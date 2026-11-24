import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { detectSoftwareWebGL, setupStudioEnvironment } from './arenas';
import { getLoadoutCharacterId } from './catalog';
import {
  applyCustomBonePose,
  attachDonorWeaponToProceduralRig,
  buildCustomHalberdPose,
  buildCustomLancePose,
  buildCustomLbxRig,
  buildCustomMeleePose,
  buildCustomRiflePose,
  createZeroCustomPose,
  CustomBonePose,
  CustomLbxRig,
} from './customModelLoader';
import { CustomModelAsset } from './customModelStorage';
import { buildLbxModel } from './lbxModel';
import { soundEngine } from './sound';
import { LbxLoadout, ModelStyle } from './types';

export type GarageCameraPreset = 'full' | 'torso' | 'weapon';

interface GarageShotFx {
  mesh: THREE.Object3D;
  mats: THREE.MeshBasicMaterial[];
  life: number;
  maxLife: number;
  vel?: THREE.Vector3;
  isFlash: boolean;
}

export class GarageViewportEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private disposeEnv: () => void;

  private pedestalGroup: THREE.Group;
  private pedestalGeos: THREE.BufferGeometry[] = [];
  private pedestalMats: THREE.Material[] = [];

  private currentRig: CustomLbxRig | null = null;
  private autoSpin = true;
  private loadSeq = 0;
  private testAttackTimer = 0;
  private testAttackStep = 0;
  private testAttackDuration = 0.62;
  private shotTriggerStage = 0;
  private guardPreview = false;
  private currentWeaponId = 'weapon_lance';
  private shotFxList: GarageShotFx[] = [];
  private flashGeo = new THREE.SphereGeometry(0.14, 10, 10);
  private tracerCoreGeo = new THREE.CylinderGeometry(0.022, 0.012, 1.05, 8);
  private tracerGeo = new THREE.CylinderGeometry(0.065, 0.028, 1.35, 8);

  private targetCamPos = new THREE.Vector3(2.8, 2.05, 3.7);
  private targetLookAt = new THREE.Vector3(0, 1.05, 0);
  private transitionActive = false;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    initialLoadout: LbxLoadout,
    customModel?: CustomModelAsset | null,
    useCustomModel = false,
    allCustomModels?: Partial<Record<ModelStyle, CustomModelAsset>>,
  ) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      Math.max(1, container.clientWidth),
      Math.max(1, container.clientHeight),
    );
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0B101B');
    this.scene.fog = new THREE.FogExp2('#0B101B', 0.045);

    this.camera = new THREE.PerspectiveCamera(
      40,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      60,
    );
    this.camera.position.copy(this.targetCamPos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.targetLookAt);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 2.1;
    this.controls.maxDistance = 6.5;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enablePan = false;
    this.controls.addEventListener('start', () => {
      this.transitionActive = false;
      this.autoSpin = false;
    });

    this.disposeEnv = setupStudioEnvironment(
      this.renderer,
      this.scene,
      this.isSoftwareGl,
    );

    this.pedestalGroup = this.buildPedestal();
    this.scene.add(this.pedestalGroup);

    this.setLoadout(initialLoadout, customModel, useCustomModel, allCustomModels);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.onResize);
    this.tick();
  }

  private buildPedestal(): THREE.Group {
    const grp = new THREE.Group();

    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.7,
      metalness: 0.25,
    });
    const floorGeo = new THREE.CircleGeometry(28, 48);
    this.pedestalGeos.push(floorGeo);
    this.pedestalMats.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    grp.add(floor);

    const baseGeo = new THREE.CylinderGeometry(1.55, 1.78, 0.18, 40);
    const baseMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.35,
      metalness: 0.65,
    });
    this.pedestalGeos.push(baseGeo);
    this.pedestalMats.push(baseMat);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.09;
    base.receiveShadow = true;
    grp.add(base);

    const ringGeo = new THREE.TorusGeometry(1.56, 0.03, 10, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#F59E0B',
      emissive: '#F59E0B',
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    this.pedestalGeos.push(ringGeo);
    this.pedestalMats.push(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    grp.add(ring);

    return grp;
  }

  private applyProceduralRig(
    loadout: LbxLoadout,
    attachDonorWeapons = false,
    seq = this.loadSeq,
    allCustomModels?: Partial<Record<ModelStyle, CustomModelAsset>>,
  ) {
    const prevRot = this.currentRig ? this.currentRig.root.rotation.y : 0.35;
    if (this.currentRig) {
      this.scene.remove(this.currentRig.root);
      this.currentRig.dispose();
    }
    const nextRig: CustomLbxRig = buildLbxModel(loadout);
    this.currentRig = nextRig;
    this.currentRig.root.rotation.y = prevRot;

    if (attachDonorWeapons) {
      void attachDonorWeaponToProceduralRig(
        nextRig,
        loadout,
        allCustomModels,
        () => !this.disposed && seq === this.loadSeq && this.currentRig === nextRig,
      );
    }

    if (loadout.weaponId === 'weapon_rifle') {
      // Tactical bladed two-handed sniper rifle stance
      this.currentRig.torsoPivot.rotation.y = -0.45;
      this.currentRig.torsoPivot.rotation.x = 0.06;
      this.currentRig.headPivot.rotation.y = 0.42;
      this.currentRig.rightShoulder.rotation.x = -1.16;
      this.currentRig.rightShoulder.rotation.z = -0.14;
      this.currentRig.rightElbow.rotation.x = -0.34;
      this.currentRig.leftShoulder.rotation.x = -1.06;
      this.currentRig.leftShoulder.rotation.z = -0.58;
      this.currentRig.leftElbow.rotation.x = -0.56;
    } else if (loadout.weaponId === 'weapon_hammer') {
      this.currentRig.bodyGroup.position.y = -0.016;
      this.currentRig.torsoPivot.rotation.order = 'YXZ';
      this.currentRig.torsoPivot.rotation.y = -0.32;
      this.currentRig.torsoPivot.rotation.x = -0.06;
      this.currentRig.torsoPivot.rotation.z = -0.02;
      this.currentRig.headPivot.rotation.y = 0.28;
      this.currentRig.headPivot.rotation.x = 0.06;
      this.currentRig.leftHip.rotation.x = -0.15;
      this.currentRig.leftHip.rotation.z = -0.22;
      this.currentRig.leftKnee.rotation.x = 0.16;
      if (this.currentRig.leftAnkle) {
        this.currentRig.leftAnkle.rotation.set(-0.01, 0, 0.22);
      }
      this.currentRig.rightHip.rotation.x = 0.12;
      this.currentRig.rightHip.rotation.z = 0.22;
      this.currentRig.rightKnee.rotation.x = 0.14;
      if (this.currentRig.rightAnkle) {
        this.currentRig.rightAnkle.rotation.set(-0.26, 0, -0.22);
      }
      this.currentRig.rightShoulder.rotation.order = 'YXZ';
      this.currentRig.rightShoulder.rotation.x = 0.04;
      this.currentRig.rightShoulder.rotation.y = 0.08;
      this.currentRig.rightShoulder.rotation.z = 0.42;
      this.currentRig.rightElbow.rotation.x = -0.38;
      this.currentRig.weaponPivot.rotation.order = 'YXZ';
      this.currentRig.weaponPivot.rotation.set(-1.0163, 0.8201, -0.795);
      this.currentRig.leftShoulder.rotation.x = -0.06;
      this.currentRig.leftShoulder.rotation.y = -0.14;
      this.currentRig.leftShoulder.rotation.z = -0.34;
      this.currentRig.leftElbow.rotation.x = -0.82;
    } else {
      this.currentRig.rightShoulder.rotation.x = -0.35;
      this.currentRig.rightElbow.rotation.x = -0.55;
      this.currentRig.leftShoulder.rotation.x = -0.18;
      this.currentRig.leftShoulder.rotation.z = 0.2;
      this.currentRig.leftElbow.rotation.x = -0.4;
    }
    this.scene.add(this.currentRig.root);
  }

  public setLoadout(
    loadout: LbxLoadout,
    customModel?: CustomModelAsset | null,
    useCustomModel = false,
    allCustomModels?: Partial<Record<ModelStyle, CustomModelAsset>>,
  ) {
    const seq = ++this.loadSeq;
    this.currentWeaponId = loadout.weaponId;
    if (
      (loadout.weaponId !== 'weapon_lance' &&
        loadout.weaponId !== 'weapon_halberd' &&
        loadout.weaponId !== 'weapon_kodachi' &&
        loadout.weaponId !== 'weapon_hammer') ||
      getLoadoutCharacterId(loadout) === 'hunter'
    ) {
      this.guardPreview = false;
    }

    if (useCustomModel && customModel) {
      if (!this.currentRig) {
        this.applyProceduralRig(loadout, false, seq, allCustomModels);
      }
      void buildCustomLbxRig(customModel, loadout, allCustomModels)
        .then((customRig) => {
          if (this.disposed || seq !== this.loadSeq) {
            customRig.dispose();
            return;
          }
          const prevRot = this.currentRig ? this.currentRig.root.rotation.y : 0.35;
          if (this.currentRig) {
            this.scene.remove(this.currentRig.root);
            this.currentRig.dispose();
          }
          customRig.root.rotation.y = prevRot;
          this.currentRig = customRig;
          this.scene.add(customRig.root);
        })
        .catch(() => {
          if (!this.disposed && seq === this.loadSeq && !this.currentRig) {
            this.applyProceduralRig(loadout, true, seq, allCustomModels);
          }
        });
      return;
    }

    this.applyProceduralRig(loadout, true, seq, allCustomModels);
  }

  public setCameraPreset(preset: GarageCameraPreset) {
    if (preset === 'full') {
      this.targetCamPos.set(2.8, 2.05, 3.7);
      this.targetLookAt.set(0, 1.05, 0);
    } else if (preset === 'torso') {
      this.targetCamPos.set(1.45, 1.75, 2.25);
      this.targetLookAt.set(0, 1.4, 0);
    } else {
      this.targetCamPos.set(2.15, 1.3, 1.9);
      this.targetLookAt.set(0.35, 0.95, 0.25);
    }
    this.transitionActive = true;
  }

  public setAutoSpin(val: boolean) {
    this.autoSpin = val;
  }

  public setGuardPreview(val: boolean) {
    this.guardPreview = val;
    if (val) {
      this.testAttackTimer = 0;
    }
  }

  public triggerTestAttack() {
    this.guardPreview = false;
    this.testAttackStep = (this.testAttackStep % 3) + 1;
    const isRifle = this.currentWeaponId === 'weapon_rifle';
    const isHammer = this.currentWeaponId === 'weapon_hammer';
    const isHalberd = this.currentWeaponId === 'weapon_halberd';
    this.testAttackDuration =
      isRifle && this.testAttackStep === 2
        ? 0.8
        : isHammer
          ? 0.82
          : isHalberd
            ? 0.72
            : 0.68;
    this.testAttackTimer = this.testAttackDuration;
    this.shotTriggerStage = 0;
  }

  private spawnRifleShotFx(rig: CustomLbxRig, heavy: boolean) {
    const muzzlePos = new THREE.Vector3();
    rig.muzzlePoint.getWorldPosition(muzzlePos);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      rig.root.getWorldQuaternion(new THREE.Quaternion()),
    );

    const flashMat = new THREE.MeshBasicMaterial({
      color: heavy ? '#FDE047' : '#38BDF8',
      transparent: true,
      opacity: 0.95,
    });
    const flash = new THREE.Mesh(this.flashGeo, flashMat);
    flash.position.copy(muzzlePos);
    flash.scale.setScalar(heavy ? 1.5 : 1.0);
    this.scene.add(flash);
    this.shotFxList.push({
      mesh: flash,
      mats: [flashMat],
      life: 0.14,
      maxLife: 0.14,
      isFlash: true,
    });

    const coreMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.98,
    });
    const tracerMat = new THREE.MeshBasicMaterial({
      color: heavy ? '#F59E0B' : '#38BDF8',
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const boltGrp = new THREE.Group();
    boltGrp.add(new THREE.Mesh(this.tracerCoreGeo, coreMat));
    boltGrp.add(new THREE.Mesh(this.tracerGeo, tracerMat));
    boltGrp.position.copy(muzzlePos).addScaledVector(forward, 0.48);
    boltGrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forward);
    this.scene.add(boltGrp);
    this.shotFxList.push({
      mesh: boltGrp,
      mats: [coreMat, tracerMat],
      life: 0.24,
      maxLife: 0.24,
      vel: forward.clone().multiplyScalar(36),
      isFlash: false,
    });

    soundEngine.playLaser(heavy);
  }

  private onResize = () => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    if (this.currentRig) {
      this.currentRig.mixer?.update(dt);
      if (this.autoSpin && this.testAttackTimer <= 0) {
        this.currentRig.root.rotation.y += dt * 0.42;
      }

      if (this.testAttackTimer > 0) {
        this.testAttackTimer = Math.max(0, this.testAttackTimer - dt);
        const p = 1 - this.testAttackTimer / this.testAttackDuration;
        const active = p >= 0.28 && p <= 0.65;
        const isRifle = this.currentWeaponId === 'weapon_rifle';

        if (isRifle) {
          if (this.testAttackStep === 2) {
            if (this.shotTriggerStage === 0 && p >= 0.18) {
              this.shotTriggerStage = 1;
              this.spawnRifleShotFx(this.currentRig, false);
            } else if (this.shotTriggerStage === 1 && p >= 0.48) {
              this.shotTriggerStage = 2;
              this.spawnRifleShotFx(this.currentRig, false);
            }
          } else if (this.shotTriggerStage === 0 && p >= 0.2) {
            this.shotTriggerStage = 1;
            this.spawnRifleShotFx(this.currentRig, this.testAttackStep === 3);
          }
        }

        if (this.currentRig.isCustomModel) {
          if (this.currentRig.attackSlashMesh) {
            if (active && !isRifle) {
              const sp = (p - 0.28) / 0.37;
              this.currentRig.attackSlashMesh.visible = true;
              this.currentRig.attackSlashMesh.rotation.z =
                this.testAttackStep === 2 ? 0.35 : this.testAttackStep === 3 ? 1.45 : -0.25;
              this.currentRig.attackSlashMesh.rotation.y =
                Math.PI / 2 + (this.testAttackStep === 2 ? -0.9 + sp * 1.8 : -0.4 + sp * 0.8);
              this.currentRig.attackSlashMesh.scale.setScalar(0.85 + sp * 0.45);
              (this.currentRig.attackSlashMesh.material as THREE.MeshBasicMaterial).opacity =
                (1 - sp) * 0.9;
            } else {
              this.currentRig.attackSlashMesh.visible = false;
            }
          }

          if (!this.currentRig.mixer) {
            const usesRifle =
              isRifle &&
              (this.currentRig.hasHangarWeapon ||
                this.currentRig.customCharacterId === 'hunter' ||
                this.currentRig.hasBuiltInWeapon);
            if (usesRifle) {
              const pose = buildCustomRiflePose({
                mode: 'fire',
                elapsed,
                fireProgress: p,
                shotVariant: this.testAttackStep,
                isPartRig: this.currentRig.isPartArticulated,
              });
              applyCustomBonePose(this.currentRig, pose, dt, 26);
            } else if (this.currentWeaponId === 'weapon_lance') {
              const pose = buildCustomLancePose({
                mode: 'strike',
                elapsed,
                strikeProgress: p,
                strikeVariant: this.testAttackStep,
              });
              applyCustomBonePose(this.currentRig, pose, dt, 24);
            } else if (this.currentWeaponId === 'weapon_halberd') {
              const pose = buildCustomHalberdPose({
                mode: 'strike',
                elapsed,
                strikeProgress: p,
                strikeVariant: this.testAttackStep,
              });
              applyCustomBonePose(this.currentRig, pose, dt, 24);
            } else {
              const pose = buildCustomMeleePose({
                mode: 'strike',
                elapsed,
                strikeProgress: p,
                strikeVariant: this.testAttackStep,
                isHeavy: this.currentWeaponId === 'weapon_hammer',
                isTwinBlade: this.currentWeaponId === 'weapon_kodachi',
              });
              applyCustomBonePose(this.currentRig, pose, dt, 24);
            }
          }
        } else if (isRifle) {
          const kick =
            p >= 0.2 && p <= 0.48
              ? Math.sin(((p - 0.2) / 0.28) * Math.PI) * (this.testAttackStep === 3 ? 0.32 : 0.22)
              : 0;
          this.currentRig.torsoPivot.rotation.y = THREE.MathUtils.damp(
            this.currentRig.torsoPivot.rotation.y,
            -0.48,
            22,
            dt,
          );
          this.currentRig.torsoPivot.rotation.x = THREE.MathUtils.damp(
            this.currentRig.torsoPivot.rotation.x,
            0.06 - kick * 0.35,
            24,
            dt,
          );
          this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(
            this.currentRig.rightShoulder.rotation.x,
            -1.18 - kick,
            24,
            dt,
          );
          this.currentRig.leftShoulder.rotation.x = THREE.MathUtils.damp(
            this.currentRig.leftShoulder.rotation.x,
            -1.08 - kick * 0.9,
            24,
            dt,
          );
        } else if (this.currentWeaponId === 'weapon_hammer') {
          this.currentRig.weaponPivot.rotation.order = 'YXZ';
          this.currentRig.weaponPivot.rotation.x = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.x, 0, 22, dt);
          this.currentRig.weaponPivot.rotation.y = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.y, 0, 22, dt);
          this.currentRig.weaponPivot.rotation.z = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.z, 0, 22, dt);
          if (this.testAttackStep === 3) {
            const w = p < 0.28 ? THREE.MathUtils.smoothstep(p, 0, 0.28) : 1;
            const a = p >= 0.28 ? THREE.MathUtils.clamp((p - 0.28) / 0.28, 0, 1) : 0;
            const rec = p >= 0.68 ? THREE.MathUtils.smoothstep(p, 0.68, 1.0) : 0;
            const targetTorsoX = p < 0.28 ? -0.26 * w : p < 0.68 ? THREE.MathUtils.lerp(-0.26, 0.28, a) : THREE.MathUtils.lerp(0.28, -0.06, rec);
            const targetRShX = p < 0.28 ? -2.44 * w : p < 0.68 ? THREE.MathUtils.lerp(-2.44, -1.04, a) : THREE.MathUtils.lerp(-1.04, 0.04, rec);
            const targetLShX = p < 0.28 ? -2.32 * w : p < 0.68 ? THREE.MathUtils.lerp(-2.32, -1.02, a) : THREE.MathUtils.lerp(-1.02, -0.06, rec);
            this.currentRig.torsoPivot.rotation.x = THREE.MathUtils.damp(this.currentRig.torsoPivot.rotation.x, targetTorsoX, 22, dt);
            this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.x, targetRShX, 22, dt);
            this.currentRig.rightShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.y, THREE.MathUtils.lerp(-0.24, 0.08, rec), 22, dt);
            this.currentRig.rightShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.z, THREE.MathUtils.lerp(-0.08, 0.42, rec), 22, dt);
            this.currentRig.rightElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.rightElbow.rotation.x, p < 0.28 ? -0.34 : p < 0.68 ? -0.14 : -0.38, 22, dt);
            this.currentRig.leftShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.x, targetLShX, 22, dt);
            this.currentRig.leftShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.y, THREE.MathUtils.lerp(0.42, -0.14, rec), 22, dt);
            this.currentRig.leftShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.z, THREE.MathUtils.lerp(0.26, -0.34, rec), 22, dt);
            this.currentRig.leftElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.leftElbow.rotation.x, p < 0.28 ? -0.42 : p < 0.68 ? -0.22 : -0.82, 22, dt);
          } else if (this.testAttackStep === 2) {
            const sweep = p < 0.26 ? 1.15 * (p / 0.26) : p < 0.58 ? THREE.MathUtils.lerp(1.15, -1.25, (p - 0.26) / 0.32) : THREE.MathUtils.lerp(-1.25, 0, (p - 0.58) / 0.42);
            this.currentRig.torsoPivot.rotation.y = THREE.MathUtils.damp(this.currentRig.torsoPivot.rotation.y, sweep * 0.66, 22, dt);
            this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.x, -1.16, 22, dt);
            this.currentRig.rightShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.y, -0.2 + sweep * 0.24, 22, dt);
            this.currentRig.rightShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.z, -0.15 + sweep * 0.48, 22, dt);
            this.currentRig.rightElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.rightElbow.rotation.x, p < 0.26 ? -0.52 : -0.18, 22, dt);
            this.currentRig.leftShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.x, -1.12, 22, dt);
            this.currentRig.leftShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.y, 0.45 + sweep * 0.22, 22, dt);
            this.currentRig.leftShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.z, 0.15 + sweep * 0.34, 22, dt);
            this.currentRig.leftElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.leftElbow.rotation.x, p < 0.26 ? -0.58 : -0.32, 22, dt);
          } else {
            const armPhase = p < 0.25 ? -1.3 * (p / 0.25) : p < 0.56 ? THREE.MathUtils.lerp(-1.3, 1.32, (p - 0.25) / 0.31) : THREE.MathUtils.lerp(1.32, 0, (p - 0.56) / 0.44);
            this.currentRig.torsoPivot.rotation.y = THREE.MathUtils.damp(this.currentRig.torsoPivot.rotation.y, armPhase * 0.72, 22, dt);
            this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.x, -1.2, 22, dt);
            this.currentRig.rightShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.z, 0.24 - armPhase * 0.64, 22, dt);
            this.currentRig.rightElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.rightElbow.rotation.x, p < 0.25 ? -0.58 : -0.14, 22, dt);
            this.currentRig.leftShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.x, p < 0.25 ? -0.82 : 0.42, 22, dt);
            this.currentRig.leftShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.z, -0.32, 22, dt);
          }
        } else {
          const swing = p < 0.28 ? -2.0 * (p / 0.28) : THREE.MathUtils.lerp(-2.0, 0.35, Math.min(1, (p - 0.28) / 0.35));
          this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(
            this.currentRig.rightShoulder.rotation.x,
            swing,
            22,
            dt,
          );
          this.currentRig.torsoPivot.rotation.y = THREE.MathUtils.damp(
            this.currentRig.torsoPivot.rotation.y,
            p < 0.28 ? -0.45 : 0.45,
            22,
            dt,
          );
        }
      } else if (!this.currentRig.isCustomModel) {
        const isHammer = this.currentWeaponId === 'weapon_hammer';
        const hammerGuard = isHammer && this.guardPreview;
        this.currentRig.bodyGroup.position.y =
          isHammer && !hammerGuard ? -0.016 : Math.sin(elapsed * 2.2) * 0.018;
        this.currentRig.headPivot.rotation.y =
          (this.currentWeaponId === 'weapon_rifle' ? 0.42 : hammerGuard ? 0.24 : isHammer ? 0.28 : 0) +
          Math.sin(elapsed * 0.9) * 0.04;
        this.currentRig.headPivot.rotation.x = THREE.MathUtils.damp(
          this.currentRig.headPivot.rotation.x,
          isHammer && !hammerGuard ? 0.06 : 0,
          10,
          dt,
        );
        this.currentRig.torsoPivot.rotation.order = 'YXZ';
        this.currentRig.torsoPivot.rotation.y = THREE.MathUtils.damp(
          this.currentRig.torsoPivot.rotation.y,
          this.currentWeaponId === 'weapon_rifle' ? -0.45 : hammerGuard ? -0.28 : isHammer ? -0.32 : 0,
          10,
          dt,
        );
        this.currentRig.torsoPivot.rotation.x = THREE.MathUtils.damp(
          this.currentRig.torsoPivot.rotation.x,
          this.currentWeaponId === 'weapon_rifle' ? 0.06 : isHammer && !hammerGuard ? -0.06 : isHammer ? 0.03 : 0,
          10,
          dt,
        );
        this.currentRig.torsoPivot.rotation.z = THREE.MathUtils.damp(
          this.currentRig.torsoPivot.rotation.z,
          isHammer && !hammerGuard ? -0.02 : 0,
          10,
          dt,
        );
        if (this.currentWeaponId === 'weapon_rifle') {
          this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(
            this.currentRig.rightShoulder.rotation.x,
            -1.16,
            12,
            dt,
          );
          this.currentRig.leftShoulder.rotation.x = THREE.MathUtils.damp(
            this.currentRig.leftShoulder.rotation.x,
            -1.06,
            12,
            dt,
          );
        } else if (isHammer) {
          this.currentRig.guardBubble.visible = false;
          this.currentRig.rightShoulder.rotation.order = 'YXZ';
          this.currentRig.weaponPivot.rotation.order = 'YXZ';
          if (hammerGuard) {
            this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.x, -0.96, 14, dt);
            this.currentRig.rightShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.y, -0.52, 14, dt);
            this.currentRig.rightShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.z, -0.24, 14, dt);
            this.currentRig.rightElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.rightElbow.rotation.x, -0.96, 14, dt);
            this.currentRig.weaponPivot.rotation.x = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.x, 0, 14, dt);
            this.currentRig.weaponPivot.rotation.y = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.y, 0, 14, dt);
            this.currentRig.weaponPivot.rotation.z = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.z, 0, 14, dt);
            this.currentRig.leftShoulder.rotation.x = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.x, 0.16, 14, dt);
            this.currentRig.leftShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.y, 0.08, 14, dt);
            this.currentRig.leftShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.z, -0.32, 14, dt);
            this.currentRig.leftElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.leftElbow.rotation.x, -0.82, 14, dt);
          } else {
            this.currentRig.rightShoulder.rotation.x = THREE.MathUtils.damp(
              this.currentRig.rightShoulder.rotation.x,
              0.04,
              12,
              dt,
            );
            this.currentRig.rightShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.y, 0.08, 12, dt);
            this.currentRig.rightShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.rightShoulder.rotation.z, 0.42, 12, dt);
            this.currentRig.rightElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.rightElbow.rotation.x, -0.38, 12, dt);
            this.currentRig.weaponPivot.rotation.x = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.x, -1.0163, 12, dt);
            this.currentRig.weaponPivot.rotation.y = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.y, 0.8201, 12, dt);
            this.currentRig.weaponPivot.rotation.z = THREE.MathUtils.damp(this.currentRig.weaponPivot.rotation.z, -0.795, 12, dt);
            this.currentRig.leftShoulder.rotation.x = THREE.MathUtils.damp(
              this.currentRig.leftShoulder.rotation.x,
              -0.06 + Math.sin(elapsed * 2.0) * 0.012,
              12,
              dt,
            );
            this.currentRig.leftShoulder.rotation.y = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.y, -0.14, 12, dt);
            this.currentRig.leftShoulder.rotation.z = THREE.MathUtils.damp(this.currentRig.leftShoulder.rotation.z, -0.34, 12, dt);
            this.currentRig.leftElbow.rotation.x = THREE.MathUtils.damp(this.currentRig.leftElbow.rotation.x, -0.82, 12, dt);
          }
        }
      } else {
        if (this.currentRig.attackSlashMesh) {
          this.currentRig.attackSlashMesh.visible = false;
        }
        if (!this.currentRig.mixer) {
          let idlePose: CustomBonePose = createZeroCustomPose();
          const usesRifle =
            this.currentWeaponId === 'weapon_rifle' &&
            (this.currentRig.hasHangarWeapon ||
              this.currentRig.customCharacterId === 'hunter' ||
              this.currentRig.hasBuiltInWeapon);
          if (usesRifle) {
            idlePose = buildCustomRiflePose({
              mode: 'aim',
              elapsed,
              isPartRig: this.currentRig.isPartArticulated,
            });
          } else if (this.currentWeaponId === 'weapon_lance') {
            idlePose = buildCustomLancePose({
              mode: this.guardPreview ? 'guard' : 'ready',
              elapsed,
            });
          } else if (this.currentWeaponId === 'weapon_halberd') {
            idlePose = buildCustomHalberdPose({
              mode: this.guardPreview ? 'guard' : 'ready',
              elapsed,
            });
          } else {
            idlePose = buildCustomMeleePose({
              mode: this.guardPreview ? 'guard' : 'ready',
              elapsed,
              isHeavy: this.currentWeaponId === 'weapon_hammer',
              isTwinBlade: this.currentWeaponId === 'weapon_kodachi',
            });
          }
          applyCustomBonePose(this.currentRig, idlePose, dt, 14);
        }
      }
    }

    for (let i = this.shotFxList.length - 1; i >= 0; i--) {
      const fx = this.shotFxList[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        fx.mats.forEach((m) => m.dispose());
        this.shotFxList.splice(i, 1);
        continue;
      }
      if (fx.vel) {
        fx.mesh.position.addScaledVector(fx.vel, dt);
      }
      const alpha = fx.life / fx.maxLife;
      fx.mats.forEach((m) => {
        m.opacity = alpha;
      });
      if (fx.isFlash) {
        fx.mesh.scale.setScalar(0.5 + (1 - alpha) * 1.4);
      }
    }

    if (this.transitionActive) {
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.targetCamPos.x, 7, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.targetCamPos.y, 7, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.targetCamPos.z, 7, dt);

      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.targetLookAt.x, 7, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.targetLookAt.y, 7, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.targetLookAt.z, 7, dt);

      if (this.camera.position.distanceTo(this.targetCamPos) < 0.02) {
        this.transitionActive = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.shotFxList.forEach((fx) => {
      this.scene.remove(fx.mesh);
      fx.mats.forEach((m) => m.dispose());
    });
    this.shotFxList = [];
    this.flashGeo.dispose();
    this.tracerCoreGeo.dispose();
    this.tracerGeo.dispose();
    if (this.currentRig) {
      this.currentRig.dispose();
    }
    this.pedestalGeos.forEach((g) => g.dispose());
    this.pedestalMats.forEach((m) => m.dispose());
    this.disposeEnv();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
