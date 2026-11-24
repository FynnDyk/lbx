import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCw,
  Shield,
  Swords,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import {
  computeLoadoutStats,
  getCharacterById,
  getLoadoutCharacterId,
  getPartsBySlot,
  getWeaponById,
  LBX_CHARACTERS,
  LBX_PAINTS,
  LBX_WEAPONS,
} from '../game/catalog';
import { getWeaponDonorCharacterId } from '../game/customModelLoader';
import { CustomModelAsset, CustomWeaponMode } from '../game/customModelStorage';
import { GarageCameraPreset, GarageViewportEngine } from '../game/garageEngine';
import {
  ACHILLES_MAX_LEVEL,
  ACHILLES_SKILL_UNLOCKS,
  getCharacterProgress,
  isLevelProgressionCharacter,
  xpRequiredForLevel,
} from '../game/progression';
import { soundEngine } from '../game/sound';
import {
  CharacterProgressMap,
  LbxCharacterPreset,
  LbxLoadout,
  ModelStyle,
  PartSlot,
} from '../game/types';

interface GarageViewProps {
  loadout: LbxLoadout;
  unlockedPartIds: string[];
  characterProgress: CharacterProgressMap;
  onSetCharacterLevel: (characterId: ModelStyle, level: number) => void;
  customModel: CustomModelAsset | null;
  customModels: Partial<Record<ModelStyle, CustomModelAsset>>;
  useCustomModel: boolean;
  onChangeLoadout: (next: LbxLoadout) => void;
  onUploadCustomModel: (files: File | File[], characterId: ModelStyle) => Promise<void>;
  onUploadCustomTextures: (files: File[], characterId: ModelStyle) => Promise<void>;
  onUploadCustomWeapon: (files: File | File[], characterId: ModelStyle) => Promise<void>;
  onUploadCustomWeaponTextures: (files: File[], characterId: ModelStyle) => Promise<void>;
  onRotateCustomWeapon: (characterId: ModelStyle) => Promise<void>;
  onDeleteCustomWeapon: (characterId: ModelStyle) => Promise<void>;
  onDeleteCustomModel: (characterId: ModelStyle) => Promise<void>;
  onRotateCustomModel: (characterId: ModelStyle) => Promise<void>;
  onResetCustomModelYaw: (characterId: ModelStyle) => Promise<void>;
  onTogglePlayAnimation: (characterId: ModelStyle) => Promise<void>;
  onChangeWeaponMode: (mode: CustomWeaponMode, characterId: ModelStyle) => Promise<void>;
  onToggleUseCustomModel: (use: boolean) => void;
  onStartQuickBattle: () => void;
}

type GarageTab = 'character' | PartSlot | 'weapon' | 'paint';

const TABS: { id: GarageTab; label: string }[] = [
  { id: 'character', label: 'Персонаж' },
  { id: 'head', label: 'Голова' },
  { id: 'torso', label: 'Торс' },
  { id: 'arms', label: 'Руки' },
  { id: 'legs', label: 'Ноги' },
  { id: 'booster', label: 'Ранец' },
  { id: 'weapon', label: 'Оружие' },
  { id: 'paint', label: 'Окраска' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export const GarageView: React.FC<GarageViewProps> = ({
  loadout,
  unlockedPartIds,
  characterProgress,
  onSetCharacterLevel,
  customModel,
  customModels,
  useCustomModel,
  onChangeLoadout,
  onUploadCustomModel,
  onUploadCustomTextures,
  onUploadCustomWeapon,
  onUploadCustomWeaponTextures,
  onRotateCustomWeapon,
  onDeleteCustomWeapon,
  onDeleteCustomModel,
  onRotateCustomModel,
  onResetCustomModelYaw,
  onTogglePlayAnimation,
  onChangeWeaponMode,
  onToggleUseCustomModel,
  onStartQuickBattle,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GarageViewportEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const texInputRef = useRef<HTMLInputElement | null>(null);
  const weaponFileInputRef = useRef<HTMLInputElement | null>(null);
  const weaponTexInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<GarageTab>('character');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [camPreset, setCamPreset] = useState<GarageCameraPreset>('full');
  const [autoSpin, setAutoSpin] = useState(true);
  const [guardPreview, setGuardPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const activeCharacterId = getLoadoutCharacterId(loadout);
  const activeCharacter = getCharacterById(activeCharacterId);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new GarageViewportEngine(
      el,
      loadout,
      customModel,
      useCustomModel,
      customModels,
    );
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      (loadout.weaponId !== 'weapon_lance' &&
        loadout.weaponId !== 'weapon_halberd' &&
        loadout.weaponId !== 'weapon_kodachi' &&
        loadout.weaponId !== 'weapon_hammer') ||
      activeCharacterId === 'hunter'
    ) {
      setGuardPreview(false);
    }
    engineRef.current?.setLoadout(loadout, customModel, useCustomModel, customModels);
  }, [loadout, customModel, useCustomModel, customModels, activeCharacterId]);

  const stats = computeLoadoutStats(loadout);
  const currentWeapon = getWeaponById(loadout.weaponId);

  const handleSelectCamera = (preset: GarageCameraPreset) => {
    soundEngine.playClick();
    setCamPreset(preset);
    engineRef.current?.setCameraPreset(preset);
  };

  const handleToggleSpin = () => {
    soundEngine.playClick();
    const next = !autoSpin;
    setAutoSpin(next);
    engineRef.current?.setAutoSpin(next);
  };

  const isCharacterUnlocked = (char: LbxCharacterPreset) =>
    char.requiredPartIds.some((id) => unlockedPartIds.includes(id));

  const handleSelectCharacter = (char: LbxCharacterPreset) => {
    if (!isCharacterUnlocked(char)) return;
    soundEngine.playClick();
    setUploadError(null);
    const preset = char.loadout;
    const nextWeaponId = unlockedPartIds.includes(preset.weaponId)
      ? preset.weaponId
      : unlockedPartIds.includes(loadout.weaponId)
        ? loadout.weaponId
        : 'weapon_lance';

    onChangeLoadout({
      ...preset,
      characterId: char.id,
      headId: unlockedPartIds.includes(preset.headId) ? preset.headId : loadout.headId,
      torsoId: unlockedPartIds.includes(preset.torsoId) ? preset.torsoId : loadout.torsoId,
      armsId: unlockedPartIds.includes(preset.armsId) ? preset.armsId : loadout.armsId,
      legsId: unlockedPartIds.includes(preset.legsId) ? preset.legsId : loadout.legsId,
      boosterId: unlockedPartIds.includes(preset.boosterId)
        ? preset.boosterId
        : loadout.boosterId,
      weaponId: nextWeaponId,
    });
  };

  const handleEquipPart = (slot: PartSlot, id: string) => {
    soundEngine.playClick();
    const keyMap: Record<PartSlot, keyof LbxLoadout> = {
      head: 'headId',
      torso: 'torsoId',
      arms: 'armsId',
      legs: 'legsId',
      booster: 'boosterId',
    };
    onChangeLoadout({
      ...loadout,
      [keyMap[slot]]: id,
    });
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    setUploading(true);
    try {
      await onUploadCustomModel(files, activeCharacterId);
      soundEngine.playSpecial();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Не удалось загрузить 3D-модель',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleTexturesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    setUploading(true);
    try {
      await onUploadCustomTextures(files, activeCharacterId);
      soundEngine.playSpecial();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Не удалось прикрепить текстуры',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleWeaponSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    setUploading(true);
    try {
      await onUploadCustomWeapon(files, activeCharacterId);
      soundEngine.playSpecial();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Не удалось загрузить модель оружия',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleWeaponTexturesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    setUploading(true);
    try {
      await onUploadCustomWeaponTextures(files, activeCharacterId);
      soundEngine.playSpecial();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Не удалось прикрепить текстуры оружия',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0B101B]">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Top-left compact LBX stats & instant character switcher */}
      <div className="absolute top-20 left-5 z-10 pointer-events-auto bg-[#0B0F17]/90 border border-slate-800 rounded-xl p-4 w-72 max-h-[calc(100vh-14.5rem)] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">Персонаж сборки</span>
          <span className="text-[11px] font-medium text-cyan-400">
            {activeCharacter.role}
          </span>
        </div>

        {/* Quick 1-click character selector */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {LBX_CHARACTERS.map((char) => {
            const unlocked = isCharacterUnlocked(char);
            const active = activeCharacterId === char.id;
            return (
              <button
                key={char.id}
                type="button"
                disabled={!unlocked}
                onClick={() => handleSelectCharacter(char)}
                title={
                  unlocked
                    ? `${char.name} · ${char.role}`
                    : `Откроется в сюжетной кампании`
                }
                className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  active
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : unlocked
                      ? 'bg-[#121927] hover:bg-slate-800 text-slate-300'
                      : 'bg-[#0E131D] text-slate-600 cursor-not-allowed'
                }`}
              >
                {!unlocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
                <span>{char.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800">
          <div className="font-display text-lg font-bold text-slate-100 truncate">
            {loadout.name}
          </div>
          <div className="text-xs text-amber-400 mt-0.5 truncate">
            {currentWeapon.name}
          </div>
        </div>

        <div className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-1.5 text-xs font-mono-num">
          <div className="flex justify-between">
            <span className="text-slate-400">Прочность</span>
            <span className="text-emerald-400 font-semibold">{stats.maxHp} HP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Броня</span>
            <span className="text-slate-200 font-semibold">{stats.armor}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Сила атаки</span>
            <span className="text-amber-400 font-semibold">{stats.attackPower}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Скорость</span>
            <span className="text-cyan-400 font-semibold">{stats.moveSpeed} м/с</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Выносливость</span>
            <span className="text-slate-200 font-semibold">{stats.maxEnergy}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Рывок / Прыжок</span>
            <span className="text-cyan-300 font-semibold">
              {stats.dashSpeed} / {stats.jumpPower} м/с
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Щит</span>
            <span
              className={
                stats.canGuard ? 'text-slate-200 font-semibold' : 'text-rose-400 font-semibold'
              }
            >
              {stats.canGuard ? 'Есть' : 'Нет'}
            </span>
          </div>
        </div>

        {isLevelProgressionCharacter(activeCharacterId) && (() => {
          const prog = getCharacterProgress(characterProgress, activeCharacterId);
          const reqXp = xpRequiredForLevel(prog.level);
          const xpPct = reqXp > 0 ? Math.min(100, Math.round((prog.xp / reqXp) * 100)) : 100;
          const skillEntries = [
            ACHILLES_SKILL_UNLOCKS.lungeR,
            ACHILLES_SKILL_UNLOCKS.thunderE,
            ACHILLES_SKILL_UNLOCKS.cycloneF,
          ];
          return (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-display font-bold text-slate-100">
                  Уровень и навыки
                </span>
                <span className="font-mono-num text-amber-400 font-bold tabular-nums">
                  Ур. {prog.level}
                </span>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono-num text-slate-400 tabular-nums">
                  <span>Опыт обучения</span>
                  <span>{reqXp > 0 ? `${prog.xp} / ${reqXp}` : 'MAX'}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-amber-400 transition-all duration-150"
                    style={{ width: `${xpPct}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                {skillEntries.map((sk) => {
                  const unlocked = prog.level >= sk.unlockLevel;
                  return (
                    <div
                      key={sk.id}
                      className={`rounded-lg px-2.5 py-1.5 border text-[11px] ${
                        unlocked
                          ? 'bg-[#121927] border-slate-700/80 text-slate-200'
                          : 'bg-[#0D121B] border-slate-800/60 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium truncate">
                          <span className="font-mono-num font-bold mr-1" style={{ color: unlocked ? sk.accentHex : '#64748B' }}>
                            [{sk.key}]
                          </span>
                          {sk.name}
                        </span>
                        <span className="font-mono-num text-[10px] shrink-0 tabular-nums">
                          {unlocked ? 'Открыто' : `Ур. ${sk.unlockLevel}`}
                        </span>
                      </div>
                      <div className="font-mono-num text-[10px] text-slate-400 mt-0.5 tabular-nums">
                        {sk.damage} ур. · −{sk.cellDrain} яч. ·{' '}
                        {sk.cooldownSec > 0 ? `КД ${sk.cooldownSec}с` : 'Долгая шкала'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <div className="text-[10px] text-slate-400 mb-1">
                  Быстрый тест уровня
                </div>
                <div className="flex items-center gap-1 font-mono-num">
                  {[0, 5, 10].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        onSetCharacterLevel(activeCharacterId, lvl);
                      }}
                      className={`flex-1 py-1 rounded text-[11px] font-semibold transition-colors tabular-nums ${
                        prog.level === lvl
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      Ур.{lvl}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={prog.level <= 0}
                    onClick={() => {
                      soundEngine.playClick();
                      onSetCharacterLevel(activeCharacterId, prog.level - 1);
                    }}
                    className="px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    disabled={prog.level >= ACHILLES_MAX_LEVEL}
                    onClick={() => {
                      soundEngine.playClick();
                      onSetCharacterLevel(activeCharacterId, prog.level + 1);
                    }}
                    className="px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Top-right Custom 3D Model Upload & Persistence Panel for Active Character */}
      <div className="absolute top-20 right-5 z-10 pointer-events-auto bg-[#0B0F17]/92 border border-slate-800 rounded-xl p-4 w-72 max-h-[calc(100vh-14.5rem)] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-display text-sm font-bold text-slate-100">
              3D-модель {activeCharacter.genitiveName}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
          Выберите один файл (.glb, .fbx, .dae, .obj) или выделите сразу{' '}
          <span className="text-slate-200 font-medium">несколько .dae частей + .png</span>{' '}
          (либо <span className="text-slate-200 font-medium">.zip</span>) для{' '}
          <span className="text-slate-200 font-medium">{activeCharacter.name}</span> — части
          автоматически соберутся в единую модель.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".glb,.gltf,.obj,.fbx,.stl,.dae,.zip,.png,.jpg,.jpeg,.webp,.tga,.bmp,.mtl"
          onChange={handleFileSelected}
          className="hidden"
        />

        <input
          ref={texInputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.tga,.bmp,.mtl"
          onChange={handleTexturesSelected}
          className="hidden"
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => {
            soundEngine.playClick();
            fileInputRef.current?.click();
          }}
          className="mt-3 w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-display font-bold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Upload className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {uploading
              ? 'Сохранение модели...'
              : customModel
                ? `Заменить модель ${activeCharacter.genitiveName}`
                : `Загрузить модель ${activeCharacter.genitiveName}`}
          </span>
        </button>

        {uploadError && (
          <div className="mt-2 text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1.5">
            {uploadError}
          </div>
        )}

        {customModel && (
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {customModel.savedOnServer ? 'Сохранена на сервере' : 'Сохранена в браузере'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono-num truncate mt-0.5">
                  {customModel.filename} · {formatBytes(customModel.size)}
                  {Object.keys(customModel.textures ?? {}).length > 0 &&
                    ` · ${Object.keys(customModel.textures ?? {}).length} текст.`}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="Добавить или обновить PNG/текстуры для этой модели"
                  disabled={uploading}
                  onClick={() => {
                    soundEngine.playClick();
                    texInputRef.current?.click();
                  }}
                  className="px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-medium flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  <span>Текстуры</span>
                </button>
                <button
                  type="button"
                  title="Удалить загруженную модель"
                  onClick={() => {
                    soundEngine.playClick();
                    void onDeleteCustomModel(activeCharacterId);
                  }}
                  className="p-1.5 rounded-md bg-slate-800/80 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-[#121927] p-1 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onToggleUseCustomModel(true);
                }}
                className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors ${
                  useCustomModel
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Своя модель
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onToggleUseCustomModel(false);
                }}
                className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors ${
                  !useCustomModel
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Модульная LBX
              </button>
            </div>

            {useCustomModel && (
              <div className="space-y-2">
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">
                    Оружие модели (привязано к вкладке «Оружие»)
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-[#121927] p-1 rounded-lg">
                    {(
                      [
                        { id: 'auto', label: 'По вкладке' },
                        { id: 'builtin', label: 'Родное' },
                        { id: 'detached', label: 'Без оружия' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playClick();
                          void onChangeWeaponMode(opt.id, activeCharacterId);
                        }}
                        className={`py-1 px-1.5 rounded-md text-[11px] font-medium transition-colors ${
                          (customModel.weaponMode ?? 'auto') === opt.id
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (loadout.weaponId !== 'weapon_rifle') {
                        soundEngine.playSlash(false);
                      }
                      setGuardPreview(false);
                      engineRef.current?.triggerTestAttack();
                    }}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    {loadout.weaponId === 'weapon_rifle'
                      ? 'Тест стрельбы'
                      : 'Тест атаки'}
                  </button>
                  {(loadout.weaponId === 'weapon_lance' ||
                    loadout.weaponId === 'weapon_halberd' ||
                    loadout.weaponId === 'weapon_kodachi' ||
                    loadout.weaponId === 'weapon_hammer') &&
                    stats.canGuard && (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        const next = !guardPreview;
                        setGuardPreview(next);
                        engineRef.current?.setGuardPreview(next);
                      }}
                      className={`py-1.5 px-2.5 rounded-lg font-display font-bold text-[11px] flex items-center justify-center gap-1 transition-colors ${
                        guardPreview
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      {loadout.weaponId === 'weapon_hammer' ||
                      loadout.weaponId === 'weapon_halberd'
                        ? 'Блок'
                        : 'Щит'}
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      void onRotateCustomModel(activeCharacterId);
                    }}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCw className="w-3 h-3" />
                    Поворот 90° ({customModel.yawOffsetDeg}°)
                  </button>
                  {customModel.yawOffsetDeg !== 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        void onResetCustomModelYaw(activeCharacterId);
                      }}
                      className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] font-medium whitespace-nowrap transition-colors"
                    >
                      0°
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    void onTogglePlayAnimation(activeCharacterId);
                  }}
                  className={`w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    customModel.playAnimation
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {customModel.playAnimation ? (
                    <>
                      <Pause className="w-3 h-3" />
                      Анимация файла: Вкл
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      Анимация файла: Выкл
                    </>
                  )}
                </button>

                {/* Separate Custom Weapon Model (e.g. Hunter's rifle) */}
                <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-300">
                      Отдельное 3D-оружие
                    </span>
                    {customModel.customWeapon && (
                      <span className="text-[10px] text-cyan-400">Активно</span>
                    )}
                  </div>

                  <input
                    ref={weaponFileInputRef}
                    type="file"
                    multiple
                    accept=".glb,.gltf,.obj,.fbx,.stl,.dae,.zip,.png,.jpg,.jpeg,.webp,.tga,.bmp,.mtl"
                    onChange={handleWeaponSelected}
                    className="hidden"
                  />
                  <input
                    ref={weaponTexInputRef}
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.tga,.bmp,.mtl"
                    onChange={handleWeaponTexturesSelected}
                    className="hidden"
                  />

                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => {
                      soundEngine.playClick();
                      weaponFileInputRef.current?.click();
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-amber-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {customModel.customWeapon
                        ? 'Заменить 3D-оружие'
                        : 'Загрузить 3D-оружие (.dae / .glb / .zip)'}
                    </span>
                  </button>

                  {customModel.customWeapon && (
                    <div className="space-y-1.5 bg-[#121927] rounded-lg p-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="text-[11px] text-slate-300 font-mono-num truncate">
                          {customModel.customWeapon.filename}
                          {Object.keys(customModel.customWeapon.textures ?? {}).length > 0 &&
                            ` · ${Object.keys(customModel.customWeapon.textures ?? {}).length} текст.`}
                        </div>
                        <button
                          type="button"
                          title="Удалить своё оружие"
                          onClick={() => {
                            soundEngine.playClick();
                            void onDeleteCustomWeapon(activeCharacterId);
                          }}
                          className="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => {
                            soundEngine.playClick();
                            weaponTexInputRef.current?.click();
                          }}
                          className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-medium flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>Текстуры</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playClick();
                            void onRotateCustomWeapon(activeCharacterId);
                          }}
                          className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                          <span>Поворот ({customModel.customWeapon.yawOffsetDeg || 0}°)</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Bottom Customization Dock */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 z-20 transition-transform duration-300 ease-out w-[min(980px,95vw)] ${
          dockCollapsed ? 'bottom-0 translate-y-[calc(100%-38px)]' : 'bottom-4 translate-y-0'
        }`}
      >
        {/* Collapse / Camera bar */}
        <div className="flex items-center justify-between px-3 pb-1.5">
          <div className="flex items-center gap-1.5 bg-[#0B0F17]/90 border border-slate-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleSelectCamera('full')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                camPreset === 'full'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Общий
            </button>
            <button
              type="button"
              onClick={() => handleSelectCamera('torso')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                camPreset === 'torso'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Корпус
            </button>
            <button
              type="button"
              onClick={() => handleSelectCamera('weapon')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                camPreset === 'weapon'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Оружие
            </button>
            <button
              type="button"
              onClick={handleToggleSpin}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                autoSpin
                  ? 'bg-slate-800 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              Поворот
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setDockCollapsed((v) => !v);
            }}
            className="px-3 py-1.5 text-xs font-medium bg-[#0B0F17]/95 border border-slate-700 rounded-lg text-slate-200 hover:text-amber-400 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Открыть сборку
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Свернуть панель
              </>
            )}
          </button>
        </div>

        {/* Main Dock Panel */}
        <div className="bg-[#0B0F17]/95 border border-slate-800 rounded-2xl p-4 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
            <div className="flex flex-wrap items-center gap-1 bg-[#121927] p-1 rounded-lg">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setActiveTab(t.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    activeTab === t.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {t.id === 'character' && <User className="w-3 h-3" />}
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onStartQuickBattle();
              }}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Swords className="w-3.5 h-3.5" />
              Тестовый бой
            </button>
          </div>

          {/* Character / Part / Weapon / Paint Selection Grid */}
          {activeTab === 'character' ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {LBX_CHARACTERS.map((char) => {
                const unlocked = isCharacterUnlocked(char);
                const selected = activeCharacterId === char.id;
                const hasModel = Boolean(customModels[char.id]);
                const sigWeapon = getWeaponById(char.loadout.weaponId);

                return (
                  <button
                    key={char.id}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => handleSelectCharacter(char)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-[#172235] border-amber-500 text-white'
                        : unlocked
                          ? 'bg-[#111723] border-slate-800 hover:border-slate-700 text-slate-200'
                          : 'bg-[#0D121B] border-slate-800/50 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[11px] font-medium truncate"
                        style={{ color: unlocked ? char.accentHex : '#64748B' }}
                      >
                        {char.role}
                      </span>
                      {!unlocked ? (
                        <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      ) : hasModel ? (
                        <Box className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : null}
                    </div>
                    <div className="font-display text-sm font-semibold mt-1 truncate">
                      {char.name}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {sigWeapon.shortLabel}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 truncate">
                      {hasModel
                        ? '3D-модель загружена'
                        : unlocked
                          ? 'Модульный каркас'
                          : 'Открыть в кампании'}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : activeTab === 'weapon' ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {LBX_WEAPONS.map((w) => {
                const unlocked = unlockedPartIds.includes(w.id);
                const equipped = loadout.weaponId === w.id;
                const donorCharId = getWeaponDonorCharacterId(w.id);
                const donorModel = donorCharId ? customModels[donorCharId] : null;
                const donorName = donorCharId ? getCharacterById(donorCharId).name : '';
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => {
                      soundEngine.playClick();
                      onChangeLoadout({ ...loadout, weaponId: w.id });
                    }}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      equipped
                        ? 'bg-[#172235] border-amber-500 text-white'
                        : unlocked
                          ? 'bg-[#111723] border-slate-800 hover:border-slate-700 text-slate-200'
                          : 'bg-[#0D121B] border-slate-800/50 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono-num text-amber-400">
                        Урон {w.damage}
                      </span>
                      {!unlocked ? (
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                      ) : donorModel ? (
                        <Box className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      ) : null}
                    </div>
                    <div className="font-display text-sm font-semibold mt-1 truncate">
                      {w.shortLabel}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {w.specialName}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 truncate">
                      {donorModel ? `3D-модель: ${donorName}` : 'Базовая 3D-модель'}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : activeTab === 'paint' ? (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              {LBX_PAINTS.map((p) => {
                const equipped = loadout.paintId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      onChangeLoadout({ ...loadout, paintId: p.id });
                    }}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      equipped
                        ? 'bg-[#172235] border-amber-500 text-white'
                        : 'bg-[#111723] border-slate-800 hover:border-slate-700 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="w-4 h-4 rounded-sm border border-white/20"
                        style={{ backgroundColor: p.primary }}
                      />
                      <span
                        className="w-4 h-4 rounded-sm border border-white/20"
                        style={{ backgroundColor: p.secondary }}
                      />
                      <span
                        className="w-4 h-4 rounded-sm border border-white/20"
                        style={{ backgroundColor: p.accent }}
                      />
                    </div>
                    <div className="font-display text-xs font-semibold truncate">
                      {p.name}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {getPartsBySlot(activeTab).map((part) => {
                const unlocked = unlockedPartIds.includes(part.id);
                const equippedId =
                  activeTab === 'head'
                    ? loadout.headId
                    : activeTab === 'torso'
                      ? loadout.torsoId
                      : activeTab === 'arms'
                        ? loadout.armsId
                        : activeTab === 'legs'
                          ? loadout.legsId
                          : loadout.boosterId;
                const equipped = equippedId === part.id;

                return (
                  <button
                    key={part.id}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => handleEquipPart(activeTab, part.id)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      equipped
                        ? 'bg-[#172235] border-amber-500 text-white'
                        : unlocked
                          ? 'bg-[#111723] border-slate-800 hover:border-slate-700 text-slate-200'
                          : 'bg-[#0D121B] border-slate-800/50 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] text-cyan-400 truncate">
                        {part.series}
                      </span>
                      {!unlocked && <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                    </div>
                    <div className="font-display text-sm font-semibold mt-1 truncate">
                      {part.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono-num mt-1">
                      +{part.hpBonus} HP · +{part.attackBonus} АТК
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
