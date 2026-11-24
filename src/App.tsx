import { useEffect, useState } from 'react';
import { RotateCcw, Settings, Volume2, VolumeX, X } from 'lucide-react';
import { BattleArenaView } from './components/BattleArenaView';
import { GarageView } from './components/GarageView';
import { SkirmishConfig, SkirmishSetupView } from './components/SkirmishSetupView';
import { StoryCampaignView } from './components/StoryCampaignView';
import {
  DEFAULT_PLAYER_LOADOUT,
  getLoadoutCharacterId,
  INITIAL_UNLOCKED_PARTS,
} from './game/catalog';
import {
  CustomModelAsset,
  CustomWeaponMode,
  addCustomCharacterTextures,
  addCustomCharacterWeaponTextures,
  deleteCustomCharacterModel,
  deleteCustomCharacterWeapon,
  loadAllSavedCustomModels,
  saveCustomCharacterModel,
  saveCustomCharacterWeapon,
  updateCustomModelPlayAnimation,
  updateCustomModelWeaponMode,
  updateCustomModelYaw,
  updateCustomWeaponYaw,
} from './game/customModelStorage';
import {
  ACHILLES_MAX_LEVEL,
  awardCharacterXp,
  getCharacterProgress,
  isLevelProgressionCharacter,
} from './game/progression';
import { soundEngine } from './game/sound';
import { STORY_CHAPTERS } from './game/story';
import {
  AiPersonality,
  ArenaId,
  BattleHudSnapshot,
  CharacterProgressMap,
  LbxLoadout,
  ModelStyle,
  StoryChapter,
} from './game/types';

type ScreenMode = 'story' | 'garage' | 'skirmish' | 'battle';

interface ActiveBattleSpec {
  enemyName: string;
  enemyLoadout: LbxLoadout;
  arenaId: ArenaId;
  aiPersonality: AiPersonality;
  storyChapter: StoryChapter | null;
}

const STORAGE_KEY = 'lbx_diorama_save_v1';

interface SaveData {
  loadout: LbxLoadout;
  unlockedPartIds: string[];
  completedChapterIds: string[];
  characterProgress?: CharacterProgressMap;
  useCustomModel?: boolean;
  useCustomModelByChar?: Partial<Record<ModelStyle, boolean>>;
  mouseSensitivity?: number;
}

function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const legacyUseCustom = parsed.useCustomModel ?? true;
      return {
        loadout: parsed.loadout ?? DEFAULT_PLAYER_LOADOUT,
        unlockedPartIds: Array.from(new Set([...INITIAL_UNLOCKED_PARTS, ...parsed.unlockedPartIds ?? []])),
        completedChapterIds: Array.isArray(parsed.completedChapterIds)
          ? parsed.completedChapterIds
          : [],
        characterProgress: parsed.characterProgress ?? { achilles: { level: 0, xp: 0 } },
        useCustomModel: legacyUseCustom,
        useCustomModelByChar: parsed.useCustomModelByChar ?? { achilles: legacyUseCustom },
        mouseSensitivity:
          typeof parsed.mouseSensitivity === 'number'
            ? Math.min(2.5, Math.max(0.2, parsed.mouseSensitivity))
            : 1.0,
      };
    }
  } catch {
    // Ignore storage read failure
  }
  return {
    loadout: DEFAULT_PLAYER_LOADOUT,
    unlockedPartIds: INITIAL_UNLOCKED_PARTS,
    completedChapterIds: [],
    characterProgress: { achilles: { level: 0, xp: 0 } },
    useCustomModel: true,
    useCustomModelByChar: { achilles: true },
    mouseSensitivity: 1.0,
  };
}

export function App() {
  const initial = loadSaveData();
  const [screen, setScreen] = useState<ScreenMode>('story');
  const [playerLoadout, setPlayerLoadout] = useState<LbxLoadout>(initial.loadout);
  const [unlockedPartIds, setUnlockedPartIds] = useState<string[]>(
    initial.unlockedPartIds,
  );
  const [completedChapterIds, setCompletedChapterIds] = useState<string[]>(
    initial.completedChapterIds,
  );
  const [characterProgress, setCharacterProgress] = useState<CharacterProgressMap>(
    initial.characterProgress ?? { achilles: { level: 0, xp: 0 } },
  );
  const [customModels, setCustomModels] = useState<
    Partial<Record<ModelStyle, CustomModelAsset>>
  >({});
  const [useCustomModelByChar, setUseCustomModelByChar] = useState<
    Partial<Record<ModelStyle, boolean>>
  >(initial.useCustomModelByChar ?? { achilles: true });
  const [activeBattle, setActiveBattle] = useState<ActiveBattleSpec | null>(null);
  const [muted, setMuted] = useState(soundEngine.muted);
  const [mouseSensitivity, setMouseSensitivity] = useState<number>(
    initial.mouseSensitivity ?? 1.0,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeCharacterId = getLoadoutCharacterId(playerLoadout);
  const activeProgress = getCharacterProgress(characterProgress, activeCharacterId);
  const activeCustomModel = customModels[activeCharacterId] ?? null;
  const activeUseCustomModel =
    (useCustomModelByChar[activeCharacterId] ?? true) && Boolean(activeCustomModel);

  const enemyCharacterId = activeBattle
    ? getLoadoutCharacterId(activeBattle.enemyLoadout)
    : null;
  const enemyCustomAsset = enemyCharacterId ? (customModels[enemyCharacterId] ?? null) : null;
  const enemyCustomModel =
    enemyCharacterId && (useCustomModelByChar[enemyCharacterId] ?? true)
      ? enemyCustomAsset
      : null;

  useEffect(() => {
    let active = true;
    void loadAllSavedCustomModels().then((assets) => {
      if (active) {
        setCustomModels(assets);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const data: SaveData = {
        loadout: playerLoadout,
        unlockedPartIds,
        completedChapterIds,
        characterProgress,
        useCustomModel: useCustomModelByChar.achilles ?? true,
        useCustomModelByChar,
        mouseSensitivity,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage write failure
    }
  }, [playerLoadout, unlockedPartIds, completedChapterIds, characterProgress, useCustomModelByChar, mouseSensitivity]);

  const handleUploadCustomModel = async (
    files: File | File[],
    charId: ModelStyle = activeCharacterId,
  ) => {
    const saved = await saveCustomCharacterModel(charId, files);
    setCustomModels((prev) => ({ ...prev, [charId]: saved }));
    setUseCustomModelByChar((prev) => ({ ...prev, [charId]: true }));
  };

  const handleAddCustomTextures = async (
    files: File[],
    charId: ModelStyle = activeCharacterId,
  ) => {
    const updated = await addCustomCharacterTextures(charId, files);
    setCustomModels((prev) => ({ ...prev, [charId]: updated }));
  };

  const handleUploadCustomWeapon = async (
    files: File | File[],
    charId: ModelStyle = activeCharacterId,
  ) => {
    const updated = await saveCustomCharacterWeapon(charId, files);
    setCustomModels((prev) => ({ ...prev, [charId]: updated }));
    setUseCustomModelByChar((prev) => ({ ...prev, [charId]: true }));
  };

  const handleAddCustomWeaponTextures = async (
    files: File[],
    charId: ModelStyle = activeCharacterId,
  ) => {
    const updated = await addCustomCharacterWeaponTextures(charId, files);
    setCustomModels((prev) => ({ ...prev, [charId]: updated }));
  };

  const handleRotateCustomWeapon = async (
    charId: ModelStyle = activeCharacterId,
  ) => {
    const target = customModels[charId]?.customWeapon;
    if (!target) return;
    const nextYaw = ((target.yawOffsetDeg || 0) + 90) % 360;
    const updated = await updateCustomWeaponYaw(nextYaw, charId);
    if (updated) {
      setCustomModels((prev) => ({ ...prev, [charId]: updated }));
    }
  };

  const handleDeleteCustomWeapon = async (
    charId: ModelStyle = activeCharacterId,
  ) => {
    const updated = await deleteCustomCharacterWeapon(charId);
    if (updated) {
      setCustomModels((prev) => ({ ...prev, [charId]: updated }));
    }
  };

  const handleDeleteCustomModel = async (
    charId: ModelStyle = activeCharacterId,
  ) => {
    await deleteCustomCharacterModel(charId);
    setCustomModels((prev) => {
      const next = { ...prev };
      delete next[charId];
      return next;
    });
  };

  const handleRotateCustomModel = async (
    charId: ModelStyle = activeCharacterId,
  ) => {
    const target = customModels[charId];
    if (!target) return;
    const nextYaw = (target.yawOffsetDeg + 90) % 360;
    await updateCustomModelYaw(nextYaw, charId);
    setCustomModels((prev) =>
      prev[charId] ? { ...prev, [charId]: { ...prev[charId]!, yawOffsetDeg: nextYaw } } : prev,
    );
  };

  const handleResetCustomModelYaw = async (
    charId: ModelStyle = activeCharacterId,
  ) => {
    if (!customModels[charId]) return;
    await updateCustomModelYaw(0, charId);
    setCustomModels((prev) =>
      prev[charId] ? { ...prev, [charId]: { ...prev[charId]!, yawOffsetDeg: 0 } } : prev,
    );
  };

  const handleTogglePlayAnimation = async (
    charId: ModelStyle = activeCharacterId,
  ) => {
    const target = customModels[charId];
    if (!target) return;
    const nextPlay = !target.playAnimation;
    await updateCustomModelPlayAnimation(nextPlay, charId);
    setCustomModels((prev) =>
      prev[charId]
        ? { ...prev, [charId]: { ...prev[charId]!, playAnimation: nextPlay } }
        : prev,
    );
  };

  const handleChangeWeaponMode = async (
    mode: CustomWeaponMode,
    charId: ModelStyle = activeCharacterId,
  ) => {
    if (!customModels[charId]) return;
    await updateCustomModelWeaponMode(mode, charId);
    setCustomModels((prev) =>
      prev[charId] ? { ...prev, [charId]: { ...prev[charId]!, weaponMode: mode } } : prev,
    );
  };

  const handleToggleUseCustomModel = (
    use: boolean,
    charId: ModelStyle = activeCharacterId,
  ) => {
    setUseCustomModelByChar((prev) => ({ ...prev, [charId]: use }));
  };

  const startStoryChapter = (chapter: StoryChapter) => {
    setActiveBattle({
      enemyName: chapter.opponentName,
      enemyLoadout: chapter.opponentLoadout,
      arenaId: chapter.arenaId,
      aiPersonality: chapter.aiPersonality,
      storyChapter: chapter,
    });
    setScreen('battle');
  };

  const startSkirmish = (cfg: SkirmishConfig) => {
    setActiveBattle({
      enemyName: cfg.enemyName,
      enemyLoadout: cfg.enemyLoadout,
      arenaId: cfg.arenaId,
      aiPersonality: cfg.aiPersonality,
      storyChapter: null,
    });
    setScreen('battle');
  };

  const startQuickTestBattle = () => {
    const ch = STORY_CHAPTERS[0];
    setActiveBattle({
      enemyName: ch.opponentName,
      enemyLoadout: ch.opponentLoadout,
      arenaId: 'meadow',
      aiPersonality: ch.aiPersonality,
      storyChapter: null,
    });
    setScreen('battle');
  };

  const handleBattleVictory = (chapter: StoryChapter | null) => {
    if (!chapter) return;
    setCompletedChapterIds((prev) =>
      prev.includes(chapter.id) ? prev : [...prev, chapter.id],
    );
    if (chapter.rewardPartIds.length > 0) {
      setUnlockedPartIds((prev) =>
        Array.from(new Set([...prev, ...chapter.rewardPartIds])),
      );
    }
  };

  const handleSetCharacterLevel = (charId: ModelStyle, level: number) => {
    const clamped = Math.max(0, Math.min(ACHILLES_MAX_LEVEL, Math.floor(level)));
    setCharacterProgress((prev) => ({
      ...prev,
      [charId]: { level: clamped, xp: 0 },
    }));
  };

  const handleBattleComplete = (
    outcome: 'victory' | 'defeat',
    snap: BattleHudSnapshot,
    chapter: StoryChapter | null,
  ) => {
    if (outcome === 'victory') {
      handleBattleVictory(chapter);
    }
    if (!isLevelProgressionCharacter(activeCharacterId)) {
      return null;
    }
    const xpGained =
      outcome === 'victory'
        ? 200 + Math.min(180, Math.round(snap.stats.damageDealt * 0.08))
        : 75;
    const current = getCharacterProgress(characterProgress, activeCharacterId);
    const res = awardCharacterXp(current, xpGained);
    setCharacterProgress((prev) => ({
      ...prev,
      [activeCharacterId]: res.next,
    }));
    return {
      xpGained,
      levelBefore: res.previousLevel,
      levelAfter: res.next.level,
      newlyUnlockedSkills: res.newlyUnlockedSkills,
    };
  };

  const handleNextChapter = (currentChapterId: string) => {
    const idx = STORY_CHAPTERS.findIndex((c) => c.id === currentChapterId);
    const next = STORY_CHAPTERS[idx + 1];
    if (next) {
      startStoryChapter(next);
    } else {
      setScreen('story');
    }
  };

  const nextCampaignChapter =
    STORY_CHAPTERS[
      Math.min(STORY_CHAPTERS.length - 1, completedChapterIds.length)
    ] ?? STORY_CHAPTERS[0];

  const currentChapterIdx = activeBattle?.storyChapter
    ? STORY_CHAPTERS.findIndex((c) => c.id === activeBattle.storyChapter?.id)
    : -1;
  const hasNextChapter =
    currentChapterIdx >= 0 && currentChapterIdx < STORY_CHAPTERS.length - 1;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0B0F17] text-slate-100">
      {/* Three-Zone Top Bar (hidden during live 3D Battle for 100% viewport focus) */}
      {screen !== 'battle' && (
        <header className="fixed top-0 inset-x-0 z-30 h-16 px-6 md:px-10 bg-[#0B0F17]/95 border-b border-slate-800/80 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setScreen('story');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            LBX · Хроники Диорам
          </button>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setScreen('story');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors pb-0.5 border-b-2 ${
                screen === 'story'
                  ? 'text-amber-400 border-amber-400'
                  : 'text-slate-400 border-transparent hover:text-slate-100'
              }`}
            >
              Сюжет
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setScreen('garage');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors pb-0.5 border-b-2 ${
                screen === 'garage'
                  ? 'text-amber-400 border-amber-400'
                  : 'text-slate-400 border-transparent hover:text-slate-100'
              }`}
            >
              Ангар LBX
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setScreen('skirmish');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors pb-0.5 border-b-2 ${
                screen === 'skirmish'
                  ? 'text-amber-400 border-amber-400'
                  : 'text-slate-400 border-transparent hover:text-slate-100'
              }`}
            >
              Свободный бой
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.muted = !soundEngine.muted;
                setMuted(soundEngine.muted);
                if (!soundEngine.muted) soundEngine.playClick();
              }}
              aria-label="Переключить звук"
              className="text-slate-400 hover:text-slate-100 transition-colors shrink-0"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setSettingsOpen(true);
              }}
              aria-label="Настройки управления"
              title="Настройки"
              className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors shrink-0"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden md:inline">Настройки</span>
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0 hidden sm:block">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                startStoryChapter(nextCampaignChapter);
              }}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs whitespace-nowrap shrink-0 transition-colors"
            >
              В бой
            </button>
          </div>
        </header>
      )}

      {/* Main Views */}
      {screen === 'story' && (
        <StoryCampaignView
          completedChapterIds={completedChapterIds}
          onStartChapter={startStoryChapter}
          onOpenGarage={() => setScreen('garage')}
        />
      )}

      {screen === 'garage' && (
        <GarageView
          loadout={playerLoadout}
          unlockedPartIds={unlockedPartIds}
          characterProgress={characterProgress}
          onSetCharacterLevel={handleSetCharacterLevel}
          customModel={activeCustomModel}
          customModels={customModels}
          useCustomModel={activeUseCustomModel}
          onChangeLoadout={setPlayerLoadout}
          onUploadCustomModel={handleUploadCustomModel}
          onUploadCustomTextures={handleAddCustomTextures}
          onUploadCustomWeapon={handleUploadCustomWeapon}
          onUploadCustomWeaponTextures={handleAddCustomWeaponTextures}
          onRotateCustomWeapon={handleRotateCustomWeapon}
          onDeleteCustomWeapon={handleDeleteCustomWeapon}
          onDeleteCustomModel={handleDeleteCustomModel}
          onRotateCustomModel={handleRotateCustomModel}
          onResetCustomModelYaw={handleResetCustomModelYaw}
          onTogglePlayAnimation={handleTogglePlayAnimation}
          onChangeWeaponMode={handleChangeWeaponMode}
          onToggleUseCustomModel={(use) =>
            handleToggleUseCustomModel(use, activeCharacterId)
          }
          onStartQuickBattle={startQuickTestBattle}
        />
      )}

      {screen === 'skirmish' && (
        <SkirmishSetupView onLaunchSkirmish={startSkirmish} />
      )}

      {screen === 'battle' && activeBattle && (
        <BattleArenaView
          playerLoadout={playerLoadout}
          playerLevel={isLevelProgressionCharacter(activeCharacterId) ? activeProgress.level : 0}
          playerCustomModel={activeUseCustomModel ? activeCustomModel : null}
          enemyName={activeBattle.enemyName}
          enemyLoadout={activeBattle.enemyLoadout}
          enemyCustomModel={enemyCustomModel}
          customModels={customModels}
          arenaId={activeBattle.arenaId}
          aiPersonality={activeBattle.aiPersonality}
          storyChapter={activeBattle.storyChapter}
          mouseSensitivity={mouseSensitivity}
          onChangeMouseSensitivity={setMouseSensitivity}
          onExitToMenu={() => setScreen('story')}
          onOpenGarage={() => setScreen('garage')}
          onVictory={handleBattleVictory}
          onBattleFinish={handleBattleComplete}
          onNextChapter={handleNextChapter}
          hasNextChapter={hasNextChapter}
        />
      )}

      {/* Main Menu Settings Modal */}
      {settingsOpen && screen !== 'battle' && (
        <div
          className="fixed inset-0 z-50 bg-[#070A10]/85 flex items-center justify-center p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="bg-[#111723] border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Настройки управления
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Параметры камеры и звука для арены
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setSettingsOpen(false);
                }}
                aria-label="Закрыть настройки"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-200">
                  Чувствительность мыши
                </span>
                <span className="font-mono-num text-amber-400 font-bold">
                  {mouseSensitivity.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={2.5}
                step={0.05}
                value={mouseSensitivity}
                onChange={(e) => setMouseSensitivity(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono-num">
                <span>0.20× (плавно)</span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setMouseSensitivity(1.0);
                  }}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Сбросить (1.00×)
                </button>
                <span>2.50× (быстро)</span>
              </div>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">
                Звуковые эффекты боя
              </span>
              <button
                type="button"
                onClick={() => {
                  soundEngine.muted = !soundEngine.muted;
                  setMuted(soundEngine.muted);
                  if (!soundEngine.muted) soundEngine.playClick();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  muted
                    ? 'border-slate-700 bg-slate-800 text-slate-400'
                    : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                }`}
              >
                {muted ? 'Выключен' : 'Включён'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setSettingsOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm transition-colors"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
