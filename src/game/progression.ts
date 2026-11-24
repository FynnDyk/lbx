import { CharacterProgress, CharacterProgressMap, ModelStyle } from './types';

export const MAX_EXPLOSION_CELLS = 8;
export const ACHILLES_MAX_LEVEL = 15;

export const ACHILLES_SKILL_UNLOCKS = {
  lungeR: {
    id: 'lunge_r' as const,
    key: 'R' as const,
    name: 'Пронзающий выпад',
    unlockLevel: 0,
    damage: 200,
    cellDrain: 1,
    cooldownSec: 10,
    accentHex: '#38BDF8',
    description: 'Стремительный выпад с выставленным копьём вперёд.',
  },
  thunderE: {
    id: 'thunder_e' as const,
    key: 'E' as const,
    name: 'Удар грозы',
    unlockLevel: 5,
    damage: 400,
    cellDrain: 4,
    cooldownSec: 35,
    accentHex: '#60A5FA',
    description: 'Мощный грозовой залп копьём. Перезарядка без шкалы.',
  },
  cycloneF: {
    id: 'cyclone_f' as const,
    key: 'F' as const,
    name: 'Разящий вихрь',
    unlockLevel: 10,
    damage: 800,
    cellDrain: 6,
    cooldownSec: 0,
    accentHex: '#2DD4BF',
    description: 'Вихревой таранный удар копьём с долгой шкалой заряда.',
  },
};

export function isLevelProgressionCharacter(charId: ModelStyle): boolean {
  return charId === 'achilles';
}

export function xpRequiredForLevel(level: number): number {
  if (level >= ACHILLES_MAX_LEVEL) return 0;
  return 100 + level * 45;
}

export function getCharacterProgress(
  map: CharacterProgressMap | undefined,
  charId: ModelStyle,
): CharacterProgress {
  const entry = map?.[charId];
  if (!entry) return { level: 0, xp: 0 };
  return {
    level: Math.max(0, Math.min(ACHILLES_MAX_LEVEL, Math.floor(entry.level))),
    xp: Math.max(0, Math.floor(entry.xp)),
  };
}

export function awardCharacterXp(
  progress: CharacterProgress,
  gainedXp: number,
): {
  next: CharacterProgress;
  leveledUp: boolean;
  previousLevel: number;
  newlyUnlockedSkills: string[];
} {
  const prevLevel = Math.max(0, Math.min(ACHILLES_MAX_LEVEL, progress.level));
  let level = prevLevel;
  let xp = Math.max(0, progress.xp) + Math.max(0, Math.round(gainedXp));

  while (level < ACHILLES_MAX_LEVEL) {
    const req = xpRequiredForLevel(level);
    if (xp >= req) {
      xp -= req;
      level += 1;
    } else {
      break;
    }
  }

  if (level >= ACHILLES_MAX_LEVEL) {
    xp = 0;
  }

  const newlyUnlockedSkills: string[] = [];
  if (prevLevel < ACHILLES_SKILL_UNLOCKS.thunderE.unlockLevel && level >= ACHILLES_SKILL_UNLOCKS.thunderE.unlockLevel) {
    newlyUnlockedSkills.push(ACHILLES_SKILL_UNLOCKS.thunderE.name);
  }
  if (prevLevel < ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel && level >= ACHILLES_SKILL_UNLOCKS.cycloneF.unlockLevel) {
    newlyUnlockedSkills.push(ACHILLES_SKILL_UNLOCKS.cycloneF.name);
  }

  return {
    next: { level, xp },
    leveledUp: level > prevLevel,
    previousLevel: prevLevel,
    newlyUnlockedSkills,
  };
}
