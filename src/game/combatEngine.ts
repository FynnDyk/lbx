import * as THREE from 'three';
import { TacticalAiBrain } from './aiController';
import { FighterDamageController } from './battleDamage';
import {
  buildArenaScene,
  detectSoftwareWebGL,
  InteractableRuntimeVisual,
  ObstacleRuntimeVisual,
  setupStudioEnvironment,
} from './arenas';
import {
  computeLoadoutStats,
  getArenaById,
  getLoadoutCharacterId,
  getWeaponById,
} from './catalog';
import {
  applyCustomBonePose,
  attachDonorWeaponToProceduralRig,
  buildCustomHalberdPose,
  buildCustomJumpPose,
  buildCustomLancePose,
  buildCustomLbxRig,
  buildCustomMeleePose,
  buildCustomRiflePose,
  createZeroCustomPose,
  CustomBonePose,
  CustomIkOverride,
  CustomLbxRig,
  startCustomSpecialClip,
  stopCustomSpecialClip,
} from './customModelLoader';
import { CustomModelAsset } from './customModelStorage';
import {
  createFighterLocomotionState,
  FighterLocomotionState,
  updateFootLocomotion,
} from './footLocomotion';
import { buildLbxModel } from './lbxModel';
import {
  ACHILLES_SKILL_UNLOCKS,
  isLevelProgressionCharacter,
  MAX_EXPLOSION_CELLS,
} from './progression';
import { soundEngine } from './sound';
import {
  AiPersonality,
  AiTacticalState,
  ArenaConfig,
  ArenaId,
  ArenaInteractable,
  ArenaObstacle,
  BattleHudSnapshot,
  BattleSkillSlotHud,
  ComputedLbxStats,
  LbxLoadout,
  LbxWeapon,
  ModelStyle,
} from './types';

interface FighterRuntime {
  isPlayer: boolean;
  name: string;
  loadout: LbxLoadout;
  characterId: ModelStyle;
  level: number;
  usesAchillesProgression: boolean;
  stats: ComputedLbxStats;
  weapon: LbxWeapon;
  rig: CustomLbxRig;

  pos: THREE.Vector3;
  vel: THREE.Vector3;
  velY: number;
  groundY: number;
  isGrounded: boolean;
  jumpSquashTimer: number;
  airAttacking: boolean;
  yaw: number;
  targetYaw: number;

  hp: number;
  energy: number;
  special: number;
  explosionCells: number;
  maxExplosionCells: number;
  overheatSparkTimer: number;

  isGuarding: boolean;
  isAiming: boolean;
  guardStartTime: number;
  isDashing: boolean;
  dashTimer: number;
  dashCooldown: number;
  dashDir: THREE.Vector3;

  skillRCooldown: number;
  skillECooldown: number;
  activeSkill: 'none' | 'lunge_r' | 'thunder_e' | 'cyclone_f';

  attackPhase: 'none' | 'windup' | 'active' | 'recover';
  attackTimer: number;
  attackDuration: number;
  comboStep: number;
  attackSwingFlip: number;
  comboResetTimer: number;
  attackCooldown: number;
  hasHitCurrentSwing: boolean;
  isSpecialAttack: boolean;
  isOdinClipSpecial: boolean;
  specialStage: number;
  missileRearmTimer: number;
  launchedBySpecial: boolean;

  stunTimer: number;
  hitFlashTimer: number;
  invulnTimer: number;
  comboCounter: number;
  comboDecayTimer: number;
  stridePhase: number;
  locomotion: FighterLocomotionState;
  aimTorsoYaw: number;
  aimTorsoPitch: number;
  damageCtrl: FighterDamageController;
  aiState?: AiTacticalState;
}

interface ObstacleState {
  data: ArenaObstacle;
  id: string;
  hp: number;
  destroyed: boolean;
}

interface InteractableState {
  data: ArenaInteractable;
  cooldown: number;
}

interface Projectile {
  active: boolean;
  ownerIsPlayer: boolean;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  isSpecial: boolean;
  mesh: THREE.Group;
}

interface StingerMissile {
  active: boolean;
  ownerIsPlayer: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  damage: number;
  smokeTimer: number;
  isFinal: boolean;
  mesh: THREE.Group;
  defaultVisual: THREE.Group;
  customVisual: THREE.Object3D | null;
}

interface LightningBolt {
  active: boolean;
  life: number;
  maxLife: number;
  group: THREE.Group;
  segments: THREE.Mesh[];
  mats: THREE.MeshBasicMaterial[];
}

interface SparkParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

interface HitFlare {
  active: boolean;
  life: number;
  maxLife: number;
  baseScale: number;
  group: THREE.Group;
  mats: THREE.MeshBasicMaterial[];
}

interface ShockwaveRing {
  active: boolean;
  life: number;
  maxLife: number;
  maxRadius: number;
  mesh: THREE.Mesh;
}

interface ExplosionBlast {
  active: boolean;
  life: number;
  maxLife: number;
  scale: number;
  group: THREE.Group;
  core: THREE.Mesh;
  fireball: THREE.Mesh;
  cloud: THREE.Mesh;
  ring: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  fireMat: THREE.MeshBasicMaterial;
  cloudMat: THREE.MeshBasicMaterial;
  ringMat: THREE.MeshBasicMaterial;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _impactPt = new THREE.Vector3();
const _impactDir = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _currentCamLook = new THREE.Vector3();
const _targetCenter = new THREE.Vector3();

const DASH_STAMINA_COST = 25;
const DASH_COOLDOWN_SEC = 1.0;

function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = shortestAngleDiff(current, target);
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export interface CombatCallbacks {
  onHudUpdate: (snapshot: BattleHudSnapshot) => void;
  onBattleEnd: (outcome: 'victory' | 'defeat', snapshot: BattleHudSnapshot) => void;
  onPointerLockChange?: (locked: boolean) => void;
  onRequestPause?: () => void;
}

export class LbxCombatEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private disposeEnv: () => void;
  private disposeArena: () => void;
  private sunLight: THREE.DirectionalLight | null = null;
  private readonly sunDir = new THREE.Vector3(34, 44, 26).normalize();

  private arena: ArenaConfig;
  private obstacleStates: ObstacleState[];
  private obstacleVisuals: Map<string, ObstacleRuntimeVisual>;
  private interactableStates: InteractableState[];
  private interactableVisuals: Map<string, InteractableRuntimeVisual>;
  private activeObstaclesScratch: ArenaObstacle[] = [];
  private readyInteractablesScratch: ArenaInteractable[] = [];

  private player: FighterRuntime;
  private enemy: FighterRuntime;
  private aiBrain: TacticalAiBrain;
  private callbacks: CombatCallbacks;

  private keys = new Set<string>();
  private mouseAttackQueued = false;
  private mouseGuardHeld = false;
  private lockOnActive = false;
  private camOrbitYaw = Math.PI;
  private camOrbitPitch = 0.36;
  private camDistance = 7.0;
  private cameraShake = 0;
  private lastPointerX: number | null = null;
  private lastPointerY: number | null = null;
  private pointerEdgeRate = 0;
  private activeTouchId: number | null = null;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private mouseSensitivity = 1.0;
  private wasPointerLocked = false;

  private projectiles: Projectile[] = [];
  private missiles: StingerMissile[] = [];
  private lightningBolts: LightningBolt[] = [];
  private sparks: SparkParticle[] = [];
  private hitFlares: HitFlare[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private explosions: ExplosionBlast[] = [];
  private thunderLight!: THREE.PointLight;
  private thunderAuraGroup!: THREE.Group;
  private thunderOuterRing!: THREE.Mesh;
  private thunderInnerRing!: THREE.Mesh;
  private thunderPillar!: THREE.Mesh;
  private thunderSpearOrb!: THREE.Group;
  private thunderPrismCore!: THREE.Mesh;
  private thunderPrismShell!: THREE.Mesh;
  private thunderPrismWire!: THREE.Mesh;
  private thunderPrismShellBasePos!: Float32Array;
  private thunderPrismWireBasePos!: Float32Array;
  private thunderPrismJitterTimer = 0;
  private thunderSpearArcA!: THREE.Mesh;
  private thunderSpearArcB!: THREE.Mesh;
  private thunderCurtainStreaks: THREE.Mesh[] = [];
  private thunderLanceCone!: THREE.Mesh;
  private thunderConeRings: THREE.Mesh[] = [];
  private cycloneVortexGroup!: THREE.Group;
  private cycloneOuterCone!: THREE.Mesh;
  private cycloneInnerCone!: THREE.Mesh;
  private cycloneRings: THREE.Mesh[] = [];
  private pendingCoreExplosions: Array<{
    delay: number;
    x: number;
    y: number;
    z: number;
    scale: number;
    shockColor: string;
  }> = [];
  private thunderAuraTimer = 0;
  private thunderFlashIntensity = 0;
  private thunderCutInProgress = -1;
  private lastThunderShot = -1;
  private thunderShotActive = false;
  private thunderShotTimer = 0;
  private thunderShotDuration = 0.34;
  private thunderShotOrigin = new THREE.Vector3();
  private thunderShotPos = new THREE.Vector3();
  private thunderShotCaster: FighterRuntime | null = null;
  private thunderShotTarget: FighterRuntime | null = null;
  private thunderShotArcCooldown = 0;
  private sharedGeos: THREE.BufferGeometry[] = [];
  private sharedMats: THREE.Material[] = [];

  private clock = new THREE.Clock();
  private elapsedTime = 0;
  private hudEmitTimer = 0;
  private bannerText: string | null = 'БОЙ НАЧАЛСЯ!';
  private bannerTimer = 1.8;
  private outcome: 'ongoing' | 'victory' | 'defeat' = 'ongoing';
  private outcomeDelayTimer = 0;
  private paused = false;

  private damageDealt = 0;
  private parriesLanded = 0;
  private specialsUsed = 0;

  private frameId = 0;
  private disposed = false;
  private virtualMove = { x: 0, z: 0 };

  constructor(
    container: HTMLElement,
    playerLoadout: LbxLoadout,
    enemyLoadout: LbxLoadout,
    enemyName: string,
    arenaId: ArenaId,
    aiPersonality: AiPersonality,
    callbacks: CombatCallbacks,
    playerCustomModel?: CustomModelAsset | null,
    mouseSensitivity = 1.0,
    enemyCustomModel?: CustomModelAsset | null,
    allCustomModels?: Partial<Record<ModelStyle, CustomModelAsset>>,
    playerLevel = 0,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.mouseSensitivity = THREE.MathUtils.clamp(mouseSensitivity, 0.2, 2.5);
    this.isSoftwareGl = detectSoftwareWebGL();
    this.arena = getArenaById(arenaId);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.arena.skyColor);
    this.scene.fog = new THREE.FogExp2(
      this.arena.fogColor,
      this.arena.id === 'meadow' ? 0.0024 : 0.011,
    );

    this.camera = new THREE.PerspectiveCamera(
      48,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      520,
    );

    this.disposeEnv = setupStudioEnvironment(
      this.renderer,
      this.scene,
      this.isSoftwareGl,
      this.arena.id === 'meadow',
      (light) => {
        this.sunLight = light;
      },
    );

    const builtArena = buildArenaScene(
      this.arena,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.scene.add(builtArena.group);
    this.disposeArena = builtArena.dispose;
    this.obstacleVisuals = builtArena.obstacleVisuals;
    this.interactableVisuals = builtArena.interactableVisuals;

    this.obstacleStates = this.arena.obstacles.map((o, idx) => ({
      data: o,
      id: o.id ?? `obs_${idx}`,
      hp: o.maxHp ?? 140,
      destroyed: false,
    }));
    this.interactableStates = this.arena.interactables.map((node) => ({
      data: node,
      cooldown: 0,
    }));

    const spawnOffset =
      this.arena.id === 'meadow' ? 21.0 : Math.min(13.5, this.arena.radius * 0.56);
    this.player = this.createFighter(true, 'Игрок (Бан)', playerLoadout, -spawnOffset, playerLevel);
    this.enemy = this.createFighter(false, enemyName, enemyLoadout, spawnOffset, 0);
    this.player.yaw = 0;
    this.player.targetYaw = 0;
    this.enemy.yaw = Math.PI;
    this.enemy.targetYaw = Math.PI;
    this.player.rig.root.rotation.y = this.player.yaw;
    this.enemy.rig.root.rotation.y = this.enemy.yaw;

    this.scene.add(this.player.rig.root);
    this.scene.add(this.enemy.rig.root);

    if (playerCustomModel) {
      void buildCustomLbxRig(playerCustomModel, playerLoadout, allCustomModels)
        .then((customRig) => {
          if (this.disposed) {
            customRig.dispose();
            return;
          }
          const prevRig = this.player.rig;
          customRig.root.position.copy(this.player.pos);
          customRig.root.rotation.y = this.player.yaw;
          customRig.guardBubble.visible = prevRig.guardBubble.visible;
          this.scene.remove(prevRig.root);
          prevRig.dispose();
          this.player.rig = customRig;
          this.player.damageCtrl.attachToMaterials(customRig.hitFlashMaterials);
          this.scene.add(customRig.root);
        })
        .catch(() => {
          // Keep procedural rig if custom model fails to parse
        });
    } else {
      const initialPlayerRig = this.player.rig;
      void attachDonorWeaponToProceduralRig(
        initialPlayerRig,
        playerLoadout,
        allCustomModels,
        () => !this.disposed && this.player.rig === initialPlayerRig,
      ).then((attached) => {
        if (attached && !this.disposed && this.player.rig === initialPlayerRig) {
          this.player.damageCtrl.attachToMaterials(initialPlayerRig.hitFlashMaterials);
        }
      });
    }

    if (enemyCustomModel) {
      void buildCustomLbxRig(enemyCustomModel, enemyLoadout, allCustomModels)
        .then((customRig) => {
          if (this.disposed) {
            customRig.dispose();
            return;
          }
          const prevRig = this.enemy.rig;
          customRig.root.position.copy(this.enemy.pos);
          customRig.root.rotation.y = this.enemy.yaw;
          customRig.guardBubble.visible = prevRig.guardBubble.visible;
          this.scene.remove(prevRig.root);
          prevRig.dispose();
          this.enemy.rig = customRig;
          this.enemy.damageCtrl.attachToMaterials(customRig.hitFlashMaterials);
          this.scene.add(customRig.root);
        })
        .catch(() => {
          // Keep procedural rig if custom model fails to parse
        });
    } else {
      const initialEnemyRig = this.enemy.rig;
      void attachDonorWeaponToProceduralRig(
        initialEnemyRig,
        enemyLoadout,
        allCustomModels,
        () => !this.disposed && this.enemy.rig === initialEnemyRig,
      ).then((attached) => {
        if (attached && !this.disposed && this.enemy.rig === initialEnemyRig) {
          this.enemy.damageCtrl.attachToMaterials(initialEnemyRig.hitFlashMaterials);
        }
      });
    }

    this.aiBrain = new TacticalAiBrain(aiPersonality);

    this.initVfxPools();
    this.initCameraPosition();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.updateCursorVisibility();
    this.requestPointerLock();
    this.emitHud();
    this.tick();
  }

  private createFighter(
    isPlayer: boolean,
    name: string,
    loadout: LbxLoadout,
    startZ: number,
    level = 0,
  ): FighterRuntime {
    const stats = computeLoadoutStats(loadout);
    const weapon = getWeaponById(loadout.weaponId);
    const characterId = getLoadoutCharacterId(loadout);
    const usesAchillesProgression = isPlayer && isLevelProgressionCharacter(characterId);
    const rig = buildLbxModel(loadout);
    rig.root.position.set(0, 0, startZ);

    const damageCtrl = new FighterDamageController();
    damageCtrl.attachToMaterials(rig.hitFlashMaterials);

    return {
      isPlayer,
      name,
      loadout,
      characterId,
      level,
      usesAchillesProgression,
      stats,
      weapon,
      rig,
      pos: new THREE.Vector3(0, 0, startZ),
      vel: new THREE.Vector3(),
      velY: 0,
      groundY: 0,
      isGrounded: true,
      jumpSquashTimer: 0,
      airAttacking: false,
      yaw: 0,
      targetYaw: 0,
      hp: stats.maxHp,
      energy: stats.maxEnergy,
      special: usesAchillesProgression ? 0 : 25,
      explosionCells: MAX_EXPLOSION_CELLS,
      maxExplosionCells: MAX_EXPLOSION_CELLS,
      overheatSparkTimer: 0,
      isGuarding: false,
      isAiming: false,
      guardStartTime: 0,
      isDashing: false,
      dashTimer: 0,
      dashCooldown: 0,
      dashDir: new THREE.Vector3(),
      skillRCooldown: 0,
      skillECooldown: 0,
      activeSkill: 'none',
      attackPhase: 'none',
      attackTimer: 0,
      attackDuration: 0.4,
      comboStep: 0,
      attackSwingFlip: 0,
      comboResetTimer: 0,
      attackCooldown: 0,
      hasHitCurrentSwing: false,
      isSpecialAttack: false,
      isOdinClipSpecial: false,
      specialStage: 0,
      missileRearmTimer: 0,
      launchedBySpecial: false,
      stunTimer: 0,
      hitFlashTimer: 0,
      invulnTimer: 0,
      comboCounter: 0,
      comboDecayTimer: 0,
      stridePhase: 0,
      locomotion: createFighterLocomotionState(),
      aimTorsoYaw: 0,
      aimTorsoPitch: 0,
      damageCtrl,
    };
  }

  private initVfxPools() {
    // Sleek futuristic plasma-rail sniper bolts (white-hot needle core + additive glowing sheath + nose flare)
    const coreGeo = new THREE.CylinderGeometry(0.028, 0.014, 1.35, 8);
    coreGeo.rotateX(Math.PI / 2);
    const sheathGeo = new THREE.CylinderGeometry(0.088, 0.036, 1.75, 8);
    sheathGeo.rotateX(Math.PI / 2);
    const tipGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const finGeo = new THREE.BoxGeometry(0.24, 0.014, 0.55);
    this.sharedGeos.push(coreGeo, sheathGeo, tipGeo, finGeo);

    const coreMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
    const playerSheathMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const enemySheathMat = new THREE.MeshBasicMaterial({
      color: '#FB923C',
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedMats.push(coreMat, playerSheathMat, enemySheathMat);

    for (let i = 0; i < 24; i++) {
      const isPlayer = i < 12;
      const sheathMat = isPlayer ? playerSheathMat : enemySheathMat;
      const grp = new THREE.Group();
      const core = new THREE.Mesh(coreGeo, coreMat);
      const sheath = new THREE.Mesh(sheathGeo, sheathMat);
      const tip = new THREE.Mesh(tipGeo, sheathMat);
      tip.position.z = 0.65;
      const fins = new THREE.Mesh(finGeo, sheathMat);
      fins.position.z = -0.35;
      grp.add(core, sheath, tip, fins);
      grp.visible = false;
      this.scene.add(grp);
      this.projectiles.push({
        active: false,
        ownerIsPlayer: isPlayer,
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        damage: 78,
        life: 0,
        isSpecial: false,
        mesh: grp,
      });
    }

    // Stinger Homing Missile Pool (fallback sleek tactical missile + slot for cloned Hunter back-missiles)
    const mslBodyGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.52, 8);
    mslBodyGeo.rotateX(Math.PI / 2);
    const mslConeGeo = new THREE.ConeGeometry(0.062, 0.18, 8);
    mslConeGeo.rotateX(Math.PI / 2);
    const mslFinGeo = new THREE.BoxGeometry(0.22, 0.015, 0.14);
    const mslFlameGeo = new THREE.ConeGeometry(0.055, 0.34, 8);
    mslFlameGeo.rotateX(-Math.PI / 2);
    this.sharedGeos.push(mslBodyGeo, mslConeGeo, mslFinGeo, mslFlameGeo);

    const mslBodyMat = new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      metalness: 0.72,
      roughness: 0.25,
    });
    const mslConeMat = new THREE.MeshStandardMaterial({
      color: '#EF4444',
      metalness: 0.4,
      roughness: 0.35,
    });
    const mslFlameMat = new THREE.MeshBasicMaterial({
      color: '#FDE047',
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedMats.push(mslBodyMat, mslConeMat, mslFlameMat);

    for (let i = 0; i < 10; i++) {
      const rootGrp = new THREE.Group();
      const defaultVisual = new THREE.Group();
      const body = new THREE.Mesh(mslBodyGeo, mslBodyMat);
      const nose = new THREE.Mesh(mslConeGeo, mslConeMat);
      nose.position.z = 0.34;
      const finH = new THREE.Mesh(mslFinGeo, mslConeMat);
      finH.position.z = -0.18;
      const finV = new THREE.Mesh(mslFinGeo, mslConeMat);
      finV.rotation.z = Math.PI / 2;
      finV.position.z = -0.18;
      defaultVisual.add(body, nose, finH, finV);
      const flame = new THREE.Mesh(mslFlameGeo, mslFlameMat);
      flame.position.z = -0.36;
      rootGrp.add(defaultVisual, flame);
      rootGrp.visible = false;
      this.scene.add(rootGrp);
      this.missiles.push({
        active: false,
        ownerIsPlayer: i < 5,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 0,
        damage: 40,
        smokeTimer: 0,
        isFinal: false,
        mesh: rootGrp,
        defaultVisual,
        customVisual: null,
      });
    }

    // 3D Lightning Bolt Pool for Achilles' "Удар Грозы" (20 bolts x 8 jagged segments)
    const boltSegGeo = new THREE.CylinderGeometry(0.068, 0.068, 1, 6);
    boltSegGeo.rotateX(Math.PI / 2);
    this.sharedGeos.push(boltSegGeo);
    for (let i = 0; i < 20; i++) {
      const group = new THREE.Group();
      const segments: THREE.Mesh[] = [];
      const mats: THREE.MeshBasicMaterial[] = [];
      for (let s = 0; s < 8; s++) {
        const mat = new THREE.MeshBasicMaterial({
          color: s % 3 === 0 ? '#FFFFFF' : s % 2 === 0 ? '#38BDF8' : '#FDE047',
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.sharedMats.push(mat);
        const seg = new THREE.Mesh(boltSegGeo, mat);
        group.add(seg);
        segments.push(seg);
        mats.push(mat);
      }
      group.visible = false;
      this.scene.add(group);
      this.lightningBolts.push({
        active: false,
        life: 0,
        maxLife: 0.36,
        group,
        segments,
        mats,
      });
    }

    // Dynamic storm point light + ground/spear thunder aura for "Удар Грозы"
    this.thunderLight = new THREE.PointLight('#60A5FA', 0, 28, 1.35);
    this.scene.add(this.thunderLight);

    this.thunderAuraGroup = new THREE.Group();
    this.thunderAuraGroup.visible = false;

    const outerRingGeo = new THREE.RingGeometry(1.35, 1.82, 36);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(outerRingGeo);
    this.sharedMats.push(outerRingMat);
    this.thunderOuterRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    this.thunderOuterRing.position.y = 0.08;

    const trimTorusGeo = new THREE.TorusGeometry(1.6, 0.036, 8, 36);
    trimTorusGeo.rotateX(Math.PI / 2);
    const trimTorusMat = new THREE.MeshBasicMaterial({
      color: '#FDE047',
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(trimTorusGeo);
    this.sharedMats.push(trimTorusMat);
    const trimTorus = new THREE.Mesh(trimTorusGeo, trimTorusMat);
    this.thunderOuterRing.add(trimTorus);

    const innerRingGeo = new THREE.RingGeometry(0.62, 0.96, 24);
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: '#7DD3FC',
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(innerRingGeo);
    this.sharedMats.push(innerRingMat);
    this.thunderInnerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    this.thunderInnerRing.position.y = 0.12;

    const pillarGeo = new THREE.CylinderGeometry(0.24, 0.68, 16, 16, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(pillarGeo);
    this.sharedMats.push(pillarMat);
    this.thunderPillar = new THREE.Mesh(pillarGeo, pillarMat);
    this.thunderPillar.position.y = 8.0;

    // Dynamic crackling triangular-prism lightning aura shaped like Achilles' spearhead
    this.thunderSpearOrb = new THREE.Group();
    this.thunderSpearOrb.visible = false;

    const prismCoreGeo = new THREE.ConeGeometry(0.16, 0.72, 3, 5);
    prismCoreGeo.translate(0, 0.14, 0);
    const prismCoreMat = new THREE.MeshBasicMaterial({
      color: '#E0F2FE',
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(prismCoreGeo);
    this.sharedMats.push(prismCoreMat);
    this.thunderPrismCore = new THREE.Mesh(prismCoreGeo, prismCoreMat);

    const prismShellGeo = new THREE.ConeGeometry(0.28, 0.92, 3, 6, true);
    prismShellGeo.translate(0, 0.12, 0);
    this.thunderPrismShellBasePos = new Float32Array(
      (prismShellGeo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
    );
    const prismShellMat = new THREE.MeshBasicMaterial({
      color: '#2563EB',
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(prismShellGeo);
    this.sharedMats.push(prismShellMat);
    this.thunderPrismShell = new THREE.Mesh(prismShellGeo, prismShellMat);

    const prismWireGeo = new THREE.ConeGeometry(0.32, 0.96, 3, 6, true);
    prismWireGeo.translate(0, 0.12, 0);
    this.thunderPrismWireBasePos = new Float32Array(
      (prismWireGeo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
    );
    const prismWireMat = new THREE.MeshBasicMaterial({
      color: '#7DD3FC',
      transparent: true,
      opacity: 0.88,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(prismWireGeo);
    this.sharedMats.push(prismWireMat);
    this.thunderPrismWire = new THREE.Mesh(prismWireGeo, prismWireMat);

    const spearArcGeo = new THREE.TorusGeometry(0.34, 0.022, 4, 3);
    const spearArcMat = new THREE.MeshBasicMaterial({
      color: '#60A5FA',
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(spearArcGeo);
    this.sharedMats.push(spearArcMat);
    this.thunderSpearArcA = new THREE.Mesh(spearArcGeo, spearArcMat);
    this.thunderSpearArcA.rotation.x = Math.PI / 2;
    this.thunderSpearArcA.position.y = -0.06;
    this.thunderSpearArcB = new THREE.Mesh(spearArcGeo, spearArcMat);
    this.thunderSpearArcB.rotation.x = Math.PI / 2;
    this.thunderSpearArcB.rotation.z = Math.PI / 3;
    this.thunderSpearArcB.position.y = 0.12;
    this.thunderSpearArcB.scale.setScalar(0.68);

    this.thunderSpearOrb.add(
      this.thunderPrismCore,
      this.thunderPrismShell,
      this.thunderPrismWire,
      this.thunderSpearArcA,
      this.thunderSpearArcB,
    );
    this.scene.add(this.thunderSpearOrb);

    // Rising anime energy curtain streaks surrounding Achilles during charge (Shot 1 & 3)
    const streakGeo = new THREE.CylinderGeometry(0.045, 0.09, 6.2, 6, 1, true);
    this.sharedGeos.push(streakGeo);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const rad = 1.05 + (i % 3) * 0.48;
      const streakMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? '#E0F2FE' : i % 2 === 0 ? '#38BDF8' : '#0EA5E9',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.sharedMats.push(streakMat);
      const streak = new THREE.Mesh(streakGeo, streakMat);
      streak.position.set(Math.cos(ang) * rad, 1.4 + (i % 4) * 0.7, Math.sin(ang) * rad);
      streak.userData = { baseY: 1.4 + (i % 4) * 0.65, speed: 5.5 + (i % 3) * 2.1, phase: i * 0.7 };
      this.thunderAuraGroup.add(streak);
      this.thunderCurtainStreaks.push(streak);
    }

    // Blazing Lightning Lance energy thrust cone & spiral shock rings (Shot 4 & active lunge)
    const coneGeo = new THREE.ConeGeometry(0.92, 4.4, 20, 1, true);
    coneGeo.rotateX(Math.PI / 2);
    coneGeo.translate(0, 0, 2.2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: '#7DD3FC',
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(coneGeo);
    this.sharedMats.push(coneMat);
    this.thunderLanceCone = new THREE.Mesh(coneGeo, coneMat);
    this.thunderLanceCone.visible = false;

    for (let r = 0; r < 3; r++) {
      const ringConeGeo = new THREE.TorusGeometry(0.45 + r * 0.34, 0.042, 8, 28);
      const ringConeMat = new THREE.MeshBasicMaterial({
        color: r === 0 ? '#FFFFFF' : '#38BDF8',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.sharedGeos.push(ringConeGeo);
      this.sharedMats.push(ringConeMat);
      const cRing = new THREE.Mesh(ringConeGeo, ringConeMat);
      cRing.position.z = 0.55 + r * 1.05;
      cRing.rotation.x = r * 0.22;
      cRing.rotation.y = -r * 0.18;
      this.thunderLanceCone.add(cRing);
      this.thunderConeRings.push(cRing);
    }
    this.scene.add(this.thunderLanceCone);

    this.thunderAuraGroup.add(this.thunderOuterRing, this.thunderInnerRing, this.thunderPillar);
    this.scene.add(this.thunderAuraGroup);

    // Cyclone Tornado Vortex VFX for Achilles Lv.10 "Разящий вихрь"
    this.cycloneVortexGroup = new THREE.Group();
    this.cycloneVortexGroup.visible = false;

    const cycOuterGeo = new THREE.ConeGeometry(1.48, 4.7, 20, 4, true);
    cycOuterGeo.rotateX(Math.PI / 2);
    cycOuterGeo.translate(0, 0, 1.35);
    const cycOuterMat = new THREE.MeshBasicMaterial({
      color: '#2DD4BF',
      transparent: true,
      opacity: 0.54,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(cycOuterGeo);
    this.sharedMats.push(cycOuterMat);
    this.cycloneOuterCone = new THREE.Mesh(cycOuterGeo, cycOuterMat);

    const cycInnerGeo = new THREE.ConeGeometry(0.72, 4.1, 16, 4, true);
    cycInnerGeo.rotateX(Math.PI / 2);
    cycInnerGeo.translate(0, 0, 1.5);
    const cycInnerMat = new THREE.MeshBasicMaterial({
      color: '#CCFBF1',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sharedGeos.push(cycInnerGeo);
    this.sharedMats.push(cycInnerMat);
    this.cycloneInnerCone = new THREE.Mesh(cycInnerGeo, cycInnerMat);
    this.cycloneVortexGroup.add(this.cycloneOuterCone, this.cycloneInnerCone);

    for (let r = 0; r < 5; r++) {
      const cycRingGeo = new THREE.TorusGeometry(0.42 + r * 0.24, 0.048, 8, 28);
      const cycRingMat = new THREE.MeshBasicMaterial({
        color: r % 2 === 0 ? '#5EEAD4' : '#E0F2FE',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.sharedGeos.push(cycRingGeo);
      this.sharedMats.push(cycRingMat);
      const cRing = new THREE.Mesh(cycRingGeo, cycRingMat);
      cRing.position.z = -0.3 + r * 0.88;
      cRing.rotation.x = (r % 2 === 0 ? 1 : -1) * 0.16;
      this.cycloneVortexGroup.add(cRing);
      this.cycloneRings.push(cRing);
    }
    this.scene.add(this.cycloneVortexGroup);

    // High-velocity elongated streak sparks (160 pooled with independent per-spark additive materials)
    const sparkGeo = new THREE.CylinderGeometry(0.017, 0.004, 0.4, 5);
    sparkGeo.rotateX(Math.PI / 2);
    this.sharedGeos.push(sparkGeo);

    for (let i = 0; i < 160; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#FDE047',
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.sharedMats.push(mat);
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.35,
        mesh,
        mat,
      });
    }

    // Crisp contact impact flare starbursts (8 pooled)
    const flareCoreGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const flareBladeGeo = new THREE.OctahedronGeometry(0.45, 0);
    flareBladeGeo.scale(0.14, 1.0, 0.14);
    this.sharedGeos.push(flareCoreGeo, flareBladeGeo);

    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const coreMat = new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const bladeMat = new THREE.MeshBasicMaterial({
        color: '#FBBF24',
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.sharedMats.push(coreMat, bladeMat);
      const core = new THREE.Mesh(flareCoreGeo, coreMat);
      const bladeA = new THREE.Mesh(flareBladeGeo, bladeMat);
      bladeA.rotation.z = Math.PI * 0.25;
      const bladeB = new THREE.Mesh(flareBladeGeo, bladeMat);
      bladeB.rotation.z = -Math.PI * 0.25;
      const bladeC = new THREE.Mesh(flareBladeGeo, bladeMat);
      bladeC.rotation.x = Math.PI * 0.5;
      group.add(core, bladeA, bladeB, bladeC);
      group.visible = false;
      this.scene.add(group);
      this.hitFlares.push({
        active: false,
        life: 0,
        maxLife: 0.14,
        baseScale: 1,
        group,
        mats: [coreMat, bladeMat],
      });
    }

    const ringGeo = new THREE.RingGeometry(0.75, 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.sharedGeos.push(ringGeo);

    for (let i = 0; i < 8; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#F59E0B',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.sharedMats.push(ringMat);
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({
        active: false,
        life: 0,
        maxLife: 0.45,
        maxRadius: 3.5,
        mesh,
      });
    }

    // Core Overload 3D Explosion Pool (4 pre-allocated multi-layer blasts)
    const expCoreGeo = new THREE.SphereGeometry(0.45, 14, 12);
    const expFireGeo = new THREE.SphereGeometry(0.75, 16, 14);
    const expCloudGeo = new THREE.SphereGeometry(0.95, 14, 12);
    const expRingGeo = new THREE.TorusGeometry(0.92, 0.08, 10, 32);
    this.sharedGeos.push(expCoreGeo, expFireGeo, expCloudGeo, expRingGeo);

    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const coreMat = new THREE.MeshBasicMaterial({
        color: '#FEF9C3',
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const fireMat = new THREE.MeshBasicMaterial({
        color: '#F97316',
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const cloudMat = new THREE.MeshBasicMaterial({
        color: '#7C2D12',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#FDBA74',
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.sharedMats.push(coreMat, fireMat, cloudMat, ringMat);

      const core = new THREE.Mesh(expCoreGeo, coreMat);
      const fireball = new THREE.Mesh(expFireGeo, fireMat);
      const cloud = new THREE.Mesh(expCloudGeo, cloudMat);
      const ring = new THREE.Mesh(expRingGeo, ringMat);
      ring.rotation.x = Math.PI * 0.44;
      group.add(cloud, fireball, core, ring);
      group.visible = false;
      this.scene.add(group);

      this.explosions.push({
        active: false,
        life: 0,
        maxLife: 0.78,
        scale: 1,
        group,
        core,
        fireball,
        cloud,
        ring,
        coreMat,
        fireMat,
        cloudMat,
        ringMat,
      });
    }
  }

  private initCameraPosition() {
    this.camOrbitYaw = Math.PI;
    this.camOrbitPitch = 0.36;
    _currentCamLook.set(0, 1.25, this.player.pos.z + 3.4);
    this.camera.position.set(0, 3.8, this.player.pos.z - 6.6);
    this.camera.lookAt(_currentCamLook);
  }

  private getCamForwardYaw(): number {
    return Math.atan2(-Math.sin(this.camOrbitYaw), -Math.cos(this.camOrbitYaw));
  }

  private getPlayerAimInfo(target: FighterRuntime): {
    camYaw: number;
    attackYaw: number;
    hasSoftLock: boolean;
  } {
    const toEnemyYaw = Math.atan2(
      target.pos.x - this.player.pos.x,
      target.pos.z - this.player.pos.z,
    );
    if (this.lockOnActive) {
      return { camYaw: toEnemyYaw, attackYaw: toEnemyYaw, hasSoftLock: true };
    }
    const camYaw = this.getCamForwardYaw();
    const diff = Math.abs(shortestAngleDiff(camYaw, toEnemyYaw));
    const hasSoftLock = diff < 0.22;
    return {
      camYaw,
      attackYaw: hasSoftLock ? toEnemyYaw : camYaw,
      hasSoftLock,
    };
  }

  private syncFreeCameraFromCurrentView() {
    if (this.player.isAiming) {
      this.camera.getWorldDirection(_v1);
      this.camOrbitYaw = Math.atan2(-_v1.x, -_v1.z);
      const pitchFromDir = -Math.asin(THREE.MathUtils.clamp(_v1.y, -0.85, 0.85));
      this.camOrbitPitch = THREE.MathUtils.clamp(pitchFromDir + 0.34, -0.18, 0.98);
      return;
    }
    const dx = this.camera.position.x - this.player.pos.x;
    const dz = this.camera.position.z - this.player.pos.z;
    const horizDist = Math.max(0.5, Math.hypot(dx, dz));
    const dy = this.camera.position.y - 1.28;
    this.camOrbitYaw = Math.atan2(dx, dz);
    this.camOrbitPitch = THREE.MathUtils.clamp(
      Math.atan2(dy, horizDist),
      -0.18,
      0.98,
    );
  }

  public setMouseSensitivity(val: number) {
    this.mouseSensitivity = THREE.MathUtils.clamp(val, 0.2, 2.5);
  }

  public requestPointerLock() {
    if (this.disposed || this.paused || this.outcome !== 'ongoing') return;
    const dom = this.renderer.domElement;
    if (document.pointerLockElement === dom) return;
    try {
      const maybePromise = dom.requestPointerLock?.() as unknown;
      if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
        (maybePromise as Promise<void>).catch(() => {});
      }
    } catch {
      // Pointer lock may be blocked outside user gesture or in strict sandbox
    }
  }

  public exitPointerLock() {
    const dom = this.renderer.domElement;
    if (document.pointerLockElement === dom) {
      try {
        document.exitPointerLock?.();
      } catch {
        // Ignore
      }
    }
  }

  private updateCursorVisibility() {
    const hideCursor = !this.paused && this.outcome === 'ongoing';
    this.renderer.domElement.style.cursor = hideCursor ? 'none' : 'default';
  }

  private onPointerLockChange = () => {
    const dom = this.renderer.domElement;
    const locked = document.pointerLockElement === dom;
    this.callbacks.onPointerLockChange?.(locked);
    if (this.wasPointerLocked && !locked && !this.paused && this.outcome === 'ongoing') {
      this.callbacks.onRequestPause?.();
    }
    this.wasPointerLocked = locked;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    this.keys.add(code);
    if (code === 'KeyJ') this.triggerPlayerAttack();
    if (code === 'KeyR') this.triggerPlayerSkillR();
    if (code === 'KeyE') this.triggerPlayerSkillE();
    if (code === 'KeyF') this.triggerPlayerSkillF();
    if (code === 'KeyP') {
      this.callbacks.onRequestPause?.();
    }
    if (code === 'Space') {
      e.preventDefault();
      this.triggerPlayerJump();
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      e.preventDefault();
      this.triggerPlayerDash();
    }
    if (code === 'Tab') {
      e.preventDefault();
      this.toggleLockOn();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.paused && this.outcome === 'ongoing') {
      this.requestPointerLock();
    }
    if (e.button === 0) {
      this.mouseAttackQueued = true;
    } else if (e.button === 2) {
      this.mouseGuardHeld = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) {
      this.mouseGuardHeld = false;
    }
  };

  private onMouseEnter = (e: MouseEvent) => {
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.pointerEdgeRate = 0;
  };

  private onMouseLeave = () => {
    this.lastPointerX = null;
    this.lastPointerY = null;
    this.pointerEdgeRate = 0;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.lockOnActive || this.paused) {
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.pointerEdgeRate = 0;
      return;
    }

    const dom = this.renderer.domElement;
    let dx = 0;
    let dy = 0;
    if (document.pointerLockElement === dom) {
      dx = THREE.MathUtils.clamp(e.movementX, -180, 180);
      dy = THREE.MathUtils.clamp(e.movementY, -180, 180);
      this.pointerEdgeRate = 0;
    } else {
      if (this.lastPointerX !== null && this.lastPointerY !== null) {
        dx = THREE.MathUtils.clamp(e.clientX - this.lastPointerX, -48, 48);
        dy = THREE.MathUtils.clamp(e.clientY - this.lastPointerY, -48, 48);
      }
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      // Gentle continuous turn when cursor reaches left/right outer margin
      const rect = dom.getBoundingClientRect();
      const edgeZone = 42;
      if (e.clientX <= rect.left + edgeZone && dx <= 0) {
        const t = 1 - Math.max(0, e.clientX - rect.left) / edgeZone;
        this.pointerEdgeRate = 1.65 * t;
      } else if (e.clientX >= rect.right - edgeZone && dx >= 0) {
        const t = 1 - Math.max(0, rect.right - e.clientX) / edgeZone;
        this.pointerEdgeRate = -1.65 * t;
      } else {
        this.pointerEdgeRate = 0;
      }
    }

    const sens = this.mouseSensitivity * (this.player.isAiming ? 0.4 : 1.0);
    this.camOrbitYaw -= dx * 0.0052 * sens;
    this.camOrbitPitch = THREE.MathUtils.clamp(
      this.camOrbitPitch + dy * 0.0038 * sens,
      -0.18,
      0.98,
    );
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camDistance = THREE.MathUtils.clamp(
      this.camDistance + e.deltaY * 0.0038,
      4.6,
      10.6,
    );
  };

  private onTouchStart = (e: TouchEvent) => {
    if (this.activeTouchId === null && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      this.activeTouchId = t.identifier;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (this.lockOnActive || this.paused || this.activeTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.activeTouchId) {
        const dx = THREE.MathUtils.clamp(t.clientX - this.lastTouchX, -48, 48);
        const dy = THREE.MathUtils.clamp(t.clientY - this.lastTouchY, -48, 48);
        this.lastTouchX = t.clientX;
        this.lastTouchY = t.clientY;
        this.camOrbitYaw -= dx * 0.007;
        this.camOrbitPitch = THREE.MathUtils.clamp(
          this.camOrbitPitch + dy * 0.005,
          -0.18,
          0.98,
        );
        break;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.activeTouchId) {
        this.activeTouchId = null;
        break;
      }
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    dom.addEventListener('mouseenter', this.onMouseEnter);
    dom.addEventListener('mouseleave', this.onMouseLeave);
    dom.addEventListener('mousemove', this.onMouseMove);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('touchstart', this.onTouchStart, { passive: true });
    dom.addEventListener('touchmove', this.onTouchMove, { passive: true });
    dom.addEventListener('touchend', this.onTouchEnd);
    dom.addEventListener('contextmenu', this.onContextMenu);
  }

  public setPaused(val: boolean) {
    this.paused = val;
    this.updateCursorVisibility();
    if (val) {
      this.exitPointerLock();
    } else {
      this.clock.getDelta();
    }
  }

  public setVirtualMove(x: number, z: number) {
    this.virtualMove.x = x;
    this.virtualMove.z = z;
  }

  public triggerPlayerAttack() {
    this.mouseAttackQueued = true;
  }

  public triggerPlayerGuard(held: boolean) {
    this.mouseGuardHeld = held;
  }

  public triggerPlayerJump() {
    if (this.outcome !== 'ongoing' || this.paused) return;
    this.tryJump(this.player);
  }

  public triggerPlayerDash() {
    if (this.outcome !== 'ongoing' || this.paused) return;
    this.tryDash(this.player, this.getPlayerMoveInput());
  }

  public triggerPlayerSkillR() {
    if (this.outcome !== 'ongoing' || this.paused) return;
    if (this.player.usesAchillesProgression) {
      this.tryAchillesSkillR(this.player, this.enemy);
    }
  }

  public triggerPlayerSkillE() {
    if (this.outcome !== 'ongoing' || this.paused) return;
    if (this.player.usesAchillesProgression) {
      this.tryAchillesSkillE(this.player, this.enemy);
    } else {
      this.trySpecial(this.player, this.enemy);
    }
  }

  public triggerPlayerSkillF() {
    if (this.outcome !== 'ongoing' || this.paused) return;
    if (this.player.usesAchillesProgression) {
      this.tryAchillesSkillF(this.player, this.enemy);
    } else {
      this.trySpecial(this.player, this.enemy);
    }
  }

  public triggerPlayerSpecial() {
    if (this.outcome !== 'ongoing' || this.paused) return;
    if (this.player.usesAchillesProgression) {
      if (this.player.level >= ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel && this.player.special >= 99.9) {
        this.tryAchillesSkillF(this.player, this.enemy);
      } else if (
        this.player.level >= ACHILLES_SKILL_UNLOCKS.thunderE.unlockLevel &&
        this.player.skillECooldown <= 0
      ) {
        this.tryAchillesSkillE(this.player, this.enemy);
      } else {
        this.tryAchillesSkillR(this.player, this.enemy);
      }
      return;
    }
    this.trySpecial(this.player, this.enemy);
  }

  public toggleLockOn() {
    this.lockOnActive = !this.lockOnActive;
    if (!this.lockOnActive) {
      this.syncFreeCameraFromCurrentView();
    }
    soundEngine.playClick();
  }

  private getPlayerMoveInput(): { x: number; z: number } {
    let ix = this.virtualMove.x;
    let iz = this.virtualMove.z;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;

    const len = Math.hypot(ix, iz);
    if (len < 0.01) return { x: 0, z: 0 };
    ix /= len;
    iz /= len;

    if (!this.lockOnActive) {
      _camForward.set(-Math.sin(this.camOrbitYaw), 0, -Math.cos(this.camOrbitYaw));
    } else {
      this.camera.getWorldDirection(_camForward);
      _camForward.y = 0;
      _camForward.normalize();
    }
    _camRight.set(-_camForward.z, 0, _camForward.x);

    const worldX = _camForward.x * -iz + _camRight.x * ix;
    const worldZ = _camForward.z * -iz + _camRight.z * ix;
    return { x: worldX, z: worldZ };
  }

  private tryJump(f: FighterRuntime) {
    if (f.stunTimer > 0 || !f.isGrounded || f.hp <= 0) return;
    f.isGrounded = false;
    f.velY = f.stats.jumpPower;
    f.isGuarding = false;
    soundEngine.playJump();
    this.spawnSparks(
      f.pos.x,
      f.pos.y + 0.14,
      f.pos.z,
      f.stats.jumpPower > 10.2 ? 7 : 5,
      f.weapon.accentHex,
    );
  }

  private tryDash(f: FighterRuntime, moveDir: { x: number; z: number }) {
    if (
      f.stunTimer > 0 ||
      f.isDashing ||
      f.dashCooldown > 0 ||
      f.energy < DASH_STAMINA_COST
    ) {
      return;
    }
    f.energy -= DASH_STAMINA_COST;
    f.isDashing = true;
    f.dashTimer = f.stats.dashDuration;
    f.dashCooldown = DASH_COOLDOWN_SEC;
    f.invulnTimer = 0.16;
    f.isGuarding = false;
    f.attackPhase = 'none';
    f.airAttacking = false;

    if (Math.hypot(moveDir.x, moveDir.z) > 0.1) {
      f.dashDir.set(moveDir.x, 0, moveDir.z).normalize();
    } else {
      f.dashDir.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    }
    soundEngine.playDash();
    this.spawnSparks(f.pos.x, f.pos.y + 0.7, f.pos.z, 6, f.weapon.accentHex);
  }

  private tryAttack(f: FighterRuntime, target: FighterRuntime) {
    if (f.stunTimer > 0 || f.isDashing || f.attackCooldown > 0 || f.attackPhase !== 'none') {
      return;
    }

    if (f.isPlayer && !this.lockOnActive) {
      f.targetYaw = f.isAiming
        ? this.getCamForwardYaw()
        : this.getPlayerAimInfo(target).attackYaw;
    } else {
      const dx = target.pos.x - f.pos.x;
      const dz = target.pos.z - f.pos.z;
      f.targetYaw = Math.atan2(dx, dz);
    }

    f.isGuarding = false;
    f.comboStep = (f.comboStep % 3) + 1;
    f.attackSwingFlip ^= 1;
    f.comboResetTimer = 1.15;
    f.hasHitCurrentSwing = false;
    f.isSpecialAttack = false;
    f.airAttacking = !f.isGrounded;

    if (f.airAttacking && !f.weapon.isRanged && f.velY < 2.2) {
      // Brief mid-air coil/hang before plunging strike
      f.velY = 2.2;
    }

    const tempo = f.weapon.attackSpeed;
    const baseDur = f.weapon.isRanged
      ? 0.34
      : f.airAttacking
        ? 0.46
        : f.weapon.kind === 'lance'
          ? 0.52
          : f.weapon.kind === 'halberd'
            ? 0.5
            : 0.44;
    f.attackDuration = baseDur / tempo;
    f.attackTimer = f.attackDuration;
    f.attackPhase = 'windup';
    f.attackCooldown = f.attackDuration * 0.92;

    if (f.weapon.isRanged) {
      soundEngine.playLaser(false);
    } else {
      soundEngine.playSlash(f.comboStep === 3 || f.airAttacking);
    }
  }

  private addSpecialCharge(f: FighterRuntime, amount: number) {
    if (f.usesAchillesProgression) {
      if (f.level < ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel) {
        f.special = 0;
        return;
      }
      // Lv 10+ "Разящий вихрь" charges noticeably slower (~3.2x slower)
      f.special = Math.min(100, f.special + amount * 0.31);
      return;
    }
    f.special = Math.min(100, f.special + amount);
  }

  private tryAchillesSkillR(f: FighterRuntime, target: FighterRuntime) {
    if (
      !f.usesAchillesProgression ||
      f.skillRCooldown > 0 ||
      f.stunTimer > 0 ||
      f.hp <= 0 ||
      f.attackPhase !== 'none'
    ) {
      return;
    }

    f.skillRCooldown = ACHILLES_SKILL_UNLOCKS.lungeR.cooldownSec;
    f.activeSkill = 'lunge_r';
    f.isGuarding = false;
    f.isAiming = false;
    f.isDashing = false;
    f.hasHitCurrentSwing = false;
    f.isSpecialAttack = false;
    f.isOdinClipSpecial = false;
    f.airAttacking = !f.isGrounded;
    f.specialStage = 0;
    f.attackDuration = 0.58;
    f.attackTimer = 0.58;
    f.attackCooldown = 0.62;
    f.invulnTimer = 0.2;
    f.attackPhase = 'windup';

    if (f.isPlayer && !this.lockOnActive) {
      f.targetYaw = this.getPlayerAimInfo(target).attackYaw;
    } else {
      f.targetYaw = Math.atan2(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
    }

    soundEngine.playDash();
    soundEngine.playSlash(true);
    this.spawnSparks(f.pos.x, f.pos.y + 0.9, f.pos.z, 10, '#38BDF8');
    if (f.isPlayer) {
      this.bannerText = `${f.name.split(' ')[0]}: ${ACHILLES_SKILL_UNLOCKS.lungeR.name.toUpperCase()}!`;
      this.bannerTimer = 1.25;
    }
  }

  private tryAchillesSkillE(f: FighterRuntime, target: FighterRuntime) {
    if (
      !f.usesAchillesProgression ||
      f.level < ACHILLES_SKILL_UNLOCKS.thunderE.unlockLevel ||
      f.skillECooldown > 0 ||
      f.stunTimer > 0 ||
      f.hp <= 0 ||
      f.attackPhase !== 'none'
    ) {
      return;
    }

    f.skillECooldown = ACHILLES_SKILL_UNLOCKS.thunderE.cooldownSec;
    f.activeSkill = 'thunder_e';
    f.isGuarding = false;
    f.isAiming = false;
    f.isDashing = false;
    f.hasHitCurrentSwing = false;
    f.isSpecialAttack = true;
    f.isOdinClipSpecial = false;
    f.specialStage = 0;
    f.airAttacking = !f.isGrounded;
    f.attackPhase = 'windup';

    const dur = 4.95;
    f.attackDuration = dur;
    f.attackTimer = dur;
    f.attackCooldown = dur + 0.08;
    f.invulnTimer = 4.5;

    if (f.isPlayer && !this.lockOnActive) {
      f.targetYaw = this.getPlayerAimInfo(target).attackYaw;
    } else {
      f.targetYaw = Math.atan2(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
    }

    startCustomSpecialClip(f.rig, dur * 0.68);
    this.thunderLight.color.set('#60A5FA');
    this.thunderAuraTimer = dur * 0.96;
    this.thunderFlashIntensity = 15;
    this.lastThunderShot = -1;
    this.thunderShotActive = false;
    this.thunderShotTimer = 0;
    this.thunderShotCaster = null;
    this.thunderShotTarget = null;
    this.thunderLight.position.set(f.pos.x, f.pos.y + 1.8, f.pos.z);
    soundEngine.playThunderCharge();

    if (f.isPlayer) {
      this.specialsUsed += 1;
    }
    this.bannerText = `${f.name.split(' ')[0]}: ${ACHILLES_SKILL_UNLOCKS.thunderE.name.toUpperCase()}!`;
    this.bannerTimer = 4.95;
    soundEngine.playSpecial();
    this.spawnShockwave(f.pos.x, f.pos.y + 0.15, f.pos.z, 2.9, '#60A5FA');
  }

  private tryAchillesSkillF(f: FighterRuntime, target: FighterRuntime) {
    if (
      !f.usesAchillesProgression ||
      f.level < ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel ||
      f.special < 99.9 ||
      f.stunTimer > 0 ||
      f.hp <= 0 ||
      f.attackPhase !== 'none'
    ) {
      return;
    }

    f.special = 0;
    f.activeSkill = 'cyclone_f';
    f.isGuarding = false;
    f.isAiming = false;
    f.isDashing = false;
    f.hasHitCurrentSwing = false;
    f.isSpecialAttack = true;
    f.isOdinClipSpecial = false;
    f.specialStage = 0;
    f.airAttacking = !f.isGrounded;
    f.attackPhase = 'windup';

    const dur = 3.45;
    f.attackDuration = dur;
    f.attackTimer = dur;
    f.attackCooldown = dur + 0.1;
    f.invulnTimer = 3.25;

    if (f.isPlayer && !this.lockOnActive) {
      f.targetYaw = this.getPlayerAimInfo(target).attackYaw;
    } else {
      f.targetYaw = Math.atan2(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
    }

    this.thunderLight.color.set('#2DD4BF');
    this.thunderFlashIntensity = 16;
    this.lastThunderShot = -1;
    this.thunderShotActive = false;
    this.thunderShotTimer = 0;
    this.thunderShotCaster = null;
    this.thunderShotTarget = null;
    this.thunderLight.position.set(f.pos.x, f.pos.y + 1.8, f.pos.z);
    soundEngine.playThunderCharge();
    soundEngine.playSpecial();

    if (f.isPlayer) {
      this.specialsUsed += 1;
    }
    this.bannerText = `${f.name.split(' ')[0]}: ${ACHILLES_SKILL_UNLOCKS.cycloneF.name.toUpperCase()}!`;
    this.bannerTimer = 3.45;
    this.spawnShockwave(f.pos.x, f.pos.y + 0.15, f.pos.z, 3.2, '#2DD4BF');
  }

  private trySpecial(f: FighterRuntime, target: FighterRuntime) {
    if (f.usesAchillesProgression) {
      if (f.level >= ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel && f.special >= 99.9) {
        this.tryAchillesSkillF(f, target);
      } else if (
        f.level >= ACHILLES_SKILL_UNLOCKS.thunderE.unlockLevel &&
        f.skillECooldown <= 0
      ) {
        this.tryAchillesSkillE(f, target);
      }
      return;
    }
    if (f.special < 99.9 || f.stunTimer > 0) return;
    f.special = 0;
    f.activeSkill = f.weapon.kind === 'lance' ? 'thunder_e' : 'none';
    f.isGuarding = false;
    f.isAiming = false;
    f.isDashing = false;
    f.hasHitCurrentSwing = false;
    f.isSpecialAttack = true;
    const isOdinGungnirClip =
      f.weapon.kind === 'halberd' &&
      f.rig.customCharacterId === 'odin' &&
      Boolean(f.rig.specialMixer && f.rig.specialAction);
    f.isOdinClipSpecial = isOdinGungnirClip;
    f.specialStage = 0;
    f.airAttacking = !f.isGrounded;
    f.attackPhase = 'windup';

    const dur =
      f.weapon.kind === 'kodachi'
        ? 1.18
        : f.weapon.kind === 'hammer'
          ? 1.04
          : isOdinGungnirClip
            ? 7.4
            : f.weapon.kind === 'halberd'
              ? 1.08
              : f.weapon.kind === 'lance'
                ? 4.95
                : f.weapon.isRanged
                  ? 0.92
                  : 0.72;
    f.attackDuration = dur;
    f.attackTimer = dur;
    f.attackCooldown = dur + 0.08;
    f.invulnTimer = isOdinGungnirClip
      ? 7.0
      : f.weapon.kind === 'lance'
        ? 4.5
        : f.weapon.kind === 'halberd'
          ? 0.62
          : 0.48;

    if (f.weapon.kind === 'hammer' && f.isGrounded) {
      f.isGrounded = false;
      f.velY = 6.2;
      f.pos.y += 0.08;
    }

    if (f.isPlayer && !this.lockOnActive) {
      f.targetYaw = this.getPlayerAimInfo(target).attackYaw;
    } else {
      const dx = target.pos.x - f.pos.x;
      const dz = target.pos.z - f.pos.z;
      f.targetYaw = Math.atan2(dx, dz);
    }

    if (f.weapon.kind === 'lance' || isOdinGungnirClip) {
      startCustomSpecialClip(f.rig, isOdinGungnirClip ? dur * 0.88 : dur * 0.68);
      this.thunderLight.color.set(isOdinGungnirClip ? '#F97316' : '#60A5FA');
      this.thunderAuraTimer = dur * 0.96;
      this.thunderFlashIntensity = 15;
      this.lastThunderShot = -1;
      this.thunderShotActive = false;
      this.thunderShotTimer = 0;
      this.thunderShotCaster = null;
      this.thunderShotTarget = null;
      this.thunderLight.position.set(f.pos.x, f.pos.y + 1.8, f.pos.z);
      soundEngine.playThunderCharge();
    }

    if (f.isPlayer) {
      this.specialsUsed += 1;
    }
    this.bannerText = `${f.name.split(' ')[0]}: ${f.weapon.specialName.toUpperCase()}!`;
    this.bannerTimer = isOdinGungnirClip ? 7.4 : f.weapon.kind === 'lance' ? 4.95 : 1.75;
    soundEngine.playSpecial();
    this.spawnShockwave(f.pos.x, f.pos.y + 0.15, f.pos.z, 2.9, f.weapon.accentHex);
  }

  private damageDestructibleObstacle(obsState: ObstacleState, damage: number, attacker: FighterRuntime) {
    if (obsState.destroyed || !obsState.data.destructible) return;
    obsState.hp -= damage;
    this.spawnSparks(obsState.data.x, 0.85, obsState.data.z, 6, '#F59E0B');

    if (obsState.hp <= 0) {
      obsState.destroyed = true;
      const vis = this.obstacleVisuals.get(obsState.id);
      if (vis) {
        vis.destroyed = true;
        vis.group.visible = false;
      }
      soundEngine.playHit(true);
      this.spawnSparks(obsState.data.x, 0.9, obsState.data.z, 16, '#F59E0B');
      this.spawnShockwave(obsState.data.x, 0.12, obsState.data.z, 2.2, '#F59E0B');

      // Supply crate drops immediate repair/energy pickup for breaker!
      const healHp = 110;
      attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + healHp);
      attacker.damageCtrl.healPartial(healHp / attacker.stats.maxHp);
      attacker.energy = Math.min(attacker.stats.maxEnergy, attacker.energy + 28);
      attacker.special = Math.min(100, attacker.special + 12);
      if (attacker.isPlayer) {
        this.bannerText = 'ЯЩИК РАЗРУШЕН: +110 HP и +28 Энергии!';
        this.bannerTimer = 1.4;
      }
    }
  }

  private spawnProjectile(
    owner: FighterRuntime,
    target: FighterRuntime,
    damage: number,
    speed: number,
    isSpecial: boolean,
    spreadYaw = 0,
  ) {
    const slot = this.projectiles.find(
      (p) => !p.active && p.ownerIsPlayer === owner.isPlayer,
    );
    if (!slot) return;

    if (owner.isPlayer && owner.isAiming) {
      // True first-person scope firing: spawn tracer slightly below eye-line and fly dead-center through the reticle
      this.camera.getWorldDirection(_camForward);
      _camRight.crossVectors(_camForward, _yAxis);
      if (_camRight.lengthSq() > 0.0001) {
        _camRight.normalize();
      } else {
        _camRight.set(1, 0, 0);
      }
      _v1
        .copy(this.camera.position)
        .addScaledVector(_camForward, 1.05)
        .addScaledVector(_camRight, 0.06);
      _v1.y -= 0.13;

      _v3.copy(this.camera.position).addScaledVector(_camForward, 65);
      _targetCenter.set(target.pos.x, target.pos.y + 1.02, target.pos.z);
      _v2.copy(_targetCenter).sub(this.camera.position);
      const projAlongRay = _v2.dot(_camForward);
      const perpDist =
        projAlongRay > 0
          ? _v2.addScaledVector(_camForward, -projAlongRay).length()
          : Infinity;
      if (this.lockOnActive || perpDist < 0.72) {
        _v3.copy(_targetCenter);
      }

      const dir = _v3.sub(_v1).normalize();
      if (spreadYaw !== 0) {
        dir.applyAxisAngle(_yAxis, spreadYaw);
      }
      slot.vel.copy(dir).multiplyScalar(speed);
    } else {
      owner.rig.muzzlePoint.getWorldPosition(_v1);
      if (_v1.y < owner.pos.y + 0.4) {
        _v1.set(owner.pos.x, owner.pos.y + 1.15, owner.pos.z);
      }

      if (owner.isPlayer && !this.lockOnActive) {
        this.camera.getWorldDirection(_v2);
        const aimPoint = _v3.copy(this.camera.position).addScaledVector(_v2, 65);
        aimPoint.y = Math.max(0.25, aimPoint.y);

        _targetCenter.set(target.pos.x, target.pos.y + 1.02, target.pos.z);
        _camForward.copy(_targetCenter).sub(this.camera.position);
        const projAlongRay = _camForward.dot(_v2);
        const aimInfo = this.getPlayerAimInfo(target);
        const perpDist =
          projAlongRay > 0
            ? _camForward.addScaledVector(_v2, -projAlongRay).length()
            : Infinity;
        if (aimInfo.hasSoftLock || perpDist < 0.95) {
          aimPoint.copy(_targetCenter);
        }

        const dir = aimPoint.sub(_v1).normalize();
        if (spreadYaw !== 0) {
          dir.applyAxisAngle(_yAxis, spreadYaw);
        }
        slot.vel.copy(dir).multiplyScalar(speed);
      } else {
        const dx = target.pos.x - _v1.x;
        const dy = target.pos.y + 1.05 - _v1.y;
        const dz = target.pos.z - _v1.z;
        const dir = _v3.set(dx, dy, dz);
        if (dir.lengthSq() > 0.0001) {
          dir.normalize();
        } else {
          dir.set(0, 0, 1);
        }
        if (spreadYaw !== 0) {
          dir.applyAxisAngle(_yAxis, spreadYaw);
        }
        slot.vel.copy(dir).multiplyScalar(speed);
      }
    }

    slot.active = true;
    slot.pos.copy(_v1);
    slot.prevPos.copy(_v1);
    slot.damage = damage;
    slot.life = 2.2;
    slot.isSpecial = isSpecial;

    slot.mesh.position.copy(slot.pos);
    slot.mesh.quaternion.setFromUnitVectors(_zAxis, _v2.copy(slot.vel).normalize());
    slot.mesh.scale.setScalar(isSpecial ? 1.5 : owner.isAiming ? 1.18 : 1.0);
    slot.mesh.visible = true;

    // Bright muzzle flash sparks at barrel tip
    this.spawnSparks(
      _v1.x,
      _v1.y,
      _v1.z,
      isSpecial ? 10 : owner.isAiming ? 7 : 5,
      isSpecial ? '#FDE047' : '#38BDF8',
    );
  }

  private spawnLightningBolt(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    thickness = 1.0,
    colorHex = '#7DD3FC',
  ) {
    const slot = this.lightningBolts.find((b) => !b.active);
    if (!slot) return;
    slot.active = true;
    slot.maxLife = 0.36;
    slot.life = slot.maxLife;
    slot.group.visible = true;

    const start = new THREE.Vector3(fromX, fromY, fromZ);
    const end = new THREE.Vector3(toX, toY, toZ);
    const dir = new THREE.Vector3().subVectors(end, start);
    const totalLen = Math.max(0.2, dir.length());
    const count = slot.segments.length;
    const pts: THREE.Vector3[] = [start];

    for (let i = 1; i < count; i += 1) {
      const t = i / count;
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      const jitter = Math.min(0.65, totalLen * 0.1) * (1 - Math.abs(t - 0.5) * 0.8);
      p.x += (Math.random() - 0.5) * 2 * jitter;
      p.y += (Math.random() - 0.5) * 1.4 * jitter;
      p.z += (Math.random() - 0.5) * 2 * jitter;
      pts.push(p);
    }
    pts.push(end);

    for (let i = 0; i < count; i += 1) {
      const seg = slot.segments[i];
      const mat = slot.mats[i];
      const a = pts[i];
      const b = pts[i + 1];
      const segVec = _v2.subVectors(b, a);
      const len = Math.max(0.05, segVec.length());
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(_zAxis, segVec.normalize());
      seg.scale.set(thickness, thickness, len);
      mat.color.set(i % 2 === 0 ? colorHex : '#FDE047');
      mat.opacity = 0.96;
    }
  }

  private launchStingerMissile(
    owner: FighterRuntime,
    target: FighterRuntime,
    slotIdx: number,
    isFinal: boolean,
  ) {
    const slot = this.missiles.find((m) => !m.active);
    if (!slot) return;

    if (slot.customVisual) {
      slot.mesh.remove(slot.customVisual);
      slot.customVisual = null;
    }

    const fx = Math.sin(owner.yaw);
    const fz = Math.cos(owner.yaw);
    const rx = -fz;
    const rz = fx;
    const sideSign = slotIdx % 2 === 0 ? -1 : 1;

    const backList = owner.rig.backMissiles ?? [];
    if (backList.length > 0) {
      const src = backList[slotIdx % backList.length];
      src.getWorldPosition(_v1);
      const wScale = new THREE.Vector3();
      src.getWorldScale(wScale);
      src.visible = false;
      owner.missileRearmTimer = 1.65;

      const cloned = src.clone();
      cloned.visible = true;
      cloned.position.set(0, 0, 0);
      cloned.rotation.set(0, 0, 0);
      cloned.scale.copy(wScale);
      slot.defaultVisual.visible = false;
      slot.mesh.add(cloned);
      slot.customVisual = cloned;
    } else {
      slot.defaultVisual.visible = true;
      _v1.set(
        owner.pos.x - fx * 0.3 + rx * sideSign * (0.28 + (slotIdx % 3) * 0.14),
        owner.pos.y + 1.45 + Math.floor(slotIdx / 2) * 0.14,
        owner.pos.z - fz * 0.3 + rz * sideSign * (0.28 + (slotIdx % 3) * 0.14),
      );
    }

    slot.active = true;
    slot.ownerIsPlayer = owner.isPlayer;
    slot.pos.copy(_v1);
    slot.vel.set(
      fx * 3.8 + rx * sideSign * (5.2 + (slotIdx % 3) * 1.4),
      8.2 + (slotIdx % 2) * 2.0,
      fz * 3.8 + rz * sideSign * (5.2 + (slotIdx % 3) * 1.4),
    );
    slot.age = 0;
    slot.life = 2.6;
    slot.damage = Math.round(owner.weapon.damage * 0.56);
    slot.smokeTimer = 0;
    slot.isFinal = isFinal;

    slot.mesh.position.copy(slot.pos);
    slot.mesh.quaternion.setFromUnitVectors(_zAxis, _v2.copy(slot.vel).normalize());
    slot.mesh.visible = true;

    soundEngine.playLaser(isFinal);
    this.spawnSparks(_v1.x, _v1.y, _v1.z, 6, '#FB923C');
    void target;
  }

  private spawnSparks(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: string,
    dirX?: number,
    dirY?: number,
    dirZ?: number,
    speedMult = 1.0,
  ) {
    const hasDir = dirX !== undefined && dirY !== undefined && dirZ !== undefined;
    let nx = 0;
    let ny = 1;
    let nz = 0;
    if (hasDir) {
      const dLen = Math.hypot(dirX!, dirY!, dirZ!);
      if (dLen > 0.001) {
        nx = dirX! / dLen;
        ny = dirY! / dLen;
        nz = dirZ! / dLen;
      }
    }

    let spawned = 0;
    for (let i = 0; i < this.sparks.length && spawned < count; i++) {
      const s = this.sparks[i];
      if (!s.active) {
        s.active = true;
        s.pos.set(
          x + (Math.random() - 0.5) * 0.14,
          y + (Math.random() - 0.5) * 0.14,
          z + (Math.random() - 0.5) * 0.14,
        );

        if (hasDir) {
          // Ricochet spray cone along outward impact normal + random tangential scatter
          const theta = Math.random() * Math.PI * 2;
          const spread = 0.45 + Math.random() * 0.95;
          const spd = (5.2 + Math.random() * 8.4) * speedMult;
          const vx = nx + Math.cos(theta) * spread;
          const vy = ny + 0.35 + Math.random() * 0.75;
          const vz = nz + Math.sin(theta) * spread;
          const vLen = Math.max(0.01, Math.hypot(vx, vy, vz));
          s.vel.set((vx / vLen) * spd, (vy / vLen) * spd, (vz / vLen) * spd);
          s.maxLife = 0.24 + Math.random() * 0.26;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const spd = (2.8 + Math.random() * 6.0) * speedMult;
          s.vel.set(
            Math.cos(angle) * spd,
            2.2 + Math.random() * 4.8,
            Math.sin(angle) * spd,
          );
          s.maxLife = 0.24 + Math.random() * 0.22;
        }

        s.life = s.maxLife;
        // White-hot / bright gold core sparks mixed with weapon/impact energy tint
        const roll = Math.random();
        if (roll < 0.28) {
          s.mat.color.set('#FFFFFF');
        } else if (roll < 0.56) {
          s.mat.color.set('#FEF08A');
        } else {
          s.mat.color.set(colorHex);
        }
        s.mat.opacity = 1;
        s.mesh.position.copy(s.pos);
        if (s.vel.lengthSq() > 0.001) {
          _velDir.copy(s.vel).normalize();
          s.mesh.quaternion.setFromUnitVectors(_zAxis, _velDir);
        }
        s.mesh.scale.set(1, 1, 1);
        s.mesh.visible = true;
        spawned++;
      }
    }
  }

  private spawnHitFlare(
    x: number,
    y: number,
    z: number,
    colorHex: string,
    scale = 1.0,
  ) {
    const flare = this.hitFlares.find((f) => !f.active);
    if (!flare) return;
    flare.active = true;
    flare.maxLife = 0.14;
    flare.life = flare.maxLife;
    flare.baseScale = scale;
    flare.group.position.set(x, y, z);
    flare.group.rotation.set(
      (Math.random() - 0.5) * 0.7,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI,
    );
    flare.group.scale.setScalar(scale * 0.7);
    flare.mats[0].color.set('#FFFFFF');
    flare.mats[0].opacity = 0.98;
    flare.mats[1].color.set(colorHex);
    flare.mats[1].opacity = 0.92;
    flare.group.visible = true;
  }

  private spawnShockwave(
    x: number,
    y: number,
    z: number,
    maxRadius: number,
    colorHex: string,
  ) {
    const ring = this.shockwaves.find((r) => !r.active);
    if (!ring) return;
    ring.active = true;
    ring.maxLife = 0.42;
    ring.life = 0.42;
    ring.maxRadius = maxRadius;
    ring.mesh.position.set(x, y, z);
    ring.mesh.scale.setScalar(0.2);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
    ring.mesh.visible = true;
  }

  private spawnExplosion(x: number, y: number, z: number, scale = 1.0) {
    let blast = this.explosions.find((e) => !e.active);
    if (!blast) {
      blast = this.explosions.reduce((oldest, cur) =>
        cur.life < oldest.life ? cur : oldest,
      );
    }
    if (!blast) return;
    blast.active = true;
    blast.maxLife = 0.78;
    blast.life = 0.78;
    blast.scale = scale;
    blast.group.position.set(x, y, z);
    blast.group.rotation.set(
      (Math.random() - 0.5) * 0.25,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.25,
    );
    blast.core.scale.setScalar(0.45 * scale);
    blast.fireball.scale.setScalar(0.35 * scale);
    blast.cloud.scale.setScalar(0.3 * scale);
    blast.ring.scale.setScalar(0.35 * scale);
    blast.coreMat.opacity = 1;
    blast.fireMat.opacity = 0.95;
    blast.cloudMat.opacity = 0.72;
    blast.ringMat.opacity = 0.92;
    blast.group.visible = true;
  }

  private triggerCoreExplosion(
    attacker: FighterRuntime,
    defender: FighterRuntime,
    nx: number,
    nz: number,
  ) {
    // 8th cell lost -> Anime chain-detonation Core Explosion that immediately finishes the battle!
    defender.explosionCells = 0;
    defender.hp = 0;

    defender.stunTimer = 2.4;
    defender.attackPhase = 'none';
    defender.activeSkill = 'none';
    defender.isSpecialAttack = false;
    defender.isOdinClipSpecial = false;
    defender.isGuarding = false;
    defender.isAiming = false;
    defender.isGrounded = false;
    defender.velY = 9.4;
    defender.pos.y = Math.max(defender.pos.y, defender.groundY + 0.16);
    defender.vel.set(-nx * 11.5, 0, -nz * 11.5);
    stopCustomSpecialClip(defender.rig);

    _impactPt.set(defender.pos.x, defender.pos.y + 1.05, defender.pos.z);
    _impactDir.set(-nx, 0.55, -nz).normalize();
    defender.damageCtrl.recordHit({
      rootObject: defender.rig.root,
      worldImpactPos: _impactPt,
      worldStrikeDir: _impactDir,
      isSlash: false,
      isHeavy: true,
      accentHex: '#F97316',
      elapsedTime: this.elapsedTime,
    });

    this.spawnExplosion(defender.pos.x, defender.pos.y + 1.05, defender.pos.z, 1.55);
    this.spawnShockwave(defender.pos.x, defender.pos.y + 0.2, defender.pos.z, 6.2, '#F97316');
    this.spawnShockwave(defender.pos.x, defender.pos.y + 0.34, defender.pos.z, 4.2, '#FEF08A');
    this.spawnShockwave(defender.pos.x, defender.pos.y + 0.44, defender.pos.z, 2.6, '#FFFFFF');
    this.spawnSparks(
      defender.pos.x,
      defender.pos.y + 1.05,
      defender.pos.z,
      48,
      '#F97316',
      -nx * 0.3,
      0.95,
      -nz * 0.3,
      1.7,
    );
    this.spawnHitFlare(defender.pos.x, defender.pos.y + 1.08, defender.pos.z, '#FB923C', 2.6);

    this.pendingCoreExplosions.push(
      {
        delay: 0.2,
        x: defender.pos.x + 0.48,
        y: defender.pos.y + 1.25,
        z: defender.pos.z + 0.32,
        scale: 1.38,
        shockColor: '#FB923C',
      },
      {
        delay: 0.46,
        x: defender.pos.x - 0.52,
        y: defender.pos.y + 0.9,
        z: defender.pos.z - 0.36,
        scale: 1.72,
        shockColor: '#FEF08A',
      },
      {
        delay: 0.76,
        x: defender.pos.x + 0.25,
        y: defender.pos.y + 1.45,
        z: defender.pos.z - 0.44,
        scale: 1.52,
        shockColor: '#EF4444',
      },
      {
        delay: 1.08,
        x: defender.pos.x,
        y: defender.pos.y + 1.15,
        z: defender.pos.z,
        scale: 2.25,
        shockColor: '#FFFFFF',
      },
    );

    this.thunderLight.color.set('#FB923C');
    this.thunderLight.position.set(defender.pos.x, defender.pos.y + 1.9, defender.pos.z);
    this.thunderFlashIntensity = 28;
    this.cameraShake = 0.55;
    soundEngine.playExplosion();

    if (this.outcome === 'ongoing') {
      this.outcome = defender.isPlayer ? 'defeat' : 'victory';
      this.outcomeDelayTimer = 2.45;
      this.bannerText = defender.isPlayer
        ? 'КРИТИЧЕСКИЙ ВЗРЫВ ЯДРА! ВАШ LBX УНИЧТОЖЕН'
        : 'КРИТИЧЕСКИЙ ВЗРЫВ ЯДРА! ПРОТИВНИК УНИЧТОЖЕН!';
      this.bannerTimer = 3.2;
      this.updateCursorVisibility();
      this.exitPointerLock();
      soundEngine.playOutcome(!defender.isPlayer);
    }
    void attacker;
  }

  private applyHit(
    attacker: FighterRuntime,
    defender: FighterRuntime,
    rawDamage: number,
    knockback: number,
    isHeavy: boolean,
    impactPoint?: THREE.Vector3,
    impactDir?: THREE.Vector3,
    isSpecialHit = false,
    options?: {
      fixedDamage?: number;
      cellDrain?: number;
      guardBreak?: boolean;
    },
  ) {
    if ((defender.invulnTimer > 0 && !options?.guardBreak) || this.outcome !== 'ongoing') return;

    const toAttackerX = attacker.pos.x - defender.pos.x;
    const toAttackerZ = attacker.pos.z - defender.pos.z;
    const len = Math.max(0.01, Math.hypot(toAttackerX, toAttackerZ));
    const nx = toAttackerX / len;
    const nz = toAttackerZ / len;
    const facingDot = Math.sin(defender.yaw) * nx + Math.cos(defender.yaw) * nz;

    // Resolve exact 3D impact point on defender's armor/shield
    if (impactPoint) {
      _impactPt.copy(impactPoint);
    } else {
      attacker.rig.bladeTipPoint.getWorldPosition(_impactPt);
      if (
        _impactPt.y < defender.pos.y + 0.1 ||
        _impactPt.distanceToSquared(defender.pos) > 9.0
      ) {
        _impactPt.set(
          defender.pos.x + nx * 0.4,
          defender.pos.y + 1.05,
          defender.pos.z + nz * 0.4,
        );
      } else {
        _impactPt.x = THREE.MathUtils.lerp(_impactPt.x, defender.pos.x + nx * 0.36, 0.52);
        _impactPt.z = THREE.MathUtils.lerp(_impactPt.z, defender.pos.z + nz * 0.36, 0.52);
        _impactPt.y = THREE.MathUtils.clamp(_impactPt.y, defender.pos.y + 0.36, defender.pos.y + 1.54);
      }
    }

    const guardEffective = defender.isGuarding && facingDot > -0.15 && !options?.guardBreak;

    if (guardEffective) {
      const heldFor = this.elapsedTime - defender.guardStartTime;
      const isParry = heldFor <= 0.26 && !isHeavy;

      const shieldX = defender.pos.x + nx * 0.52;
      const shieldY = THREE.MathUtils.clamp(_impactPt.y, defender.pos.y + 0.65, defender.pos.y + 1.45);
      const shieldZ = defender.pos.z + nz * 0.52;

      if (isParry) {
        soundEngine.playBlock(true);
        this.addSpecialCharge(defender, 20);
        attacker.stunTimer = 0.58;
        attacker.attackPhase = 'none';
        if (defender.isPlayer) {
          this.parriesLanded += 1;
          this.bannerText = 'ИДЕАЛЬНОЕ ПАРИРОВАНИЕ!';
          this.bannerTimer = 1.1;
        }
        this.spawnSparks(shieldX, shieldY, shieldZ, 24, '#38BDF8', nx, 0.45, nz, 1.15);
        this.spawnHitFlare(shieldX, shieldY, shieldZ, '#38BDF8', 1.35);
        this.spawnShockwave(defender.pos.x, 0.9, defender.pos.z, 2.0, '#38BDF8');
        return;
      } else {
        const baseForBlock = options?.fixedDamage ?? rawDamage;
        const mitigated = baseForBlock * (1 - defender.weapon.blockMitigation);
        const dmg = Math.max(4, Math.round(mitigated));
        defender.hp = Math.max(0, defender.hp - dmg);
        defender.energy = Math.max(0, defender.energy - 8);
        defender.vel.x -= nx * knockback * 0.45;
        defender.vel.z -= nz * knockback * 0.45;
        soundEngine.playBlock(false);
        this.spawnSparks(shieldX, shieldY, shieldZ, 14, '#CBD5E1', nx, 0.35, nz, 0.95);
        this.spawnHitFlare(shieldX, shieldY, shieldZ, '#94A3B8', 0.85);
        if (attacker.isPlayer) this.damageDealt += dmg;
        this.checkKo();
        return;
      }
    }

    const powerScale = attacker.stats.attackPower / 100;
    const armorFactor = 1 - defender.stats.armor / 100;
    const finalDmg =
      options?.fixedDamage !== undefined
        ? Math.max(1, Math.round(options.fixedDamage))
        : Math.max(10, Math.round(rawDamage * powerScale * armorFactor));

    defender.hp = Math.max(0, defender.hp - finalDmg);
    defender.hitFlashTimer = 0.14;
    defender.stunTimer = isHeavy ? 0.36 : 0.18;
    if (isHeavy) {
      defender.attackPhase = 'none';
      defender.isGuarding = false;
    }
    defender.vel.x -= nx * knockback;
    defender.vel.z -= nz * knockback;

    this.addSpecialCharge(attacker, isHeavy ? 13 : 8);
    this.addSpecialCharge(defender, 6);
    attacker.comboCounter += 1;
    attacker.comboDecayTimer = 2.4;

    if (attacker.isPlayer) {
      this.damageDealt += finalDmg;
    }

    // Imprint persistent 3D battle scar (gash or plasma burn crater) directly onto struck armor
    defender.damageCtrl.recordHit({
      rootObject: defender.rig.root,
      worldImpactPos: _impactPt,
      worldStrikeDir: impactDir,
      isSlash: !attacker.weapon.isRanged,
      isHeavy: isHeavy || finalDmg >= 180,
      accentHex: attacker.weapon.accentHex,
      elapsedTime: this.elapsedTime,
    });

    this.cameraShake = Math.min(0.45, this.cameraShake + (isHeavy ? 0.25 : 0.11));
    soundEngine.playHit(isHeavy);

    // High-velocity ricochet sparks jetting directly off the hit point + bright contact starburst
    this.spawnSparks(
      _impactPt.x,
      _impactPt.y,
      _impactPt.z,
      isHeavy ? 30 : 18,
      attacker.weapon.accentHex,
      nx,
      isHeavy ? 0.55 : 0.35,
      nz,
      isHeavy ? 1.25 : 1.0,
    );
    this.spawnHitFlare(
      _impactPt.x,
      _impactPt.y,
      _impactPt.z,
      attacker.weapon.accentHex,
      isHeavy ? 1.5 : 0.95,
    );

    if (isHeavy) {
      this.spawnShockwave(
        defender.pos.x,
        defender.pos.y + 0.18,
        defender.pos.z,
        2.6,
        attacker.weapon.accentHex,
      );
    }

    // 8-Cell Explosion Gauge ("До взрыва")
    let cellDrain = 0;
    if (options?.cellDrain !== undefined) {
      cellDrain = options.cellDrain;
    } else if (isSpecialHit) {
      cellDrain = isHeavy ? 4 : 1;
    } else if (isHeavy || finalDmg >= 145) {
      cellDrain = 1;
    }

    if (cellDrain > 0 && defender.explosionCells > 0) {
      defender.explosionCells = Math.max(0, defender.explosionCells - cellDrain);
      if (defender.explosionCells <= 0) {
        this.triggerCoreExplosion(attacker, defender, nx, nz);
        return;
      }
    }

    this.checkKo();
  }

  private checkKo() {
    if (this.outcome !== 'ongoing') return;
    if (this.enemy.hp <= 0) {
      this.outcome = 'victory';
      this.outcomeDelayTimer = 1.6;
      this.bannerText = 'ПОБЕДА! LBX ПРОТИВНИКА ПОВЕРЖЕН';
      this.bannerTimer = 3.0;
      this.updateCursorVisibility();
      this.exitPointerLock();
      this.spawnExplosion(this.enemy.pos.x, this.enemy.pos.y + 1.0, this.enemy.pos.z, 1.45);
      this.spawnShockwave(this.enemy.pos.x, 0.3, this.enemy.pos.z, 4.5, '#F59E0B');
      soundEngine.playExplosion();
      soundEngine.playOutcome(true);
    } else if (this.player.hp <= 0) {
      this.outcome = 'defeat';
      this.outcomeDelayTimer = 1.6;
      this.bannerText = 'ПОРАЖЕНИЕ — LBX ВЫВЕДЕН ИЗ СТРОЯ';
      this.bannerTimer = 3.0;
      this.updateCursorVisibility();
      this.exitPointerLock();
      this.spawnExplosion(this.player.pos.x, this.player.pos.y + 1.0, this.player.pos.z, 1.45);
      this.spawnShockwave(this.player.pos.x, 0.3, this.player.pos.z, 4.5, '#EF4444');
      soundEngine.playExplosion();
      soundEngine.playOutcome(false);
    }
  }

  private updateInteractables(dt: number) {
    this.readyInteractablesScratch.length = 0;

    for (let i = 0; i < this.interactableStates.length; i++) {
      const item = this.interactableStates[i];
      if (item.cooldown > 0) {
        item.cooldown = Math.max(0, item.cooldown - dt);
      }

      const vis = this.interactableVisuals.get(item.data.id);
      if (vis) {
        const ready = item.cooldown <= 0;
        vis.beaconMesh.visible = ready;
        vis.beaconMesh.rotation.y += dt * 1.8;
        vis.beaconMesh.position.y = 0.72 + Math.sin(this.elapsedTime * 3.0 + i) * 0.12;
        (vis.ringMesh.material as THREE.MeshBasicMaterial).opacity = ready ? 0.92 : 0.18;
      }

      if (item.cooldown <= 0 && this.outcome === 'ongoing') {
        this.readyInteractablesScratch.push(item.data);

        const fighters = [this.player, this.enemy];
        for (let fIdx = 0; fIdx < fighters.length; fIdx++) {
          const f = fighters[fIdx];
          if (f.hp <= 0) continue;
          const dist = Math.hypot(f.pos.x - item.data.x, f.pos.z - item.data.z);
          if (dist <= item.data.radius + 0.55) {
            if (item.data.kind === 'repair_node') {
              const healHp = 260;
              f.hp = Math.min(f.stats.maxHp, f.hp + healHp);
              f.damageCtrl.healPartial(healHp / f.stats.maxHp);
              this.addSpecialCharge(f, 20);
              item.cooldown = 11.0;
              soundEngine.playSpecial();
              this.spawnShockwave(item.data.x, 0.15, item.data.z, 2.4, '#34D399');
              if (f.isPlayer) {
                this.bannerText = f.usesAchillesProgression && f.level < ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel
                  ? 'РЕМОНТНЫЙ УЗЕЛ: +260 HP!'
                  : 'РЕМОНТНЫЙ УЗЕЛ: +260 HP и заряд Экстра!';
                this.bannerTimer = 1.4;
              }
            } else {
              f.energy = Math.min(f.stats.maxEnergy, f.energy + 45);
              // Smooth boost surge forward
              f.vel.x += Math.sin(f.yaw) * 7.5;
              f.vel.z += Math.cos(f.yaw) * 7.5;
              item.cooldown = 8.0;
              soundEngine.playDash();
              this.spawnShockwave(item.data.x, 0.15, item.data.z, 2.2, '#38BDF8');
              if (f.isPlayer) {
                this.bannerText = 'ЭНЕРГО-УСКОРИТЕЛЬ: +45 Буст-энергии!';
                this.bannerTimer = 1.3;
              }
            }
            break;
          }
        }
      }
    }
  }

  private updateFighter(
    f: FighterRuntime,
    opponent: FighterRuntime,
    moveInput: { x: number; z: number },
    wantAttack: boolean,
    wantGuard: boolean,
    wantDash: boolean,
    wantSpecial: boolean,
    aimAngle: number | null,
    dt: number,
  ) {
    f.attackCooldown = Math.max(0, f.attackCooldown - dt);
    f.dashCooldown = Math.max(0, f.dashCooldown - dt);
    f.skillRCooldown = Math.max(0, f.skillRCooldown - dt);
    f.skillECooldown = Math.max(0, f.skillECooldown - dt);
    f.stunTimer = Math.max(0, f.stunTimer - dt);
    f.hitFlashTimer = Math.max(0, f.hitFlashTimer - dt);
    f.invulnTimer = Math.max(0, f.invulnTimer - dt);
    f.jumpSquashTimer = Math.max(0, f.jumpSquashTimer - dt);
    f.comboResetTimer = Math.max(0, f.comboResetTimer - dt);
    if (f.missileRearmTimer > 0) {
      f.missileRearmTimer = Math.max(0, f.missileRearmTimer - dt);
      if (f.missileRearmTimer <= 0 && f.rig.backMissiles) {
        f.rig.backMissiles.forEach((m) => {
          m.visible = true;
        });
      }
    }
    if (f.comboResetTimer <= 0 && f.attackPhase === 'none') {
      f.comboStep = 0;
    }
    if (f.attackPhase === 'none') {
      f.airAttacking = false;
    }
    f.comboDecayTimer = Math.max(0, f.comboDecayTimer - dt);
    if (f.comboDecayTimer <= 0) {
      f.comboCounter = 0;
    }

    f.rig.hitFlashMaterials.forEach((mat) => {
      mat.emissive.setHex(f.hitFlashTimer > 0 ? 0xff4422 : 0x000000);
      mat.emissiveIntensity = f.hitFlashTimer > 0 ? 0.65 : 0;
    });

    const hpRatio = f.hp / Math.max(1, f.stats.maxHp);
    f.damageCtrl.update(f.rig.root, hpRatio, this.elapsedTime, dt);
    if (f.hp > 0 && hpRatio < 0.36 && Math.random() < dt * (8.5 - hpRatio * 14)) {
      // Critical chassis damage emits periodic electrical/ember sparks
      this.spawnSparks(
        f.pos.x + (Math.random() - 0.5) * 0.45,
        f.pos.y + 0.65 + Math.random() * 0.72,
        f.pos.z + (Math.random() - 0.5) * 0.45,
        2,
        Math.random() > 0.45 ? '#FB923C' : '#38BDF8',
        (Math.random() - 0.5) * 2,
        0.9,
        (Math.random() - 0.5) * 2,
        0.55,
      );
    }

    if (f.hp > 0 && f.explosionCells <= 2) {
      f.overheatSparkTimer -= dt;
      if (f.overheatSparkTimer <= 0) {
        f.overheatSparkTimer = 0.24 + Math.random() * 0.14;
        this.spawnSparks(
          f.pos.x + (Math.random() - 0.5) * 0.35,
          f.pos.y + 1.05 + (Math.random() - 0.5) * 0.25,
          f.pos.z + (Math.random() - 0.5) * 0.35,
          3,
          Math.random() > 0.4 ? '#F97316' : '#EF4444',
          (Math.random() - 0.5) * 2.5,
          1.2,
          (Math.random() - 0.5) * 2.5,
          0.75,
        );
      }
    } else {
      f.overheatSparkTimer = 0;
    }

    if (f.hp <= 0) {
      f.isAiming = false;
      stopCustomSpecialClip(f.rig);
      f.vel.x = THREE.MathUtils.damp(f.vel.x, 0, 8, dt);
      f.vel.z = THREE.MathUtils.damp(f.vel.z, 0, 8, dt);
      if (f.pos.y > 0) {
        f.velY -= 24.5 * dt;
        f.pos.y = Math.max(0, f.pos.y + f.velY * dt);
      }
      f.pos.x += f.vel.x * dt;
      f.pos.z += f.vel.z * dt;
      f.rig.root.position.copy(f.pos);
      f.rig.shadowDisc.position.y = 0.015 - f.pos.y;
      f.rig.bodyGroup.rotation.x = THREE.MathUtils.damp(
        f.rig.bodyGroup.rotation.x,
        -Math.PI * 0.45,
        6,
        dt,
      );
      f.rig.bodyGroup.position.y = THREE.MathUtils.damp(
        f.rig.bodyGroup.position.y,
        -0.45,
        6,
        dt,
      );
      return;
    }

    if (f.stunTimer > 0 && (f.rig.specialAnimActive || f.activeSkill !== 'none')) {
      stopCustomSpecialClip(f.rig);
      f.isOdinClipSpecial = false;
      f.activeSkill = 'none';
      f.isSpecialAttack = false;
    }

    if (!f.isDashing && !f.isGuarding) {
      f.energy = Math.min(
        f.stats.maxEnergy,
        f.energy + f.stats.energyRegen * dt,
      );
    }

    if (wantSpecial) {
      this.trySpecial(f, opponent);
    } else if (wantDash) {
      this.tryDash(f, moveInput);
    } else if (wantAttack) {
      this.tryAttack(f, opponent);
    }

    const canGuard =
      f.stats.canGuard &&
      wantGuard &&
      f.isGrounded &&
      !f.isDashing &&
      f.attackPhase === 'none' &&
      f.stunTimer <= 0 &&
      f.energy > 4;
    if (canGuard && !f.isGuarding) {
      f.guardStartTime = this.elapsedTime;
    }
    f.isGuarding = canGuard;
    if (f.isGuarding) {
      f.energy = Math.max(0, f.energy - 6.5 * dt);
    }

    f.isAiming =
      !f.stats.canGuard &&
      f.weapon.isRanged &&
      wantGuard &&
      !f.isDashing &&
      !f.isSpecialAttack &&
      f.stunTimer <= 0 &&
      f.hp > 0;

    const usesPhysicalShield =
      f.weapon.kind === 'lance' ||
      f.weapon.kind === 'halberd' ||
      f.weapon.kind === 'hammer' ||
      Boolean(f.rig.isCustomModel && !f.rig.hasHangarWeapon && f.rig.hasBuiltInWeapon);
    f.rig.guardBubble.visible = f.isGuarding && !usesPhysicalShield;
    if (f.rig.guardBubble.visible) {
      f.rig.guardBubble.rotation.y += dt * 1.8;
    }

    if (f.attackPhase !== 'none') {
      f.attackTimer -= dt;
      const progress = 1 - Math.max(0, f.attackTimer / f.attackDuration);

      if (f.activeSkill === 'lunge_r') {
        // Achilles Lv 0 (R): "Пронзающий выпад" — 200 dmg, -1 explosion cell, 10s CD
        if (progress < 0.22) {
          f.attackPhase = 'windup';
        } else if (progress < 0.64) {
          f.attackPhase = 'active';
          if (f.specialStage === 0) {
            f.specialStage = 1;
            this.spawnShockwave(f.pos.x, f.pos.y + 0.18, f.pos.z, 2.2, '#38BDF8');
          }
          if (!f.hasHitCurrentSwing && progress >= 0.25) {
            const fx = Math.sin(f.yaw);
            const fz = Math.cos(f.yaw);
            for (let i = 0; i < this.obstacleStates.length; i++) {
              const obs = this.obstacleStates[i];
              if (obs.destroyed || !obs.data.destructible) continue;
              const odist = Math.hypot(obs.data.x - f.pos.x, obs.data.z - f.pos.z);
              if (odist <= f.weapon.range + 1.55) {
                this.damageDestructibleObstacle(obs, ACHILLES_SKILL_UNLOCKS.lungeR.damage, f);
              }
            }
            const dx = opponent.pos.x - f.pos.x;
            const dz = opponent.pos.z - f.pos.z;
            const dist = Math.hypot(dx, dz);
            const dot = dist > 0.01 ? (fx * dx + fz * dz) / dist : 1;
            if (
              dist <= f.weapon.range + 1.55 &&
              dot > 0.05 &&
              Math.abs(opponent.pos.y - f.pos.y) <= 2.2
            ) {
              f.hasHitCurrentSwing = true;
              _impactDir.set(fx, 0.25, fz).normalize();
              this.applyHit(
                f,
                opponent,
                ACHILLES_SKILL_UNLOCKS.lungeR.damage,
                8.8,
                true,
                undefined,
                _impactDir,
                false,
                {
                  fixedDamage: ACHILLES_SKILL_UNLOCKS.lungeR.damage,
                  cellDrain: ACHILLES_SKILL_UNLOCKS.lungeR.cellDrain,
                },
              );
              this.spawnShockwave(opponent.pos.x, opponent.pos.y + 0.22, opponent.pos.z, 2.7, '#38BDF8');
              this.spawnSparks(opponent.pos.x, opponent.pos.y + 1.05, opponent.pos.z, 20, '#7DD3FC');
            }
          }
        } else {
          f.attackPhase = 'recover';
        }
      } else if (f.isSpecialAttack) {
        if (f.activeSkill === 'cyclone_f') {
          // Achilles Lv 10 (F): "Разящий вихрь" — 800 dmg, -6 explosion cells, slow special gauge
          const fx = Math.sin(f.yaw);
          const fz = Math.cos(f.yaw);
          if (progress < 0.24) {
            f.attackPhase = 'windup';
            if (Math.random() < 0.45) {
              this.spawnSparks(
                f.pos.x + (Math.random() - 0.5) * 1.1,
                f.pos.y + 0.5 + Math.random() * 1.3,
                f.pos.z + (Math.random() - 0.5) * 1.1,
                2,
                Math.random() > 0.35 ? '#2DD4BF' : '#38BDF8',
              );
            }
            if (f.specialStage === 0 && progress >= 0.1) {
              f.specialStage = 1;
              this.spawnShockwave(f.pos.x, f.pos.y + 0.18, f.pos.z, 3.6, '#2DD4BF');
              soundEngine.playThunderCharge();
            }
          } else if (progress < 0.72) {
            f.attackPhase = 'active';
            if (f.specialStage < 2) {
              f.specialStage = 2;
              this.spawnShockwave(f.pos.x, f.pos.y + 0.25, f.pos.z, 4.2, '#2DD4BF');
              soundEngine.playDash();
              soundEngine.playSlash(true);
            }
            if (Math.random() < 0.62) {
              this.spawnSparks(
                f.pos.x + fx * 0.9 + (Math.random() - 0.5) * 0.9,
                f.pos.y + 1.0 + (Math.random() - 0.5) * 0.6,
                f.pos.z + fz * 0.9 + (Math.random() - 0.5) * 0.9,
                2,
                Math.random() > 0.35 ? '#5EEAD4' : '#E0F2FE',
                -fx * 0.4,
                0.35,
                -fz * 0.4,
                1.1,
              );
            }
            const dx = opponent.pos.x - f.pos.x;
            const dz = opponent.pos.z - f.pos.z;
            const dist = Math.hypot(dx, dz);
            if (!f.hasHitCurrentSwing && (progress >= 0.62 || (dist <= 2.0 && progress >= 0.46))) {
              f.hasHitCurrentSwing = true;
              const strikeX = f.pos.x + fx * 1.15;
              const strikeZ = f.pos.z + fz * 1.15;
              this.spawnShockwave(strikeX, f.pos.y + 0.2, strikeZ, 6.0, '#2DD4BF');
              this.spawnShockwave(strikeX, f.pos.y + 0.32, strikeZ, 4.2, '#E0F2FE');
              this.spawnShockwave(strikeX, f.pos.y + 0.42, strikeZ, 2.7, '#38BDF8');
              this.spawnHitFlare(strikeX, f.pos.y + 1.1, strikeZ, '#5EEAD4', 2.4);
              this.spawnSparks(strikeX, f.pos.y + 1.1, strikeZ, 42, '#2DD4BF', fx * 0.4, 0.5, fz * 0.4, 1.55);
              this.thunderLight.color.set('#2DD4BF');
              this.thunderLight.position.set(strikeX, f.pos.y + 1.8, strikeZ);
              this.thunderFlashIntensity = 26;
              this.cameraShake = Math.min(0.5, this.cameraShake + 0.45);
              soundEngine.playHit(true);
              soundEngine.playThunderStrike();

              for (let i = 0; i < this.obstacleStates.length; i++) {
                const obs = this.obstacleStates[i];
                if (obs.destroyed || !obs.data.destructible) continue;
                const odist = Math.hypot(obs.data.x - strikeX, obs.data.z - strikeZ);
                if (odist <= 4.0) {
                  this.damageDestructibleObstacle(obs, ACHILLES_SKILL_UNLOCKS.cycloneF.damage, f);
                }
              }

              if (opponent.hp > 0 && (dist <= f.weapon.range + 2.8 || progress >= 0.58)) {
                _v2.set(opponent.pos.x, opponent.pos.y + 1.05, opponent.pos.z);
                _impactDir.set(fx, 0.4, fz).normalize();
                this.applyHit(
                  f,
                  opponent,
                  ACHILLES_SKILL_UNLOCKS.cycloneF.damage,
                  14.5,
                  true,
                  _v2,
                  _impactDir,
                  true,
                  {
                    fixedDamage: ACHILLES_SKILL_UNLOCKS.cycloneF.damage,
                    cellDrain: ACHILLES_SKILL_UNLOCKS.cycloneF.cellDrain,
                    guardBreak: true,
                  },
                );
              }
            }
          } else {
            f.attackPhase = 'recover';
          }
        } else if (f.weapon.isRanged) {
          // Hunter "Залп Стингера": launch 6 back-mounted Stinger homing missiles in rapid sequence
          const salvoTimes = [0.14, 0.23, 0.32, 0.41, 0.50, 0.59];
          while (f.specialStage < salvoTimes.length && progress >= salvoTimes[f.specialStage]) {
            this.launchStingerMissile(
              f,
              opponent,
              f.specialStage,
              f.specialStage === salvoTimes.length - 1,
            );
            f.specialStage += 1;
          }
          f.attackPhase = progress < 0.14 ? 'windup' : progress < 0.72 ? 'active' : 'recover';
        } else if (f.weapon.kind === 'kodachi') {
          // Kunoichi "Быстрый как ветер": 3 rapid horizontal cyclone strikes + fierce bottom-to-top upward launch
          const windTimes = [0.16, 0.34, 0.52, 0.78];
          while (f.specialStage < windTimes.length && progress >= windTimes[f.specialStage]) {
            const stage = f.specialStage;
            f.specialStage += 1;
            const fx = Math.sin(f.yaw);
            const fz = Math.cos(f.yaw);
            const isUppercut = stage === 3;
            f.vel.x += fx * (isUppercut ? 5.8 : 9.2);
            f.vel.z += fz * (isUppercut ? 5.8 : 9.2);
            soundEngine.playSlash(isUppercut || stage === 2);

            const dx = opponent.pos.x - f.pos.x;
            const dz = opponent.pos.z - f.pos.z;
            const dist = Math.hypot(dx, dz);
            const dot = dist > 0.01 ? (fx * dx + fz * dz) / dist : 1;
            if (dist <= f.weapon.range + 1.55 && dot > -0.15 && Math.abs(opponent.pos.y - f.pos.y) <= 2.4) {
              if (!isUppercut) {
                const slashSign = stage % 2 === 0 ? 1 : -1;
                _impactDir.set(-fz * slashSign, 0.25, fx * slashSign).normalize();
                this.applyHit(f, opponent, f.weapon.damage * 0.46, 1.5, false, undefined, _impactDir, true);
                if (opponent.hp > 0) {
                  opponent.stunTimer = Math.max(opponent.stunTimer, 0.44);
                }
              } else {
                _impactDir.set(fx * 0.25, 0.96, fz * 0.25).normalize();
                this.applyHit(f, opponent, f.weapon.damage * 1.18, 4.8, true, undefined, _impactDir, true);
                if (opponent.hp > 0) {
                  opponent.isGrounded = false;
                  opponent.velY = 13.6;
                  opponent.pos.y = Math.max(opponent.pos.y, opponent.groundY + 0.18);
                  opponent.stunTimer = 1.08;
                  opponent.launchedBySpecial = true;
                }
                this.spawnShockwave(
                  opponent.pos.x,
                  opponent.pos.y + 0.35,
                  opponent.pos.z,
                  3.2,
                  '#2DD4BF',
                );
                this.spawnSparks(opponent.pos.x, opponent.pos.y + 1.2, opponent.pos.z, 18, '#5EEAD4');
              }
            }
          }
          f.attackPhase = progress < 0.14 ? 'windup' : progress < 0.88 ? 'active' : 'recover';
        } else if (f.weapon.kind === 'lance') {
          // Achilles "Удар Грозы":
          // 0..68%: anime cut-in charge with glowing blue lightning orb building at spear tip
          // 68..77%: gameplay returns, enemy stands still, Achilles lowers/points spear at enemy
          // 77..92%: blue lightning launches from spear tip across arena into standing enemy
          f.rig.bladeTipPoint.getWorldPosition(_v1);
          if (_v1.y < f.pos.y + 0.25) {
            _v1.set(f.pos.x + Math.sin(f.yaw) * 1.1, f.pos.y + 1.45, f.pos.z + Math.cos(f.yaw) * 1.1);
          }
          if (f.rig.bladeBasePoint) {
            f.rig.bladeBasePoint.getWorldPosition(_v2);
          } else {
            _v2.set(_v1.x - Math.sin(f.yaw) * 0.55, _v1.y - 0.1, _v1.z - Math.cos(f.yaw) * 0.55);
          }
          _v3.copy(_v1).sub(_v2);
          if (_v3.lengthSq() > 0.0004) {
            _v3.normalize();
          } else {
            _v3.set(Math.sin(f.yaw), 0.15, Math.cos(f.yaw)).normalize();
          }
          this.thunderAuraGroup.position.copy(f.pos);
          if (!this.thunderShotActive && progress < 0.78) {
            // Center the triangular-prism lightning sheath right over the spearhead and align with spear axis!
            this.thunderSpearOrb.position.copy(_v1).addScaledVector(_v3, -0.22);
            this.thunderSpearOrb.quaternion.setFromUnitVectors(_yAxis, _v3);
            this.thunderSpearOrb.visible = true;
            this.thunderLight.position.set(_v1.x, _v1.y + 0.35, _v1.z);
            if (Math.random() < 0.28) {
              // Crackling lightning filament running up one edge of the spearhead
              const rAng = Math.random() * Math.PI * 2;
              this.spawnLightningBolt(
                _v2.x + Math.cos(rAng) * 0.16,
                _v2.y + 0.04,
                _v2.z + Math.sin(rAng) * 0.16,
                _v1.x + _v3.x * 0.18,
                _v1.y + _v3.y * 0.18,
                _v1.z + _v3.z * 0.18,
                0.45,
                Math.random() > 0.4 ? '#38BDF8' : '#E0F2FE',
              );
            }
          }

          if (progress < 0.77 && Math.random() < 0.56) {
            this.spawnSparks(_v1.x, _v1.y, _v1.z, 2, Math.random() > 0.25 ? '#38BDF8' : '#60A5FA');
          }

          if (f.specialStage === 0 && progress >= 0.03) {
            f.specialStage = 1;
            this.spawnLightningBolt(f.pos.x + 1.2, f.pos.y + 13.5, f.pos.z - 0.7, _v1.x, _v1.y, _v1.z, 1.25, '#38BDF8');
            this.spawnSparks(_v1.x, _v1.y, _v1.z, 12, '#60A5FA');
            this.thunderFlashIntensity = 15;
            this.cameraShake = Math.min(0.45, this.cameraShake + 0.07);
          }
          if (f.specialStage === 1 && progress >= 0.17) {
            f.specialStage = 2;
            this.spawnLightningBolt(f.pos.x - 1.4, f.pos.y + 14.8, f.pos.z - 0.8, _v1.x, _v1.y, _v1.z, 1.35, '#93C5FD');
            this.spawnShockwave(f.pos.x, f.pos.y + 0.16, f.pos.z, 3.0, '#38BDF8');
            this.spawnSparks(_v1.x, _v1.y, _v1.z, 14, '#38BDF8');
            this.thunderFlashIntensity = 17;
            this.cameraShake = Math.min(0.45, this.cameraShake + 0.08);
          }
          if (f.specialStage === 2 && progress >= 0.28) {
            f.specialStage = 3;
            this.spawnLightningBolt(f.pos.x - 0.7, f.pos.y + 14.0, f.pos.z + 0.8, _v1.x, _v1.y, _v1.z, 1.2, '#60A5FA');
            this.spawnSparks(_v1.x, _v1.y, _v1.z, 16, '#93C5FD');
            soundEngine.playThunderCharge();
            this.thunderFlashIntensity = 20;
            this.cameraShake = Math.min(0.45, this.cameraShake + 0.09);
          }
          if (f.specialStage === 3 && progress >= 0.45) {
            f.specialStage = 4;
            for (let k = 0; k < 3; k++) {
              const ang = (k / 3) * Math.PI * 2 + 0.4;
              this.spawnLightningBolt(
                _v1.x + Math.cos(ang) * 2.1,
                f.pos.y + 16.0,
                _v1.z + Math.sin(ang) * 2.1,
                _v1.x,
                _v1.y,
                _v1.z,
                1.35,
                k === 0 ? '#E0F2FE' : '#38BDF8',
              );
            }
            this.spawnShockwave(f.pos.x, f.pos.y + 0.24, f.pos.z, 4.1, '#38BDF8');
            this.spawnSparks(_v1.x, _v1.y, _v1.z, 22, '#60A5FA');
            soundEngine.playThunderCharge();
            this.thunderFlashIntensity = 22;
            this.cameraShake = Math.min(0.45, this.cameraShake + 0.1);
          }
          if (f.specialStage === 4 && progress >= 0.62) {
            f.specialStage = 5;
            for (let k = 0; k < 4; k++) {
              const ang = (k / 4) * Math.PI * 2;
              this.spawnLightningBolt(
                _v1.x + Math.cos(ang) * 2.4,
                f.pos.y + 16.5,
                _v1.z + Math.sin(ang) * 2.4,
                _v1.x,
                _v1.y,
                _v1.z,
                1.5,
                k % 2 === 0 ? '#E0F2FE' : '#2563EB',
              );
            }
            this.spawnShockwave(f.pos.x, f.pos.y + 0.28, f.pos.z, 4.6, '#60A5FA');
            this.spawnSparks(_v1.x, _v1.y, _v1.z, 24, '#38BDF8');
            soundEngine.playThunderCharge();
            this.thunderFlashIntensity = 24;
            this.cameraShake = Math.min(0.45, this.cameraShake + 0.12);
          }

          if (progress >= 0.68 && f.rig.specialAnimActive) {
            // Cut-in finished: transition smoothly into gameplay spear-pointing aim pose
            stopCustomSpecialClip(f.rig);
          }

          if (progress < 0.68) {
            f.attackPhase = 'windup';
          } else if (progress < 0.91) {
            f.attackPhase = 'active';
            if (f.specialStage === 5 && progress >= 0.77 && !f.hasHitCurrentSwing) {
              f.specialStage = 6;
              // Launch charged blue lightning from spear tip toward standing opponent!
              this.thunderShotActive = true;
              this.thunderShotTimer = 0;
              this.thunderShotOrigin.copy(_v1);
              this.thunderShotPos.copy(_v1);
              const shotDist = Math.hypot(
                opponent.pos.x - _v1.x,
                opponent.pos.z - _v1.z,
              );
              this.thunderShotDuration = THREE.MathUtils.clamp(shotDist / 30, 0.24, 0.44);
              this.thunderShotCaster = f;
              this.thunderShotTarget = opponent;
              this.thunderShotArcCooldown = 0;
              this.thunderFlashIntensity = 24;
              this.cameraShake = Math.min(0.45, this.cameraShake + 0.16);
              soundEngine.playThunderCharge();
              soundEngine.playLaser(true);
            } else if (progress >= 0.89 && !f.hasHitCurrentSwing && !this.thunderShotActive) {
              f.hasHitCurrentSwing = true;
              this.executeAttackImpact(f, opponent);
            }
          } else {
            f.attackPhase = 'recover';
          }
        } else if (f.weapon.kind === 'hammer') {
          // Xenon "Удар Ксенона": power coil -> soaring meteor leap -> earth-shatter hammer slam at 54% progress
          if (progress < 0.54) {
            f.attackPhase = 'windup';
          } else if (progress < 0.8) {
            f.attackPhase = 'active';
            if (!f.hasHitCurrentSwing) {
              f.hasHitCurrentSwing = true;
              this.executeAttackImpact(f, opponent);
            }
          } else {
            f.attackPhase = 'recover';
          }
        } else if (f.weapon.kind === 'halberd') {
          if (f.isOdinClipSpecial) {
            // Odin "Разряд Гунгнира" (using embedded GLB "Gungnir" clip):
            // 0..12%: skyward thruster ascent; 12..62%: aerial spear twirl & fiery orange plasma sky charge;
            // 62..72%: cocks Gungnir back aiming down; 72..88%: forward thrust launching orange Gungnir plasma lance!
            f.rig.bladeTipPoint.getWorldPosition(_v1);
            if (_v1.y < f.pos.y + 0.25) {
              _v1.set(
                f.pos.x + Math.sin(f.yaw) * 1.1,
                f.pos.y + 3.4,
                f.pos.z + Math.cos(f.yaw) * 1.1,
              );
            }
            if (f.rig.bladeBasePoint) {
              f.rig.bladeBasePoint.getWorldPosition(_v2);
            } else {
              _v2.set(_v1.x - Math.sin(f.yaw) * 0.55, _v1.y - 0.15, _v1.z - Math.cos(f.yaw) * 0.55);
            }
            _v3.copy(_v1).sub(_v2);
            if (_v3.lengthSq() > 0.0004) {
              _v3.normalize();
            } else {
              _v3.set(Math.sin(f.yaw), 0.2, Math.cos(f.yaw)).normalize();
            }
            this.thunderAuraGroup.position.copy(f.pos);

            if (!this.thunderShotActive && progress < 0.75) {
              this.thunderSpearOrb.position.copy(_v1).addScaledVector(_v3, -0.2);
              this.thunderSpearOrb.quaternion.setFromUnitVectors(_yAxis, _v3);
              this.thunderSpearOrb.visible = true;
              this.thunderLight.position.set(_v1.x, _v1.y + 0.3, _v1.z);
              if (Math.random() < 0.34) {
                const rAng = Math.random() * Math.PI * 2;
                this.spawnLightningBolt(
                  _v2.x + Math.cos(rAng) * 0.18,
                  _v2.y + 0.04,
                  _v2.z + Math.sin(rAng) * 0.18,
                  _v1.x + _v3.x * 0.22,
                  _v1.y + _v3.y * 0.22,
                  _v1.z + _v3.z * 0.22,
                  0.52,
                  Math.random() > 0.35 ? '#F97316' : '#FEF08A',
                );
              }
            }

            if (progress < 0.74 && Math.random() < 0.6) {
              this.spawnSparks(
                _v1.x,
                _v1.y,
                _v1.z,
                2,
                Math.random() > 0.3 ? '#FB923C' : '#FDE047',
              );
            }

            if (f.specialStage === 0 && progress >= 0.03) {
              f.specialStage = 1;
              // Jet thruster takeoff ring on ground as Odin ascends
              this.spawnShockwave(f.pos.x, f.pos.y + 0.16, f.pos.z, 3.6, '#F97316');
              this.spawnSparks(f.pos.x, f.pos.y + 0.6, f.pos.z, 18, '#FB923C', 0, -0.4, 0, 1.15);
              this.thunderFlashIntensity = 16;
              this.cameraShake = Math.min(0.45, this.cameraShake + 0.08);
            }
            if (f.specialStage === 1 && progress >= 0.18) {
              f.specialStage = 2;
              this.spawnLightningBolt(
                f.pos.x - 1.5,
                f.pos.y + 15.5,
                f.pos.z - 0.6,
                _v1.x,
                _v1.y,
                _v1.z,
                1.35,
                '#F97316',
              );
              this.spawnSparks(_v1.x, _v1.y, _v1.z, 16, '#FB923C');
              this.thunderFlashIntensity = 18;
              this.cameraShake = Math.min(0.45, this.cameraShake + 0.08);
            }
            if (f.specialStage === 2 && progress >= 0.38) {
              f.specialStage = 3;
              // Vertical sky-salute Gungnir ignition
              this.spawnLightningBolt(
                _v1.x,
                f.pos.y + 18.0,
                _v1.z,
                _v1.x,
                _v1.y,
                _v1.z,
                1.65,
                '#FEF08A',
              );
              this.spawnShockwave(f.pos.x, f.pos.y + 0.22, f.pos.z, 4.2, '#F97316');
              this.spawnSparks(_v1.x, _v1.y, _v1.z, 22, '#FB923C');
              soundEngine.playThunderCharge();
              this.thunderFlashIntensity = 22;
              this.cameraShake = Math.min(0.45, this.cameraShake + 0.1);
            }
            if (f.specialStage === 3 && progress >= 0.54) {
              f.specialStage = 4;
              for (let k = 0; k < 4; k++) {
                const ang = (k / 4) * Math.PI * 2 + 0.35;
                this.spawnLightningBolt(
                  _v1.x + Math.cos(ang) * 2.4,
                  f.pos.y + 16.5,
                  _v1.z + Math.sin(ang) * 2.4,
                  _v1.x,
                  _v1.y,
                  _v1.z,
                  1.4,
                  k % 2 === 0 ? '#FEF08A' : '#F97316',
                );
              }
              this.spawnShockwave(f.pos.x, f.pos.y + 0.26, f.pos.z, 4.8, '#FB923C');
              this.spawnSparks(_v1.x, _v1.y, _v1.z, 26, '#FDE047');
              soundEngine.playThunderCharge();
              this.thunderFlashIntensity = 25;
              this.cameraShake = Math.min(0.45, this.cameraShake + 0.12);
            }
            if (f.specialStage === 4 && progress >= 0.66) {
              f.specialStage = 5;
              this.spawnHitFlare(_v1.x, _v1.y, _v1.z, '#F97316', 1.75);
              this.spawnSparks(_v1.x, _v1.y, _v1.z, 20, '#FEF08A');
              soundEngine.playThunderCharge();
              this.thunderFlashIntensity = 24;
            }

            if (progress >= 0.88 && f.rig.specialAnimActive) {
              stopCustomSpecialClip(f.rig);
              f.jumpSquashTimer = 0.22;
              this.spawnShockwave(f.pos.x, f.pos.y + 0.16, f.pos.z, 2.8, '#F97316');
              this.spawnSparks(f.pos.x, f.pos.y + 0.25, f.pos.z, 14, '#FB923C');
            }

            if (progress < 0.7) {
              f.attackPhase = 'windup';
            } else if (progress < 0.9) {
              f.attackPhase = 'active';
              if (f.specialStage === 5 && progress >= 0.73 && !f.hasHitCurrentSwing) {
                f.specialStage = 6;
                this.thunderShotActive = true;
                this.thunderShotTimer = 0;
                this.thunderShotOrigin.copy(_v1);
                this.thunderShotPos.copy(_v1);
                const shotDist = Math.hypot(
                  opponent.pos.x - _v1.x,
                  opponent.pos.z - _v1.z,
                );
                this.thunderShotDuration = THREE.MathUtils.clamp(shotDist / 32, 0.24, 0.42);
                this.thunderShotCaster = f;
                this.thunderShotTarget = opponent;
                this.thunderShotArcCooldown = 0;
                this.thunderFlashIntensity = 26;
                this.cameraShake = Math.min(0.45, this.cameraShake + 0.18);
                soundEngine.playThunderCharge();
                soundEngine.playLaser(true);
              } else if (progress >= 0.87 && !f.hasHitCurrentSwing && !this.thunderShotActive) {
                f.hasHitCurrentSwing = true;
                this.executeAttackImpact(f, opponent);
              }
            } else {
              f.attackPhase = 'recover';
            }
          } else {
            // Non-Odin fallback "Разряд Гунгнира": overhead plasma charge -> supersonic crescent arc discharge
            f.rig.bladeTipPoint.getWorldPosition(_v1);
            if (_v1.y < f.pos.y + 0.25) {
              _v1.set(
                f.pos.x + Math.sin(f.yaw) * 1.1,
                f.pos.y + 1.9,
                f.pos.z + Math.cos(f.yaw) * 1.1,
              );
            }
            if (progress < 0.42) {
              f.attackPhase = 'windup';
              if (Math.random() < 0.45) {
                this.spawnSparks(
                  _v1.x,
                  _v1.y,
                  _v1.z,
                  2,
                  Math.random() > 0.35 ? '#F97316' : '#FEF08A',
                );
              }
            } else if (progress < 0.72) {
              f.attackPhase = 'active';
              if (progress >= 0.44 && !f.hasHitCurrentSwing) {
                f.hasHitCurrentSwing = true;
                const fx = Math.sin(f.yaw);
                const fz = Math.cos(f.yaw);
                f.vel.x += fx * 11.5;
                f.vel.z += fz * 11.5;
                soundEngine.playLaser(true);
                soundEngine.playSlash(true);
                const strikeX = f.pos.x + fx * 1.45;
                const strikeZ = f.pos.z + fz * 1.45;
                this.spawnShockwave(strikeX, f.pos.y + 0.35, strikeZ, 5.2, '#F97316');
                this.spawnShockwave(strikeX, f.pos.y + 0.22, strikeZ, 3.3, '#FEF08A');
                this.spawnHitFlare(strikeX, f.pos.y + 1.15, strikeZ, '#F97316', 1.85);
                this.spawnSparks(
                  strikeX,
                  f.pos.y + 1.15,
                  strikeZ,
                  28,
                  '#FB923C',
                  fx,
                  0.35,
                  fz,
                  1.3,
                );
                this.cameraShake = Math.min(0.45, this.cameraShake + 0.32);

                for (let i = 0; i < this.obstacleStates.length; i++) {
                  const obs = this.obstacleStates[i];
                  if (obs.destroyed || !obs.data.destructible) continue;
                  const odist = Math.hypot(obs.data.x - strikeX, obs.data.z - strikeZ);
                  if (odist <= f.weapon.range + 1.8) {
                    this.damageDestructibleObstacle(obs, f.weapon.damage * 1.65, f);
                  }
                }

                const dx = opponent.pos.x - f.pos.x;
                const dz = opponent.pos.z - f.pos.z;
                const dist = Math.hypot(dx, dz);
                const dot = dist > 0.01 ? (fx * dx + fz * dz) / dist : 1;
                if (
                  dist <= f.weapon.range + 2.2 &&
                  dot > -0.25 &&
                  Math.abs(opponent.pos.y - f.pos.y) <= 2.6
                ) {
                  _impactDir.set(-fz * 0.4 + fx * 0.8, 0.45, fx * 0.4 + fz * 0.8).normalize();
                  this.applyHit(
                    f,
                    opponent,
                    f.weapon.damage * 1.65,
                    9.8,
                    true,
                    undefined,
                    _impactDir,
                    true,
                  );
                }
              }
            } else {
              f.attackPhase = 'recover';
            }
          }
        } else {
          if (progress < 0.28) {
            f.attackPhase = 'windup';
          } else if (progress < 0.65) {
            f.attackPhase = 'active';
            if (!f.hasHitCurrentSwing) {
              f.hasHitCurrentSwing = true;
              this.executeAttackImpact(f, opponent);
            }
          } else {
            f.attackPhase = 'recover';
          }
        }
      } else {
        if (progress < 0.28) {
          f.attackPhase = 'windup';
        } else if (progress < 0.65) {
          f.attackPhase = 'active';
          if (!f.hasHitCurrentSwing) {
            f.hasHitCurrentSwing = true;
            this.executeAttackImpact(f, opponent);
          }
        } else {
          f.attackPhase = 'recover';
        }
      }

      if (f.attackTimer <= 0) {
        f.attackPhase = 'none';
        f.activeSkill = 'none';
        f.isSpecialAttack = false;
        f.isOdinClipSpecial = false;
        f.airAttacking = false;
        f.specialStage = 0;
        stopCustomSpecialClip(f.rig);
      }
    }

    let desiredVx = 0;
    let desiredVz = 0;

    if (f.isDashing) {
      f.dashTimer -= dt;
      desiredVx = f.dashDir.x * f.stats.dashSpeed;
      desiredVz = f.dashDir.z * f.stats.dashSpeed;
      if (f.isPlayer && !this.lockOnActive) {
        f.targetYaw = this.getCamForwardYaw();
      } else {
        f.targetYaw = Math.atan2(f.dashDir.x, f.dashDir.z);
      }
      if (f.dashTimer <= 0) {
        f.isDashing = false;
      }
    } else if (f.stunTimer > 0) {
      desiredVx = 0;
      desiredVz = 0;
    } else if (f.activeSkill === 'lunge_r' || f.activeSkill === 'cyclone_f') {
      const skillProg = 1 - Math.max(0, f.attackTimer / Math.max(0.1, f.attackDuration));
      const fx = Math.sin(f.yaw);
      const fz = Math.cos(f.yaw);
      if (f.activeSkill === 'lunge_r') {
        const thrusting = skillProg >= 0.22 && skillProg <= 0.58;
        desiredVx = thrusting ? fx * 17.5 : 0;
        desiredVz = thrusting ? fz * 17.5 : 0;
      } else {
        const distToOpp = Math.hypot(opponent.pos.x - f.pos.x, opponent.pos.z - f.pos.z);
        const drilling = skillProg >= 0.24 && skillProg < 0.65 && !f.hasHitCurrentSwing && distToOpp > 1.7;
        desiredVx = drilling ? fx * 18.0 : 0;
        desiredVz = drilling ? fz * 18.0 : 0;
      }
      f.targetYaw = Math.atan2(opponent.pos.x - f.pos.x, opponent.pos.z - f.pos.z);
    } else {
      const speedMult =
        f.attackPhase !== 'none'
          ? f.airAttacking
            ? 0.62
            : f.isAiming
              ? 0.45
              : 0.28
          : f.isGuarding
            ? 0.42
            : f.isAiming
              ? 0.52
              : !f.isGrounded
                ? 0.92
                : 1.0;
      const moveLen = Math.hypot(moveInput.x, moveInput.z);
      let backpedalScale = 1.0;
      if (moveLen > 0.1) {
        const fwdDot =
          (moveInput.x / moveLen) * Math.sin(f.yaw) +
          (moveInput.z / moveLen) * Math.cos(f.yaw);
        if (fwdDot < -0.35) {
          backpedalScale = 0.85;
        }
      }
      desiredVx = moveInput.x * f.stats.moveSpeed * speedMult * backpedalScale;
      desiredVz = moveInput.z * f.stats.moveSpeed * speedMult * backpedalScale;
      if (f.isSpecialAttack && (f.weapon.kind === 'lance' || f.isOdinClipSpecial)) {
        // Point Achilles / Odin straight toward opponent during cut-in & beam discharge
        f.targetYaw = Math.atan2(opponent.pos.x - f.pos.x, opponent.pos.z - f.pos.z);
      } else if (f.isPlayer && !this.lockOnActive) {
        // Player character turns strictly with the cursor/camera, never rotating toward WASD keys
        f.targetYaw =
          f.attackPhase !== 'none'
            ? (aimAngle ?? this.getCamForwardYaw())
            : this.getCamForwardYaw();
      } else if (aimAngle !== null && (this.lockOnActive || !f.isPlayer || f.isGuarding || f.isAiming)) {
        f.targetYaw = aimAngle;
      } else if (moveLen > 0.1) {
        f.targetYaw = Math.atan2(moveInput.x, moveInput.z);
      }
    }

    const accelLambda =
      f.isDashing || f.activeSkill === 'lunge_r' || f.activeSkill === 'cyclone_f'
        ? 22
      : f.stunTimer > 0
        ? 9
        : !f.isGrounded
          ? 7.5
          : 12.5;
    f.vel.x = THREE.MathUtils.damp(f.vel.x, desiredVx, accelLambda, dt);
    f.vel.z = THREE.MathUtils.damp(f.vel.z, desiredVz, accelLambda, dt);

    f.pos.x += f.vel.x * dt;
    f.pos.z += f.vel.z * dt;

    const supportY = this.resolveCollisions(f, opponent);
    f.groundY = supportY;

    const grav = f.isDashing
      ? 6.5
      : f.airAttacking && !f.weapon.isRanged && f.attackPhase === 'windup'
        ? 10.5
        : 24.5;

    if (!f.isGrounded || f.pos.y > supportY || f.velY > 0) {
      f.velY -= grav * dt;
      f.pos.y += f.velY * dt;
      if (f.pos.y <= supportY) {
        const impactSpeed = Math.abs(f.velY);
        f.pos.y = supportY;
        f.velY = 0;
        if (!f.isGrounded) {
          f.isGrounded = true;
          f.jumpSquashTimer = Math.min(0.2, 0.08 + impactSpeed * 0.012);
          if (impactSpeed > 4.2) {
            soundEngine.playLand();
          }
          if (f.launchedBySpecial) {
            f.launchedBySpecial = false;
            this.spawnShockwave(f.pos.x, supportY + 0.14, f.pos.z, 3.2, '#2DD4BF');
            this.spawnSparks(f.pos.x, supportY + 0.25, f.pos.z, 14, '#5EEAD4');
            this.cameraShake = Math.min(0.45, this.cameraShake + 0.24);
            soundEngine.playHit(true);
          } else if (f.airAttacking && !f.weapon.isRanged && f.attackPhase !== 'none' && impactSpeed > 6.5) {
            this.spawnShockwave(f.pos.x, supportY + 0.12, f.pos.z, 2.35, f.weapon.accentHex);
            this.spawnSparks(f.pos.x, supportY + 0.25, f.pos.z, 9, f.weapon.accentHex);
          }
        }
      } else {
        f.isGrounded = false;
      }
    } else {
      f.pos.y = supportY;
      f.velY = 0;
      f.isGrounded = true;
    }

    const yawLambda =
      f.isPlayer && !this.lockOnActive
        ? f.isGrounded
          ? 18
          : 11.5
        : 14;
    f.yaw = dampAngle(f.yaw, f.targetYaw, yawLambda, dt);
    f.rig.root.position.copy(f.pos);
    f.rig.root.rotation.y = f.yaw;

    // Anchor ground contact shadow on surface below while jumping
    const heightAboveSurface = Math.max(0, f.pos.y - f.groundY);
    f.rig.shadowDisc.position.y = f.groundY + 0.015 - f.pos.y;
    f.rig.shadowDisc.scale.setScalar(Math.max(0.45, 1 - heightAboveSurface * 0.2));
    (f.rig.shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0.16,
      0.65 - heightAboveSurface * 0.16,
    );

    // Upper torso & head dynamically track cursor direction (quick waist/head lead + vertical pitch)
    let targetAimYaw = 0;
    let targetAimPitch = 0;
    if (f.isPlayer && !this.lockOnActive && f.hp > 0 && f.stunTimer <= 0 && !f.isDashing) {
      const camYaw = this.getCamForwardYaw();
      const rawDelta = shortestAngleDiff(f.yaw, camYaw);
      targetAimYaw = THREE.MathUtils.clamp(rawDelta * 1.15, -0.85, 0.85);
      targetAimPitch = THREE.MathUtils.clamp((this.camOrbitPitch - 0.36) * 0.72, -0.34, 0.34);
    }
    f.aimTorsoYaw = THREE.MathUtils.damp(f.aimTorsoYaw, targetAimYaw, 20, dt);
    f.aimTorsoPitch = THREE.MathUtils.damp(f.aimTorsoPitch, targetAimPitch, 18, dt);

    this.animateFighterRig(f, dt);
  }

  private executeAttackImpact(f: FighterRuntime, target: FighterRuntime) {
    if (f.isSpecialAttack) {
      if (f.weapon.isRanged) {
        [-0.1, 0, 0.1].forEach((spread) => {
          this.spawnProjectile(
            f,
            target,
            f.weapon.damage * 0.92,
            38,
            true,
            spread,
          );
        });
        soundEngine.playLaser(true);
      } else if (f.weapon.kind === 'lance') {
        // Achilles "Удар Грозы" blue lightning detonation on standing enemy
        const strikeX = target.pos.x;
        const strikeY = target.pos.y;
        const strikeZ = target.pos.z;
        f.rig.bladeTipPoint.getWorldPosition(_v1);
        if (_v1.y < f.pos.y + 0.3) {
          _v1.set(f.pos.x + Math.sin(f.yaw) * 1.1, f.pos.y + 1.35, f.pos.z + Math.cos(f.yaw) * 1.1);
        }
        // Main blue-white sky-to-enemy lightning pillar + 5 surrounding blue storm bolts
        this.spawnLightningBolt(
          strikeX,
          strikeY + 18.0,
          strikeZ,
          strikeX,
          strikeY + 0.15,
          strikeZ,
          2.1,
          '#E0F2FE',
        );
        for (let b = 0; b < 5; b++) {
          const ang = (b / 5) * Math.PI * 2 + 0.3;
          const rad = 1.25 + (b % 2) * 0.95;
          const bx = strikeX + Math.cos(ang) * rad;
          const bz = strikeZ + Math.sin(ang) * rad;
          this.spawnLightningBolt(
            bx + Math.cos(ang) * 1.1,
            strikeY + 15.5,
            bz + Math.sin(ang) * 1.1,
            bx,
            strikeY + 0.12,
            bz,
            1.25,
            b % 2 === 0 ? '#38BDF8' : '#60A5FA',
          );
        }
        // Final spear-tip -> enemy lightning arc
        this.spawnLightningBolt(
          _v1.x,
          _v1.y,
          _v1.z,
          strikeX,
          strikeY + 1.08,
          strikeZ,
          1.6,
          '#93C5FD',
        );

        this.spawnShockwave(strikeX, strikeY + 0.18, strikeZ, f.weapon.range + 2.8, '#E0F2FE');
        this.spawnShockwave(strikeX, strikeY + 0.25, strikeZ, f.weapon.range + 2.1, '#38BDF8');
        this.spawnShockwave(strikeX, strikeY + 0.32, strikeZ, f.weapon.range + 1.2, '#2563EB');
        this.spawnSparks(strikeX, strikeY + 1.05, strikeZ, 38, '#60A5FA');
        this.thunderLight.color.set('#60A5FA');
        this.thunderLight.position.set(strikeX, strikeY + 2.1, strikeZ);
        this.thunderFlashIntensity = 30;
        this.cameraShake = Math.min(0.45, this.cameraShake + 0.44);
        soundEngine.playHit(true);
        soundEngine.playThunderStrike();

        for (let i = 0; i < this.obstacleStates.length; i++) {
          const obs = this.obstacleStates[i];
          if (obs.destroyed || !obs.data.destructible) continue;
          const odist = Math.hypot(obs.data.x - strikeX, obs.data.z - strikeZ);
          if (odist <= f.weapon.range + 2.2) {
            this.damageDestructibleObstacle(obs, f.weapon.damage * 2.0, f);
          }
        }

        if (target.hp > 0) {
          _v2.set(strikeX, strikeY + 1.05, strikeZ);
          if (f.usesAchillesProgression) {
            this.applyHit(
              f,
              target,
              ACHILLES_SKILL_UNLOCKS.thunderE.damage,
              12.6,
              true,
              _v2,
              undefined,
              true,
              {
                fixedDamage: ACHILLES_SKILL_UNLOCKS.thunderE.damage,
                cellDrain: ACHILLES_SKILL_UNLOCKS.thunderE.cellDrain,
                guardBreak: true,
              },
            );
          } else {
            this.applyHit(f, target, f.weapon.damage * 2.15, 12.6, true, _v2, undefined, true);
          }
        }
      } else if (f.weapon.kind === 'halberd') {
        // Odin "Разряд Гунгнира" fiery orange plasma storm detonation on target
        const strikeX = target.pos.x;
        const strikeY = target.pos.y;
        const strikeZ = target.pos.z;
        f.rig.bladeTipPoint.getWorldPosition(_v1);
        if (_v1.y < f.pos.y + 0.3) {
          _v1.set(
            f.pos.x + Math.sin(f.yaw) * 1.1,
            f.pos.y + 3.2,
            f.pos.z + Math.cos(f.yaw) * 1.1,
          );
        }
        this.spawnLightningBolt(
          strikeX,
          strikeY + 18.0,
          strikeZ,
          strikeX,
          strikeY + 0.15,
          strikeZ,
          2.2,
          '#FEF08A',
        );
        for (let b = 0; b < 5; b++) {
          const ang = (b / 5) * Math.PI * 2 + 0.4;
          const rad = 1.3 + (b % 2) * 1.0;
          const bx = strikeX + Math.cos(ang) * rad;
          const bz = strikeZ + Math.sin(ang) * rad;
          this.spawnLightningBolt(
            bx + Math.cos(ang) * 1.1,
            strikeY + 16.0,
            bz + Math.sin(ang) * 1.1,
            bx,
            strikeY + 0.12,
            bz,
            1.3,
            b % 2 === 0 ? '#F97316' : '#FB923C',
          );
        }
        this.spawnLightningBolt(
          _v1.x,
          _v1.y,
          _v1.z,
          strikeX,
          strikeY + 1.08,
          strikeZ,
          1.8,
          '#F97316',
        );

        this.spawnShockwave(strikeX, strikeY + 0.18, strikeZ, f.weapon.range + 3.0, '#FFF7ED');
        this.spawnShockwave(strikeX, strikeY + 0.26, strikeZ, f.weapon.range + 2.2, '#F97316');
        this.spawnShockwave(strikeX, strikeY + 0.34, strikeZ, f.weapon.range + 1.3, '#FDE047');
        this.spawnSparks(strikeX, strikeY + 1.05, strikeZ, 42, '#FB923C');
        this.spawnHitFlare(strikeX, strikeY + 1.1, strikeZ, '#F97316', 2.2);
        this.thunderLight.color.set('#F97316');
        this.thunderLight.position.set(strikeX, strikeY + 2.1, strikeZ);
        this.thunderFlashIntensity = 30;
        this.cameraShake = Math.min(0.45, this.cameraShake + 0.45);
        soundEngine.playHit(true);
        soundEngine.playThunderStrike();

        for (let i = 0; i < this.obstacleStates.length; i++) {
          const obs = this.obstacleStates[i];
          if (obs.destroyed || !obs.data.destructible) continue;
          const odist = Math.hypot(obs.data.x - strikeX, obs.data.z - strikeZ);
          if (odist <= f.weapon.range + 2.4) {
            this.damageDestructibleObstacle(obs, f.weapon.damage * 2.0, f);
          }
        }

        if (target.hp > 0) {
          _v2.set(strikeX, strikeY + 1.05, strikeZ);
          this.applyHit(f, target, f.weapon.damage * 2.15, 12.8, true, _v2, undefined, true);
        }
      } else if (f.weapon.kind === 'hammer') {
        // Xenon "Удар Ксенона": cataclysmic earth-shatter hammer impact
        const fx = Math.sin(f.yaw);
        const fz = Math.cos(f.yaw);
        f.vel.x += fx * 12.5;
        f.vel.z += fz * 12.5;
        if (!f.isGrounded) {
          f.velY = Math.min(f.velY, -13.0);
        }
        const strikeX = f.pos.x + fx * 1.75;
        const strikeZ = f.pos.z + fz * 1.75;
        this.spawnShockwave(strikeX, f.pos.y + 0.16, strikeZ, f.weapon.range + 2.1, '#F59E0B');
        this.spawnShockwave(strikeX, f.pos.y + 0.26, strikeZ, f.weapon.range + 1.0, '#EF4444');
        this.spawnSparks(strikeX, f.pos.y + 0.45, strikeZ, 26, '#FBBF24', 0, 1.0, 0, 1.2);
        this.cameraShake = Math.min(0.45, this.cameraShake + 0.36);
        soundEngine.playHit(true);

        for (let i = 0; i < this.obstacleStates.length; i++) {
          const obs = this.obstacleStates[i];
          if (obs.destroyed || !obs.data.destructible) continue;
          const odist = Math.hypot(obs.data.x - strikeX, obs.data.z - strikeZ);
          if (odist <= f.weapon.range + 1.35) {
            this.damageDestructibleObstacle(obs, f.weapon.damage * 1.75, f);
          }
        }

        const dist = Math.hypot(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
        if (dist <= f.weapon.range + 1.35 && Math.abs(target.pos.y - f.pos.y) <= 2.2) {
          _impactDir.set(-fz, 0.55, fx).normalize();
          this.applyHit(f, target, f.weapon.damage * 1.85, 10.5, true, undefined, _impactDir, true);
        }
      } else {
        const fx = Math.sin(f.yaw);
        const fz = Math.cos(f.yaw);
        f.vel.x += fx * 12;
        f.vel.z += fz * 12;
        if (!f.isGrounded) {
          f.velY = Math.min(f.velY, -10.5);
        }
        this.spawnShockwave(
          f.pos.x + fx * 1.4,
          f.pos.y + 0.25,
          f.pos.z + fz * 1.4,
          f.weapon.range + 1.4,
          f.weapon.accentHex,
        );
        const dist = Math.hypot(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
        if (dist <= f.weapon.range + 1.8 && Math.abs(target.pos.y - f.pos.y) <= 2.5) {
          _impactDir.set(-fz, 0.35, fx).normalize();
          this.applyHit(f, target, f.weapon.damage * 1.95, 11, true, undefined, _impactDir, true);
        }
      }
      return;
    }

    if (f.weapon.isRanged) {
      const shotSpeed = f.isAiming ? 42.0 : 36.0;
      const shotDamage = f.isAiming ? f.weapon.damage * 1.15 : f.weapon.damage;
      this.spawnProjectile(f, target, shotDamage, shotSpeed, false, 0);
      f.vel.x -= Math.sin(f.yaw) * (f.isGrounded ? (f.isAiming ? 1.0 : 1.6) : 2.4);
      f.vel.z -= Math.cos(f.yaw) * (f.isGrounded ? (f.isAiming ? 1.0 : 1.6) : 2.4);
    } else {
      const fx = Math.sin(f.yaw);
      const fz = Math.cos(f.yaw);
      const lungeImpulse = f.airAttacking ? 6.8 : f.comboStep === 3 ? 6.5 : 4.2;
      f.vel.x += fx * lungeImpulse;
      f.vel.z += fz * lungeImpulse;
      if (f.airAttacking) {
        f.velY = Math.min(f.velY, -10.0);
      }

      // Check destructible crates in melee swing arc!
      for (let i = 0; i < this.obstacleStates.length; i++) {
        const obs = this.obstacleStates[i];
        if (obs.destroyed || !obs.data.destructible) continue;
        const odx = obs.data.x - f.pos.x;
        const odz = obs.data.z - f.pos.z;
        const odist = Math.hypot(odx, odz);
        const dot = odist > 0.01 ? (fx * odx + fz * odz) / odist : 1;
        if (
          odist <= f.weapon.range + obs.data.radius * 0.6 &&
          dot > 0.05 &&
          f.pos.y <= obs.data.height + 1.5
        ) {
          this.damageDestructibleObstacle(obs, f.weapon.damage * 0.9, f);
        }
      }

      const dx = target.pos.x - f.pos.x;
      const dz = target.pos.z - f.pos.z;
      const dist = Math.hypot(dx, dz);
      const dot = dist > 0.01 ? (fx * dx + fz * dz) / dist : 1;
      const dyMax = f.airAttacking ? 2.45 : 1.75;

      if (dist <= f.weapon.range && dot > 0.15 && Math.abs(target.pos.y - f.pos.y) <= dyMax) {
        const mult = f.airAttacking
          ? 1.24
          : f.comboStep === 3
            ? 1.38
            : f.comboStep === 2
              ? 1.12
              : 1.0;
        const kb = f.airAttacking ? 7.8 : f.comboStep === 3 ? 8.5 : 4.5;
        // Alternate slash gash angle per combo step
        const slashSign = f.comboStep === 2 ? -1 : 1;
        _impactDir.set(-fz * slashSign, f.comboStep === 3 ? 0.72 : 0.34, fx * slashSign).normalize();
        this.applyHit(
          f,
          target,
          f.weapon.damage * mult,
          kb,
          f.comboStep === 3 || f.airAttacking,
          undefined,
          _impactDir,
        );
      }
    }
  }

  private resolveCollisions(f: FighterRuntime, other: FighterRuntime): number {
    const botRadius = 0.68;
    let supportGroundY = 0;

    for (let i = 0; i < this.obstacleStates.length; i++) {
      const obs = this.obstacleStates[i];
      if (obs.destroyed) continue;
      const dx = f.pos.x - obs.data.x;
      const dz = f.pos.z - obs.data.z;
      const dist = Math.hypot(dx, dz);
      const topSupportR = obs.data.radius * 0.96 + botRadius * 0.55;
      const minD = obs.data.radius + botRadius;
      if (dist < topSupportR && f.pos.y >= obs.data.height - 0.45 && f.velY <= 1.2) {
        supportGroundY = Math.max(supportGroundY, obs.data.height);
      } else if (dist < minD && dist > 0.0001) {
        const clearingTopLedge = !f.isGrounded && f.pos.y >= obs.data.height - 0.55 && f.velY > -2.5;
        if (!clearingTopLedge && f.pos.y < obs.data.height - 0.45) {
          const push = minD - dist;
          f.pos.x += (dx / dist) * push;
          f.pos.z += (dz / dist) * push;
        }
      }
    }

    const fdx = f.pos.x - other.pos.x;
    const fdz = f.pos.z - other.pos.z;
    const fdist = Math.hypot(fdx, fdz);
    const minFighterDist = 1.25;
    if (fdist < minFighterDist && fdist > 0.0001 && Math.abs(f.pos.y - other.pos.y) < 1.65) {
      const push = (minFighterDist - fdist) * 0.5;
      f.pos.x += (fdx / fdist) * push;
      f.pos.z += (fdz / fdist) * push;
    }

    const r = Math.hypot(f.pos.x, f.pos.z);
    const maxR = this.arena.radius - botRadius;
    if (r > maxR && r > 0.0001) {
      f.pos.x = (f.pos.x / r) * maxR;
      f.pos.z = (f.pos.z / r) * maxR;
    }

    return supportGroundY;
  }

  private animateFighterRig(f: FighterRuntime, dt: number) {
    const rig = f.rig;
    rig.mixer?.update(dt);
    if (rig.specialAnimActive && rig.specialMixer) {
      rig.specialMixer.update(dt);
    }
    const speed = Math.hypot(f.vel.x, f.vel.z);
    const normMax = Math.max(0.5, f.stats.moveSpeed);
    const speedRatio = THREE.MathUtils.clamp(speed / normMax, 0, 1.8);
    const forwardDot = Math.sin(f.yaw) * f.vel.x + Math.cos(f.yaw) * f.vel.z;
    const rightDot = -Math.cos(f.yaw) * f.vel.x + Math.sin(f.yaw) * f.vel.z;
    const forwardAmount = THREE.MathUtils.clamp(forwardDot / normMax, -1, 1);
    const strafeAmount = THREE.MathUtils.clamp(rightDot / normMax, -1, 1);
    const strafeRatio = strafeAmount;
    const strideSign = forwardAmount < -0.08 ? -1 : 1;

    const absFwd = Math.abs(forwardAmount);
    const absStrafe = Math.min(1, Math.abs(strafeAmount));
    const fwdRaw = Math.pow(absFwd, 1.35);
    const strafeRaw = Math.pow(absStrafe, 1.35);
    const rawDirSum = fwdRaw + strafeRaw;
    const wFwd = rawDirSum > 0.0001 ? fwdRaw / rawDirSum : 1;
    const wStrafe = rawDirSum > 0.0001 ? strafeRaw / rawDirSum : 0;

    const dashDuration = f.stats.dashDuration;
    const dashProgress = f.isDashing
      ? THREE.MathUtils.clamp(1 - f.dashTimer / dashDuration, 0, 1)
      : 0;
    const dashForward = f.isDashing
      ? Math.sin(f.yaw) * f.dashDir.x + Math.cos(f.yaw) * f.dashDir.z
      : 1;
    const dashRight = f.isDashing
      ? -Math.cos(f.yaw) * f.dashDir.x + Math.sin(f.yaw) * f.dashDir.z
      : 0;

    const sMove = Math.min(1.4, speedRatio);
    const walkBlend = THREE.MathUtils.smoothstep(sMove, 0.04, 0.32);
    const sprint = THREE.MathUtils.clamp((sMove - 0.56) / 0.64, 0, 1);

    // Zero foot-skating: wider, slower strides synced to ground velocity / stride length!
    if (speed > 0.16 && f.isGrounded && !f.isDashing) {
      const fwdLen = THREE.MathUtils.lerp(2.45, 4.15, sprint);
      const strafeLen = THREE.MathUtils.lerp(1.65, 2.45, sprint);
      const strideLen = wFwd * fwdLen + wStrafe * strafeLen;
      const omega = (speed / strideLen) * Math.PI * 2 * 0.88;
      f.stridePhase += dt * omega * strideSign;
    } else if (!f.isGrounded) {
      f.stridePhase += dt * 1.4 * strideSign;
    }

    const t = this.elapsedTime;
    const allowIk =
      f.isGrounded &&
      !f.isDashing &&
      f.stunTimer <= 0 &&
      !rig.specialAnimActive &&
      !rig.mixer &&
      f.activeSkill !== 'lunge_r' &&
      f.activeSkill !== 'cyclone_f' &&
      (f.attackPhase === 'none' || f.weapon.isRanged);
    const stanceStyle: 'rifle' | 'lance' | 'kodachi' | 'hammer' | 'blade' =
      f.weapon.isRanged
        ? 'rifle'
        : f.weapon.kind === 'lance' || f.weapon.kind === 'halberd'
          ? 'lance'
          : f.weapon.kind === 'kodachi'
            ? 'kodachi'
            : f.weapon.kind === 'hammer'
              ? 'hammer'
              : 'blade';
    const landingSquash =
      f.isGrounded && f.jumpSquashTimer > 0 && f.attackPhase === 'none' && !f.isDashing
        ? Math.sin((f.jumpSquashTimer / 0.2) * Math.PI) * 0.11
        : 0;
    const ikResult = rig.legKinematics
      ? updateFootLocomotion({
          state: f.locomotion,
          kinematics: rig.legKinematics,
          fighterPos: f.pos,
          velX: f.vel.x,
          velZ: f.vel.z,
          facingYaw: f.yaw,
          maxMoveSpeed: f.stats.moveSpeed,
          isGrounded: f.isGrounded,
          allowIk,
          stanceStyle,
          elapsed: t,
          dt,
          aiming: f.isAiming,
          guarding: f.isGuarding,
          landingSquash,
        })
      : null;

    const syncedPhase = ikResult && allowIk ? f.locomotion.gaitPhase : f.stridePhase;
    const breath = rig.isCustomModel
      ? 0
      : Math.sin(t * 2.6 + (f.isPlayer ? 0 : 1.5)) * 0.028;

    const sinP = Math.sin(syncedPhase);
    const cosP = Math.cos(syncedPhase);
    const uL = syncedPhase * strideSign;
    const uR = (syncedPhase + Math.PI) * strideSign;
    const fwdSwingAmp = THREE.MathUtils.lerp(0.5, 0.86, sprint) * Math.min(1.15, sMove);

    const stanceL = THREE.MathUtils.smoothstep(Math.sin(uL), -0.18, 0.22);
    const stanceR = THREE.MathUtils.smoothstep(Math.sin(uR), -0.18, 0.22);
    const swingKneeL = Math.pow(Math.max(0, -Math.sin(uL) * 0.85 - Math.cos(uL) * 0.35), 0.78) * (1 - stanceL);
    const swingKneeR = Math.pow(Math.max(0, -Math.sin(uR) * 0.85 - Math.cos(uR) * 0.35), 0.78) * (1 - stanceR);
    const recL = swingKneeL;
    const recR = swingKneeR;

    const leanMult =
      f.weapon.kind === 'kodachi'
        ? 1.38
        : f.weapon.kind === 'hammer'
          ? 1.08
          : f.weapon.isRanged
            ? 0.88
            : 1.0;

    // Formula 1 (Longitudinal) modular fallback
    const fwdHipXL = Math.sin(uL) * fwdSwingAmp;
    const fwdHipXR = Math.sin(uR) * fwdSwingAmp;
    const fwdKneeXL =
      (0.1 + Math.max(0, Math.cos(uL)) * 0.2 + Math.pow(Math.max(0, -Math.cos(uL)), 1.2) * 0.34) * stanceL +
      swingKneeL * (0.84 + 0.36 * sprint) +
      (1 - walkBlend) * 0.12;
    const fwdKneeXR =
      (0.1 + Math.max(0, Math.cos(uR)) * 0.2 + Math.pow(Math.max(0, -Math.cos(uR)), 1.2) * 0.34) * stanceR +
      swingKneeR * (0.84 + 0.36 * sprint) +
      (1 - walkBlend) * 0.12;
    const stepDrop = THREE.MathUtils.lerp(0.036, 0.065, sprint) * walkBlend;
    const fwdBodyPitch =
      (forwardAmount < -0.08 ? -0.07 : THREE.MathUtils.lerp(0.05, 0.22, sprint)) * walkBlend * leanMult +
      Math.sin(syncedPhase * 2) * 0.02 * walkBlend;
    const fwdBodyRoll = sinP * strideSign * (0.03 + 0.012 * sprint) * walkBlend;
    const fwdBodyBob = Math.cos(syncedPhase * 2) * stepDrop - stepDrop * 0.52;
    const fwdBodyYaw = -cosP * (0.075 + 0.045 * sprint) * walkBlend;
    const fwdTorsoYaw = cosP * (0.12 + 0.08 * sprint) * walkBlend;

    // Formula 2 (Lateral Side-Step) modular fallback (lbxModel: leftHip at -X, rightHip at +X)
    const wrapTau = (a: number) => {
      const tau = Math.PI * 2;
      const r = a % tau;
      return r < 0 ? r + tau : r;
    };
    const uLatPos = wrapTau(syncedPhase);
    const uLatNeg = wrapTau(syncedPhase + Math.PI);
    const swStart = 0.06 * Math.PI;
    const swEnd = 0.86 * Math.PI;
    const swSpan = swEnd - swStart;
    const solveModStrafe = (u: number, xSign: 1 | -1, isLead: boolean) => {
      const inSw = u >= swStart && u < swEnd;
      const tSw = inSw ? THREE.MathUtils.clamp((u - swStart) / swSpan, 0, 1) : 0;
      const liftArc = inSw ? Math.sin(Math.PI * tSw) : 0;
      const hipX = -0.14 - liftArc * 0.14;
      const kneeX = 0.26 + liftArc * (isLead ? 0.34 : 0.4);
      const wideAbd = 0.28 + 0.12 * sprint;
      const hipZ = isLead
        ? xSign * THREE.MathUtils.lerp(0.05, wideAbd, inSw ? tSw : 0.3)
        : xSign * THREE.MathUtils.lerp(-0.07, 0.05, inSw ? tSw : 0.5);
      return { hipX, kneeX, hipZ };
    };
    // Note: in lbxModel, leftHip is -X (Lead when strafeAmount > 0), rightHip is +X (Lead when strafeAmount < 0)
    const latModL = solveModStrafe(uLatNeg, -1, strafeAmount >= 0);
    const latModR = solveModStrafe(uLatPos, 1, strafeAmount < 0);
    const latBodyYaw = -strafeAmount * THREE.MathUtils.lerp(0.38, 0.48, sprint) * walkBlend;
    const leadCyc = strafeAmount >= 0 ? uLatNeg : uLatPos;
    const overLead = THREE.MathUtils.smoothstep(Math.sin(leadCyc - Math.PI), -0.35, 0.75);
    const latShiftX = -strafeAmount * (0.025 + 0.055 * overLead) * walkBlend;
    const latBodyBob = (-0.018 - 0.025 * overLead) * walkBlend;
    const latTorsoYaw = -latBodyYaw * 0.94;
    const latHeadYaw = -latBodyYaw * 0.06;
    const latTorsoRoll = strafeAmount * (0.06 + 0.03 * sprint) * walkBlend;

    // Diagonal Blend of Formula 1 + Formula 2
    let bodyYaw = wFwd * fwdBodyYaw + wStrafe * latBodyYaw;
    let bodyShiftX = wStrafe * latShiftX;
    let bodyPitch = wFwd * fwdBodyPitch + wStrafe * 0.035 * walkBlend;
    let bodyRoll = wFwd * fwdBodyRoll + wStrafe * strafeAmount * 0.05 * walkBlend;
    let bodyBob = breath + wFwd * fwdBodyBob + wStrafe * latBodyBob;
    let torsoYaw = wFwd * fwdTorsoYaw + wStrafe * latTorsoYaw;
    let torsoPitch =
      f.weapon.kind === 'kodachi' ? 0.14 * sMove : f.weapon.kind === 'hammer' ? 0.07 * sMove : 0;
    let torsoRoll = wStrafe * latTorsoRoll;

    let lHipX = wFwd * fwdHipXL + wStrafe * latModL.hipX;
    let rHipX = wFwd * fwdHipXR + wStrafe * latModR.hipX;
    let lHipZ = wFwd * -0.05 + wStrafe * latModL.hipZ;
    let rHipZ = wFwd * 0.05 + wStrafe * latModR.hipZ;
    let lKneeX = wFwd * fwdKneeXL + wStrafe * latModL.kneeX;
    let rKneeX = wFwd * fwdKneeXR + wStrafe * latModR.kneeX;

    let lShoulderX = -Math.sin(uL) * (0.38 + 0.18 * sprint) * walkBlend * wFwd - 0.16;
    let lShoulderY = 0;
    let lShoulderZ = 0.18;
    let lElbowX = -0.48 - recL * 0.18 * walkBlend * wFwd;

    let rShoulderX = -Math.sin(uR) * (0.34 + 0.16 * sprint) * walkBlend * wFwd - 0.24;
    let rShoulderY = 0;
    let rShoulderZ = -0.18;
    let rElbowX = -0.64 - recR * 0.16 * walkBlend * wFwd;
    let wPitch = 0;
    let wYaw = 0;
    let wRoll = 0;

    let headYaw = wFwd * (-fwdTorsoYaw * 0.7) + wStrafe * latHeadYaw;

    if (f.weapon.isRanged) {
      // Tactical bladed two-handed rifle carry & shouldered aim
      torsoYaw = -0.45 + sinP * 0.045 * sMove * wFwd + wStrafe * latTorsoYaw;
      torsoPitch = 0.07;
      headYaw = 0.42 - sinP * 0.035 * sMove * wFwd + wStrafe * latHeadYaw;
      rShoulderX = -1.16 - sMove * 0.06 + Math.cos(f.stridePhase * 2) * 0.04 * sMove;
      rShoulderZ = -0.14;
      rElbowX = -0.34;
      lShoulderX = -1.06 + Math.cos(f.stridePhase * 2) * 0.035 * sMove;
      lShoulderZ = -0.56;
      lElbowX = -0.56;
    } else if (f.weapon.kind === 'kodachi') {
      // Kunoichi agile shinobi sprint with swept-back arms
      if (sMove > 0.15) {
        lShoulderX = 0.68 * Math.min(1.15, sMove) - sinP * 0.18 * sMove * wFwd;
        rShoulderX = 0.68 * Math.min(1.15, sMove) + sinP * 0.18 * sMove * wFwd;
        lShoulderZ = 0.34;
        rShoulderZ = -0.34;
        lElbowX = -0.34;
        rElbowX = -0.34;
      } else {
        lShoulderX = -0.78;
        lShoulderZ = 0.24;
        lElbowX = -1.12;
        rShoulderX = 0.22;
        rShoulderZ = -0.26;
        rElbowX = -0.92;
      }
    } else if (f.weapon.kind === 'hammer') {
      // Regal Xenon sovereign stance: tall wide stance, proud lifted chest, commanding gaze,
      // left fist poised heroically outward, and upright hammer planted vertically on floor (y = 0)
      if (sMove < 0.15) {
        torsoYaw = -0.32;
        torsoPitch = -0.06;
        torsoRoll = -0.02;
        headYaw = 0.28;
        lHipX = -0.15;
        lHipZ = -0.22;
        lKneeX = 0.16;
        rHipX = 0.12;
        rHipZ = 0.22;
        rKneeX = 0.14;
        rShoulderX = 0.04 + breath * 0.18;
        rShoulderY = 0.08;
        rShoulderZ = 0.42;
        rElbowX = -0.38;
        wPitch = -1.0163;
        wYaw = 0.8201;
        wRoll = -0.795;
        lShoulderX = -0.06 + breath * 0.3;
        lShoulderY = -0.14;
        lShoulderZ = -0.34;
        lElbowX = -0.82;
      } else {
        torsoYaw = -0.2 + cosP * 0.08 * sMove * wFwd + wStrafe * latTorsoYaw;
        headYaw = 0.18 - cosP * 0.06 * sMove * wFwd + wStrafe * latHeadYaw;
        rShoulderX = -0.26 + sinP * 0.14 * sMove * wFwd;
        rShoulderY = 0.1;
        rShoulderZ = 0.34;
        rElbowX = -1.32;
        lShoulderX = -0.24 - sinP * 0.48 * sMove * wFwd;
        lShoulderZ = -0.24;
        lElbowX = -0.82;
      }
    } else if (f.weapon.kind === 'lance') {
      // Achilles hoplite shield + spear counter-poise
      lShoulderX = -0.54 - sinP * 0.2 * sMove * wFwd;
      lShoulderY = -0.58;
      lElbowX = -0.68;
      rShoulderX = 0.2 + sinP * 0.2 * sMove * wFwd;
      rShoulderZ = -0.14;
      rElbowX = -0.9;
    }

    if (f.isDashing || f.isGuarding || f.stunTimer > 0 || !f.isGrounded || f.attackPhase !== 'none') {
      wPitch = 0;
      wYaw = 0;
      wRoll = 0;
    }

    if (f.isDashing) {
      const snap = Math.min(1, dashProgress * 3.0);
      const snapEase = 1 - Math.pow(1 - snap, 4);
      const brake = dashProgress > 0.7 ? (dashProgress - 0.7) / 0.3 : 0;
      const strength = snapEase * (1 - brake * 0.45);
      const isLateral = Math.abs(dashRight) > Math.abs(dashForward) * 0.9 && Math.abs(dashRight) > 0.35;

      if (isLateral) {
        const side = dashRight >= 0 ? 1 : -1;
        bodyPitch = (0.16 + brake * 0.08) * strength;
        bodyRoll = side * 0.38 * strength;
        bodyBob = (0.06 - brake * 0.08) * strength;
        torsoYaw = (f.weapon.isRanged ? -0.42 : 0) + side * 0.28 * strength;
        headYaw = (f.weapon.isRanged ? 0.38 : 0) - side * 0.2 * strength;
        if (side > 0) {
          // Dashing RIGHT: right knee tucked, left leg extended push-off
          rHipX = -0.64 * strength;
          rKneeX = 1.08 * strength;
          lHipX = 0.34 * strength;
          lKneeX = 0.24 * strength;
          lHipZ = 0.2 * strength;
          rHipZ = -0.08;
        } else {
          // Dashing LEFT: left knee tucked, right leg extended push-off
          lHipX = -0.64 * strength;
          lKneeX = 1.08 * strength;
          rHipX = 0.34 * strength;
          rKneeX = 0.24 * strength;
          rHipZ = -0.2 * strength;
          lHipZ = 0.08;
        }
        if (f.weapon.isRanged) {
          rShoulderX = side > 0 ? -1.04 : -0.96;
          lShoulderX = side > 0 ? -1.08 : -1.16;
        } else if (f.weapon.kind === 'kodachi') {
          bodyRoll = side * 0.44 * strength;
          if (side > 0) {
            rShoulderX = -0.94;
            rShoulderZ = 0.38;
            rElbowX = -1.06;
            lShoulderX = 0.72 * strength;
            lShoulderZ = 0.48;
          } else {
            lShoulderX = -0.94;
            lShoulderZ = -0.38;
            lElbowX = -1.06;
            rShoulderX = 0.72 * strength;
            rShoulderZ = -0.48;
          }
        } else if (f.weapon.kind === 'hammer') {
          if (side > 0) {
            rShoulderX = -0.38;
            rShoulderZ = -0.58 * strength;
            lShoulderX = -0.98;
            lShoulderZ = -0.18;
          } else {
            rShoulderX = -0.78;
            rShoulderZ = 0.22 * strength;
            lShoulderX = -0.42;
            lShoulderZ = 0.56 * strength;
          }
        } else if (f.weapon.kind === 'lance') {
          if (side > 0) {
            lShoulderX = -0.92;
            lShoulderY = -1.08;
            rShoulderX = 0.66 * strength;
            rShoulderZ = -0.28;
          } else {
            lShoulderX = -1.04;
            lShoulderY = -1.24;
            lShoulderZ = 0.18;
            rShoulderX = 0.38;
          }
        } else {
          if (side > 0) {
            rShoulderX = 0.68 * strength;
            rShoulderZ = -0.36;
            lShoulderX = -0.82;
            lShoulderZ = 0.24;
          } else {
            lShoulderX = 0.68 * strength;
            lShoulderZ = 0.36;
            rShoulderX = -0.82;
            rShoulderZ = -0.24;
          }
        }
      } else if (dashForward < -0.3) {
        bodyPitch = -0.26 * strength;
        bodyRoll = dashRight * 0.18 * strength;
        bodyBob = 0.07 * strength;
        lHipX = -0.46 * strength;
        lKneeX = 0.58 * strength;
        rHipX = 0.24 * strength;
        rKneeX = 0.82 * strength;
        if (!f.weapon.isRanged) {
          lShoulderX = -0.72 * strength;
          rShoulderX = -0.62 * strength;
          lShoulderZ = 0.32;
          rShoulderZ = -0.32;
        }
      } else {
        bodyPitch = 0.48 * strength;
        bodyRoll = dashRight * 0.18 * strength;
        bodyBob = 0.11 * strength;
        lHipX = 0.6 * strength;
        lKneeX = 0.42 * strength;
        rHipX = 0.2 * strength;
        rKneeX = 0.94 * strength;
        if (!f.weapon.isRanged) {
          lShoulderX = 0.72 * strength;
          rShoulderX = 0.72 * strength;
          lShoulderZ = 0.28;
          rShoulderZ = -0.28;
        }
      }
    } else if (f.isGuarding) {
      bodyPitch = 0.04;
      bodyRoll = 0;
      bodyBob = -0.05;
      lHipX = -0.24;
      rHipX = 0.24;
      lKneeX = 0.34;
      rKneeX = 0.34;
      if (f.weapon.kind === 'lance') {
        torsoYaw = 0.35;
        headYaw = -0.32;
        lShoulderX = -1.18;
        lShoulderY = -0.85;
        lShoulderZ = 0.2;
        lElbowX = -0.82;
        rShoulderX = -0.35;
        rShoulderZ = 0.15;
        rElbowX = -0.95;
      } else if (f.weapon.kind === 'hammer') {
        // One-handed hammer block diagonally across chest/visor with right arm alone
        torsoYaw = -0.28;
        headYaw = 0.24;
        rShoulderX = -0.96;
        rShoulderY = -0.52;
        rShoulderZ = -0.24;
        rElbowX = -0.96;
        lShoulderX = 0.16;
        lShoulderY = 0.08;
        lShoulderZ = -0.32;
        lElbowX = -0.82;
      } else {
        lShoulderX = -1.05;
        lShoulderZ = -0.35;
        lElbowX = -0.85;
        rShoulderX = -0.85;
        rShoulderZ = 0.25;
        rElbowX = -0.95;
      }
    } else if (f.stunTimer > 0) {
      bodyPitch = -0.28;
      bodyRoll = 0;
      torsoPitch = -0.22;
      lShoulderX = -0.4;
      rShoulderX = -0.4;
      lShoulderZ = 0.55;
      rShoulderZ = -0.55;
    } else if (!f.isGrounded && f.attackPhase === 'none') {
      // Multi-phase airborne jump: launch extension -> mid-ascent knee drive -> apex hang -> landing brace
      const rise = THREE.MathUtils.clamp(f.velY / 7.5, -1, 1);
      const launchLift = Math.max(0, rise);
      const fallBrace = Math.max(0, -rise);
      const hoverBreath = Math.sin(t * 5.2 + (f.isPlayer ? 0 : 1.1)) * 0.024;
      bodyRoll = strafeRatio * 0.16;
      bodyBob = 0.03 + hoverBreath * 0.6;
      lHipZ = 0.08 + Math.max(0, -strafeRatio) * 0.08;
      rHipZ = -0.08 - Math.max(0, strafeRatio) * 0.08;
      if (rise > 0.56) {
        const launch = THREE.MathUtils.clamp((rise - 0.56) / 0.44, 0, 1);
        bodyPitch = THREE.MathUtils.lerp(-0.15, -0.22, launch);
        lHipX = THREE.MathUtils.lerp(-0.96, -1.04, launch);
        lKneeX = THREE.MathUtils.lerp(1.36, 1.44, launch);
        rHipX = THREE.MathUtils.lerp(0.42, 0.58, launch);
        rKneeX = THREE.MathUtils.lerp(0.32, 0.18, launch);
      } else if (rise > 0.18) {
        const a = THREE.MathUtils.clamp((rise - 0.18) / 0.38, 0, 1);
        bodyPitch = THREE.MathUtils.lerp(0.02, -0.15, a);
        lHipX = THREE.MathUtils.lerp(-0.7, -0.96, a);
        lKneeX = THREE.MathUtils.lerp(1.08, 1.36, a);
        rHipX = THREE.MathUtils.lerp(0.28, 0.42, a);
        rKneeX = THREE.MathUtils.lerp(0.64, 0.32, a);
      } else if (rise < -0.2) {
        const d = THREE.MathUtils.clamp((-rise - 0.2) / 0.8, 0, 1);
        bodyPitch = THREE.MathUtils.lerp(0.02, 0.19, d);
        lHipX = THREE.MathUtils.lerp(-0.7, -0.32, d);
        lKneeX = THREE.MathUtils.lerp(1.08, 0.52, d);
        rHipX = THREE.MathUtils.lerp(0.28, 0.14, d);
        rKneeX = THREE.MathUtils.lerp(0.64, 0.44, d);
      } else {
        bodyPitch = 0.02 + hoverBreath;
        lHipX = -0.7 + hoverBreath * 0.4;
        lKneeX = 1.08;
        rHipX = 0.28 - hoverBreath * 0.4;
        rKneeX = 0.64;
      }
      if (!f.weapon.isRanged) {
        if (f.weapon.kind === 'kodachi') {
          lShoulderX = 0.42 - launchLift * 0.52 + fallBrace * 0.25;
          lShoulderZ = 0.46 + fallBrace * 0.18;
          lElbowX = -0.68;
          rShoulderX = -0.76 - launchLift * 0.28 + fallBrace * 0.2;
          rShoulderZ = -0.32 - fallBrace * 0.16;
          rElbowX = -1.02;
        } else {
          lShoulderX = -0.66 - launchLift * 0.28 + fallBrace * 0.22;
          lShoulderZ = 0.28 + fallBrace * 0.18;
          lElbowX = -0.58;
          rShoulderX = -0.48 - launchLift * 0.26 + fallBrace * 0.18;
          rShoulderZ = -0.26 - fallBrace * 0.16;
          rElbowX = -0.66;
        }
      }
    } else if (f.attackPhase !== 'none') {
      const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
      bodyRoll = 0;
      if (f.weapon.isRanged) {
        // Horizontal shoulder-level sniper aim & crisp recoil kick (grounded or mid-air)
        const brace = p < 0.18 ? p / 0.18 : Math.max(0, 1 - (p - 0.18) / 0.22);
        const kick =
          p >= 0.18 && p <= 0.5
            ? Math.sin(((p - 0.18) / 0.32) * Math.PI) * (f.isSpecialAttack ? 0.36 : 0.24)
            : 0;
        if (!f.isGrounded) {
          bodyPitch = -0.06 - kick * 0.18;
          bodyBob = 0.03;
          lHipX = -0.68 + kick * 0.22;
          lKneeX = 1.04 - kick * 0.18;
          rHipX = 0.36 + kick * 0.14;
          rKneeX = 0.48;
        } else {
          bodyPitch = 0.04 * brace - kick * 0.12;
          bodyBob = -0.04 * brace - kick * 0.03;
          lKneeX = 0.34 + brace * 0.08 + kick * 0.06;
          rKneeX = 0.26 + kick * 0.14;
        }
        torsoYaw = -0.48 - kick * 0.12;
        torsoPitch = 0.06 - kick * 0.32;
        headYaw = 0.44 + kick * 0.06;
        rShoulderX = -1.2 - kick;
        rShoulderZ = -0.12;
        rElbowX = -0.3 - kick * 0.12;
        lShoulderX = -1.1 - kick * 0.92;
        lShoulderZ = -0.54;
        lElbowX = -0.52;
      } else if (!f.isGrounded || f.airAttacking) {
        // Aerial diving melee strike!
        const w = Math.min(1, p / 0.28);
        const a = THREE.MathUtils.clamp((p - 0.28) / 0.32, 0, 1);
        const isW = p < 0.28;
        bodyPitch = isW ? -0.16 * w : THREE.MathUtils.lerp(-0.16, 0.44, a);
        torsoPitch = isW ? -0.26 * w : THREE.MathUtils.lerp(-0.26, 0.28, a);
        torsoYaw = isW ? -0.35 * w : THREE.MathUtils.lerp(-0.35, 0.32, a);
        headYaw = -torsoYaw * 0.5;
        lHipX = isW ? -0.82 : -0.44;
        lKneeX = isW ? 1.22 : 0.46;
        rHipX = isW ? -0.22 : 0.56;
        rKneeX = isW ? 0.72 : 0.58;
        rShoulderX = isW ? -2.32 * w : THREE.MathUtils.lerp(-2.32, -0.78, a);
        rElbowX = isW ? -0.55 * w : -0.08;
        lShoulderX = -0.75;
        lShoulderY = f.weapon.kind === 'lance' ? -0.65 : 0;
        lElbowX = -0.52;
      } else if (f.weapon.kind === 'lance') {
        const w = Math.min(1, p / 0.26);
        const a = THREE.MathUtils.clamp((p - 0.26) / 0.26, 0, 1);
        const aEase = 1 - Math.pow(1 - a, 3);
        const isW = p < 0.26;
        if (f.activeSkill === 'lunge_r') {
          const thr = THREE.MathUtils.smoothstep(p, 0.18, 0.32) * (1 - THREE.MathUtils.smoothstep(p, 0.62, 1.0));
          bodyPitch = 0.28 * thr;
          torsoPitch = 0.16 * thr;
          torsoYaw = -0.32 * thr;
          headYaw = 0.28 * thr;
          bodyBob = -0.1 * thr;
          lHipX = -0.58 * thr;
          lKneeX = 0.88 * thr;
          rHipX = 0.46 * thr;
          rShoulderX = -1.56 * thr;
          rElbowX = -0.06;
          lShoulderX = -0.96 * thr;
          lShoulderY = -0.78 * thr;
        } else if (f.activeSkill === 'cyclone_f') {
          if (p < 0.24) {
            const c = THREE.MathUtils.smoothstep(p, 0, 0.24);
            bodyBob = -0.14 * c;
            bodyPitch = 0.22 * c;
            torsoYaw = -0.5 * c;
            rShoulderX = -1.45 * c;
            lShoulderX = -1.1 * c;
          } else if (p < 0.72) {
            const sp = THREE.MathUtils.clamp((p - 0.24) / 0.42, 0, 1);
            bodyYaw = sp * Math.PI * 10;
            bodyPitch = 0.24;
            bodyBob = 0.04;
            torsoYaw = -0.3;
            rShoulderX = -1.56;
            rElbowX = -0.06;
            lShoulderX = -1.0;
            lShoulderY = -0.82;
          } else {
            const rec = THREE.MathUtils.smoothstep(p, 0.72, 1.0);
            bodyPitch = THREE.MathUtils.lerp(0.24, 0.04, rec);
            bodyBob = THREE.MathUtils.lerp(0.04, 0, rec);
            rShoulderX = THREE.MathUtils.lerp(-1.56, 0.2, rec);
          }
        } else if (f.isSpecialAttack) {
          if (p >= 0.66) {
            const aimIn = THREE.MathUtils.smoothstep(p, 0.66, 0.74);
            const recoil =
              p >= 0.77 && p <= 0.9
                ? Math.sin(((p - 0.77) / 0.13) * Math.PI)
                : 0;
            const rec = THREE.MathUtils.smoothstep(p, 0.89, 1.0);
            const k = aimIn * (1 - rec);
            torsoYaw = 0.34 * k;
            bodyPitch = (0.08 - recoil * 0.1) * k;
            torsoPitch = (0.06 - recoil * 0.08) * k;
            bodyBob = -0.06 * k;
            lHipX = -0.44 * k;
            lKneeX = 0.62 * k;
            rHipX = 0.38 * k;
            rShoulderX = THREE.MathUtils.lerp(-0.42, -1.58 - recoil * 0.16, k);
            rElbowX = THREE.MathUtils.lerp(-0.55, -0.06, k);
            lShoulderX = THREE.MathUtils.lerp(-0.78, -0.72, k);
            lShoulderY = -0.75 * k;
          } else {
            const w = THREE.MathUtils.smoothstep(p, 0, 0.66);
            torsoPitch = -0.26 * w;
            bodyPitch = -0.14 * w;
            bodyBob = 0.09 * w;
            lHipX = -0.24 * w;
            lKneeX = 0.42 * w;
            rHipX = 0.18 * w;
            rShoulderX = -2.42 * w;
            rElbowX = -0.68 * w;
            lShoulderX = -0.98 * w;
            lShoulderY = -0.65;
          }
        } else if (f.comboStep === 3) {
          torsoPitch = isW ? -0.24 * w : THREE.MathUtils.lerp(-0.24, 0.32, aEase);
          bodyPitch = isW ? -0.14 * w : THREE.MathUtils.lerp(-0.14, 0.34, aEase);
          bodyBob = isW ? 0.09 * w : -0.13 * aEase;
          lHipX = isW ? -0.24 * w : -0.64 * aEase;
          lKneeX = isW ? 0.42 * w : 0.9 * aEase;
          rHipX = isW ? 0.18 * w : 0.54 * aEase;
          rShoulderX = isW ? -2.38 * w : THREE.MathUtils.lerp(-2.38, -0.84, aEase);
          rElbowX = isW ? -0.75 * w : -0.06;
          lShoulderX = isW ? -0.96 * w : -0.24;
          lShoulderY = -0.65;
        } else if (f.comboStep === 2) {
          torsoYaw = isW ? -0.72 * w : THREE.MathUtils.lerp(-0.72, 0.66, aEase);
          bodyRoll = isW ? -0.08 * w : 0.08 * aEase;
          bodyBob = isW ? -0.08 * w : -0.06 * aEase;
          headYaw = -torsoYaw * 0.55;
          lHipX = isW ? -0.28 : -0.56 * aEase;
          lKneeX = isW ? 0.46 : 0.76 * aEase;
          rHipX = isW ? 0.28 : 0.48 * aEase;
          rShoulderX = isW ? 0.38 * w : THREE.MathUtils.lerp(0.38, -1.48, aEase);
          rShoulderZ = isW ? -0.48 * w : THREE.MathUtils.lerp(-0.48, 0.44, aEase);
          rElbowX = isW ? -1.12 * w : -0.08;
          lShoulderX = isW ? -0.92 * w : -0.22;
          lShoulderY = -0.55;
        } else {
          torsoYaw = isW ? -0.66 * w : THREE.MathUtils.lerp(-0.66, 0.52, aEase);
          bodyRoll = isW ? -0.07 * w : 0.06 * aEase;
          headYaw = -torsoYaw * 0.65;
          bodyPitch = isW ? -0.06 * w : 0.26 * aEase;
          bodyBob = isW ? -0.07 * w : -0.1 * aEase;
          lHipX = isW ? -0.2 : -0.62 * aEase;
          lKneeX = isW ? 0.34 : 0.86 * aEase;
          rHipX = isW ? 0.26 : 0.52 * aEase;
          rShoulderX = isW ? 0.58 * w : THREE.MathUtils.lerp(0.58, -1.52, aEase);
          rElbowX = isW ? -1.28 * w : -0.06;
          lShoulderX = isW ? -0.95 * w : -0.2;
          lShoulderY = isW ? -0.78 * w : -0.25;
        }
      } else if (f.weapon.kind === 'hammer') {
        const hammerVariant = f.isSpecialAttack
          ? 3
          : f.comboStep === 3
            ? 3
            : f.attackSwingFlip === 1
              ? 1
              : 2;
        if (f.isSpecialAttack) {
          // Xenon "Удар Ксенона": two-handed soaring leap & earth-shatter slam
          if (p < 0.18) {
            const c = THREE.MathUtils.smoothstep(p, 0, 0.18);
            bodyPitch = 0.2 * c;
            torsoPitch = 0.22 * c;
            bodyBob = -0.15 * c;
            lHipX = -0.5 * c;
            lKneeX = 0.9 * c;
            rHipX = 0.4 * c;
            rShoulderX = 0.56 * c;
            lShoulderX = -0.78 * c;
          } else if (p < 0.47) {
            const u = 1 - Math.pow(1 - (p - 0.18) / 0.29, 3);
            bodyPitch = THREE.MathUtils.lerp(0.2, -0.2, u);
            torsoPitch = THREE.MathUtils.lerp(0.22, -0.32, u);
            bodyBob = THREE.MathUtils.lerp(-0.15, 0.2, u);
            lHipX = THREE.MathUtils.lerp(-0.5, -0.78, u);
            lKneeX = THREE.MathUtils.lerp(0.9, 1.15, u);
            rHipX = THREE.MathUtils.lerp(0.4, -0.26, u);
            rShoulderX = THREE.MathUtils.lerp(0.56, -2.56, u);
            rShoulderY = -0.24 * u;
            rShoulderZ = -0.08 * u;
            lShoulderX = THREE.MathUtils.lerp(-0.78, -2.48, u);
            lShoulderY = 0.42 * u;
            lShoulderZ = 0.26 * u;
            rElbowX = -0.26;
            lElbowX = -0.34;
          } else if (p < 0.6) {
            const s = 1 - Math.pow(1 - (p - 0.47) / 0.13, 4);
            bodyPitch = THREE.MathUtils.lerp(-0.2, 0.3, s);
            torsoPitch = THREE.MathUtils.lerp(-0.32, 0.34, s);
            bodyBob = THREE.MathUtils.lerp(0.2, -0.17, s);
            lHipX = THREE.MathUtils.lerp(-0.78, -0.68, s);
            lKneeX = THREE.MathUtils.lerp(1.15, 0.98, s);
            rHipX = THREE.MathUtils.lerp(-0.26, 0.52, s);
            rShoulderX = THREE.MathUtils.lerp(-2.56, -1.04, s);
            rShoulderY = -0.24;
            rShoulderZ = -0.08;
            lShoulderX = THREE.MathUtils.lerp(-2.48, -1.02, s);
            lShoulderY = 0.42;
            lShoulderZ = 0.26;
            rElbowX = -0.12;
            lElbowX = -0.22;
          } else {
            const rec = THREE.MathUtils.smoothstep(p, 0.72, 1.0);
            bodyPitch = THREE.MathUtils.lerp(0.3, 0.04, rec);
            torsoPitch = THREE.MathUtils.lerp(0.34, 0.04, rec);
            bodyBob = THREE.MathUtils.lerp(-0.17, 0, rec);
            lHipX = THREE.MathUtils.lerp(-0.68, -0.14, rec);
            lKneeX = THREE.MathUtils.lerp(0.98, 0.18, rec);
            rHipX = THREE.MathUtils.lerp(0.52, 0.14, rec);
            rShoulderX = THREE.MathUtils.lerp(-1.04, 0.04, rec);
            rShoulderY = THREE.MathUtils.lerp(-0.24, 0.08, rec);
            rShoulderZ = THREE.MathUtils.lerp(-0.08, 0.42, rec);
            rElbowX = THREE.MathUtils.lerp(-0.12, -0.38, rec);
            lShoulderX = THREE.MathUtils.lerp(-1.02, -0.06, rec);
            lShoulderY = THREE.MathUtils.lerp(0.42, -0.14, rec);
            lShoulderZ = THREE.MathUtils.lerp(0.26, -0.34, rec);
            lElbowX = THREE.MathUtils.lerp(-0.22, -0.82, rec);
          }
        } else if (hammerVariant === 3) {
          // Two-Handed Overhead Titan Crush
          if (p < 0.28) {
            const w = THREE.MathUtils.smoothstep(p, 0, 0.28);
            bodyPitch = -0.14 * w;
            torsoPitch = -0.26 * w;
            bodyBob = 0.06 * w;
            lHipX = -0.26 * w;
            lKneeX = 0.46 * w;
            rHipX = 0.2 * w;
            rShoulderX = -2.44 * w;
            rShoulderY = -0.24 * w;
            rShoulderZ = -0.08 * w;
            lShoulderX = -2.32 * w;
            lShoulderY = 0.42 * w;
            lShoulderZ = 0.26 * w;
            rElbowX = -0.34;
            lElbowX = -0.42;
          } else if (p < 0.56) {
            const a = 1 - Math.pow(1 - (p - 0.28) / 0.28, 4);
            bodyPitch = THREE.MathUtils.lerp(-0.14, 0.26, a);
            torsoPitch = THREE.MathUtils.lerp(-0.26, 0.28, a);
            bodyBob = THREE.MathUtils.lerp(0.06, -0.14, a);
            lHipX = THREE.MathUtils.lerp(-0.26, -0.64, a);
            lKneeX = THREE.MathUtils.lerp(0.46, 0.92, a);
            rHipX = THREE.MathUtils.lerp(0.2, 0.5, a);
            rShoulderX = THREE.MathUtils.lerp(-2.44, -1.04, a);
            rShoulderY = -0.24;
            rShoulderZ = -0.08;
            lShoulderX = THREE.MathUtils.lerp(-2.32, -1.02, a);
            lShoulderY = 0.42;
            lShoulderZ = 0.26;
            rElbowX = -0.14;
            lElbowX = -0.22;
          } else {
            const r = THREE.MathUtils.smoothstep(p, 0.68, 1.0);
            bodyPitch = THREE.MathUtils.lerp(0.26, 0.04, r);
            torsoPitch = THREE.MathUtils.lerp(0.28, 0.04, r);
            bodyBob = THREE.MathUtils.lerp(-0.14, 0, r);
            lHipX = THREE.MathUtils.lerp(-0.64, -0.14, r);
            lKneeX = THREE.MathUtils.lerp(0.92, 0.2, r);
            rHipX = THREE.MathUtils.lerp(0.5, 0.14, r);
            rShoulderX = THREE.MathUtils.lerp(-1.04, 0.04, r);
            rShoulderY = THREE.MathUtils.lerp(-0.24, 0.08, r);
            rShoulderZ = THREE.MathUtils.lerp(-0.08, 0.42, r);
            rElbowX = THREE.MathUtils.lerp(-0.14, -0.38, r);
            lShoulderX = THREE.MathUtils.lerp(-1.02, -0.06, r);
            lShoulderY = THREE.MathUtils.lerp(0.42, -0.14, r);
            lShoulderZ = THREE.MathUtils.lerp(0.26, -0.34, r);
            lElbowX = THREE.MathUtils.lerp(-0.22, -0.82, r);
          }
        } else if (hammerVariant === 2) {
          // Two-Handed Cross-Body Horizontal Cleave
          const armLagP = THREE.MathUtils.clamp((p - 0.04) / 0.96, 0, 1);
          const sweep =
            armLagP < 0.26
              ? 1.15 * THREE.MathUtils.smoothstep(armLagP, 0, 0.26)
              : armLagP < 0.56
                ? THREE.MathUtils.lerp(1.15, -1.25, 1 - Math.pow(1 - (armLagP - 0.26) / 0.3, 4))
                : THREE.MathUtils.lerp(-1.25, 0, THREE.MathUtils.smoothstep(armLagP, 0.7, 1.0));
          bodyRoll = sweep * 0.08;
          bodyBob = p < 0.25 ? -0.08 : -0.05;
          lHipX = p < 0.25 ? -0.34 : -0.54;
          lKneeX = p < 0.25 ? 0.6 : 0.78;
          rHipX = p < 0.25 ? 0.3 : 0.44;
          torsoYaw = sweep * 0.66;
          headYaw = -torsoYaw * 0.68;
          torsoPitch = p < 0.25 ? 0.1 : 0.02;
          rShoulderX = -1.16;
          rShoulderY = -0.2 + sweep * 0.24;
          rShoulderZ = -0.15 + sweep * 0.48;
          rElbowX = p < 0.25 ? -0.52 : -0.18;
          lShoulderX = -1.12;
          lShoulderY = 0.45 + sweep * 0.22;
          lShoulderZ = 0.15 + sweep * 0.34;
          lElbowX = p < 0.25 ? -0.58 : -0.32;
        } else {
          // One-Handed Wide Forehand Cleave (left fist tucked for balance)
          const armLagP = THREE.MathUtils.clamp((p - 0.05) / 0.95, 0, 1);
          const armPhase =
            armLagP < 0.25
              ? -1.3 * THREE.MathUtils.smoothstep(armLagP, 0, 0.25)
              : armLagP < 0.54
                ? THREE.MathUtils.lerp(-1.3, 1.32, 1 - Math.pow(1 - (armLagP - 0.25) / 0.29, 4))
                : THREE.MathUtils.lerp(1.32, 0, THREE.MathUtils.smoothstep(armLagP, 0.68, 1.0));
          bodyRoll = armPhase * 0.09;
          bodyBob = p < 0.25 ? -0.06 : -0.1;
          lHipX = p < 0.25 ? -0.28 : -0.58;
          lKneeX = p < 0.25 ? 0.5 : 0.86;
          rHipX = p < 0.25 ? 0.28 : 0.46;
          torsoYaw = armPhase * 0.72;
          headYaw = -torsoYaw * 0.68;
          torsoPitch = p < 0.25 ? -0.08 : 0.16;
          rShoulderX = -1.2;
          rShoulderZ = 0.24 - armPhase * 0.64;
          rElbowX = p < 0.25 ? -0.58 : -0.14;
          lShoulderX = p < 0.25 ? -0.82 : 0.42;
          lShoulderZ = -0.32;
          lElbowX = -0.58;
        }
      } else if (f.isSpecialAttack && f.weapon.kind === 'kodachi') {
        if (p < 0.65) {
          const cycle = Math.sin(((p - 0.11) / 0.17) * Math.PI * 2);
          bodyBob = -0.09;
          bodyPitch = 0.24;
          bodyRoll = cycle * 0.14;
          lHipX = -0.5;
          lKneeX = 0.82;
          rHipX = 0.4;
          rKneeX = 0.62;
          torsoYaw = cycle * 0.94;
          headYaw = -torsoYaw * 0.72;
          rShoulderX = -1.32;
          rShoulderZ = -0.35 + cycle * 0.72;
          lShoulderX = -1.32;
          lShoulderZ = 0.35 - cycle * 0.72;
          rElbowX = -0.18;
        } else if (p < 0.76) {
          const c = THREE.MathUtils.smoothstep(p, 0.65, 0.76);
          bodyBob = THREE.MathUtils.lerp(-0.09, -0.16, c);
          bodyPitch = 0.28;
          torsoPitch = 0.28;
          lHipX = -0.58;
          lKneeX = 1.0;
          rShoulderX = THREE.MathUtils.lerp(-1.2, 0.84, c);
          lShoulderX = THREE.MathUtils.lerp(-1.2, 0.84, c);
        } else {
          const up = THREE.MathUtils.clamp((p - 0.76) / 0.14, 0, 1);
          const upEase = 1 - Math.pow(1 - up, 4);
          bodyBob = THREE.MathUtils.lerp(-0.16, 0.22, upEase);
          bodyPitch = THREE.MathUtils.lerp(0.28, -0.28, upEase);
          torsoPitch = THREE.MathUtils.lerp(0.28, -0.36, upEase);
          lHipX = THREE.MathUtils.lerp(-0.58, -0.84, upEase);
          lKneeX = THREE.MathUtils.lerp(1.0, 1.22, upEase);
          rShoulderX = THREE.MathUtils.lerp(0.84, -2.66, upEase);
          lShoulderX = THREE.MathUtils.lerp(0.84, -2.62, upEase);
          rElbowX = -0.1;
        }
      } else {
        const dir = f.comboStep === 2 ? -1 : 1;
        const a = THREE.MathUtils.clamp((p - 0.22) / 0.28, 0, 1);
        const aEase = 1 - Math.pow(1 - a, 4);
        const sweep =
          p < 0.22
            ? -1.42 * dir * THREE.MathUtils.smoothstep(p, 0, 0.22)
            : p < 0.72
              ? THREE.MathUtils.lerp(-1.42 * dir, 1.38 * dir, aEase)
              : THREE.MathUtils.lerp(1.38 * dir, 0, THREE.MathUtils.smoothstep(p, 0.72, 1.0));
        bodyRoll = sweep * 0.085;
        bodyPitch = p < 0.22 ? 0.08 : 0.25 * aEase;
        bodyBob = p < 0.22 ? -0.08 : -0.05 * aEase;
        lHipX = p < 0.22 ? -0.34 : -0.62 * aEase;
        lKneeX = p < 0.22 ? 0.56 : 0.86 * aEase;
        rHipX = p < 0.22 ? 0.28 : 0.5 * aEase;
        torsoYaw = sweep * 0.74;
        headYaw = -torsoYaw * 0.68;
        rShoulderX = -1.24;
        rShoulderZ = -0.36 + sweep * 0.54;
        rElbowX = -0.22;
        lShoulderX = f.weapon.kind === 'kodachi' ? -1.24 : -0.65;
        lShoulderZ = f.weapon.kind === 'kodachi' ? 0.36 - sweep * 0.54 : 0.35;
      }
    }

    if (f.isGrounded && f.jumpSquashTimer > 0 && f.attackPhase === 'none' && !f.isDashing) {
      const sq = Math.sin((f.jumpSquashTimer / 0.2) * Math.PI);
      bodyBob -= sq * 0.16;
      bodyPitch += sq * 0.1;
      lKneeX += sq * 0.52;
      rKneeX += sq * 0.52;
      lHipX -= sq * 0.25;
      rHipX -= sq * 0.25;
    }

    if (rig.isCustomModel) {
      if (rig.attackSlashMesh) {
        if (f.attackPhase === 'active' && !f.weapon.isRanged) {
          const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
          if (f.isSpecialAttack && f.weapon.kind === 'kodachi') {
            rig.attackSlashMesh.visible = true;
            if (p < 0.66) {
              const subP = ((p - 0.14) / 0.18) % 1;
              const altDir = Math.floor((p - 0.14) / 0.18) % 2 === 0 ? 1 : -1;
              rig.attackSlashMesh.rotation.z = altDir * 0.18;
              rig.attackSlashMesh.rotation.y = Math.PI / 2 + (-1.1 + subP * 2.2) * altDir;
              rig.attackSlashMesh.scale.setScalar(1.25 + subP * 0.35);
            } else {
              const upP = THREE.MathUtils.clamp((p - 0.72) / 0.2, 0, 1);
              rig.attackSlashMesh.rotation.z = Math.PI * 0.5;
              rig.attackSlashMesh.rotation.y = Math.PI / 2 - 0.8 + upP * 1.6;
              rig.attackSlashMesh.scale.setScalar(1.45 + upP * 0.5);
            }
            (rig.attackSlashMesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
          } else if (f.isSpecialAttack && f.weapon.kind === 'hammer') {
            const slamProg = THREE.MathUtils.clamp((p - 0.54) / 0.26, 0, 1);
            rig.attackSlashMesh.visible = true;
            rig.attackSlashMesh.rotation.z = Math.PI * 0.5;
            rig.attackSlashMesh.rotation.y = Math.PI / 2 - 0.65 + slamProg * 1.3;
            rig.attackSlashMesh.scale.setScalar(1.42 + slamProg * 0.65);
            (rig.attackSlashMesh.material as THREE.MeshBasicMaterial).opacity =
              (1 - slamProg) * 0.94;
          } else {
            const swingProg = THREE.MathUtils.clamp((p - 0.28) / 0.37, 0, 1);
            const effStep =
              f.weapon.kind === 'hammer'
                ? f.isSpecialAttack || f.comboStep === 3
                  ? 3
                  : f.attackSwingFlip === 1
                    ? 1
                    : 2
                : f.comboStep;
            rig.attackSlashMesh.visible = true;
            rig.attackSlashMesh.rotation.z = f.airAttacking
              ? 1.15
              : effStep === 2
                ? 0.28
                : effStep === 3 || f.isSpecialAttack
                  ? 1.45
                  : -0.25;
            rig.attackSlashMesh.rotation.y =
              Math.PI / 2 + (effStep === 2 ? 0.9 - swingProg * 1.8 : -0.4 + swingProg * 0.8);
            rig.attackSlashMesh.scale.setScalar((f.isSpecialAttack ? 1.25 : 0.85) + swingProg * 0.45);
            (rig.attackSlashMesh.material as THREE.MeshBasicMaterial).opacity =
              (1 - swingProg) * 0.9;
          }
        } else {
          rig.attackSlashMesh.visible = false;
        }
      }

      if (rig.specialAnimActive) {
        return;
      }

      if (!rig.mixer) {
        const holdingRifle = Boolean(
          f.weapon.isRanged &&
            (rig.hasHangarWeapon || rig.customCharacterId === 'hunter' || rig.hasBuiltInWeapon),
        );
        const holdingLance = f.weapon.kind === 'lance';
        const holdingHalberd = f.weapon.kind === 'halberd';
        const isBackward = forwardDot < -0.4;
        let customTarget: CustomBonePose = createZeroCustomPose();

        if (f.stunTimer > 0) {
          customTarget.bodyPitch = bodyPitch;
          customTarget.bodyBob = bodyBob;
          customTarget.lHipX = lHipX;
          customTarget.rHipX = rHipX;
          customTarget.lKneeX = lKneeX;
          customTarget.rKneeX = rKneeX;
          customTarget.torsoPitch = -0.25;
          customTarget.lShoulderX = -0.35;
          customTarget.rShoulderX = -0.35;
          customTarget.lShoulderZ = 0.45;
          customTarget.rShoulderZ = -0.45;
        } else if (holdingRifle) {
          if (f.isDashing) {
            customTarget = buildCustomRiflePose({
              mode: 'dash',
              elapsed: t,
              dashProgress,
              dashForward,
              dashRight,
              isPartRig: rig.isPartArticulated,
            });
          } else if (!f.isGrounded) {
            if (f.attackPhase !== 'none') {
              const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
              customTarget = buildCustomRiflePose({
                mode: 'air_fire',
                elapsed: t,
                fireProgress: p,
                shotVariant: f.isSpecialAttack ? 3 : 1,
                velY: f.velY,
                strafeRatio,
                isPartRig: rig.isPartArticulated,
                isAiming: f.isAiming,
              });
            } else {
              customTarget = buildCustomRiflePose({
                mode: 'air_aim',
                elapsed: t,
                velY: f.velY,
                strafeRatio,
                isPartRig: rig.isPartArticulated,
                isAiming: f.isAiming,
              });
            }
          } else if (f.isGuarding) {
            customTarget.bodyPitch = bodyPitch;
            customTarget.bodyBob = bodyBob;
            customTarget.lHipX = lHipX;
            customTarget.rHipX = rHipX;
            customTarget.lKneeX = lKneeX;
            customTarget.rKneeX = rKneeX;
            customTarget.torsoYaw = 0.35;
            customTarget.lShoulderX = -1.1;
            customTarget.lShoulderZ = -0.35;
            customTarget.lElbowX = -0.65;
            customTarget.rShoulderX = -0.4;
            customTarget.rElbowX = -0.5;
          } else if (f.attackPhase !== 'none') {
            const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
            customTarget = buildCustomRiflePose({
              mode: 'fire',
              elapsed: t,
              fireProgress: p,
              shotVariant: f.isSpecialAttack ? 3 : 1,
              isPartRig: rig.isPartArticulated,
              isAiming: f.isAiming,
            });
          } else if (speedRatio > 0.1) {
            customTarget = buildCustomRiflePose({
              mode: 'low_ready',
              elapsed: t,
              speedRatio,
              stridePhase: syncedPhase,
              backward: isBackward,
              strafeRatio,
              isPartRig: rig.isPartArticulated,
              isAiming: f.isAiming,
            });
          } else {
            customTarget = buildCustomRiflePose({
              mode: 'aim',
              elapsed: t,
              isPartRig: rig.isPartArticulated,
              isAiming: f.isAiming,
            });
          }
        } else if (holdingLance) {
          if (f.isDashing) {
            customTarget = buildCustomLancePose({
              mode: 'dash',
              elapsed: t,
              dashProgress,
              dashForward,
              dashRight,
            });
          } else if (f.activeSkill === 'lunge_r' && f.attackPhase !== 'none') {
            const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
            customTarget = buildCustomLancePose({
              mode: 'lunge_r',
              elapsed: t,
              strikeProgress: p,
            });
          } else if (f.activeSkill === 'cyclone_f' && f.attackPhase !== 'none') {
            const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
            customTarget = buildCustomLancePose({
              mode: 'cyclone_f',
              elapsed: t,
              strikeProgress: p,
            });
          } else if (!f.isGrounded && !f.isSpecialAttack) {
            if (f.attackPhase !== 'none') {
              const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
              customTarget = buildCustomLancePose({
                mode: 'air_strike',
                elapsed: t,
                strikeProgress: p,
                velY: f.velY,
                strafeRatio,
              });
            } else {
              customTarget = buildCustomLancePose({
                mode: 'jump',
                elapsed: t,
                velY: f.velY,
                strafeRatio,
              });
            }
          } else if (f.isGuarding) {
            customTarget = buildCustomLancePose({ mode: 'guard', elapsed: t });
          } else if (f.attackPhase !== 'none') {
            const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
            customTarget = buildCustomLancePose({
              mode: 'strike',
              elapsed: t,
              strikeProgress: p,
              strikeVariant: f.isSpecialAttack ? 3 : f.comboStep,
              isSpecial: f.isSpecialAttack,
            });
          } else if (speedRatio > 0.08) {
            customTarget = buildCustomLancePose({
              mode: 'run',
              elapsed: t,
              speedRatio,
              stridePhase: syncedPhase,
              backward: isBackward,
              strafeRatio,
            });
          } else {
            customTarget = buildCustomLancePose({ mode: 'ready', elapsed: t });
          }
        } else if (holdingHalberd) {
          if (f.isDashing) {
            customTarget = buildCustomHalberdPose({
              mode: 'dash',
              elapsed: t,
              dashProgress,
              dashForward,
              dashRight,
            });
          } else if (!f.isGrounded && !f.isSpecialAttack) {
            if (f.attackPhase !== 'none') {
              const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
              customTarget = buildCustomHalberdPose({
                mode: 'air_strike',
                elapsed: t,
                strikeProgress: p,
                velY: f.velY,
                strafeRatio,
              });
            } else {
              customTarget = buildCustomHalberdPose({
                mode: 'jump',
                elapsed: t,
                velY: f.velY,
                strafeRatio,
              });
            }
          } else if (f.isGuarding) {
            customTarget = buildCustomHalberdPose({ mode: 'guard', elapsed: t });
          } else if (f.attackPhase !== 'none') {
            const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
            customTarget = buildCustomHalberdPose({
              mode: 'strike',
              elapsed: t,
              strikeProgress: p,
              strikeVariant: f.isSpecialAttack ? 3 : f.comboStep,
              isSpecial: f.isSpecialAttack,
            });
          } else if (speedRatio > 0.08) {
            customTarget = buildCustomHalberdPose({
              mode: 'run',
              elapsed: t,
              speedRatio,
              stridePhase: syncedPhase,
              backward: isBackward,
              strafeRatio,
            });
          } else {
            customTarget = buildCustomHalberdPose({ mode: 'ready', elapsed: t });
          }
        } else {
          const isHeavy = f.weapon.kind === 'hammer';
          const isTwinBlade = f.weapon.kind === 'kodachi';
          if (f.isDashing) {
            customTarget = buildCustomMeleePose({
              mode: 'dash',
              elapsed: t,
              dashProgress,
              dashForward,
              dashRight,
              isHeavy,
              isTwinBlade,
            });
          } else if (!f.isGrounded && !(f.isSpecialAttack && (isTwinBlade || isHeavy))) {
            const p =
              f.attackPhase !== 'none'
                ? 1 - Math.max(0, f.attackTimer / f.attackDuration)
                : 0;
            customTarget = buildCustomJumpPose({
              mode: f.attackPhase !== 'none' ? 'air_strike' : 'jump',
              velY: f.velY,
              strikeProgress: p,
              isHeavy,
              isTwinBlade,
              elapsed: t,
              strafeRatio,
            });
          } else if (f.isGuarding) {
            customTarget = buildCustomMeleePose({
              mode: 'guard',
              elapsed: t,
              isHeavy,
              isTwinBlade,
            });
          } else if (f.attackPhase !== 'none') {
            const p = 1 - Math.max(0, f.attackTimer / f.attackDuration);
            const strikeVariant = isHeavy
              ? f.isSpecialAttack || f.comboStep === 3
                ? 3
                : f.attackSwingFlip === 1
                  ? 1
                  : 2
              : f.isSpecialAttack
                ? 3
                : f.comboStep;
            customTarget = buildCustomMeleePose({
              mode: 'strike',
              elapsed: t,
              strikeProgress: p,
              strikeVariant,
              isHeavy,
              isTwinBlade,
              isWindSpecial: f.isSpecialAttack && isTwinBlade,
              isHammerSpecial: f.isSpecialAttack && isHeavy,
            });
          } else if (speedRatio > 0.08) {
            customTarget = buildCustomMeleePose({
              mode: 'run',
              elapsed: t,
              speedRatio,
              stridePhase: syncedPhase,
              backward: isBackward,
              strafeRatio,
              isHeavy,
              isTwinBlade,
            });
          } else {
            customTarget = buildCustomMeleePose({
              mode: 'ready',
              elapsed: t,
              isHeavy,
              isTwinBlade,
            });
          }
        }

        if (f.isGrounded && f.jumpSquashTimer > 0 && f.attackPhase === 'none' && !f.isDashing) {
          const sq = Math.sin((f.jumpSquashTimer / 0.2) * Math.PI);
          if (ikResult && allowIk) {
            // Foot IK bends knees automatically via landingSquash; absorb momentum cleanly in torso
            customTarget.torsoPitch += sq * 0.08;
          } else {
            customTarget.bodyBob -= sq * 0.14;
            customTarget.bodyPitch += sq * 0.08;
            customTarget.lKneeX += sq * 0.48;
            customTarget.rKneeX += sq * 0.48;
            customTarget.lHipX -= sq * 0.22;
            customTarget.rHipX -= sq * 0.22;
          }
        }

        let ikOverride: CustomIkOverride | undefined;
        if (ikResult && ikResult.ikWeight > 0.01) {
          if (allowIk) {
            // Keep pelvis upright over planted feet while upper torso & shoulders counter-stabilize toward camera/target
            const extraPelvisYaw = ikResult.pelvisYaw - customTarget.bodyYaw;
            customTarget.bodyPitch = 0;
            customTarget.bodyRoll = 0;
            customTarget.torsoYaw -= extraPelvisYaw * 0.92;
            customTarget.headYaw -= extraPelvisYaw * 0.08;
            if (speed > 0.24) {
              customTarget.torsoPitch = THREE.MathUtils.lerp(
                customTarget.torsoPitch,
                customTarget.torsoPitch * 0.45 + ikResult.torsoPitch,
                0.75,
              );
              customTarget.torsoRoll = THREE.MathUtils.lerp(
                customTarget.torsoRoll,
                ikResult.torsoRoll,
                0.72,
              );
            }
          }
          ikOverride = {
            weight: ikResult.ikWeight,
            pelvisShiftX: ikResult.pelvisShiftX,
            cogBobY: ikResult.cogBobY,
            pelvisYaw: ikResult.pelvisYaw,
            left: ikResult.left,
            right: ikResult.right,
          };
        }

        const freeAimActive =
          f.isPlayer && !this.lockOnActive && f.stunTimer <= 0 && !f.isDashing;
        if (freeAimActive) {
          const meleeStrikeScale =
            !f.weapon.isRanged && f.attackPhase !== 'none'
              ? f.isGrounded
                ? 0.18
                : 0.42
              : 1;
          customTarget.torsoYaw += f.aimTorsoYaw * 0.82 * meleeStrikeScale;
          customTarget.torsoPitch += f.aimTorsoPitch * 0.78 * meleeStrikeScale;
          customTarget.headYaw += f.aimTorsoYaw * 0.28 * meleeStrikeScale;
          customTarget.headPitch += f.aimTorsoPitch * 0.48 * meleeStrikeScale;
          if (holdingRifle) {
            customTarget.rShoulderX += f.aimTorsoPitch * 0.45;
            customTarget.lShoulderX += f.aimTorsoPitch * 0.45;
          }
        }

        applyCustomBonePose(
          rig,
          customTarget,
          dt,
          f.activeSkill === 'cyclone_f'
            ? 36
            : f.attackPhase !== 'none' || f.isGuarding || f.isDashing
              ? 22
              : 16,
          freeAimActive && f.attackPhase === 'none',
          ikOverride,
        );
      }
      return;
    }

    if (ikResult && allowIk) {
      // Modular rig upper-body decoupling: keep pelvis upright, absorb lean & counter-twist in chest/head
      const baseTorsoYaw =
        f.weapon.isRanged
          ? -0.45 + sinP * 0.045 * sMove
          : f.weapon.kind === 'hammer' && sMove < 0.15
            ? -0.32
            : f.weapon.kind === 'hammer'
              ? -0.2 + cosP * 0.08 * sMove
              : 0;
      const baseHeadYaw =
        f.weapon.isRanged
          ? 0.42 - sinP * 0.035 * sMove
          : f.weapon.kind === 'hammer' && sMove < 0.15
            ? 0.28
            : f.weapon.kind === 'hammer'
              ? 0.18 - cosP * 0.06 * sMove
              : 0;
      torsoYaw = baseTorsoYaw + ikResult.torsoCounterYaw;
      headYaw = baseHeadYaw + ikResult.headCounterYaw;
      torsoPitch += ikResult.torsoPitch * 0.9;
      torsoRoll += ikResult.torsoRoll * 0.75;
    }

    const freeAimModular =
      f.isPlayer && !this.lockOnActive && f.stunTimer <= 0 && !f.isDashing;
    let headPitch = f.weapon.kind === 'hammer' && sMove < 0.15 && f.attackPhase === 'none' && !f.isGuarding ? 0.06 : 0;
    if (freeAimModular) {
      torsoYaw += f.aimTorsoYaw * 0.8;
      torsoPitch += f.aimTorsoPitch * 0.75;
      headYaw += f.aimTorsoYaw * 0.32;
      headPitch += f.aimTorsoPitch * 0.48;
      if (f.weapon.isRanged) {
        rShoulderX += f.aimTorsoPitch * 0.45;
        lShoulderX += f.aimTorsoPitch * 0.45;
      }
    }

    const jLambda = f.attackPhase !== 'none' || f.isDashing ? 22 : 16;
    const ikW = ikResult ? ikResult.ikWeight : 0;
    const oneMinusIk = 1 - ikW;

    rig.bodyGroup.rotation.order = 'YXZ';
    rig.bodyGroup.rotation.x = THREE.MathUtils.damp(
      rig.bodyGroup.rotation.x,
      bodyPitch * oneMinusIk,
      jLambda,
      dt,
    );
    rig.bodyGroup.rotation.z = THREE.MathUtils.damp(
      rig.bodyGroup.rotation.z,
      bodyRoll * oneMinusIk,
      jLambda,
      dt,
    );
    const dampedBodyYaw = THREE.MathUtils.damp(rig.bodyGroup.rotation.y, bodyYaw, jLambda, dt);
    const dampedShiftX = THREE.MathUtils.damp(rig.bodyGroup.position.x, bodyShiftX, jLambda, dt);
    const dampedBob = THREE.MathUtils.damp(rig.bodyGroup.position.y, bodyBob, jLambda, dt);
    if (ikResult && ikW > 0.01) {
      rig.bodyGroup.rotation.y = THREE.MathUtils.lerp(dampedBodyYaw, ikResult.pelvisYaw, ikW);
      rig.bodyGroup.position.x = THREE.MathUtils.lerp(dampedShiftX, ikResult.pelvisShiftX, ikW);
      rig.bodyGroup.position.y = THREE.MathUtils.lerp(dampedBob, ikResult.cogBobY, ikW);
    } else {
      rig.bodyGroup.rotation.y = dampedBodyYaw;
      rig.bodyGroup.position.x = dampedShiftX;
      rig.bodyGroup.position.y = dampedBob;
    }

    rig.torsoPivot.rotation.y = THREE.MathUtils.damp(rig.torsoPivot.rotation.y, torsoYaw, jLambda, dt);
    rig.torsoPivot.rotation.x = THREE.MathUtils.damp(rig.torsoPivot.rotation.x, torsoPitch, jLambda, dt);
    rig.torsoPivot.rotation.z = THREE.MathUtils.damp(rig.torsoPivot.rotation.z, torsoRoll, jLambda, dt);
    rig.headPivot.rotation.y = THREE.MathUtils.damp(rig.headPivot.rotation.y, headYaw, jLambda, dt);
    rig.headPivot.rotation.x = THREE.MathUtils.damp(rig.headPivot.rotation.x, headPitch, jLambda, dt);

    const dampedLHipX = THREE.MathUtils.damp(rig.leftHip.rotation.x, lHipX, jLambda, dt);
    const dampedLHipZ = THREE.MathUtils.damp(rig.leftHip.rotation.z, lHipZ, jLambda, dt);
    const dampedRHipX = THREE.MathUtils.damp(rig.rightHip.rotation.x, rHipX, jLambda, dt);
    const dampedRHipZ = THREE.MathUtils.damp(rig.rightHip.rotation.z, rHipZ, jLambda, dt);
    const dampedLKneeX = THREE.MathUtils.damp(rig.leftKnee.rotation.x, lKneeX, jLambda, dt);
    const dampedRKneeX = THREE.MathUtils.damp(rig.rightKnee.rotation.x, rKneeX, jLambda, dt);

    if (ikResult && ikW > 0.01) {
      rig.leftHip.rotation.order = 'ZXY';
      rig.rightHip.rotation.order = 'ZXY';
      rig.leftHip.rotation.x = THREE.MathUtils.lerp(dampedLHipX, ikResult.left.hipX, ikW);
      rig.leftHip.rotation.z = THREE.MathUtils.lerp(dampedLHipZ, ikResult.left.hipZ, ikW);
      rig.leftKnee.rotation.x = THREE.MathUtils.lerp(dampedLKneeX, ikResult.left.kneeX, ikW);
      rig.rightHip.rotation.x = THREE.MathUtils.lerp(dampedRHipX, ikResult.right.hipX, ikW);
      rig.rightHip.rotation.z = THREE.MathUtils.lerp(dampedRHipZ, ikResult.right.hipZ, ikW);
      rig.rightKnee.rotation.x = THREE.MathUtils.lerp(dampedRKneeX, ikResult.right.kneeX, ikW);
      if (rig.leftAnkle) {
        rig.leftAnkle.rotation.x = ikResult.left.footX * ikW;
        rig.leftAnkle.rotation.z = ikResult.left.footZ * ikW;
      }
      if (rig.rightAnkle) {
        rig.rightAnkle.rotation.x = ikResult.right.footX * ikW;
        rig.rightAnkle.rotation.z = ikResult.right.footZ * ikW;
      }
    } else {
      rig.leftHip.rotation.order = 'XYZ';
      rig.rightHip.rotation.order = 'XYZ';
      rig.leftHip.rotation.x = dampedLHipX;
      rig.leftHip.rotation.z = dampedLHipZ;
      rig.rightHip.rotation.x = dampedRHipX;
      rig.rightHip.rotation.z = dampedRHipZ;
      rig.leftKnee.rotation.x = dampedLKneeX;
      rig.rightKnee.rotation.x = dampedRKneeX;
      if (rig.leftAnkle) {
        rig.leftAnkle.rotation.x = THREE.MathUtils.damp(rig.leftAnkle.rotation.x, 0, jLambda, dt);
        rig.leftAnkle.rotation.z = THREE.MathUtils.damp(rig.leftAnkle.rotation.z, 0, jLambda, dt);
      }
      if (rig.rightAnkle) {
        rig.rightAnkle.rotation.x = THREE.MathUtils.damp(rig.rightAnkle.rotation.x, 0, jLambda, dt);
        rig.rightAnkle.rotation.z = THREE.MathUtils.damp(rig.rightAnkle.rotation.z, 0, jLambda, dt);
      }
    }

    rig.leftShoulder.rotation.x = THREE.MathUtils.damp(rig.leftShoulder.rotation.x, lShoulderX, jLambda, dt);
    rig.leftShoulder.rotation.y = THREE.MathUtils.damp(rig.leftShoulder.rotation.y, lShoulderY, jLambda, dt);
    rig.leftShoulder.rotation.z = THREE.MathUtils.damp(rig.leftShoulder.rotation.z, lShoulderZ, jLambda, dt);
    rig.leftElbow.rotation.x = THREE.MathUtils.damp(rig.leftElbow.rotation.x, lElbowX, jLambda, dt);

    rig.rightShoulder.rotation.x = THREE.MathUtils.damp(rig.rightShoulder.rotation.x, rShoulderX, jLambda, dt);
    rig.rightShoulder.rotation.y = THREE.MathUtils.damp(rig.rightShoulder.rotation.y, rShoulderY, jLambda, dt);
    rig.rightShoulder.rotation.z = THREE.MathUtils.damp(rig.rightShoulder.rotation.z, rShoulderZ, jLambda, dt);
    rig.rightElbow.rotation.x = THREE.MathUtils.damp(rig.rightElbow.rotation.x, rElbowX, jLambda, dt);

    rig.weaponPivot.rotation.order = 'YXZ';
    rig.weaponPivot.rotation.x = THREE.MathUtils.damp(rig.weaponPivot.rotation.x, wPitch, jLambda, dt);
    rig.weaponPivot.rotation.y = THREE.MathUtils.damp(rig.weaponPivot.rotation.y, wYaw, jLambda, dt);
    rig.weaponPivot.rotation.z = THREE.MathUtils.damp(rig.weaponPivot.rotation.z, wRoll, jLambda, dt);

    const flameTarget = f.isDashing ? 1.8 : !f.isGrounded ? 1.3 : speedRatio > 0.25 ? 0.65 : 0.18;
    rig.thrusterFlames.forEach((flame) => {
      flame.scale.y = THREE.MathUtils.damp(flame.scale.y, flameTarget, 14, dt);
    });
  }

  private updateProjectiles(dt: number) {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.active) continue;

      p.prevPos.copy(p.pos);
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);

      if (p.life <= 0 || p.pos.y < 0.05 || Math.hypot(p.pos.x, p.pos.z) > this.arena.radius + 0.5) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      const target = p.ownerIsPlayer ? this.enemy : this.player;
      const attacker = p.ownerIsPlayer ? this.player : this.enemy;
      let hitDone = false;

      // Sub-step along prevPos -> pos so high-velocity sniper bolts never tunnel
      for (let s = 1; s <= 3; s++) {
        const alpha = s / 3;
        const sx = THREE.MathUtils.lerp(p.prevPos.x, p.pos.x, alpha);
        const sy = THREE.MathUtils.lerp(p.prevPos.y, p.pos.y, alpha);
        const sz = THREE.MathUtils.lerp(p.prevPos.z, p.pos.z, alpha);

        let hitObs: ObstacleState | null = null;
        for (let j = 0; j < this.obstacleStates.length; j++) {
          const o = this.obstacleStates[j];
          if (o.destroyed) continue;
          if (
            sy <= o.data.height + 0.15 &&
            Math.hypot(sx - o.data.x, sz - o.data.z) < o.data.radius + 0.15
          ) {
            hitObs = o;
            break;
          }
        }
        if (hitObs) {
          if (hitObs.data.destructible) {
            this.damageDestructibleObstacle(hitObs, p.damage, attacker);
          } else {
            this.spawnSparks(sx, sy, sz, 6, '#38BDF8');
          }
          p.active = false;
          p.mesh.visible = false;
          hitDone = true;
          break;
        }

        const dx = sx - target.pos.x;
        const dz = sz - target.pos.z;
        if (
          Math.hypot(dx, dz) < 0.88 &&
          sy >= target.pos.y - 0.15 &&
          sy <= target.pos.y + 2.15
        ) {
          _v2.set(sx, THREE.MathUtils.clamp(sy, target.pos.y + 0.35, target.pos.y + 1.55), sz);
          this.applyHit(attacker, target, p.damage, p.isSpecial ? 6.5 : 2.6, p.isSpecial, _v2, p.vel, p.isSpecial);
          p.active = false;
          p.mesh.visible = false;
          hitDone = true;
          break;
        }
      }

      if (hitDone) continue;
    }

    // Update Homing Stinger Missiles
    for (let i = 0; i < this.missiles.length; i++) {
      const m = this.missiles[i];
      if (!m.active) continue;

      m.age += dt;
      m.life -= dt;
      const target = m.ownerIsPlayer ? this.enemy : this.player;
      const attacker = m.ownerIsPlayer ? this.player : this.enemy;

      if (m.age > 0.13) {
        _v1.set(target.pos.x, target.pos.y + 1.02, target.pos.z).sub(m.pos).normalize();
        const steerRate = m.age < 0.35 ? 6.5 : 11.5;
        const curDir = _v2.copy(m.vel).normalize();
        curDir.lerp(_v1, Math.min(1, steerRate * dt)).normalize();
        m.vel.copy(curDir).multiplyScalar(27.5);
      } else {
        m.vel.y -= 4.5 * dt;
      }

      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      if (m.vel.lengthSq() > 0.01) {
        m.mesh.quaternion.setFromUnitVectors(_zAxis, _v2.copy(m.vel).normalize());
      }

      m.smokeTimer -= dt;
      if (m.smokeTimer <= 0) {
        m.smokeTimer = 0.045;
        this.spawnSparks(m.pos.x, m.pos.y, m.pos.z, 1, '#FDBA74');
      }

      let detonate = m.life <= 0 || m.pos.y <= 0.15;
      let hitTarget = false;

      if (!detonate) {
        const tDist = Math.hypot(m.pos.x - target.pos.x, m.pos.z - target.pos.z);
        if (
          tDist < 1.05 &&
          m.pos.y >= target.pos.y - 0.1 &&
          m.pos.y <= target.pos.y + 2.25
        ) {
          detonate = true;
          hitTarget = true;
        }
      }

      if (!detonate) {
        for (let j = 0; j < this.obstacleStates.length; j++) {
          const o = this.obstacleStates[j];
          if (o.destroyed) continue;
          if (
            m.pos.y <= o.data.height + 0.2 &&
            Math.hypot(m.pos.x - o.data.x, m.pos.z - o.data.z) < o.data.radius + 0.25
          ) {
            if (o.data.destructible) {
              this.damageDestructibleObstacle(o, m.damage, attacker);
            }
            detonate = true;
            break;
          }
        }
      }

      if (detonate) {
        if (hitTarget) {
          this.applyHit(attacker, target, m.damage, m.isFinal ? 7.5 : 3.4, m.isFinal, m.pos, m.vel, true);
        } else if (m.pos.distanceTo(target.pos) < 2.2) {
          this.applyHit(attacker, target, m.damage * 0.6, 3.2, false, m.pos, m.vel, true);
        }
        this.spawnShockwave(m.pos.x, Math.max(0.15, m.pos.y), m.pos.z, 2.2, '#F97316');
        this.spawnSparks(m.pos.x, m.pos.y, m.pos.z, 22, '#FDE047', 0, 1, 0, 1.15);
        this.spawnHitFlare(m.pos.x, m.pos.y, m.pos.z, '#F97316', m.isFinal ? 1.6 : 1.15);
        soundEngine.playHit(m.isFinal);

        if (m.customVisual) {
          m.mesh.remove(m.customVisual);
          m.customVisual = null;
        }
        m.active = false;
        m.mesh.visible = false;
      }
    }
  }

  private updateVfx(dt: number) {
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      s.vel.y -= 15.5 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.05) {
        s.pos.y = 0.05;
        s.vel.y *= -0.45;
        s.vel.x *= 0.8;
        s.vel.z *= 0.8;
      }
      s.mesh.position.copy(s.pos);
      const spdSq = s.vel.lengthSq();
      const lifeAlpha = Math.max(0.01, s.life / s.maxLife);
      if (spdSq > 0.01) {
        const spd = Math.sqrt(spdSq);
        _velDir.copy(s.vel).divideScalar(spd);
        s.mesh.quaternion.setFromUnitVectors(_zAxis, _velDir);
        const streakLen = THREE.MathUtils.clamp(spd * 0.14, 0.35, 1.85) * lifeAlpha;
        s.mesh.scale.set(lifeAlpha, lifeAlpha, streakLen);
      } else {
        s.mesh.scale.setScalar(lifeAlpha);
      }
      s.mat.opacity = Math.pow(lifeAlpha, 0.6);
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
      }
    }

    for (let i = 0; i < this.hitFlares.length; i++) {
      const f = this.hitFlares[i];
      if (!f.active) continue;
      f.life -= dt;
      const prog = 1 - Math.max(0, f.life / f.maxLife);
      const pulse = prog < 0.25 ? THREE.MathUtils.lerp(0.7, 1.3, prog / 0.25) : 1.3 * (1 - (prog - 0.25) / 0.75);
      f.group.scale.setScalar(Math.max(0.02, f.baseScale * pulse));
      f.group.rotation.z += dt * 11;
      const fade = 1 - prog;
      f.mats[0].opacity = fade * 0.98;
      f.mats[1].opacity = fade * 0.9;
      if (f.life <= 0) {
        f.active = false;
        f.group.visible = false;
      }
    }

    for (let i = 0; i < this.shockwaves.length; i++) {
      const r = this.shockwaves[i];
      if (!r.active) continue;
      r.life -= dt;
      const prog = 1 - Math.max(0, r.life / r.maxLife);
      const curRadius = 0.25 + prog * r.maxRadius;
      r.mesh.scale.setScalar(curRadius);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.85;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
      }
    }

    for (let i = 0; i < this.explosions.length; i++) {
      const e = this.explosions[i];
      if (!e.active) continue;
      e.life -= dt;
      const prog = 1 - Math.max(0, e.life / e.maxLife);
      const fade = Math.max(0, 1 - prog);

      const coreScale = THREE.MathUtils.lerp(1.4, 0.2, Math.min(1, prog * 1.8)) * e.scale;
      const fireScale = (0.45 + Math.pow(prog, 0.45) * 2.15) * e.scale;
      const cloudScale = (0.4 + Math.pow(prog, 0.55) * 2.7) * e.scale;
      const ringScale = (0.4 + prog * 3.1) * e.scale;

      e.core.scale.setScalar(Math.max(0.05, coreScale));
      e.fireball.scale.setScalar(fireScale);
      e.cloud.scale.setScalar(cloudScale);
      e.cloud.position.y = prog * 0.65 * e.scale;
      e.ring.scale.setScalar(ringScale);
      e.ring.rotation.z += dt * 4.5;

      e.coreMat.opacity = Math.max(0, 1 - prog * 1.9);
      e.fireMat.opacity = Math.pow(fade, 0.75) * 0.92;
      e.cloudMat.opacity = Math.pow(fade, 1.1) * 0.68;
      e.ringMat.opacity = Math.pow(fade, 0.8) * 0.88;

      if (e.life <= 0) {
        e.active = false;
        e.group.visible = false;
      }
    }

    for (let i = 0; i < this.lightningBolts.length; i++) {
      const b = this.lightningBolts[i];
      if (!b.active) continue;
      b.life -= dt;
      const alpha = Math.max(0, b.life / b.maxLife);
      const flicker = Math.random() > 0.2 ? 1 : 0.45;
      for (let m = 0; m < b.mats.length; m++) {
        b.mats[m].opacity = alpha * flicker;
      }
      if (b.life <= 0) {
        b.active = false;
        b.group.visible = false;
      }
    }

    // Staggered Anime Chain-Detonation Core Explosions
    for (let i = this.pendingCoreExplosions.length - 1; i >= 0; i--) {
      const evt = this.pendingCoreExplosions[i];
      evt.delay -= dt;
      if (evt.delay <= 0) {
        this.pendingCoreExplosions.splice(i, 1);
        this.spawnExplosion(evt.x, evt.y, evt.z, evt.scale);
        this.spawnShockwave(evt.x, Math.max(0.2, evt.y - 0.8), evt.z, evt.scale * 2.7, evt.shockColor);
        this.spawnSparks(evt.x, evt.y, evt.z, 26, evt.shockColor, 0, 0.9, 0, 1.45);
        this.spawnHitFlare(evt.x, evt.y, evt.z, evt.shockColor, evt.scale * 1.35);
        this.cameraShake = Math.max(this.cameraShake, 0.42);
        soundEngine.playExplosion();
      }
    }

    // Achilles Lv 10 ("Разящий вихрь") 3D Cyclone Vortex Funnel VFX
    const cycloneFighter =
      this.player.activeSkill === 'cyclone_f' && this.player.attackPhase !== 'none'
        ? this.player
        : this.enemy.activeSkill === 'cyclone_f' && this.enemy.attackPhase !== 'none'
          ? this.enemy
          : null;
    if (cycloneFighter) {
      const cp = 1 - Math.max(0, cycloneFighter.attackTimer / Math.max(0.1, cycloneFighter.attackDuration));
      this.cycloneVortexGroup.visible = cp < 0.78;
      if (this.cycloneVortexGroup.visible) {
        if (cp < 0.24) {
          this.cycloneVortexGroup.position.set(
            cycloneFighter.pos.x,
            cycloneFighter.pos.y + 1.1,
            cycloneFighter.pos.z,
          );
          this.cycloneVortexGroup.rotation.set(-Math.PI * 0.5, 0, 0);
          const s = 0.65 + (cp / 0.24) * 0.55;
          this.cycloneVortexGroup.scale.set(s, s, s);
        } else {
          const fx = Math.sin(cycloneFighter.yaw);
          const fz = Math.cos(cycloneFighter.yaw);
          this.cycloneVortexGroup.position.set(
            cycloneFighter.pos.x + fx * 0.9,
            cycloneFighter.pos.y + 1.05,
            cycloneFighter.pos.z + fz * 0.9,
          );
          this.cycloneVortexGroup.rotation.set(0, cycloneFighter.yaw, 0);
          const fade = cp > 0.65 ? Math.max(0.1, 1 - (cp - 0.65) / 0.13) : 1;
          const pulse = 1.05 + Math.sin(this.elapsedTime * 38) * 0.12;
          this.cycloneVortexGroup.scale.set(pulse * fade, pulse * fade, (1.15 + pulse * 0.1) * fade);
        }
        this.cycloneOuterCone.rotation.z += dt * 24;
        this.cycloneInnerCone.rotation.z -= dt * 32;
        for (let r = 0; r < this.cycloneRings.length; r++) {
          this.cycloneRings[r].rotation.z += dt * (r % 2 === 0 ? 18 : -22);
        }
      }
    } else {
      this.cycloneVortexGroup.visible = false;
    }

    if (this.thunderSpearOrb.visible) {
      this.thunderPrismJitterTimer -= dt;
      if (this.thunderPrismJitterTimer <= 0) {
        this.thunderPrismJitterTimer = 0.028;
        const jitterPrism = (mesh: THREE.Mesh, baseArr: Float32Array, amp: number) => {
          const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
          const arr = attr.array as Float32Array;
          for (let i = 0; i < arr.length; i += 3) {
            const bx = baseArr[i];
            const by = baseArr[i + 1];
            const bz = baseArr[i + 2];
            // Taper jitter near sharp tip (by ~ 0.58), crackle strongly along prism edges & base
            const tipFade = THREE.MathUtils.clamp(1 - (by - 0.28) / 0.35, 0.18, 1);
            const j = amp * tipFade;
            arr[i] = bx + (Math.random() - 0.5) * j;
            arr[i + 1] = by + (Math.random() - 0.5) * j * 0.45;
            arr[i + 2] = bz + (Math.random() - 0.5) * j;
          }
          attr.needsUpdate = true;
        };
        jitterPrism(this.thunderPrismShell, this.thunderPrismShellBasePos, 0.11);
        jitterPrism(this.thunderPrismWire, this.thunderPrismWireBasePos, 0.15);
        (this.thunderPrismShell.material as THREE.MeshBasicMaterial).opacity = 0.46 + Math.random() * 0.42;
        (this.thunderPrismWire.material as THREE.MeshBasicMaterial).opacity = 0.62 + Math.random() * 0.36;
      }
      this.thunderPrismCore.rotation.y += dt * 16;
      this.thunderPrismShell.rotation.y -= dt * 13;
      this.thunderPrismWire.rotation.y += dt * 21;
      this.thunderSpearArcA.rotation.z += dt * 14;
      this.thunderSpearArcB.rotation.z -= dt * 18;
    }

    if (this.thunderShotActive && this.thunderShotCaster && this.thunderShotTarget) {
      this.thunderShotTimer += dt;
      const alpha = Math.min(1, this.thunderShotTimer / Math.max(0.08, this.thunderShotDuration));
      const targetChestX = this.thunderShotTarget.pos.x;
      const targetChestY = this.thunderShotTarget.pos.y + 1.08;
      const targetChestZ = this.thunderShotTarget.pos.z;
      const isOdinOrangeShot = this.thunderShotCaster.isOdinClipSpecial;

      this.thunderShotPos.set(
        THREE.MathUtils.lerp(this.thunderShotOrigin.x, targetChestX, alpha),
        THREE.MathUtils.lerp(this.thunderShotOrigin.y, targetChestY, alpha),
        THREE.MathUtils.lerp(this.thunderShotOrigin.z, targetChestZ, alpha),
      );

      _v2.set(targetChestX - this.thunderShotOrigin.x, targetChestY - this.thunderShotOrigin.y, targetChestZ - this.thunderShotOrigin.z);
      if (_v2.lengthSq() > 0.0004) {
        _v2.normalize();
        this.thunderSpearOrb.quaternion.setFromUnitVectors(_yAxis, _v2);
      }
      this.thunderSpearOrb.visible = true;
      this.thunderSpearOrb.position.copy(this.thunderShotPos);
      this.thunderSpearOrb.scale.set(1.35 + Math.sin(this.elapsedTime * 54) * 0.2, 1.85, 1.35 + Math.cos(this.elapsedTime * 54) * 0.2);
      this.thunderLight.color.set(isOdinOrangeShot ? '#F97316' : '#60A5FA');
      this.thunderLight.position.copy(this.thunderShotPos);
      this.thunderFlashIntensity = Math.max(this.thunderFlashIntensity, 22);

      this.thunderShotArcCooldown -= dt;
      if (this.thunderShotArcCooldown <= 0) {
        this.thunderShotArcCooldown = 0.04;
        this.thunderShotCaster.rig.bladeTipPoint.getWorldPosition(_v1);
        if (_v1.y < this.thunderShotCaster.pos.y + 0.25) {
          _v1.copy(this.thunderShotOrigin);
        }
        this.spawnLightningBolt(
          _v1.x,
          _v1.y,
          _v1.z,
          this.thunderShotPos.x,
          this.thunderShotPos.y,
          this.thunderShotPos.z,
          1.35,
          isOdinOrangeShot ? '#F97316' : '#38BDF8',
        );
        this.spawnLightningBolt(
          this.thunderShotOrigin.x,
          this.thunderShotOrigin.y,
          this.thunderShotOrigin.z,
          this.thunderShotPos.x,
          this.thunderShotPos.y,
          this.thunderShotPos.z,
          0.95,
          isOdinOrangeShot ? '#FEF08A' : '#E0F2FE',
        );
        this.spawnSparks(
          this.thunderShotPos.x,
          this.thunderShotPos.y,
          this.thunderShotPos.z,
          4,
          isOdinOrangeShot ? '#FB923C' : '#60A5FA',
        );
      }

      if (alpha >= 1) {
        const caster = this.thunderShotCaster;
        const target = this.thunderShotTarget;
        this.thunderShotActive = false;
        this.thunderShotCaster = null;
        this.thunderShotTarget = null;
        if (!caster.hasHitCurrentSwing) {
          caster.hasHitCurrentSwing = true;
          this.executeAttackImpact(caster, target);
        }
      }
    }

    if (this.thunderAuraTimer > 0) {
      this.thunderAuraTimer = Math.max(0, this.thunderAuraTimer - dt);
      const activeSpecialFighter =
        this.player.isSpecialAttack &&
        (this.player.weapon.kind === 'lance' || this.player.isOdinClipSpecial)
          ? this.player
          : this.enemy.isSpecialAttack &&
              (this.enemy.weapon.kind === 'lance' || this.enemy.isOdinClipSpecial)
            ? this.enemy
            : null;
      if (activeSpecialFighter) {
        const isOdinOrange = activeSpecialFighter.isOdinClipSpecial;
        (this.thunderOuterRing.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#F97316' : '#38BDF8',
        );
        (this.thunderInnerRing.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#FED7AA' : '#7DD3FC',
        );
        (this.thunderPillar.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#EA580C' : '#38BDF8',
        );
        (this.thunderPrismCore.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#FFF7ED' : '#E0F2FE',
        );
        (this.thunderPrismShell.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#EA580C' : '#2563EB',
        );
        (this.thunderPrismWire.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#FDBA74' : '#7DD3FC',
        );
        (this.thunderSpearArcA.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#F97316' : '#60A5FA',
        );
        (this.thunderLanceCone.material as THREE.MeshBasicMaterial).color.set(
          isOdinOrange ? '#FB923C' : '#7DD3FC',
        );
        for (let r = 0; r < this.thunderConeRings.length; r++) {
          (this.thunderConeRings[r].material as THREE.MeshBasicMaterial).color.set(
            isOdinOrange
              ? r === 0
                ? '#FFF7ED'
                : r === 1
                  ? '#FDE047'
                  : '#F97316'
              : r === 0
                ? '#FFFFFF'
                : '#38BDF8',
          );
        }

        this.thunderAuraGroup.visible = true;
        this.thunderAuraGroup.position.copy(activeSpecialFighter.pos);
        this.thunderOuterRing.rotation.y += dt * 4.8;
        this.thunderInnerRing.rotation.y -= dt * 7.2;
        const pulse = 1 + Math.sin(this.elapsedTime * 28) * 0.14;
        this.thunderOuterRing.scale.setScalar(pulse);
        this.thunderPillar.scale.set(
          0.85 + Math.sin(this.elapsedTime * 34) * 0.25,
          1,
          0.85 + Math.cos(this.elapsedTime * 34) * 0.25,
        );
        const specProg =
          1 -
          activeSpecialFighter.attackTimer / Math.max(0.1, activeSpecialFighter.attackDuration);
        if (!this.thunderShotActive) {
          const chargeScale = THREE.MathUtils.lerp(0.55, 1.38, Math.min(1, specProg / 0.77));
          this.thunderSpearOrb.scale.set(
            chargeScale * (0.94 + Math.sin(this.elapsedTime * 44) * 0.16),
            chargeScale * 1.18,
            chargeScale * (0.94 + Math.cos(this.elapsedTime * 44) * 0.16),
          );
        }

        for (let i = 0; i < this.thunderCurtainStreaks.length; i++) {
          const st = this.thunderCurtainStreaks[i];
          const ud = st.userData as { baseY: number; speed: number; phase: number };
          const cyc = ((this.elapsedTime * ud.speed + ud.phase) % 4.5) / 4.5;
          st.position.y = ud.baseY + cyc * 3.8;
          const stMat = st.material as THREE.MeshBasicMaterial;
          stMat.color.set(
            isOdinOrange
              ? i % 3 === 0
                ? '#FFF7ED'
                : i % 2 === 0
                  ? '#F97316'
                  : '#F59E0B'
              : i % 3 === 0
                ? '#E0F2FE'
                : i % 2 === 0
                  ? '#38BDF8'
                  : '#0EA5E9',
          );
          stMat.opacity = Math.sin(cyc * Math.PI) * 0.62;
        }

        const showCone =
          (this.thunderCutInProgress >= 0.86 ||
            this.thunderShotActive ||
            activeSpecialFighter.attackPhase === 'active') &&
          specProg < 0.94;
        if (showCone) {
          this.thunderLanceCone.visible = true;
          activeSpecialFighter.rig.bladeTipPoint.getWorldPosition(_v1);
          if (_v1.y < activeSpecialFighter.pos.y + 0.25) {
            _v1.set(
              activeSpecialFighter.pos.x + Math.sin(activeSpecialFighter.yaw) * 0.9,
              activeSpecialFighter.pos.y + (isOdinOrange ? 3.1 : 1.25),
              activeSpecialFighter.pos.z + Math.cos(activeSpecialFighter.yaw) * 0.9,
            );
          }
          this.thunderLanceCone.position.copy(_v1);
          if (isOdinOrange) {
            const targetFighter =
              activeSpecialFighter === this.player ? this.enemy : this.player;
            _v2
              .set(
                targetFighter.pos.x - _v1.x,
                targetFighter.pos.y + 1.05 - _v1.y,
                targetFighter.pos.z - _v1.z,
              )
              .normalize();
            this.thunderLanceCone.quaternion.setFromUnitVectors(_zAxis, _v2);
          } else {
            this.thunderLanceCone.rotation.set(0, activeSpecialFighter.yaw, 0);
          }
          const conePulse = 1 + Math.sin(this.elapsedTime * 48) * 0.14;
          this.thunderLanceCone.scale.set(conePulse, conePulse, 1 + Math.cos(this.elapsedTime * 36) * 0.18);
          for (let r = 0; r < this.thunderConeRings.length; r++) {
            this.thunderConeRings[r].rotation.z += dt * (9 + r * 4);
          }
        } else {
          this.thunderLanceCone.visible = false;
        }
      } else {
        this.thunderAuraTimer = 0;
        this.thunderAuraGroup.visible = false;
        if (!this.thunderShotActive) {
          this.thunderSpearOrb.visible = false;
        }
        this.thunderLanceCone.visible = false;
      }
    } else {
      this.thunderAuraGroup.visible = false;
      if (!this.thunderShotActive) {
        this.thunderSpearOrb.visible = false;
      }
      const lungeFighter =
        this.player.activeSkill === 'lunge_r' && this.player.attackPhase === 'active'
          ? this.player
          : this.enemy.activeSkill === 'lunge_r' && this.enemy.attackPhase === 'active'
            ? this.enemy
            : null;
      if (lungeFighter) {
        this.thunderLanceCone.visible = true;
        (this.thunderLanceCone.material as THREE.MeshBasicMaterial).color.set('#38BDF8');
        lungeFighter.rig.bladeTipPoint.getWorldPosition(_v1);
        if (_v1.y < lungeFighter.pos.y + 0.25) {
          _v1.set(
            lungeFighter.pos.x + Math.sin(lungeFighter.yaw) * 1.1,
            lungeFighter.pos.y + 1.15,
            lungeFighter.pos.z + Math.cos(lungeFighter.yaw) * 1.1,
          );
        }
        this.thunderLanceCone.position.copy(_v1);
        this.thunderLanceCone.rotation.set(0, lungeFighter.yaw, 0);
        this.thunderLanceCone.scale.set(0.68, 0.68, 1.05);
      } else {
        this.thunderLanceCone.visible = false;
      }
    }

    if (this.thunderFlashIntensity > 0.05) {
      this.thunderFlashIntensity = THREE.MathUtils.damp(this.thunderFlashIntensity, 0, 12, dt);
      this.thunderLight.intensity = this.thunderFlashIntensity;
    } else {
      this.thunderFlashIntensity = 0;
      this.thunderLight.intensity = 0;
    }
  }

  private updateCamera(dt: number) {
    const pPos = this.player.pos;
    const ePos = this.enemy.pos;
    const isSniperAds = this.player.isAiming;
    const cutIn = this.thunderCutInProgress;
    const isThunderLunge =
      cutIn < 0 &&
      ((this.player.isSpecialAttack &&
        (this.player.weapon.kind === 'lance' || this.player.isOdinClipSpecial)) ||
        this.player.activeSkill === 'lunge_r' ||
        this.player.activeSkill === 'cyclone_f') &&
      this.player.attackPhase === 'active';

    let thunderShotIdx = -1;
    if (cutIn >= 0) {
      const fx = Math.sin(this.player.yaw);
      const fz = Math.cos(this.player.yaw);
      // Character's right-arm (spear) side = (-fz, 0, fx); left-arm (shield) side = (fz, 0, -fx)
      const rx = -fz;
      const rz = fx;
      const lx = fz;
      const lz = -fx;

      if (this.player.activeSkill === 'cyclone_f') {
        thunderShotIdx = 0;
        const s = cutIn;
        const ang = THREE.MathUtils.lerp(-0.45, 0.55, s);
        const dirX = fx * Math.cos(ang) + lx * Math.sin(ang);
        const dirZ = fz * Math.cos(ang) + lz * Math.sin(ang);
        const dist = THREE.MathUtils.lerp(2.7, 2.05, s);
        _desiredCamPos.set(
          pPos.x + dirX * dist,
          pPos.y + THREE.MathUtils.lerp(0.95, 1.35, s),
          pPos.z + dirZ * dist,
        );
        _desiredLook.set(pPos.x, pPos.y + 1.15, pPos.z);
      } else if (this.player.isOdinClipSpecial) {
        if (cutIn < 0.22) {
          // Shot 0: Skyward thruster ascent close-up
          thunderShotIdx = 0;
          const s = cutIn / 0.22;
          const fwd = THREE.MathUtils.lerp(2.3, 2.05, s);
          const rightSide = THREE.MathUtils.lerp(0.62, 0.35, s);
          const up = THREE.MathUtils.lerp(0.95, 2.65, s);
          _desiredCamPos.set(
            pPos.x + fx * fwd + rx * rightSide,
            pPos.y + up,
            pPos.z + fz * fwd + rz * rightSide,
          );
          _desiredLook.set(
            pPos.x + fx * 0.1,
            pPos.y + THREE.MathUtils.lerp(1.1, 3.05, s),
            pPos.z + fz * 0.1,
          );
        } else if (cutIn < 0.56) {
          // Shot 1: Orbiting mid-air Gungnir spear-twirl charge
          thunderShotIdx = 1;
          const s = (cutIn - 0.22) / 0.34;
          const ang = THREE.MathUtils.lerp(-0.65, 0.72, s);
          const orbitR = 2.65;
          const dirX = fx * Math.cos(ang) + lx * Math.sin(ang);
          const dirZ = fz * Math.cos(ang) + lz * Math.sin(ang);
          _desiredCamPos.set(
            pPos.x + dirX * orbitR,
            pPos.y + THREE.MathUtils.lerp(2.75, 3.3, s),
            pPos.z + dirZ * orbitR,
          );
          _desiredLook.set(pPos.x, pPos.y + 3.25, pPos.z);
        } else if (cutIn < 0.84) {
          // Shot 2: Dramatic low-angle heroic 3/4 sky-salute charge
          thunderShotIdx = 2;
          const s = (cutIn - 0.56) / 0.28;
          const ease = 1 - Math.pow(1 - s, 2);
          const fwd = THREE.MathUtils.lerp(2.55, 2.15, ease);
          const leftSide = THREE.MathUtils.lerp(1.3, 1.55, ease);
          const up = THREE.MathUtils.lerp(2.35, 2.6, ease);
          _desiredCamPos.set(
            pPos.x + fx * fwd + lx * leftSide,
            pPos.y + up,
            pPos.z + fz * fwd + lz * leftSide,
          );
          _desiredLook.set(
            pPos.x + fx * 0.1,
            pPos.y + 3.55,
            pPos.z + fz * 0.1,
          );
        } else {
          // Shot 3: Drawn-back aim over right shoulder before firing Gungnir downward
          thunderShotIdx = 3;
          const s = (cutIn - 0.84) / 0.16;
          const fwd = THREE.MathUtils.lerp(2.2, 2.9, s);
          const rightSide = THREE.MathUtils.lerp(0.95, 0.55, s);
          _desiredCamPos.set(
            pPos.x + fx * fwd + rx * rightSide,
            pPos.y + THREE.MathUtils.lerp(3.45, 3.15, s),
            pPos.z + fz * fwd + rz * rightSide,
          );
          _desiredLook.set(
            pPos.x + fx * 0.35,
            pPos.y + 3.25,
            pPos.z + fz * 0.35,
          );
        }
      } else if (cutIn < 0.33) {
        // Shot 0 (00:00): Medium front-right upward aura charge close-up
        thunderShotIdx = 0;
        const s = cutIn / 0.33;
        const fwd = THREE.MathUtils.lerp(2.1, 1.68, s);
        const rightSide = THREE.MathUtils.lerp(0.62, 0.26, s);
        const up = THREE.MathUtils.lerp(1.02, 1.24, s);
        _desiredCamPos.set(
          pPos.x + fx * fwd + rx * rightSide,
          pPos.y + up,
          pPos.z + fz * fwd + rz * rightSide,
        );
        _desiredLook.set(
          pPos.x + fx * 0.15 + rx * 0.05,
          pPos.y + 1.28,
          pPos.z + fz * 0.15 + rz * 0.05,
        );
      } else if (cutIn < 0.6) {
        // Shot 1 (00:01): Extreme shield-rim close-up looking up at Achilles' helmet & visor
        thunderShotIdx = 1;
        const s = (cutIn - 0.33) / 0.27;
        const fwd = THREE.MathUtils.lerp(1.48, 1.32, s);
        const leftSide = THREE.MathUtils.lerp(0.76, 0.58, s);
        const up = THREE.MathUtils.lerp(1.16, 1.3, s);
        _desiredCamPos.set(
          pPos.x + fx * fwd + lx * leftSide,
          pPos.y + up,
          pPos.z + fz * fwd + lz * leftSide,
        );
        _desiredLook.set(
          pPos.x + fx * 0.12 + lx * 0.06,
          pPos.y + 1.4,
          pPos.z + fz * 0.12 + lz * 0.06,
        );
      } else if (cutIn < 0.9) {
        // Shot 2 (00:02): Heroic 3/4 shield-side profile showing drawn-back blazing Lightning Lance
        thunderShotIdx = 2;
        const s = (cutIn - 0.6) / 0.3;
        const ease = 1 - Math.pow(1 - s, 2);
        const fwd = THREE.MathUtils.lerp(1.88, 1.56, ease);
        const leftSide = THREE.MathUtils.lerp(1.32, 1.66, ease);
        const up = THREE.MathUtils.lerp(1.18, 1.34, ease);
        _desiredCamPos.set(
          pPos.x + fx * fwd + lx * leftSide,
          pPos.y + up,
          pPos.z + fz * fwd + lz * leftSide,
        );
        _desiredLook.set(
          pPos.x + fx * 0.18 + rx * 0.14,
          pPos.y + 1.28,
          pPos.z + fz * 0.18 + rz * 0.14,
        );
      } else {
        // Shot 3 (00:03): Forward vortex burst view looking down the surging cyan energy cone
        thunderShotIdx = 3;
        const s = (cutIn - 0.9) / 0.1;
        const fwd = THREE.MathUtils.lerp(2.5, 3.1, s);
        _desiredCamPos.set(
          pPos.x + fx * fwd + rx * 0.34,
          pPos.y + 1.12,
          pPos.z + fz * fwd + rz * 0.34,
        );
        _desiredLook.set(
          pPos.x + fx * 0.45,
          pPos.y + 1.16,
          pPos.z + fz * 0.45,
        );
      }
    } else if (isSniperAds) {
      // True First-Person Sniper Scope camera at Hunter's visor/optic height
      const eyeY = pPos.y + 1.42;
      if (this.lockOnActive) {
        _v1.subVectors(ePos, pPos);
        _v1.y = 0;
        const dist = Math.max(0.5, _v1.length());
        _v1.divideScalar(dist);

        _desiredCamPos.set(
          pPos.x + _v1.x * 0.24,
          eyeY,
          pPos.z + _v1.z * 0.24,
        );
        _desiredLook.set(ePos.x, ePos.y + 1.02, ePos.z);
      } else {
        if (Math.abs(this.pointerEdgeRate) > 0.01) {
          this.camOrbitYaw += this.pointerEdgeRate * this.mouseSensitivity * dt;
        }
        if (this.keys.has('KeyQ')) {
          this.camOrbitYaw += 1.6 * dt;
        }
        if (this.keys.has('KeyC')) {
          this.camOrbitYaw -= 1.6 * dt;
        }

        _camForward.set(-Math.sin(this.camOrbitYaw), 0, -Math.cos(this.camOrbitYaw));
        const adsPitch = THREE.MathUtils.clamp(this.camOrbitPitch - 0.34, -0.52, 0.64);
        const cosAds = Math.cos(adsPitch);
        const sinAds = Math.sin(adsPitch);

        _desiredCamPos.set(
          pPos.x + _camForward.x * 0.24,
          eyeY,
          pPos.z + _camForward.z * 0.24,
        );
        _desiredLook.set(
          _desiredCamPos.x + _camForward.x * cosAds * 28,
          _desiredCamPos.y - sinAds * 28,
          _desiredCamPos.z + _camForward.z * cosAds * 28,
        );
      }
    } else if (
      this.lockOnActive ||
      (this.player.isSpecialAttack &&
        (this.player.weapon.kind === 'lance' || this.player.isOdinClipSpecial))
    ) {
      _v1.subVectors(ePos, pPos);
      _v1.y = 0;
      const dist = Math.max(0.5, _v1.length());
      _v1.divideScalar(dist);

      const camBack = THREE.MathUtils.clamp(5.8 + dist * 0.22, 6.0, 9.2);
      const camHeight = THREE.MathUtils.clamp(3.2 + dist * 0.14, 3.4, 5.4);
      const sideOffset = 1.15;

      _v2.set(-_v1.z, 0, _v1.x);

      _desiredCamPos.set(
        pPos.x - _v1.x * camBack + _v2.x * sideOffset,
        camHeight + pPos.y * 0.9,
        pPos.z - _v1.z * camBack + _v2.z * sideOffset,
      );

      _desiredLook.set(
        THREE.MathUtils.lerp(pPos.x, ePos.x, 0.55),
        1.15 + THREE.MathUtils.lerp(pPos.y, ePos.y, 0.55) * 0.88,
        THREE.MathUtils.lerp(pPos.z, ePos.z, 0.55),
      );
    } else {
      if (Math.abs(this.pointerEdgeRate) > 0.01) {
        this.camOrbitYaw += this.pointerEdgeRate * this.mouseSensitivity * dt;
      }
      if (this.keys.has('KeyQ')) {
        this.camOrbitYaw += 2.2 * dt;
      }
      if (this.keys.has('KeyC')) {
        this.camOrbitYaw -= 2.2 * dt;
      }

      _camForward.set(-Math.sin(this.camOrbitYaw), 0, -Math.cos(this.camOrbitYaw));
      _camRight.set(-_camForward.z, 0, _camForward.x);

      const dist = this.camDistance;
      const cosP = Math.cos(this.camOrbitPitch);
      const camBaseY = this.player.groundY + (pPos.y - this.player.groundY) * 0.82;

      _desiredCamPos.set(
        pPos.x + Math.sin(this.camOrbitYaw) * cosP * dist + _camRight.x * 0.42,
        camBaseY + 1.28 + Math.sin(this.camOrbitPitch) * dist,
        pPos.z + Math.cos(this.camOrbitYaw) * cosP * dist + _camRight.z * 0.42,
      );

      const lookY = Math.max(
        0.4,
        camBaseY + 1.26 - Math.sin(this.camOrbitPitch) * 2.1,
      );
      _desiredLook.set(
        pPos.x + _camForward.x * 3.4 + _camRight.x * 0.22,
        lookY,
        pPos.z + _camForward.z * 3.4 + _camRight.z * 0.22,
      );
    }

    _desiredCamPos.y = Math.max(0.75, _desiredCamPos.y);

    const snapCut = thunderShotIdx !== this.lastThunderShot;
    this.lastThunderShot = thunderShotIdx;

    if (snapCut) {
      this.camera.position.copy(_desiredCamPos);
      _currentCamLook.copy(_desiredLook);
    } else {
      const posLambda = cutIn >= 0 ? 14 : isSniperAds ? 26 : this.lockOnActive ? 7.5 : 16.5;
      const lookLambda = cutIn >= 0 ? 20 : isSniperAds ? 34 : this.lockOnActive ? 10 : 20;

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredCamPos.x, posLambda, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredCamPos.y, posLambda, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredCamPos.z, posLambda, dt);

      _currentCamLook.x = THREE.MathUtils.damp(_currentCamLook.x, _desiredLook.x, lookLambda, dt);
      _currentCamLook.y = THREE.MathUtils.damp(_currentCamLook.y, _desiredLook.y, lookLambda, dt);
      _currentCamLook.z = THREE.MathUtils.damp(_currentCamLook.z, _desiredLook.z, lookLambda, dt);
    }

    if (this.cameraShake > 0.002) {
      this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 14, dt);
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.7;
    }

    // Hide player mesh seamlessly whenever camera is inside first-person scope radius so helmet/cape never clip the lens
    const camHorizDist = Math.hypot(this.camera.position.x - pPos.x, this.camera.position.z - pPos.z);
    this.player.rig.root.visible = !(cutIn < 0 && ((isSniperAds && camHorizDist < 1.15) || camHorizDist < 0.75));

    const targetFov =
      thunderShotIdx === 0
        ? THREE.MathUtils.lerp(34, 30, Math.min(1, cutIn / 0.33))
        : thunderShotIdx === 1
          ? 27
          : thunderShotIdx === 2
            ? 36
            : thunderShotIdx === 3
              ? 50
              : isThunderLunge
                ? 58
                : isSniperAds
                  ? 18
                  : this.player.isDashing
                    ? 55
                    : 48;
    if (snapCut) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    } else if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, cutIn >= 0 ? 12 : isSniperAds ? 16 : 13, dt);
      this.camera.updateProjectionMatrix();
    }

    this.camera.lookAt(_currentCamLook);
  }

  private getScopeTelemetry() {
    const targetDistance = Math.round(this.player.pos.distanceTo(this.enemy.pos) * 10) / 10;
    const camDir = _v1;
    this.camera.getWorldDirection(camDir);
    const aimPitchDeg = Math.round(Math.asin(THREE.MathUtils.clamp(camDir.y, -0.99, 0.99)) * (180 / Math.PI) * 10) / 10;

    const targetCenter = _v2.set(this.enemy.pos.x, this.enemy.pos.y + 1.02, this.enemy.pos.z);
    const rayToTarget = _v3.copy(targetCenter).sub(this.camera.position);
    const projAlongRay = rayToTarget.dot(camDir);
    const perpDist = projAlongRay > 0 ? rayToTarget.addScaledVector(camDir, -projAlongRay).length() : Infinity;
    const aimInfo = this.getPlayerAimInfo(this.enemy);
    const targetInReticle =
      this.enemy.hp > 0 &&
      (this.player.isAiming ? perpDist < 0.72 || this.lockOnActive : aimInfo.hasSoftLock);

    const shotReadyPct =
      this.player.attackCooldown > 0
        ? Math.round(
            THREE.MathUtils.clamp(
              (1 - this.player.attackCooldown / Math.max(0.1, this.player.attackDuration)) * 100,
              0,
              100,
            ),
          )
        : 100;

    return {
      targetDistance,
      aimPitchDeg,
      targetInReticle,
      shotReadyPct,
    };
  }

  private buildPlayerSkillsHud(): BattleSkillSlotHud[] {
    if (this.player.usesAchillesProgression) {
      const atkBusy = this.player.stunTimer > 0 || this.player.attackPhase !== 'none';
      const eUnlocked = this.player.level >= ACHILLES_SKILL_UNLOCKS.thunderE.unlockLevel;
      const fUnlocked = this.player.level >= ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel;
      return [
        {
          id: 'lunge_r',
          key: 'R',
          name: ACHILLES_SKILL_UNLOCKS.lungeR.name,
          unlocked: true,
          unlockLevel: 0,
          mode: 'cooldown',
          cooldownRemaining: Number(this.player.skillRCooldown.toFixed(1)),
          cooldownTotal: ACHILLES_SKILL_UNLOCKS.lungeR.cooldownSec,
          ready: !atkBusy && this.player.skillRCooldown <= 0,
          accentHex: ACHILLES_SKILL_UNLOCKS.lungeR.accentHex,
        },
        {
          id: 'thunder_e',
          key: 'E',
          name: ACHILLES_SKILL_UNLOCKS.thunderE.name,
          unlocked: eUnlocked,
          unlockLevel: ACHILLES_SKILL_UNLOCKS.thunderE.unlockLevel,
          mode: 'cooldown',
          cooldownRemaining: Number(this.player.skillECooldown.toFixed(1)),
          cooldownTotal: ACHILLES_SKILL_UNLOCKS.thunderE.cooldownSec,
          ready: eUnlocked && !atkBusy && this.player.skillECooldown <= 0,
          accentHex: ACHILLES_SKILL_UNLOCKS.thunderE.accentHex,
        },
        {
          id: 'cyclone_f',
          key: 'F',
          name: ACHILLES_SKILL_UNLOCKS.cycloneF.name,
          unlocked: fUnlocked,
          unlockLevel: ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel,
          mode: 'gauge',
          gaugePct: Math.round(this.player.special),
          ready: fUnlocked && !atkBusy && this.player.special >= 100,
          accentHex: ACHILLES_SKILL_UNLOCKS.cycloneF.accentHex,
        },
      ];
    }

    return [
      {
        id: 'special_e',
        key: 'E',
        name: this.player.weapon.specialName,
        unlocked: true,
        unlockLevel: 0,
        mode: 'gauge',
        gaugePct: Math.round(this.player.special),
        ready: this.player.special >= 100 && this.player.stunTimer <= 0 && this.player.attackPhase === 'none',
        accentHex: this.player.weapon.accentHex,
      },
    ];
  }

  private emitHud() {
    const scopeTelemetry = this.getScopeTelemetry();
    const isCyclone = this.player.activeSkill === 'cyclone_f';
    const snapshot: BattleHudSnapshot = {
      player: {
        name: this.player.name,
        lbxName: this.player.loadout.name,
        level: this.player.usesAchillesProgression ? this.player.level : undefined,
        hp: Math.ceil(this.player.hp),
        maxHp: this.player.stats.maxHp,
        energy: Math.round(this.player.energy),
        maxEnergy: this.player.stats.maxEnergy,
        special: Math.round(this.player.special),
        explosionCells: this.player.explosionCells,
        maxExplosionCells: this.player.maxExplosionCells,
        explosionGauge: Math.round((this.player.explosionCells / this.player.maxExplosionCells) * 100),
        isGuarding: this.player.isGuarding,
        canGuard: this.player.stats.canGuard,
        isAiming: this.player.isAiming,
        isDashing: this.player.isDashing,
        dashCooldown: Number(this.player.dashCooldown.toFixed(2)),
        isStunned: this.player.stunTimer > 0,
        comboCount: this.player.comboCounter,
      },
      enemy: {
        name: this.enemy.name,
        lbxName: this.enemy.loadout.name,
        hp: Math.ceil(this.enemy.hp),
        maxHp: this.enemy.stats.maxHp,
        energy: Math.round(this.enemy.energy),
        maxEnergy: this.enemy.stats.maxEnergy,
        special: Math.round(this.enemy.special),
        explosionCells: this.enemy.explosionCells,
        maxExplosionCells: this.enemy.maxExplosionCells,
        explosionGauge: Math.round((this.enemy.explosionCells / this.enemy.maxExplosionCells) * 100),
        isGuarding: this.enemy.isGuarding,
        canGuard: this.enemy.stats.canGuard,
        isAiming: this.enemy.isAiming,
        isDashing: this.enemy.isDashing,
        isStunned: this.enemy.stunTimer > 0,
        comboCount: this.enemy.comboCounter,
        aiState: this.enemy.aiState,
      },
      playerSkills: this.buildPlayerSkillsHud(),
      showSpecialGauge:
        !this.player.usesAchillesProgression ||
        this.player.level >= ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel,
      specialGaugeLabel: this.player.usesAchillesProgression ? 'Вихрь · F' : 'Экстра',
      elapsedTime: this.elapsedTime,
      lockOnActive: this.lockOnActive,
      bannerText: this.bannerTimer > 0 ? this.bannerText : null,
      specialCutIn:
        this.thunderCutInProgress >= 0
          ? {
              title: isCyclone
                ? ACHILLES_SKILL_UNLOCKS.cycloneF.name.toUpperCase()
                : this.player.weapon.specialName.toUpperCase(),
              subtitle: `ЭКСТРА-ПРИЁМ • ${this.player.loadout.name.toUpperCase()}`,
              accentHex: isCyclone
                ? ACHILLES_SKILL_UNLOCKS.cycloneF.accentHex
                : this.player.weapon.accentHex,
              progress: this.thunderCutInProgress,
            }
          : null,
      outcome: this.outcome,
      targetDistance: scopeTelemetry.targetDistance,
      aimPitchDeg: scopeTelemetry.aimPitchDeg,
      targetInReticle: scopeTelemetry.targetInReticle,
      shotReadyPct: scopeTelemetry.shotReadyPct,
      stats: {
        damageDealt: this.damageDealt,
        parriesLanded: this.parriesLanded,
        specialsUsed: this.specialsUsed,
      },
    };
    this.callbacks.onHudUpdate(snapshot);
  }

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

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    if (!this.paused) {
      this.elapsedTime += dt;
      if (this.bannerTimer > 0) {
        this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      }

      this.updateInteractables(dt);

      // Refresh active obstacles scratch array
      this.activeObstaclesScratch.length = 0;
      for (let i = 0; i < this.obstacleStates.length; i++) {
        if (!this.obstacleStates[i].destroyed) {
          this.activeObstaclesScratch.push(this.obstacleStates[i].data);
        }
      }

      if (this.outcome === 'ongoing') {
        const isCycloneCutIn =
          this.player.activeSkill === 'cyclone_f' && this.player.attackTimer > 0;
        const hasCutInSpecial =
          this.player.attackTimer > 0 &&
          (isCycloneCutIn ||
            (this.player.isSpecialAttack &&
              (this.player.weapon.kind === 'lance' || this.player.isOdinClipSpecial)));
        const cutInWindow = isCycloneCutIn ? 0.24 : this.player.isOdinClipSpecial ? 0.72 : 0.68;
        const cutInProg = hasCutInSpecial
          ? 1 - this.player.attackTimer / Math.max(0.1, this.player.attackDuration)
          : 1;
        const inCutIn = hasCutInSpecial && cutInProg < cutInWindow;
        const enemyStandStill =
          hasCutInSpecial &&
          !this.player.hasHitCurrentSwing &&
          (isCycloneCutIn ? cutInProg < 0.68 : cutInProg < 0.88);
        this.thunderCutInProgress = inCutIn
          ? THREE.MathUtils.clamp(cutInProg / cutInWindow, 0, 1)
          : -1;
        const worldDt = inCutIn ? dt * 0.03 : dt;

        const moveInput = inCutIn ? { x: 0, z: 0 } : this.getPlayerMoveInput();
        const wantAttack = inCutIn ? false : this.mouseAttackQueued;
        this.mouseAttackQueued = false;
        const wantGuard = inCutIn ? false : this.mouseGuardHeld || this.keys.has('KeyK');
        const pAim = this.getPlayerAimInfo(this.enemy).attackYaw;

        this.updateFighter(
          this.player,
          this.enemy,
          moveInput,
          wantAttack,
          wantGuard,
          false,
          false,
          pAim,
          dt,
        );

        const aiOut = this.aiBrain.update({
          aiPos: this.enemy.pos,
          aiHp: this.enemy.hp,
          aiMaxHp: this.enemy.stats.maxHp,
          aiEnergy: this.enemy.energy,
          aiMaxEnergy: this.enemy.stats.maxEnergy,
          aiSpecial: this.enemy.special,
          aiAttackCooldown: this.enemy.attackCooldown,
          aiComboStep: this.enemy.comboStep,
          aiIsStunned: this.enemy.stunTimer > 0,
          aiWeapon: this.enemy.weapon,
          aiCanGuard: this.enemy.stats.canGuard,
          aiIsGrounded: this.enemy.isGrounded,
          playerPos: this.player.pos,
          playerHp: this.player.hp,
          playerMaxHp: this.player.stats.maxHp,
          playerEnergy: this.player.energy,
          playerIsAttacking: this.player.attackPhase !== 'none',
          playerAttackPhase: this.player.attackPhase,
          playerIsGuarding: this.player.isGuarding,
          playerWeaponIsRanged: this.player.weapon.isRanged,
          playerFacingAngle: this.player.yaw,
          arenaRadius: this.arena.radius,
          obstacles: this.activeObstaclesScratch,
          readyInteractables: this.readyInteractablesScratch,
          dt: worldDt,
        });

        this.enemy.aiState = aiOut.tacticalState;
        if (enemyStandStill) {
          this.enemy.vel.x = 0;
          this.enemy.vel.z = 0;
          this.enemy.isDashing = false;
          this.enemy.isGuarding = false;
          this.enemy.isAiming = false;
          this.enemy.attackPhase = 'none';
          this.enemy.isSpecialAttack = false;
          stopCustomSpecialClip(this.enemy.rig);
        } else if (aiOut.wantJump && !inCutIn) {
          this.tryJump(this.enemy);
        }

        this.updateFighter(
          this.enemy,
          this.player,
          enemyStandStill ? { x: 0, z: 0 } : { x: aiOut.moveDirX, z: aiOut.moveDirZ },
          enemyStandStill || inCutIn ? false : aiOut.wantAttack,
          enemyStandStill || inCutIn ? false : aiOut.wantGuard,
          enemyStandStill || inCutIn ? false : aiOut.wantDash,
          enemyStandStill || inCutIn ? false : aiOut.wantSpecial,
          aiOut.aimAngle,
          worldDt,
        );

        this.updateProjectiles(worldDt);
      } else {
        this.thunderCutInProgress = -1;
        this.updateFighter(this.player, this.enemy, { x: 0, z: 0 }, false, false, false, false, null, dt * 0.65);
        this.updateFighter(this.enemy, this.player, { x: 0, z: 0 }, false, false, false, false, null, dt * 0.65);
        if (this.outcomeDelayTimer > 0) {
          this.outcomeDelayTimer -= dt;
          if (this.outcomeDelayTimer <= 0) {
            this.emitHud();
            const finalSnap: BattleHudSnapshot = {
              player: {
                name: this.player.name,
                lbxName: this.player.loadout.name,
                level: this.player.usesAchillesProgression ? this.player.level : undefined,
                hp: Math.ceil(this.player.hp),
                maxHp: this.player.stats.maxHp,
                energy: Math.round(this.player.energy),
                maxEnergy: this.player.stats.maxEnergy,
                special: Math.round(this.player.special),
                explosionCells: this.player.explosionCells,
                maxExplosionCells: this.player.maxExplosionCells,
                explosionGauge: Math.round((this.player.explosionCells / this.player.maxExplosionCells) * 100),
                isGuarding: false,
                canGuard: this.player.stats.canGuard,
                isAiming: false,
                isDashing: false,
                isStunned: false,
                comboCount: 0,
              },
              enemy: {
                name: this.enemy.name,
                lbxName: this.enemy.loadout.name,
                hp: Math.ceil(this.enemy.hp),
                maxHp: this.enemy.stats.maxHp,
                energy: Math.round(this.enemy.energy),
                maxEnergy: this.enemy.stats.maxEnergy,
                special: Math.round(this.enemy.special),
                explosionCells: this.enemy.explosionCells,
                maxExplosionCells: this.enemy.maxExplosionCells,
                explosionGauge: Math.round((this.enemy.explosionCells / this.enemy.maxExplosionCells) * 100),
                isGuarding: false,
                canGuard: this.enemy.stats.canGuard,
                isAiming: false,
                isDashing: false,
                isStunned: false,
                comboCount: 0,
                aiState: this.enemy.aiState,
              },
              playerSkills: this.buildPlayerSkillsHud(),
              showSpecialGauge:
                !this.player.usesAchillesProgression ||
                this.player.level >= ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel,
              specialGaugeLabel: this.player.usesAchillesProgression ? 'Вихрь · F' : 'Экстра',
              elapsedTime: this.elapsedTime,
              lockOnActive: this.lockOnActive,
              bannerText: null,
              specialCutIn: null,
              outcome: this.outcome,
              stats: {
                damageDealt: this.damageDealt,
                parriesLanded: this.parriesLanded,
                specialsUsed: this.specialsUsed,
              },
            };
            this.callbacks.onBattleEnd(this.outcome, finalSnap);
          }
        }
        this.updateProjectiles(dt);
      }

      this.updateVfx(dt);
      this.updateCamera(dt);

      if (this.sunLight) {
        // Snap shadow frustum center to shadow texel grid around the player for crisp anti-shimmer sunlight across the 54m valley
        const texelSnap = (60 / 2048) * 8;
        const focusX = Math.round(this.player.pos.x / texelSnap) * texelSnap;
        const focusZ = Math.round(this.player.pos.z / texelSnap) * texelSnap;
        this.sunLight.target.position.set(focusX, 0, focusZ);
        this.sunLight.position
          .copy(this.sunLight.target.position)
          .addScaledVector(this.sunDir, 62);
        this.sunLight.target.updateMatrixWorld();
      }

      this.hudEmitTimer += dt;
      if (this.hudEmitTimer >= 0.05) {
        this.hudEmitTimer = 0;
        this.emitHud();
      }
    }

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

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.exitPointerLock();
    const dom = this.renderer.domElement;
    dom.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    dom.removeEventListener('mouseenter', this.onMouseEnter);
    dom.removeEventListener('mouseleave', this.onMouseLeave);
    dom.removeEventListener('mousemove', this.onMouseMove);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('touchstart', this.onTouchStart);
    dom.removeEventListener('touchmove', this.onTouchMove);
    dom.removeEventListener('touchend', this.onTouchEnd);
    dom.removeEventListener('contextmenu', this.onContextMenu);

    this.player.rig.dispose();
    this.enemy.rig.dispose();
    this.sharedGeos.forEach((g) => g.dispose());
    this.sharedMats.forEach((m) => m.dispose());
    this.disposeArena();
    this.disposeEnv();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
