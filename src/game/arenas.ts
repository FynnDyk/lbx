import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createAnimeSkyTexture,
  createArenaFloorTexture,
  createCliffWallTexture,
  createGrassBumpTexture,
  createGrassDetailTexture,
  createObstacleTexture,
} from './textures';
import { ArenaConfig } from './types';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function buildDaylightPmremScene(): THREE.Scene {
  const envScene = new THREE.Scene();

  // Sky dome gradient: azure zenith -> bright horizon -> emerald ground bounce
  const skyGeo = new THREE.SphereGeometry(20, 24, 16);
  const skyColors = new Float32Array(skyGeo.attributes.position.count * 3);
  const pos = skyGeo.attributes.position;
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / 20;
    if (ny > 0.05) {
      col.setRGB(
        THREE.MathUtils.lerp(0.68, 0.22, ny),
        THREE.MathUtils.lerp(0.88, 0.56, ny),
        THREE.MathUtils.lerp(1.0, 0.96, ny),
      );
    } else if (ny > -0.05) {
      col.setRGB(0.84, 0.94, 0.98);
    } else {
      const g = Math.min(1, (-ny - 0.05) * 1.4);
      col.setRGB(
        THREE.MathUtils.lerp(0.24, 0.14, g),
        THREE.MathUtils.lerp(0.52, 0.34, g),
        THREE.MathUtils.lerp(0.18, 0.11, g),
      );
    }
    skyColors[i * 3] = col.r;
    skyColors[i * 3 + 1] = col.g;
    skyColors[i * 3 + 2] = col.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // Bright warm solar hotspot for realistic metallic specular glints on LBX armor
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(6.5, 5.6, 3.8) }),
  );
  sunDisc.position.set(11.5, 14.2, 9.2);
  envScene.add(sunDisc);

  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.45) }),
  );
  sunHalo.position.set(11.5, 14.2, 9.2);
  envScene.add(sunHalo);

  return envScene;
}

export function setupStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  isSoftwareGl: boolean,
  isDaylight = false,
  onSunLightCreated?: (light: THREE.DirectionalLight) => void,
) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envSource = isDaylight ? buildDaylightPmremScene() : new RoomEnvironment();
  const envTex = pmrem.fromScene(envSource, isDaylight ? 0.025 : 0.04).texture;
  scene.environment = envTex;
  if (isDaylight) {
    envSource.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
  pmrem.dispose();

  // Natural azure sky fill + rich green meadow ground bounce
  const hemi = isDaylight
    ? new THREE.HemisphereLight(0x90d8ff, 0x24581b, 0.88)
    : new THREE.HemisphereLight(0xbbe0ff, 0x3b3828, 0.88);
  scene.add(hemi);

  // Warm golden afternoon sunlight carving crisp sculptural form & shadows
  const keyLight = new THREE.DirectionalLight(
    isDaylight ? 0xffe9ba : 0xfff1dc,
    isDaylight ? 2.85 : 2.1,
  );
  keyLight.position.set(34, 44, 26);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = isDaylight ? 130 : 85;
    const d = isDaylight ? 30 : 28;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.00035;
    keyLight.shadow.normalBias = 0.016;
  }
  scene.add(keyLight);
  scene.add(keyLight.target);
  onSunLightCreated?.(keyLight);

  // Cool atmospheric sky rim separating silhouettes cleanly from shadowed faces
  const rimLight = new THREE.DirectionalLight(
    isDaylight ? 0x70c4ff : 0x38bdf8,
    isDaylight ? 0.85 : 0.9,
  );
  rimLight.position.set(-28, 18, -24);
  scene.add(rimLight);

  if (isDaylight) {
    // Subtle warm sunlit bounce from opposite ground slope to soften harsh dark sides
    const bounceLight = new THREE.DirectionalLight(0xffd79c, 0.38);
    bounceLight.position.set(-18, 6, 22);
    scene.add(bounceLight);
  }

  return () => {
    envTex.dispose();
  };
}

export interface ObstacleRuntimeVisual {
  id: string;
  group: THREE.Group;
  destroyed: boolean;
}

export interface InteractableRuntimeVisual {
  id: string;
  ringMesh: THREE.Mesh;
  beaconMesh: THREE.Mesh;
}

export interface BuiltArena {
  group: THREE.Group;
  obstacleVisuals: Map<string, ObstacleRuntimeVisual>;
  interactableVisuals: Map<string, InteractableRuntimeVisual>;
  dispose: () => void;
}

function createFacetedCliffGeo(
  topR: number,
  botR: number,
  height: number,
  radialSegs: number,
  seed: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topR, botR, height, radialSegs, 3, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.001) continue;
    const angle = Math.atan2(z, x);
    const crag =
      1 +
      Math.sin(angle * 3 + seed) * 0.1 +
      Math.cos(angle * 5 - seed * 1.7) * 0.065;
    const midBand = Math.abs(y) < height * 0.44 ? Math.sin(angle * 7 + y + seed) * 0.04 : 0;
    const scale = crag + midBand;
    pos.setX(i, x * scale);
    pos.setZ(i, z * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildArenaScene(
  config: ArenaConfig,
  maxAnisotropy: number,
): BuiltArena {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const obstacleVisuals = new Map<string, ObstacleRuntimeVisual>();
  const interactableVisuals = new Map<string, InteractableRuntimeVisual>();

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const isMeadow = config.id === 'meadow';

  const outerGrassTex = isMeadow
    ? createGrassDetailTexture(maxAnisotropy, 50, 50)
    : null;
  const outerGrassBumpTex = isMeadow
    ? createGrassBumpTexture(maxAnisotropy, 50, 50)
    : null;
  if (outerGrassTex) textures.push(outerGrassTex);
  if (outerGrassBumpTex) textures.push(outerGrassBumpTex);

  // Seamless outer ground extending cleanly to horizon fog
  const outerFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isMeadow
        ? '#ffffff'
        : config.id === 'cardboard'
          ? '#2c221b'
          : '#0b101b',
      map: outerGrassTex ?? undefined,
      bumpMap: outerGrassBumpTex ?? undefined,
      bumpScale: isMeadow ? 0.05 : 0,
      roughness: isMeadow ? 0.92 : 0.88,
      metalness: isMeadow ? 0.0 : 0.06,
    }),
  );
  const outerFloor = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(isMeadow ? 290 : 120, 64)),
    outerFloorMat,
  );
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = isMeadow ? -0.025 : -0.35;
  outerFloor.receiveShadow = true;
  group.add(outerFloor);

  // Diorama raised base for non-meadow arenas
  if (!isMeadow) {
    const baseMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: config.id === 'cardboard' ? '#7c5329' : '#161e2e',
        roughness: 0.72,
        metalness: 0.2,
      }),
    );
    const dioramaBase = new THREE.Mesh(
      trackGeo(
        new THREE.CylinderGeometry(
          config.radius + 0.65,
          config.radius + 0.95,
          0.34,
          48,
        ),
      ),
      baseMat,
    );
    dioramaBase.position.y = -0.17;
    dioramaBase.receiveShadow = true;
    group.add(dioramaBase);
  }

  // Playable floor surface (y = 0)
  const floorTex = createArenaFloorTexture(
    config.id,
    config.floorPrimary,
    config.floorSecondary,
    config.accentColor,
    maxAnisotropy,
    config.radius,
  );
  textures.push(floorTex);

  const floorBumpTex = isMeadow
    ? createGrassBumpTexture(maxAnisotropy, 18, 18)
    : null;
  if (floorBumpTex) textures.push(floorBumpTex);

  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: floorTex,
      bumpMap: floorBumpTex ?? undefined,
      bumpScale: isMeadow ? 0.046 : 0,
      roughness: config.id === 'artemis' ? 0.35 : isMeadow ? 0.92 : 0.82,
      metalness: config.id === 'artemis' ? 0.35 : isMeadow ? 0.0 : 0.04,
    }),
  );
  // CircleGeometry rotated -PI/2 maps canvas (x,y) 1:1 onto world (x,z) for the meadow footpath & courtyard!
  const floorMesh = new THREE.Mesh(
    trackGeo(
      isMeadow
        ? new THREE.CircleGeometry(config.radius, 64)
        : new THREE.CylinderGeometry(config.radius, config.radius, 0.05, 56),
    ),
    floorMat,
  );
  if (isMeadow) {
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0.002;
  } else {
    floorMesh.position.y = -0.025;
  }
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // Subtle boundary ring (mossy stone curbs for meadow, glowing rim for indoor/colosseum)
  const rimGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: config.accentColor,
      emissive: config.accentColor,
      emissiveIntensity: isMeadow ? 0.45 : 1.4,
      roughness: 0.3,
      metalness: 0.4,
    }),
  );

  let cliffWallTex: THREE.CanvasTexture | null = null;
  let cliffWallMat: THREE.MeshStandardMaterial | null = null;
  let turfCapMat: THREE.MeshStandardMaterial | null = null;

  if (isMeadow) {
    // Shared stratified anime cliff & lush emerald grass cap materials
    cliffWallTex = createCliffWallTexture();
    cliffWallTex.repeat.set(2.5, 1);
    textures.push(cliffWallTex);

    cliffWallMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: cliffWallTex,
        roughness: 0.9,
        metalness: 0.02,
      }),
    );

    const capGrassTex = createGrassDetailTexture(maxAnisotropy, 3, 3);
    const capGrassBumpTex = createGrassBumpTexture(maxAnisotropy, 3, 3);
    textures.push(capGrassTex, capGrassBumpTex);

    turfCapMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: capGrassTex,
        bumpMap: capGrassBumpTex,
        bumpScale: 0.04,
        roughness: 0.9,
        metalness: 0.0,
      }),
    );

    // 1. Anime Daytime Sky Dome with Golden Sun & Halo Corona (unlit, fog-free)
    const skyTex = createAnimeSkyTexture();
    textures.push(skyTex);
    const skyDomeMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        fog: false,
      }),
    );
    const skyDome = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(320, 40, 24)),
      skyDomeMat,
    );
    skyDome.position.y = -12;
    group.add(skyDome);

    // Radiant Sun Disc + Atmospheric Corona aligned with key sunlight vector (34, 44, 26)
    const sunCoreMat = trackMat(
      new THREE.MeshBasicMaterial({ color: '#fffbe6', fog: false }),
    );
    const sunCore = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(10.5, 24, 16)),
      sunCoreMat,
    );
    sunCore.position.set(170, 205, 128);
    group.add(sunCore);

    const sunGlowInnerMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: '#ffe599',
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    const sunGlowInner = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(22, 20, 14)),
      sunGlowInnerMat,
    );
    sunGlowInner.position.copy(sunCore.position);
    group.add(sunGlowInner);

    const sunGlowOuterMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: '#ffd27d',
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    const sunGlowOuter = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(42, 20, 14)),
      sunGlowOuterMat,
    );
    sunGlowOuter.position.copy(sunCore.position);
    group.add(sunGlowOuter);

    // 2. Subtle spaced mossy meadow boundary stones around expanded perimeter
    const markerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#798074',
        roughness: 0.88,
        metalness: 0.04,
      }),
    );
    const markerCount = 48;
    const markerGeo = trackGeo(new THREE.DodecahedronGeometry(0.35, 0));
    const markerInst = new THREE.InstancedMesh(markerGeo, markerMat, markerCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < markerCount; i++) {
      const a = (i / markerCount) * Math.PI * 2 + 0.08;
      const rad = config.radius + 0.55;
      dummy.position.set(Math.cos(a) * rad, 0.09, Math.sin(a) * rad);
      dummy.rotation.set(i * 0.6, a, i * 0.4);
      const s = 0.68 + (i % 3) * 0.15;
      dummy.scale.set(s * 1.4, s * 0.48, s * 0.92);
      dummy.updateMatrix();
      markerInst.setMatrixAt(i, dummy.matrix);
    }
    markerInst.instanceMatrix.needsUpdate = true;
    markerInst.computeBoundingSphere();
    markerInst.receiveShadow = true;
    group.add(markerInst);

    // 3. Dense rich emerald grass tufts across the expanded 54m meadow & outer hills
    const grassCount = 3200;
    const grassGeo = trackGeo(new THREE.ConeGeometry(0.09, 0.42, 4));
    grassGeo.translate(0, 0.21, 0);
    const grassMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.88,
        metalness: 0.0,
      }),
    );
    const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    const grassColor = new THREE.Color();
    let gSeed = 4242;
    const gRand = () => {
      gSeed = (gSeed * 16807) % 2147483647;
      return (gSeed - 1) / 2147483646;
    };
    for (let i = 0; i < grassCount; i++) {
      const r = Math.sqrt(gRand()) * (config.radius + 18);
      const a = gRand() * Math.PI * 2;
      const gx = Math.cos(a) * r;
      const gz = Math.sin(a) * r;
      dummy.position.set(gx, 0, gz);
      dummy.rotation.set(
        (gRand() - 0.5) * 0.28,
        gRand() * Math.PI * 2,
        (gRand() - 0.5) * 0.28,
      );
      const gs = 0.72 + gRand() * 0.78;
      dummy.scale.set(gs, gs * (0.68 + gRand() * 0.65), gs);
      dummy.updateMatrix();
      grassInst.setMatrixAt(i, dummy.matrix);
      grassColor.setHSL(0.305 + (gRand() - 0.5) * 0.035, 0.68, 0.24 + gRand() * 0.11);
      grassInst.setColorAt(i, grassColor);
    }
    grassInst.instanceMatrix.needsUpdate = true;
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
    grassInst.computeBoundingSphere();
    group.add(grassInst);

    // 4. Rolling rich green meadow hills & distant hazy blue mountain silhouettes
    const hillGrassTex = createGrassDetailTexture(maxAnisotropy, 7, 5);
    textures.push(hillGrassTex);
    const hillMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#d8eed0',
        map: hillGrassTex,
        roughness: 0.92,
      }),
    );
    const farHillMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#256620',
        roughness: 0.92,
      }),
    );
    const distantRidgeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#4c8fa6',
        roughness: 0.95,
      }),
    );

    const rollingHills: Array<[number, number, number, number, boolean]> = [
      [-42, -84, 34, 9.5, false],
      [22, -92, 38, 10.2, false],
      [82, -78, 36, 11.0, false],
      [98, 10, 40, 10.5, false],
      [72, 82, 36, 9.8, false],
      [-6, 96, 42, 10.0, false],
      [-78, 72, 38, 10.8, false],
      [-94, -18, 36, 9.8, false],
      [-132, -110, 54, 21.0, true],
      [48, -142, 56, 22.0, true],
      [146, -60, 52, 20.5, true],
      [136, 102, 54, 21.0, true],
      [-108, 134, 52, 19.5, true],
    ];
    rollingHills.forEach(([hx, hz, rad, hgt, isFar]) => {
      const hill = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        isFar ? farHillMat : hillMat,
      );
      hill.scale.set(rad, hgt, rad * 0.85);
      hill.position.set(hx, -0.5, hz);
      hill.receiveShadow = true;
      group.add(hill);
    });

    // Distant blue-teal mountain backdrop
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.15;
      const dist = 195 + (i % 3) * 16;
      const ridge = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(36 + (i % 4) * 9, 32 + (i % 3) * 10, 7)),
        distantRidgeMat,
      );
      ridge.position.set(Math.cos(a) * dist, 11.5, Math.sin(a) * dist);
      ridge.rotation.y = i * 0.9;
      group.add(ridge);
    }

    // 5. Iconic Terraced Flat-Topped Plateau Mountain (Image 1 left-back)
    const addTerracedShelf = (
      px: number,
      pz: number,
      baseY: number,
      topR: number,
      botR: number,
      height: number,
      seed: number,
    ) => {
      const wall = new THREE.Mesh(
        trackGeo(createFacetedCliffGeo(topR, botR, height, 14, seed)),
        cliffWallMat!,
      );
      wall.position.set(px, baseY + height / 2, pz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);

      const cap = new THREE.Mesh(
        trackGeo(createFacetedCliffGeo(topR * 1.04, topR * 1.02, 0.78, 14, seed)),
        turfCapMat!,
      );
      cap.position.set(px, baseY + height + 0.2, pz);
      cap.receiveShadow = true;
      group.add(cap);
    };
    addTerracedShelf(-88, -106, 0, 23.0, 29.0, 12.0, 1.3);
    addTerracedShelf(-85, -108, 12.0, 16.0, 20.5, 9.5, 2.7);
    addTerracedShelf(-89, -105, 21.5, 9.8, 13.0, 7.2, 4.1);

    // 6. Dramatic Stratified Steep Canyon Cliff Bluffs framing the outer horizon (Image 2)
    const cliffBluffs: Array<[number, number, number, number, number, number]> = [
      [88, -98, 12.5, 17.5, 21.0, 1.1],
      [108, -72, 14.5, 20.0, 26.5, 2.4],
      [116, -34, 12.0, 17.0, 20.0, 3.7],
      [-114, -54, 13.5, 18.8, 19.0, 4.9],
      [-108, 32, 12.8, 17.8, 18.0, 6.2],
      [104, 60, 13.5, 18.5, 20.0, 7.5],
      [-34, 114, 14.5, 19.5, 18.8, 8.8],
    ];
    cliffBluffs.forEach(([cx, cz, topR, botR, hgt, seed]) => {
      const cliff = new THREE.Mesh(
        trackGeo(createFacetedCliffGeo(topR, botR, hgt, 11, seed)),
        cliffWallMat!,
      );
      cliff.position.set(cx, hgt / 2 - 0.5, cz);
      cliff.receiveShadow = true;
      group.add(cliff);

      const cap = new THREE.Mesh(
        trackGeo(createFacetedCliffGeo(topR * 1.05, topR * 1.01, 0.72, 11, seed)),
        turfCapMat!,
      );
      cap.position.set(cx, hgt - 0.35, cz);
      cap.receiveShadow = true;
      group.add(cap);
    });

    // 7. Shimmering Sunlit Blue Lake / Pond in the Right-Back Valley (Image 1)
    const pondMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#258fe6',
        emissive: '#0c4a6e',
        emissiveIntensity: 0.18,
        roughness: 0.08,
        metalness: 0.55,
      }),
    );
    const pond = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(11.5, 36)),
      pondMat,
    );
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(1.38, 0.84, 1);
    pond.position.set(66, 0.04, -62);
    pond.receiveShadow = true;
    group.add(pond);

    const pondRimMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#b8a97c',
        roughness: 0.9,
      }),
    );
    const pondRim = new THREE.Mesh(
      trackGeo(new THREE.RingGeometry(11.1, 12.2, 36)),
      pondRimMat,
    );
    pondRim.rotation.x = -Math.PI / 2;
    pondRim.scale.set(1.38, 0.84, 1);
    pondRim.position.set(66, 0.02, -62);
    pondRim.receiveShadow = true;
    group.add(pondRim);

    // 8. Stylized Multi-Tier Evergreen Pine Trees (perimeter + scattered valley slopes)
    const pinePositions: Array<[number, number, number]> = [
      [-41.5, -31.0, 1.25],
      [-45.0, -7.5, 1.15],
      [-40.5, 33.5, 1.2],
      [40.0, -31.5, 1.26],
      [44.5, 9.0, 1.16],
      [40.5, 31.0, 1.22],
      [-46.5, 15.0, 1.28],
      [46.0, -16.5, 1.28],
      [-23.5, -42.5, 1.22],
      [25.5, 41.5, 1.24],
    ];
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2 + 0.17;
      const dist = config.radius + 5.5 + (i % 4) * 5.2;
      pinePositions.push([
        Math.cos(a) * dist,
        Math.sin(a) * dist,
        1.1 + (i % 5) * 0.18,
      ]);
    }

    const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.3, 1.6, 7));
    trunkGeo.translate(0, 0.8, 0);
    const trunkMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#6b472b', roughness: 0.9 }),
    );
    const coneBotGeo = trackGeo(new THREE.ConeGeometry(1.35, 2.0, 8));
    coneBotGeo.translate(0, 2.0, 0);
    const coneMidGeo = trackGeo(new THREE.ConeGeometry(1.05, 1.85, 8));
    coneMidGeo.translate(0, 2.95, 0);
    const coneTopGeo = trackGeo(new THREE.ConeGeometry(0.72, 1.55, 8));
    coneTopGeo.translate(0, 3.85, 0);
    const pineLeafMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 }),
    );

    const pTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pinePositions.length);
    const pBot = new THREE.InstancedMesh(coneBotGeo, pineLeafMat, pinePositions.length);
    const pMid = new THREE.InstancedMesh(coneMidGeo, pineLeafMat, pinePositions.length);
    const pTop = new THREE.InstancedMesh(coneTopGeo, pineLeafMat, pinePositions.length);
    const pineCol = new THREE.Color();

    pinePositions.forEach(([px, pz, sc], i) => {
      dummy.position.set(px, 0, pz);
      dummy.rotation.set(0, i * 1.1, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      pTrunks.setMatrixAt(i, dummy.matrix);
      pBot.setMatrixAt(i, dummy.matrix);
      pMid.setMatrixAt(i, dummy.matrix);
      pTop.setMatrixAt(i, dummy.matrix);

      pineCol.setHSL(0.32 + (i % 3) * 0.015, 0.56, 0.25 + (i % 4) * 0.035);
      pBot.setColorAt(i, pineCol);
      pineCol.setHSL(0.31 + (i % 3) * 0.015, 0.58, 0.29 + (i % 4) * 0.035);
      pMid.setColorAt(i, pineCol);
      pineCol.setHSL(0.3 + (i % 3) * 0.015, 0.62, 0.34 + (i % 4) * 0.035);
      pTop.setColorAt(i, pineCol);
    });
    [pTrunks, pBot, pMid, pTop].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      inst.receiveShadow = true;
      group.add(inst);
    });

    // 9. Rounded Broadleaf Valley Trees near Hills, Pond & Terraced Plateau
    const groveCoords: Array<[number, number, number, number]> = [
      [-65, -76, 0, 2.0], [-56, -84, 0, 1.8], [-74, -68, 0, 2.2], [-96, -74, 0, 1.9],
      [-72, -92, 12.0, 1.7], [-66, -98, 12.0, 1.6], [-82, -89, 12.0, 1.65],
      [44, -70, 0, 1.9], [52, -78, 0, 1.75], [80, -56, 0, 2.0], [84, -66, 0, 1.8],
      [72, -44, 0, 1.65], [60, -86, 0, 2.1], [-38, -68, 0, 1.8], [-20, -76, 0, 1.75],
      [16, -72, 0, 1.85], [74, 30, 0, 1.95], [80, 44, 0, 1.8], [-68, 52, 0, 1.9], [-60, 62, 0, 1.75],
    ];
    const bTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.36, 2.0, 7));
    bTrunkGeo.translate(0, 1.0, 0);
    const bCanopyGeo = trackGeo(new THREE.DodecahedronGeometry(1.55, 1));
    bCanopyGeo.translate(0, 2.95, 0);
    const bCanopyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82 }),
    );
    const bTrunks = new THREE.InstancedMesh(bTrunkGeo, trunkMat, groveCoords.length);
    const bCanopies = new THREE.InstancedMesh(bCanopyGeo, bCanopyMat, groveCoords.length);
    const bCol = new THREE.Color();

    groveCoords.forEach(([bx, bz, by, sc], i) => {
      dummy.position.set(bx, by, bz);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.set(sc, sc * (0.95 + (i % 3) * 0.1), sc);
      dummy.updateMatrix();
      bTrunks.setMatrixAt(i, dummy.matrix);
      bCanopies.setMatrixAt(i, dummy.matrix);
      bCol.setHSL(0.305 + (i % 4) * 0.015, 0.66, 0.25 + (i % 3) * 0.045);
      bCanopies.setColorAt(i, bCol);
    });
    bTrunks.instanceMatrix.needsUpdate = true;
    bCanopies.instanceMatrix.needsUpdate = true;
    if (bCanopies.instanceColor) bCanopies.instanceColor.needsUpdate = true;
    bTrunks.computeBoundingSphere();
    bCanopies.computeBoundingSphere();
    bTrunks.castShadow = true;
    bCanopies.castShadow = true;
    bCanopies.receiveShadow = true;
    group.add(bTrunks);
    group.add(bCanopies);
  } else {
    const rimTorus = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(config.radius + 0.05, 0.09, 10, 64)),
      rimGlowMat,
    );
    rimTorus.rotation.x = Math.PI / 2;
    rimTorus.position.y = 0.04;
    group.add(rimTorus);

    const postCount = 14;
    const postMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: config.id === 'cardboard' ? '#9c6b3b' : '#243044',
        roughness: 0.6,
        metalness: 0.3,
      }),
    );
    for (let i = 0; i < postCount; i++) {
      const angle = (i / postCount) * Math.PI * 2;
      const px = Math.cos(angle) * (config.radius + 0.32);
      const pz = Math.sin(angle) * (config.radius + 0.32);
      const post = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.45, 0.65, 0.45)),
        postMat,
      );
      post.position.set(px, 0.32, pz);
      post.rotation.y = -angle;
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);

      const cap = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.5, 0.08, 0.5)),
        rimGlowMat,
      );
      cap.position.set(px, 0.66, pz);
      cap.rotation.y = -angle;
      group.add(cap);
    }
  }

  // Shared obstacle material cache by kind
  const obsMatCache = new Map<string, THREE.MeshStandardMaterial>();
  const getObsMat = (kind: 'block' | 'pillar' | 'crate' | 'rock' | 'ruin') => {
    const existing = obsMatCache.get(kind);
    if (existing) return existing;
    const obsTex = createObstacleTexture(kind, config.accentColor);
    textures.push(obsTex);
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: obsTex,
        roughness: kind === 'pillar' ? 0.35 : 0.82,
        metalness: kind === 'pillar' ? 0.35 : 0.04,
      }),
    );
    obsMatCache.set(kind, mat);
    return mat;
  };

  // Detailed Multi-Part Obstacles & Destructible Crates
  config.obstacles.forEach((obs, idx) => {
    const obsId = obs.id ?? `obs_${idx}`;
    const obsGroup = new THREE.Group();
    obsGroup.position.set(obs.x, 0, obs.z);
    const obsMat = getObsMat(obs.kind);

    if (obs.kind === 'pillar') {
      const body = new THREE.Mesh(
        trackGeo(
          new THREE.CylinderGeometry(obs.radius * 0.85, obs.radius, obs.height, 8),
        ),
        obsMat,
      );
      body.position.y = obs.height / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      obsGroup.add(body);

      const ring = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(obs.radius * 0.92, 0.05, 8, 24)),
        rimGlowMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = obs.height * 0.82;
      obsGroup.add(ring);
    } else if (obs.kind === 'rock') {
      if (isMeadow && cliffWallMat && turfCapMat) {
        // Faceted stratified anime cliff with flat climbable emerald grass top (Images 2 & 3)
        const seed = idx * 1.37 + 0.5;
        const topRatio = obs.height >= 3.0 ? 0.84 : 0.88;
        const cliffBody = new THREE.Mesh(
          trackGeo(
            createFacetedCliffGeo(
              obs.radius * topRatio,
              obs.radius * 1.04,
              obs.height - 0.16,
              10,
              seed,
            ),
          ),
          cliffWallMat,
        );
        cliffBody.position.y = (obs.height - 0.16) / 2;
        cliffBody.castShadow = true;
        cliffBody.receiveShadow = true;
        obsGroup.add(cliffBody);

        const grassCap = new THREE.Mesh(
          trackGeo(
            createFacetedCliffGeo(
              obs.radius * (topRatio + 0.05),
              obs.radius * (topRatio + 0.03),
              0.22,
              10,
              seed,
            ),
          ),
          turfCapMat,
        );
        grassCap.position.y = obs.height - 0.11;
        grassCap.castShadow = true;
        grassCap.receiveShadow = true;
        obsGroup.add(grassCap);

        const baseRockCount = obs.height >= 3.0 ? 3 : 2;
        for (let b = 0; b < baseRockCount; b++) {
          const ba = b * 2.2 + idx * 0.9;
          const baseRock = new THREE.Mesh(
            trackGeo(new THREE.DodecahedronGeometry(obs.radius * 0.24, 0)),
            obsMat,
          );
          baseRock.position.set(
            Math.cos(ba) * obs.radius * 0.86,
            obs.radius * 0.12,
            Math.sin(ba) * obs.radius * 0.86,
          );
          baseRock.scale.set(1.15, 0.65, 1.0);
          baseRock.castShadow = true;
          baseRock.receiveShadow = true;
          obsGroup.add(baseRock);
        }
      } else {
        const mainBoulder = new THREE.Mesh(
          trackGeo(new THREE.DodecahedronGeometry(obs.radius * 0.98, 1)),
          obsMat,
        );
        mainBoulder.scale.set(1.05, obs.height / (obs.radius * 1.7), 0.92);
        mainBoulder.position.y = obs.height * 0.42;
        mainBoulder.castShadow = true;
        mainBoulder.receiveShadow = true;
        obsGroup.add(mainBoulder);

        const sideRock = new THREE.Mesh(
          trackGeo(new THREE.DodecahedronGeometry(obs.radius * 0.48, 0)),
          obsMat,
        );
        sideRock.position.set(obs.radius * 0.65, obs.radius * 0.28, obs.radius * 0.32);
        sideRock.castShadow = true;
        obsGroup.add(sideRock);
      }
    } else if (obs.kind === 'ruin') {
      if (isMeadow && obsId === 'm_shrine') {
        // Iconic LBX stone ruin shrine with terracotta/red-brown pitched roof (Image 3)
        const bodyW = obs.radius * 1.56;
        const bodyD = obs.radius * 1.24;
        const wallH = obs.height * 0.62;

        const plinth = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(bodyW + 0.28, 0.22, bodyD + 0.28)),
          obsMat,
        );
        plinth.position.y = 0.11;
        plinth.castShadow = true;
        plinth.receiveShadow = true;
        obsGroup.add(plinth);

        const body = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(bodyW, wallH, bodyD)),
          obsMat,
        );
        body.position.y = 0.22 + wallH / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        obsGroup.add(body);

        const doorMat = trackMat(
          new THREE.MeshStandardMaterial({ color: '#1b1d24', roughness: 0.95 }),
        );
        const doorway = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(bodyW * 0.4, wallH * 0.72, 0.12)),
          doorMat,
        );
        doorway.position.set(0, 0.22 + wallH * 0.36, bodyD * 0.5 + 0.02);
        obsGroup.add(doorway);

        const timberMat = trackMat(
          new THREE.MeshStandardMaterial({ color: '#5c3c24', roughness: 0.88 }),
        );
        const lintel = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(bodyW * 0.52, 0.14, 0.2)),
          timberMat,
        );
        lintel.position.set(0, 0.22 + wallH * 0.74, bodyD * 0.5 + 0.03);
        obsGroup.add(lintel);

        const roofMat = trackMat(
          new THREE.MeshStandardMaterial({ color: '#9e4232', roughness: 0.76 }),
        );
        const roof = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.16, obs.radius * 1.18, obs.height * 0.42, 4)),
          roofMat,
        );
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1.16, 1, 0.94);
        roof.position.y = 0.22 + wallH + obs.height * 0.21;
        roof.castShadow = true;
        roof.receiveShadow = true;
        obsGroup.add(roof);

        const ridge = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(bodyW * 0.96, 0.12, 0.22)),
          trackMat(new THREE.MeshStandardMaterial({ color: '#7c2d20', roughness: 0.8 })),
        );
        ridge.position.y = 0.22 + wallH + obs.height * 0.41;
        obsGroup.add(ridge);
      } else if (isMeadow) {
        // Crumbling mossy courtyard stone wall segment (Image 3 courtyard L/U walls)
        const isNorthSouth = obsId === 'm_wall_l' || obsId === 'm_wall_r';
        const wLen = obs.radius * 1.85;
        const wThk = obs.radius * 0.72;
        const wallAngle = obsId === 'm_wall_r' ? -0.35 : 0;

        const subGroup = new THREE.Group();
        subGroup.rotation.y = wallAngle;

        const baseWall = new THREE.Mesh(
          trackGeo(
            new THREE.BoxGeometry(
              isNorthSouth ? wThk : wLen,
              obs.height * 0.68,
              isNorthSouth ? wLen : wThk,
            ),
          ),
          obsMat,
        );
        baseWall.position.y = obs.height * 0.34;
        baseWall.castShadow = true;
        baseWall.receiveShadow = true;
        subGroup.add(baseWall);

        const upperBlock = new THREE.Mesh(
          trackGeo(
            new THREE.BoxGeometry(
              isNorthSouth ? wThk * 0.9 : wLen * 0.52,
              obs.height * 0.34,
              isNorthSouth ? wLen * 0.52 : wThk * 0.9,
            ),
          ),
          obsMat,
        );
        upperBlock.position.set(
          isNorthSouth ? 0 : -wLen * 0.16,
          obs.height * 0.85,
          isNorthSouth ? -wLen * 0.16 : 0,
        );
        upperBlock.castShadow = true;
        upperBlock.receiveShadow = true;
        subGroup.add(upperBlock);

        if (turfCapMat) {
          const mossStrip = new THREE.Mesh(
            trackGeo(
              new THREE.BoxGeometry(
                isNorthSouth ? wThk * 0.82 : wLen * 0.44,
                0.1,
                isNorthSouth ? wLen * 0.44 : wThk * 0.82,
              ),
            ),
            turfCapMat,
          );
          mossStrip.position.set(
            isNorthSouth ? 0 : wLen * 0.24,
            obs.height * 0.71,
            isNorthSouth ? wLen * 0.24 : 0,
          );
          subGroup.add(mossStrip);
        }

        obsGroup.add(subGroup);
      } else {
        // Ancient stone plinth + broken pillar + moss band
        const plinth = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(obs.radius * 1.7, 0.35, obs.radius * 1.7)),
          obsMat,
        );
        plinth.position.y = 0.175;
        plinth.castShadow = true;
        plinth.receiveShadow = true;
        obsGroup.add(plinth);

        const col = new THREE.Mesh(
          trackGeo(
            new THREE.CylinderGeometry(
              obs.radius * 0.65,
              obs.radius * 0.72,
              obs.height - 0.35,
              8,
            ),
          ),
          obsMat,
        );
        col.position.y = 0.35 + (obs.height - 0.35) / 2;
        col.castShadow = true;
        col.receiveShadow = true;
        obsGroup.add(col);
      }
    } else {
      // Crate / Block (often destructible!)
      const size = obs.radius * 1.48;
      const box = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(size, obs.height, size)),
        obsMat,
      );
      box.position.y = obs.height / 2;
      box.castShadow = true;
      box.receiveShadow = true;
      obsGroup.add(box);

      if (obs.destructible) {
        // Glowing amber/emerald energy core strip indicating destructible supply box
        const stripMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: '#F59E0B',
            emissive: '#F59E0B',
            emissiveIntensity: 1.2,
            roughness: 0.25,
          }),
        );
        const strip = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(size + 0.04, 0.16, size + 0.04)),
          stripMat,
        );
        strip.position.y = obs.height * 0.5;
        obsGroup.add(strip);
      }
    }

    group.add(obsGroup);
    obstacleVisuals.set(obsId, {
      id: obsId,
      group: obsGroup,
      destroyed: false,
    });
  });

  // Interactive Tactical Pads (Repair / Overcharge Node & Boost Jump Pads)
  config.interactables.forEach((node) => {
    const color = node.kind === 'repair_node' ? '#34D399' : '#38BDF8';
    const padGroup = new THREE.Group();
    padGroup.position.set(node.x, 0.02, node.z);

    const baseMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        metalness: 0.7,
        roughness: 0.3,
      }),
    );
    const padBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(node.radius, node.radius * 1.1, 0.08, 24)),
      baseMat,
    );
    padBase.position.y = 0.04;
    padGroup.add(padBase);

    const ringMat = trackMat(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      }),
    );
    const ringMesh = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(node.radius * 0.85, 0.06, 8, 28)),
      ringMat,
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.09;
    padGroup.add(ringMesh);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.6,
        roughness: 0.15,
      }),
    );
    const beaconMesh = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.26, 0)),
      beaconMat,
    );
    beaconMesh.position.y = 0.72;
    padGroup.add(beaconMesh);

    group.add(padGroup);
    interactableVisuals.set(node.id, {
      id: node.id,
      ringMesh,
      beaconMesh,
    });
  });

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return { group, obstacleVisuals, interactableVisuals, dispose };
}
