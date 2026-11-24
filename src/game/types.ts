export type PartSlot = 'head' | 'torso' | 'arms' | 'legs' | 'booster';

export type ModelStyle = 'achilles' | 'kunoichi' | 'emperor' | 'hunter' | 'odin';

export type WeaponKind = 'lance' | 'kodachi' | 'hammer' | 'rifle' | 'halberd';

export type ArenaId = 'meadow' | 'cardboard' | 'factory' | 'canyon' | 'artemis';

export interface LbxPart {
  id: string;
  slot: PartSlot;
  style: ModelStyle;
  name: string;
  series: string;
  description: string;
  hpBonus: number;
  armorBonus: number;
  speedBonus: number;
  energyBonus: number;
  attackBonus: number;
}

export interface LbxWeapon {
  id: string;
  kind: WeaponKind;
  name: string;
  shortLabel: string;
  description: string;
  damage: number;
  range: number; // meters in diorama scale
  attackSpeed: number; // combo tempo multiplier
  moveSpeedMod: number; // multiplier on movement speed
  blockMitigation: number; // 0.35 - 0.75
  isRanged: boolean;
  specialName: string;
  specialDesc: string;
  accentHex: string;
}

export interface LbxPaint {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  frame: string;
  visor: string;
}

export interface LbxCharacterPreset {
  id: ModelStyle;
  name: string;
  genitiveName: string;
  role: string;
  description: string;
  accentHex: string;
  loadout: LbxLoadout;
  requiredPartIds: string[];
}

export interface LbxLoadout {
  name: string;
  characterId?: ModelStyle;
  headId: string;
  torsoId: string;
  armsId: string;
  legsId: string;
  boosterId: string;
  weaponId: string;
  paintId: string;
}

export interface ComputedLbxStats {
  maxHp: number;
  armor: number; // damage reduction percentage 0..38
  moveSpeed: number; // units/sec
  dashSpeed: number;
  dashDuration: number;
  jumpPower: number;
  maxEnergy: number;
  energyRegen: number;
  attackPower: number;
  canGuard: boolean;
}

export interface AiPersonality {
  id: string;
  label: string;
  aggression: number; // 0..1
  caution: number; // 0..1 (guard/retreat propensity)
  flankBias: number; // 0..1 (circling vs direct)
  evadeSkill: number; // 0..1 (reaction to telegraphs)
  parryChance: number; // 0..1
  preferredRange: number; // desired distance
  reactionTime: number; // seconds between full utility evaluations
  comboCommit: number; // 0..1 chance to chain full 3-hit combo
}

export interface DialogueLine {
  speaker: string;
  role: string;
  text: string;
  side: 'left' | 'right';
}

export interface StoryChapter {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  opponentName: string;
  opponentTitle: string;
  opponentLbxName: string;
  arenaId: ArenaId;
  opponentLoadout: LbxLoadout;
  aiPersonality: AiPersonality;
  rewardPartIds: string[];
  rewardLabel: string;
  briefing: string;
  preBattleDialogue: DialogueLine[];
  victoryDialogue: DialogueLine[];
}

export interface ArenaObstacle {
  id?: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  kind: 'block' | 'pillar' | 'crate' | 'rock' | 'ruin';
  destructible?: boolean;
  maxHp?: number;
}

export interface ArenaInteractable {
  id: string;
  x: number;
  z: number;
  radius: number;
  kind: 'repair_node' | 'boost_pad';
}

export interface ArenaConfig {
  id: ArenaId;
  name: string;
  subtitle: string;
  description: string;
  radius: number;
  skyColor: string;
  fogColor: string;
  floorPrimary: string;
  floorSecondary: string;
  accentColor: string;
  obstacles: ArenaObstacle[];
  interactables: ArenaInteractable[];
}

export type AiTacticalState =
  | 'APPROACH'
  | 'FLANK'
  | 'COMBO'
  | 'SNIPE'
  | 'GUARD'
  | 'EVADE'
  | 'RETREAT'
  | 'SPECIAL';

export interface CharacterProgress {
  level: number;
  xp: number;
}

export type CharacterProgressMap = Partial<Record<ModelStyle, CharacterProgress>>;

export interface BattleSkillSlotHud {
  id: 'lunge_r' | 'thunder_e' | 'cyclone_f' | 'special_e';
  key: 'R' | 'E' | 'F';
  name: string;
  unlocked: boolean;
  unlockLevel: number;
  mode: 'cooldown' | 'gauge';
  cooldownRemaining?: number;
  cooldownTotal?: number;
  gaugePct?: number;
  ready: boolean;
  accentHex: string;
}

export interface FighterHudState {
  name: string;
  lbxName: string;
  level?: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  special: number; // 0..100
  explosionCells: number; // 0..8 remaining core cells
  maxExplosionCells: number;
  explosionGauge?: number; // 0..100 legacy percentage mirror
  isGuarding: boolean;
  canGuard?: boolean;
  isAiming?: boolean;
  isDashing: boolean;
  dashCooldown?: number;
  isDodging?: boolean;
  dodgeDir?: 'left' | 'back' | 'right' | null;
  dodgeCooldown?: number;
  dodgePenaltyTimer?: number;
  isStunned: boolean;
  comboCount: number;
  aiState?: AiTacticalState;
}

export interface BattleHudSnapshot {
  player: FighterHudState;
  enemy: FighterHudState;
  playerSkills?: BattleSkillSlotHud[];
  showSpecialGauge?: boolean;
  specialGaugeLabel?: string;
  elapsedTime: number;
  lockOnActive: boolean;
  targetDistance?: number;
  aimPitchDeg?: number;
  targetInReticle?: boolean;
  shotReadyPct?: number;
  bannerText: string | null;
  specialCutIn?: {
    title: string;
    subtitle: string;
    accentHex: string;
    progress: number;
  } | null;
  dodgeSlowMo?: {
    remaining: number;
    duration: number;
    dir: 'left' | 'back' | 'right';
  } | null;
  outcome: 'ongoing' | 'victory' | 'defeat';
  stats: {
    damageDealt: number;
    parriesLanded: number;
    specialsUsed: number;
  };
}
