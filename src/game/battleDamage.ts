import * as THREE from 'three';

export const MAX_BATTLE_SCARS = 8;

export interface BattleDamageUniforms {
  uTime: { value: number };
  uDamageLevel: { value: number };
  uWorldToChar: { value: THREE.Matrix4 };
  uScarSpots: { value: THREE.Vector4[] }; // xyz = char-space hit point, w = radius (<= 0 inactive)
  uScarDirs: { value: THREE.Vector4[] };  // xyz = char-space slash axis, w = flags (bit0: slash, bit1: heavy hole)
  uScarAges: { value: number[] };         // seconds since hit (controls fresh impact flash cooling into ember glow)
  uScarColors: { value: THREE.Vector3[] }; // linear RGB impact tint
}

const _invRoot = new THREE.Matrix4();
const _tmpCharPos = new THREE.Vector3();
const _tmpSlashDir = new THREE.Vector3();
const _tmpWorldEnd = new THREE.Vector3();
const _tmpCharEnd = new THREE.Vector3();
const _tmpColor = new THREE.Color();

export class FighterDamageController {
  public readonly uniforms: BattleDamageUniforms;
  private nextScarIdx = 0;
  private scarTimestamps = new Float32Array(MAX_BATTLE_SCARS);
  private scarActive = new Uint8Array(MAX_BATTLE_SCARS);
  private scarBaseRadii = new Float32Array(MAX_BATTLE_SCARS);

  constructor() {
    const spots: THREE.Vector4[] = [];
    const dirs: THREE.Vector4[] = [];
    const ages: number[] = [];
    const colors: THREE.Vector3[] = [];
    for (let i = 0; i < MAX_BATTLE_SCARS; i++) {
      spots.push(new THREE.Vector4(0, 0, 0, 0));
      dirs.push(new THREE.Vector4(1, 0, 0, 0));
      ages.push(99);
      colors.push(new THREE.Vector3(1.0, 0.42, 0.05));
    }
    this.uniforms = {
      uTime: { value: 0 },
      uDamageLevel: { value: 0 },
      uWorldToChar: { value: new THREE.Matrix4() },
      uScarSpots: { value: spots },
      uScarDirs: { value: dirs },
      uScarAges: { value: ages },
      uScarColors: { value: colors },
    };
  }

  public attachToMaterials(materials: THREE.Material[]) {
    attachBattleDamageToMaterials(materials, this.uniforms);
  }

  public recordHit(params: {
    rootObject: THREE.Object3D;
    worldImpactPos: THREE.Vector3;
    worldStrikeDir?: THREE.Vector3;
    isSlash: boolean;
    isHeavy: boolean;
    accentHex: string;
    elapsedTime: number;
  }) {
    const {
      rootObject,
      worldImpactPos,
      worldStrikeDir,
      isSlash,
      isHeavy,
      accentHex,
      elapsedTime,
    } = params;

    rootObject.updateMatrixWorld(true);
    _invRoot.copy(rootObject.matrixWorld).invert();
    _tmpCharPos.copy(worldImpactPos).applyMatrix4(_invRoot);

    // Keep impact center anchored onto the robot's physical hull bounds so fractures and holes land cleanly on armor
    _tmpCharPos.x = THREE.MathUtils.clamp(_tmpCharPos.x, -0.36, 0.36);
    _tmpCharPos.y = THREE.MathUtils.clamp(_tmpCharPos.y, 0.42, 1.46);
    _tmpCharPos.z = THREE.MathUtils.clamp(_tmpCharPos.z, -0.26, 0.28);

    if (worldStrikeDir && worldStrikeDir.lengthSq() > 0.0001) {
      _tmpWorldEnd.copy(worldImpactPos).add(worldStrikeDir);
      _tmpCharEnd.copy(_tmpWorldEnd).applyMatrix4(_invRoot);
      _tmpSlashDir.subVectors(_tmpCharEnd, _tmpCharPos);
      if (_tmpSlashDir.lengthSq() > 0.0001) {
        _tmpSlashDir.normalize();
      } else {
        _tmpSlashDir.set(0.7, 0.7, 0).normalize();
      }
    } else {
      _tmpSlashDir.set(Math.random() > 0.5 ? 0.78 : -0.78, 0.58, 0.22).normalize();
    }

    const idx = this.nextScarIdx;
    this.nextScarIdx = (this.nextScarIdx + 1) % MAX_BATTLE_SCARS;

    // Compact fracture web radius (~12-20cm on a 1.7m robot) so armor stays crisp instead of washed in gray
    const radius = isHeavy
      ? 0.175 + Math.random() * 0.04
      : isSlash
        ? 0.135 + Math.random() * 0.03
        : 0.115 + Math.random() * 0.025;

    this.scarActive[idx] = 1;
    this.scarBaseRadii[idx] = radius;
    this.scarTimestamps[idx] = elapsedTime;

    this.uniforms.uScarSpots.value[idx].set(
      _tmpCharPos.x,
      _tmpCharPos.y,
      _tmpCharPos.z,
      radius,
    );
    const flags = (isSlash ? 1.0 : 0.0) + (isHeavy ? 2.0 : 0.0);
    this.uniforms.uScarDirs.value[idx].set(
      _tmpSlashDir.x,
      _tmpSlashDir.y,
      _tmpSlashDir.z,
      flags,
    );
    this.uniforms.uScarAges.value[idx] = 0;

    _tmpColor.set(accentHex);
    // Fiery molten orange core lightly tinted by the impact weapon
    this.uniforms.uScarColors.value[idx].set(
      THREE.MathUtils.lerp(1.0, _tmpColor.r, 0.18),
      THREE.MathUtils.lerp(0.38, _tmpColor.g, 0.18),
      THREE.MathUtils.lerp(0.04, _tmpColor.b, 0.18),
    );
  }

  public healPartial(ratioRestored: number) {
    const keepScale = THREE.MathUtils.clamp(1 - ratioRestored * 0.55, 0.5, 1.0);
    for (let i = 0; i < MAX_BATTLE_SCARS; i++) {
      if (this.scarActive[i]) {
        this.scarBaseRadii[i] *= keepScale;
        this.uniforms.uScarSpots.value[i].w = this.scarBaseRadii[i];
      }
    }
  }

  public update(rootObject: THREE.Object3D, hpRatio: number, elapsedTime: number, dt: number) {
    this.uniforms.uTime.value = elapsedTime;
    const targetDmg = THREE.MathUtils.clamp(1 - hpRatio, 0, 1);
    this.uniforms.uDamageLevel.value = THREE.MathUtils.damp(
      this.uniforms.uDamageLevel.value,
      targetDmg,
      8.5,
      dt,
    );

    _invRoot.copy(rootObject.matrixWorld).invert();
    this.uniforms.uWorldToChar.value.copy(_invRoot);

    for (let i = 0; i < MAX_BATTLE_SCARS; i++) {
      if (this.scarActive[i]) {
        this.uniforms.uScarAges.value[i] = Math.max(0, elapsedTime - this.scarTimestamps[i]);
      }
    }
  }
}

const DAMAGE_GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform float uDamageLevel;
uniform vec4 uScarSpots[${MAX_BATTLE_SCARS}];
uniform vec4 uScarDirs[${MAX_BATTLE_SCARS}];
uniform float uScarAges[${MAX_BATTLE_SCARS}];
uniform vec3 uScarColors[${MAX_BATTLE_SCARS}];
varying vec3 vCharDmgPos;

float bdHash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float bdNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(bdHash3(i + vec3(0.0, 0.0, 0.0)), bdHash3(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(bdHash3(i + vec3(0.0, 1.0, 0.0)), bdHash3(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(bdHash3(i + vec3(0.0, 0.0, 1.0)), bdHash3(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(bdHash3(i + vec3(0.0, 1.0, 1.0)), bdHash3(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

// Uniform-width 3D Voronoi cell-border distance -> crisp polygonal shatter micro-cracks
float bdVoronoiEdge(vec3 x) {
  vec3 n = floor(x);
  vec3 f = fract(x);
  vec3 mr1 = vec3(0.0);
  vec3 mr2 = vec3(1.0);
  float d1 = 8.0;
  float d2 = 8.0;

  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 cell = n + g;
        vec3 o = vec3(
          bdHash3(cell),
          bdHash3(cell + vec3(17.3, 31.7, 11.1)),
          bdHash3(cell + vec3(43.1, 7.9, 29.3))
        );
        o = 0.18 + 0.64 * o;
        vec3 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          mr2 = mr1;
          d1 = d;
          mr1 = r;
        } else if (d < d2) {
          d2 = d;
          mr2 = r;
        }
      }
    }
  }

  vec3 diff = mr2 - mr1;
  float lenDiff = length(diff);
  if (lenDiff < 0.0001) return 1.0;
  return dot(0.5 * (mr1 + mr2), diff / lenDiff);
}
`;

export function attachBattleDamageToMaterials(
  materials: THREE.Material[],
  uniforms: BattleDamageUniforms,
) {
  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    if (!mat || mat.userData.__battleDamagePatched) continue;
    const anyMat = mat as THREE.MeshStandardMaterial;
    if (
      !anyMat.isMeshStandardMaterial &&
      !(mat as THREE.MeshPhongMaterial).isMeshPhongMaterial &&
      !(mat as THREE.MeshLambertMaterial).isMeshLambertMaterial
    ) {
      continue;
    }
    // Leave ultra-bright glowing visor/sensor optics untouched
    if (typeof anyMat.emissiveIntensity === 'number' && anyMat.emissiveIntensity > 1.2) {
      continue;
    }

    mat.userData.__battleDamagePatched = true;
    const isStandard = Boolean(anyMat.isMeshStandardMaterial);
    const prevCacheKey = mat.customProgramCacheKey?.bind(mat);
    mat.customProgramCacheKey = () =>
      `${prevCacheKey ? prevCacheKey() : 'base'}_lbx_dmg_v2_${isStandard ? 'std' : 'bas'}`;

    const prevOnBeforeCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prevOnBeforeCompile) {
        prevOnBeforeCompile(shader, renderer);
      }

      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uDamageLevel = uniforms.uDamageLevel;
      shader.uniforms.uWorldToChar = uniforms.uWorldToChar;
      shader.uniforms.uScarSpots = uniforms.uScarSpots;
      shader.uniforms.uScarDirs = uniforms.uScarDirs;
      shader.uniforms.uScarAges = uniforms.uScarAges;
      shader.uniforms.uScarColors = uniforms.uScarColors;

      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          `uniform mat4 uWorldToChar;\nvarying vec3 vCharDmgPos;\nvoid main() {`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>\nvCharDmgPos = (uWorldToChar * modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${DAMAGE_GLSL_COMMON}\nvoid main() {`)
        .replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          float bdScorchMask = 0.0;
          vec3 bdGlowRadiance = vec3(0.0);

          if (uDamageLevel > 0.015 || uScarSpots[0].w > 0.001) {
            float maxScarMask = 0.0;
            float rimCharMask = 0.0;
            float rimHeatMask = 0.0;
            float crackMaskMax = 0.0;
            vec3 dominantHeatColor = vec3(1.0, 0.36, 0.04);

            // 1. Evaluate proximity to actual hit spots & check for heavy armor-piercing holes
            for (int i = 0; i < ${MAX_BATTLE_SCARS}; i++) {
              float rad = uScarSpots[i].w;
              if (rad <= 0.001) continue;

              vec3 d = vCharDmgPos - uScarSpots[i].xyz;
              vec3 sDir = uScarDirs[i].xyz;
              float flags = uScarDirs[i].w;
              bool isSlash = mod(flags, 2.0) > 0.5;
              bool isHeavy = flags > 1.5;

              if (isSlash) {
                float along = clamp(dot(d, sDir), -rad * 0.78, rad * 0.78);
                d -= sDir * along * 0.72;
              }

              float distRaw = length(d);
              float rNorm = distRaw / max(0.03, rad);

              if (rNorm < 1.18) {
                // High-frequency jagged boundary perturbation (never blurry gray circles)
                float jag = (bdNoise3(vCharDmgPos * 38.0 + float(i) * 5.7) - 0.5) * 0.34;
                float rJag = rNorm + jag * 0.45;

                // Heavy / critical impacts punch an actual jagged hole through the armor plate!
                if (isHeavy) {
                  float limbScale = (abs(uScarSpots[i].x) > 0.22 || uScarSpots[i].y < 0.72) ? 0.58 : 1.0;
                  float holeNorm = (distRaw + jag * rad * 0.14) / max(0.02, rad * 0.27 * limbScale);
                  if (holeNorm < 0.85) {
                    discard;
                  }
                  if (holeNorm < 1.38) {
                    float charredRim = smoothstep(1.38, 0.88, holeNorm);
                    float moltenEdge = smoothstep(1.16, 0.86, holeNorm);
                    rimCharMask = max(rimCharMask, charredRim);
                    rimHeatMask = max(rimHeatMask, moltenEdge * 1.45);
                    dominantHeatColor = mix(dominantHeatColor, uScarColors[i], 0.5);
                  }
                } else {
                  // Light/medium hits create a tight dark puncture slit/dent with a hot molten center
                  float pitNorm = (distRaw + jag * rad * 0.12) / max(0.02, rad * 0.18);
                  if (pitNorm < 1.3) {
                    float pitDark = smoothstep(1.3, 0.45, pitNorm);
                    float pitHot = smoothstep(0.95, 0.25, pitNorm);
                    rimCharMask = max(rimCharMask, pitDark * 0.92);
                    rimHeatMask = max(rimHeatMask, pitHot * 1.05);
                    dominantHeatColor = mix(dominantHeatColor, uScarColors[i], 0.45);
                  }
                }

                float falloff = smoothstep(1.18, 0.18, rJag);
                float coolBoost = 1.0 + exp(-uScarAges[i] * 1.45) * 1.15;
                maxScarMask = max(maxScarMask, falloff);
                crackMaskMax = max(crackMaskMax, falloff * coolBoost);
              }
            }

            // 2. Sparse localized stress-crack pockets only when hull integrity drops below 65%
            float stressPocket = 0.0;
            if (uDamageLevel > 0.35) {
              float pocketNoise = bdNoise3(vCharDmgPos * 3.8 + vec3(1.7, 4.3, 2.9));
              float pocketThresh = mix(0.84, 0.62, smoothstep(0.35, 1.0, uDamageLevel));
              stressPocket = smoothstep(pocketThresh, pocketThresh + 0.11, pocketNoise);
            }

            // 3. Only compute sharp Voronoi micro-cracks where a hit or stress pocket exists
            if (maxScarMask > 0.01 || stressPocket > 0.01) {
              vec3 warp = vec3(
                bdNoise3(vCharDmgPos * 19.0),
                bdNoise3(vCharDmgPos * 19.0 + vec3(7.1, 3.3, 5.9)),
                bdNoise3(vCharDmgPos * 19.0 + vec3(2.5, 9.7, 1.3))
              ) - 0.5;
              float vEdge = bdVoronoiEdge(vCharDmgPos * 25.0 + warp * 0.36);

              // Razor-thin hairline fracture core + narrow charred crack edge (no wide glowing blobs!)
              float zoneWeight = max(maxScarMask, stressPocket * 0.85);
              float hairlineOrange = (1.0 - smoothstep(0.010, 0.044, vEdge)) * zoneWeight;
              float hairlineChar = (1.0 - smoothstep(0.028, 0.078, vEdge)) * zoneWeight;

              // Fine secondary micro-branches inside strong hit zones
              float microBranch = 0.0;
              if (maxScarMask > 0.22) {
                float vSub = bdVoronoiEdge(vCharDmgPos * 46.0 + warp * 0.52);
                microBranch = (1.0 - smoothstep(0.008, 0.036, vSub)) * maxScarMask * 0.72;
              }

              float totalCrackGlow = clamp(max(hairlineOrange, microBranch), 0.0, 1.25);
              float totalCrackSeam = clamp(max(hairlineChar, rimCharMask), 0.0, 1.0);
              bdScorchMask = max(bdScorchMask, totalCrackSeam);

              // Crisp dark fracture crevice + molten orange interior glow
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.025, 0.022), totalCrackSeam * 0.92);

              float heatFactor = max(totalCrackGlow * max(1.0, crackMaskMax), rimHeatMask);
              float pulse = 0.9 + 0.1 * sin(uTime * 5.2 + vCharDmgPos.y * 12.0);
              vec3 hotOrange = mix(vec3(1.0, 0.31, 0.02), vec3(1.0, 0.62, 0.14), clamp(heatFactor - 0.45, 0.0, 1.0));
              hotOrange = mix(hotOrange, dominantHeatColor, 0.22);
              bdGlowRadiance += hotOrange * heatFactor * 1.95 * pulse;
            } else if (rimCharMask > 0.01) {
              bdScorchMask = max(bdScorchMask, rimCharMask);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.024, 0.02), rimCharMask * 0.94);
              bdGlowRadiance += vec3(1.0, 0.36, 0.04) * rimHeatMask * 1.85;
            }
          }
          `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `
          #include <emissivemap_fragment>
          totalEmissiveRadiance += bdGlowRadiance;
          `,
        );

      if (isStandard) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <roughnessmap_fragment>',
            `
            #include <roughnessmap_fragment>
            roughnessFactor = mix(roughnessFactor, 0.88, bdScorchMask);
            `,
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `
            #include <metalnessmap_fragment>
            metalnessFactor = mix(metalnessFactor, 0.25, bdScorchMask);
            `,
          );
      }
    };

    mat.needsUpdate = true;
  }
}
