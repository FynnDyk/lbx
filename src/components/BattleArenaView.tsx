import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { Lock } from 'lucide-react';
import { getWeaponById } from '../game/catalog';
import { LbxCombatEngine } from '../game/combatEngine';
import { CustomModelAsset } from '../game/customModelStorage';
import { MAX_EXPLOSION_CELLS } from '../game/progression';
import { soundEngine } from '../game/sound';
import {
  AiPersonality,
  AiTacticalState,
  ArenaId,
  BattleHudSnapshot,
  BattleSkillSlotHud,
  LbxLoadout,
  ModelStyle,
  StoryChapter,
} from '../game/types';

export interface BattleFinishProgress {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  newlyUnlockedSkills: string[];
}

interface BattleArenaViewProps {
  playerLoadout: LbxLoadout;
  playerLevel?: number;
  playerCustomModel?: CustomModelAsset | null;
  enemyName: string;
  enemyLoadout: LbxLoadout;
  enemyCustomModel?: CustomModelAsset | null;
  customModels?: Partial<Record<ModelStyle, CustomModelAsset>>;
  arenaId: ArenaId;
  aiPersonality: AiPersonality;
  storyChapter: StoryChapter | null;
  mouseSensitivity: number;
  onChangeMouseSensitivity: (val: number) => void;
  onExitToMenu: () => void;
  onOpenGarage: () => void;
  onVictory: (chapter: StoryChapter | null) => void;
  onBattleFinish?: (
    outcome: 'victory' | 'defeat',
    snap: BattleHudSnapshot,
    chapter: StoryChapter | null,
  ) => BattleFinishProgress | null;
  onNextChapter?: (nextChapterId: string) => void;
  hasNextChapter?: boolean;
}

const AI_STATE_LABELS: Record<AiTacticalState, string> = {
  APPROACH: 'Сближение',
  FLANK: 'Фланговый обход',
  COMBO: 'Серия ударов',
  SNIPE: 'Прицельный огонь',
  GUARD: 'Глухая оборона',
  EVADE: 'Уклонение рывком',
  RETREAT: 'Тактический отход',
  SPECIAL: 'Экстра-приём!',
};

export const BattleArenaView: React.FC<BattleArenaViewProps> = ({
  playerLoadout,
  playerLevel = 0,
  playerCustomModel,
  enemyName,
  enemyLoadout,
  enemyCustomModel,
  customModels,
  arenaId,
  aiPersonality,
  storyChapter,
  mouseSensitivity,
  onChangeMouseSensitivity,
  onExitToMenu,
  onOpenGarage,
  onVictory,
  onBattleFinish,
  onNextChapter,
  hasNextChapter,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<LbxCombatEngine | null>(null);

  const [hud, setHud] = useState<BattleHudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(soundEngine.muted);
  const [resultModal, setResultModal] = useState<{
    outcome: 'victory' | 'defeat';
    snapshot: BattleHudSnapshot;
    progression: BattleFinishProgress | null;
  } | null>(null);
  const [battleKey, setBattleKey] = useState(0);

  const playerWeapon = getWeaponById(playerLoadout.weaponId);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    setResultModal(null);
    setPaused(false);

    const engine = new LbxCombatEngine(
      el,
      playerLoadout,
      enemyLoadout,
      enemyName,
      arenaId,
      aiPersonality,
      {
        onHudUpdate: (snap) => {
          setHud(snap);
        },
        onBattleEnd: (outcome, snap) => {
          let progression: BattleFinishProgress | null = null;
          if (onBattleFinish) {
            progression = onBattleFinish(outcome, snap, storyChapter);
          } else if (outcome === 'victory') {
            onVictory(storyChapter);
          }
          setResultModal({ outcome, snapshot: snap, progression });
        },
        onRequestPause: () => {
          setPaused((prev) => {
            const next = !prev;
            engineRef.current?.setPaused(next);
            return next;
          });
        },
      },
      playerCustomModel,
      mouseSensitivity,
      enemyCustomModel,
      customModels,
      playerLevel,
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleKey, arenaId, enemyName, playerLoadout, playerLevel, playerCustomModel, enemyLoadout, enemyCustomModel, customModels, aiPersonality]);

  useEffect(() => {
    engineRef.current?.setMouseSensitivity(mouseSensitivity);
  }, [mouseSensitivity]);

  const togglePause = () => {
    soundEngine.playClick();
    const next = !paused;
    setPaused(next);
    engineRef.current?.setPaused(next);
    if (!next) {
      engineRef.current?.requestPointerLock();
    }
  };

  const toggleMute = () => {
    soundEngine.muted = !soundEngine.muted;
    setMuted(soundEngine.muted);
    if (!soundEngine.muted) soundEngine.playClick();
  };

  const handleRestart = () => {
    soundEngine.playClick();
    setBattleKey((k) => k + 1);
  };

  const pHpPct = hud ? Math.max(0, (hud.player.hp / hud.player.maxHp) * 100) : 100;
  const pEnPct = hud
    ? Math.max(0, (hud.player.energy / hud.player.maxEnergy) * 100)
    : 100;
  const eHpPct = hud ? Math.max(0, (hud.enemy.hp / hud.enemy.maxHp) * 100) : 100;
  const eEnPct = hud
    ? Math.max(0, (hud.enemy.energy / hud.enemy.maxEnergy) * 100)
    : 100;

  const isActiveCombat = !paused && !resultModal;

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-[#0B0F17] ${
        isActiveCombat ? 'cursor-none' : ''
      }`}
    >
      {/* Isolated 3D WebGL Canvas */}
      <div
        ref={mountRef}
        className={`absolute inset-0 w-full h-full ${isActiveCombat ? 'cursor-none' : ''}`}
      />

      {/* Centered Aim Reticle or Realistic FFP Mil-Dot Sniper ADS Scope Overlay */}
      {isActiveCombat && hud?.player.isAiming ? (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center overflow-hidden">
          {/* Optical eyepiece vignette */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, rgba(16, 185, 129, 0.04) 0%, rgba(15, 23, 42, 0.06) 24%, rgba(4, 7, 13, 0.55) 33%, rgba(2, 4, 8, 0.94) 44%, #020408 62%)',
            }}
          />

          {/* Machined anodized scope tube & optical glass */}
          <div className="relative w-[min(560px,80vh,88vw)] h-[min(560px,80vh,88vw)] rounded-full flex items-center justify-center">
            {/* Knurled elevation & windage turret indicators */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-3 rounded-t-md bg-[#111827] border border-slate-700/90 flex items-center justify-center gap-1">
              <span className="w-1 h-1.5 bg-slate-500/70 rounded-xs" />
              <span className="w-2 h-1.5 bg-amber-400/80 rounded-xs" />
              <span className="w-1 h-1.5 bg-slate-500/70 rounded-xs" />
            </div>
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-3 h-16 rounded-r-md bg-[#111827] border border-slate-700/90 flex flex-col items-center justify-center gap-1">
              <span className="w-1.5 h-1 bg-slate-500/70 rounded-xs" />
              <span className="w-1.5 h-2 bg-cyan-400/80 rounded-xs" />
              <span className="w-1.5 h-1 bg-slate-500/70 rounded-xs" />
            </div>

            {/* Scope tube metallic rim & inner optical bevel */}
            <div className="absolute inset-0 rounded-full border-[10px] border-[#0A0E17] shadow-[inset_0_0_38px_rgba(0,0,0,0.88),0_0_0_2px_rgba(148,163,184,0.18)]" />
            <div className="absolute inset-[10px] rounded-full border border-slate-600/35" />
            <div
              className="absolute inset-[12px] rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 32% 28%, rgba(56, 189, 248, 0.08) 0%, rgba(16, 185, 129, 0.03) 34%, transparent 64%), linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 28%, transparent 76%, rgba(56,189,248,0.05) 100%)',
              }}
            />

            {/* Precision FFP Mil-Dot + BDC Etched Reticle */}
            <svg
              viewBox="0 0 400 400"
              className="relative w-full h-full p-[12px]"
              aria-hidden="true"
            >
              {/* Outer concentric subtension ring */}
              <circle
                cx="200"
                cy="200"
                r="168"
                fill="none"
                stroke="rgba(226, 232, 240, 0.14)"
                strokeWidth="0.75"
                strokeDasharray="3 7"
              />

              {/* Heavy tapered outer duplex posts */}
              <path
                d="M200 18 L200 72 M200 328 L200 382 M18 200 L72 200 M328 200 L382 200"
                stroke="rgba(15, 23, 42, 0.92)"
                strokeWidth="4.2"
                strokeLinecap="butt"
              />
              <path
                d="M200 18 L200 72 M200 328 L200 382 M18 200 L72 200 M328 200 L382 200"
                stroke="rgba(203, 213, 225, 0.5)"
                strokeWidth="1.2"
              />

              {/* Fine inner etched stadia crosshair */}
              <line x1="72" y1="200" x2="188" y2="200" stroke="rgba(226, 232, 240, 0.72)" strokeWidth="0.9" />
              <line x1="212" y1="200" x2="328" y2="200" stroke="rgba(226, 232, 240, 0.72)" strokeWidth="0.9" />
              <line x1="200" y1="72" x2="200" y2="188" stroke="rgba(226, 232, 240, 0.72)" strokeWidth="0.9" />
              <line x1="200" y1="212" x2="200" y2="328" stroke="rgba(226, 232, 240, 0.72)" strokeWidth="0.9" />

              {/* Mil-dot ticks along horizontal & vertical axes */}
              {[-90, -75, -60, -45, -30, -15, 15, 30, 45, 60, 75, 90].map((offset) => {
                const isMajor = Math.abs(offset) % 30 === 0;
                const tickHalf = isMajor ? 5 : 2.8;
                return (
                  <g key={offset} stroke="rgba(226, 232, 240, 0.8)" strokeWidth={isMajor ? '1.05' : '0.75'}>
                    <line x1={200 + offset} y1={200 - tickHalf} x2={200 + offset} y2={200 + tickHalf} />
                    <line x1={200 - tickHalf} y1={200 + offset} x2={200 + tickHalf} y2={200 + offset} />
                  </g>
                );
              })}

              {/* BDC Elevation Drop Holdover Stadia (2, 4, 6) */}
              {[
                { y: 224, width: 12, label: '2' },
                { y: 248, width: 18, label: '4' },
                { y: 274, width: 24, label: '6' },
              ].map((bdc) => (
                <g key={bdc.label}>
                  <line
                    x1={200 - bdc.width}
                    y1={bdc.y}
                    x2={200 + bdc.width}
                    y2={bdc.y}
                    stroke="rgba(248, 250, 252, 0.68)"
                    strokeWidth="0.9"
                  />
                  <text
                    x={200 + bdc.width + 5}
                    y={bdc.y + 2.5}
                    fill="rgba(203, 213, 225, 0.75)"
                    fontSize="7.5"
                    fontFamily="monospace"
                  >
                    {bdc.label}
                  </text>
                </g>
              ))}

              {/* Stadiametric Rangefinder Curve (bottom-left quadrant, 1.0m LBX silhouette scale) */}
              <g opacity="0.72">
                <line x1="78" y1="292" x2="148" y2="292" stroke="rgba(203, 213, 225, 0.7)" strokeWidth="0.85" />
                <path
                  d="M 80 264 Q 108 286 146 289"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.78)"
                  strokeWidth="1"
                />
                <text x="80" y="302" fill="rgba(148, 163, 184, 0.85)" fontSize="6.5" fontFamily="monospace">
                  10M 20M 40M
                </text>
              </g>

              {/* Center Illuminated Locking Brackets & Micro Aiming Dot */}
              <path
                d="M 192 200 L 196 200 M 204 200 L 208 200 M 200 192 L 200 196 M 200 204 L 200 208"
                stroke={hud.targetInReticle ? '#34D399' : '#38BDF8'}
                strokeWidth="1.3"
              />
              <circle
                cx="200"
                cy="200"
                r={hud.targetInReticle ? 2.4 : 1.7}
                fill={hud.targetInReticle ? '#FBBF24' : '#38BDF8'}
              />
              {hud.targetInReticle && (
                <circle
                  cx="200"
                  cy="200"
                  r="11"
                  fill="none"
                  stroke="rgba(52, 211, 153, 0.78)"
                  strokeWidth="1.1"
                  strokeDasharray="4 3"
                />
              )}
            </svg>

            {/* Top Optical Magnification Readout */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 font-mono-num text-[11px] tracking-widest uppercase text-cyan-300/90 tabular-nums">
              <span>×2.7 · 1-Е ЛИЦО</span>
              <span className="text-slate-500">|</span>
              <span className={hud.targetInReticle ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                {hud.targetInReticle ? 'ЦЕЛЬ В ЗАХВАТЕ' : 'ПОИСК'}
              </span>
            </div>

            {/* Bottom Integrated Ballistic Telemetry Bar */}
            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-4 px-3.5 py-1 rounded bg-[#070B12]/78 border border-slate-700/70 font-mono-num text-[11px] text-slate-200 tabular-nums whitespace-nowrap">
              <div>
                <span className="text-slate-400 mr-1">ДИСТ:</span>
                <span className="text-cyan-300 font-bold">
                  {(hud.targetDistance ?? 0).toFixed(1)} м
                </span>
              </div>
              <div className="w-px h-3 bg-slate-700" />
              <div>
                <span className="text-slate-400 mr-1">УГОЛ:</span>
                <span className="text-slate-100">
                  {(hud.aimPitchDeg ?? 0) >= 0 ? '+' : ''}
                  {(hud.aimPitchDeg ?? 0).toFixed(1)}°
                </span>
              </div>
              <div className="w-px h-3 bg-slate-700" />
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">ЗАРЯД</span>
                <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 ${
                      (hud.shotReadyPct ?? 100) >= 100 ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${hud.shotReadyPct ?? 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        isActiveCombat &&
        !hud?.specialCutIn && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="relative w-6 h-6 flex items-center justify-center opacity-80">
              <div className="w-1 h-1 rounded-full bg-cyan-300" />
              <div className="absolute top-0 w-px h-1.5 bg-cyan-300/80" />
              <div className="absolute bottom-0 w-px h-1.5 bg-cyan-300/80" />
              <div className="absolute left-0 h-px w-1.5 bg-cyan-300/80" />
              <div className="absolute right-0 h-px w-1.5 bg-cyan-300/80" />
            </div>
          </div>
        )
      )}

      {/* LBX Hissatsu Anime Cut-In Overlay (Letterbox + 4-Beat Storm Title Reveal) */}
      {isActiveCombat && hud?.specialCutIn && (() => {
        const hex = hud.specialCutIn.accentHex.toLowerCase();
        const isOrangeCutIn = hex === '#f97316';
        const isTealCutIn = hex === '#2dd4bf';
        return (
          <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
            {/* Energy edge vignette & burst */}
            <div
              className="absolute inset-0 transition-opacity duration-75"
              style={{
                background:
                  hud.specialCutIn.progress >= 0.88
                    ? isOrangeCutIn
                      ? 'radial-gradient(circle at center, rgba(255, 247, 237, 0.84) 10%, rgba(251, 146, 60, 0.74) 55%, rgba(234, 88, 12, 0.88) 100%)'
                      : isTealCutIn
                        ? 'radial-gradient(circle at center, rgba(204, 251, 241, 0.82) 10%, rgba(45, 212, 191, 0.72) 55%, rgba(13, 148, 136, 0.88) 100%)'
                        : 'radial-gradient(circle at center, rgba(224, 242, 254, 0.82) 10%, rgba(56, 189, 248, 0.72) 55%, rgba(14, 165, 233, 0.88) 100%)'
                    : isOrangeCutIn
                      ? 'radial-gradient(circle at center, rgba(249, 115, 22, 0.05) 30%, rgba(234, 88, 12, 0.28) 74%, rgba(15, 6, 2, 0.78) 100%)'
                      : isTealCutIn
                        ? 'radial-gradient(circle at center, rgba(45, 212, 191, 0.05) 30%, rgba(13, 148, 136, 0.26) 74%, rgba(2, 16, 18, 0.78) 100%)'
                        : 'radial-gradient(circle at center, rgba(56, 189, 248, 0.04) 30%, rgba(14, 165, 233, 0.24) 74%, rgba(2, 6, 23, 0.76) 100%)',
                opacity:
                  hud.specialCutIn.progress >= 0.88
                    ? Math.min(0.85, (hud.specialCutIn.progress - 0.88) / 0.12)
                    : 1,
              }}
            />

            {/* Top & Bottom Cinema Letterbox Bars */}
            <div
              className={`absolute top-0 inset-x-0 h-[7.5vh] bg-black/95 border-b ${
                isOrangeCutIn
                  ? 'border-orange-400/80 shadow-[0_6px_28px_rgba(249,115,22,0.45)]'
                  : isTealCutIn
                    ? 'border-teal-400/80 shadow-[0_6px_28px_rgba(45,212,191,0.42)]'
                    : 'border-cyan-400/75 shadow-[0_6px_28px_rgba(56,189,248,0.38)]'
              }`}
            />
            <div
              className={`absolute bottom-0 inset-x-0 h-[7.5vh] bg-black/95 border-t ${
                isOrangeCutIn
                  ? 'border-orange-400/80 shadow-[0_-6px_28px_rgba(249,115,22,0.45)]'
                  : isTealCutIn
                    ? 'border-teal-400/80 shadow-[0_-6px_28px_rgba(45,212,191,0.42)]'
                    : 'border-cyan-400/75 shadow-[0_-6px_28px_rgba(56,189,248,0.38)]'
              }`}
            />

            {/* Iconic Lower-Third Bold Anime Title Slam */}
            {(isTealCutIn ? hud.specialCutIn.progress >= 0.12 : hud.specialCutIn.progress >= 0.58) &&
              hud.specialCutIn.progress < 0.94 && (
              <div className="absolute inset-x-0 bottom-[10.5vh] flex flex-col items-center px-4">
                <div
                  className="-skew-x-12 font-display text-3xl sm:text-5xl font-black tracking-[0.12em] text-white uppercase text-center"
                  style={{
                    WebkitTextStroke: '2px #040914',
                    paintOrder: 'stroke fill',
                    textShadow: isOrangeCutIn
                      ? '0 4px 0 #040914, 0 0 22px rgba(249, 115, 22, 0.98), 0 0 42px rgba(234, 88, 12, 0.82)'
                      : isTealCutIn
                        ? '0 4px 0 #040914, 0 0 22px rgba(45, 212, 191, 0.95), 0 0 42px rgba(13, 148, 136, 0.8)'
                        : '0 4px 0 #040914, 0 0 22px rgba(56, 189, 248, 0.95), 0 0 42px rgba(14, 165, 233, 0.75)',
                  }}
                >
                  {hud.specialCutIn.title}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Perfect Dodge Slow-Motion Vignette & Counterattack Prompt */}
      {isActiveCombat && hud?.dodgeSlowMo && !hud?.specialCutIn && (
        <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, rgba(56, 189, 248, 0.0) 42%, rgba(14, 165, 233, 0.22) 78%, rgba(2, 6, 23, 0.68) 100%)',
            }}
          />
          <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div className="bg-[#060B14]/92 border-2 border-cyan-400/85 rounded-xl px-6 py-2.5 text-center shadow-[0_0_28px_rgba(56,189,248,0.38)]">
              <div className="flex items-center justify-center gap-2 font-mono-num text-[11px] font-bold tracking-[0.18em] text-cyan-300 uppercase">
                <span>ЗАМЕДЛЕНИЕ ВРЕМЕНИ</span>
                <span className="text-slate-500">·</span>
                <span className="text-amber-300 tabular-nums">
                  {hud.dodgeSlowMo.remaining.toFixed(1)}с
                </span>
              </div>
              <div className="font-display text-base sm:text-lg font-black tracking-wide text-white mt-0.5">
                НАЧАЛО КОНТРАТАКИ — ЖМИТЕ <span className="text-amber-400">ЛКМ</span> ИЛИ{' '}
                <span className="text-amber-400">J</span>!
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (hud.dodgeSlowMo.remaining / Math.max(0.1, hud.dodgeSlowMo.duration)) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Battle HUD (Solid translucent dark obsidian, zero backdrop-blur) */}
      {hud && (
        <div className="absolute top-4 inset-x-4 md:inset-x-6 z-10 pointer-events-none flex items-start justify-between gap-4">
          {/* Player Bar */}
          <div className="w-[min(340px,42vw)] bg-[#0B0F17]/90 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-display text-sm font-bold text-slate-100 truncate">
                  {hud.player.lbxName}
                </span>
                {hud.player.level !== undefined && (
                  <span className="font-mono-num text-[11px] font-semibold text-amber-400 shrink-0 tabular-nums">
                    Ур. {hud.player.level}
                  </span>
                )}
              </div>
              <span className="font-mono-num text-xs text-emerald-400 shrink-0 tabular-nums">
                {hud.player.hp} / {hud.player.maxHp}
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-emerald-500 transition-all duration-100"
                style={{ width: `${pHpPct}%` }}
              />
            </div>

            {(() => {
              const totalCells = hud.player.maxExplosionCells ?? MAX_EXPLOSION_CELLS;
              const cells = Math.max(0, Math.min(totalCells, hud.player.explosionCells ?? totalCells));
              const isCritical = cells <= 2;
              const isWarning = cells <= 4;
              return (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] font-mono-num">
                    <span className={isCritical ? 'text-rose-400 font-semibold animate-pulse' : isWarning ? 'text-orange-400' : 'text-amber-300/90'}>
                      До взрыва
                    </span>
                    <span className={`tabular-nums ${isCritical ? 'text-rose-400 font-bold' : isWarning ? 'text-orange-400' : 'text-amber-300/90'}`}>
                      {cells} / {totalCells}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {Array.from({ length: totalCells }).map((_, idx) => {
                      const active = idx < cells;
                      return (
                        <span
                          key={idx}
                          className={`w-3 h-3 rounded-full border transition-all duration-150 ${
                            active
                              ? isCritical
                                ? 'bg-rose-500 border-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.75)] animate-pulse'
                                : isWarning
                                  ? 'bg-orange-400 border-orange-200 shadow-[0_0_6px_rgba(251,146,60,0.5)]'
                                  : 'bg-amber-400 border-amber-200 shadow-[0_0_6px_rgba(251,191,36,0.45)]'
                              : 'bg-slate-900/90 border-slate-700/70'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className={`mt-2 ${hud.showSpecialGauge === false ? '' : 'grid grid-cols-2 gap-2'}`}>
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 font-mono-num">
                  <span>
                    Буст
                    {(hud.player.dashCooldown ?? 0) > 0 && (
                      <span className="ml-1.5 text-amber-400">
                        · КД {(hud.player.dashCooldown ?? 0).toFixed(1)}с
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{hud.player.energy}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                  <div
                    className="h-full bg-cyan-400"
                    style={{ width: `${pEnPct}%` }}
                  />
                </div>
              </div>
              {hud.showSpecialGauge !== false && (
                <div>
                  <div className="flex justify-between text-[11px] text-teal-300 font-mono-num">
                    <span>{hud.specialGaugeLabel ?? 'Экстра'}</span>
                    <span className="tabular-nums">{hud.player.special}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                    <div
                      className={`h-full transition-all duration-100 ${
                        hud.specialGaugeLabel?.includes('Вихрь') ? 'bg-teal-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${hud.player.special}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono-num">
              <span className="text-slate-400">
                Уклон <strong className="text-slate-200">Z / X / C</strong>
              </span>
              {(hud.player.dodgePenaltyTimer ?? 0) > 0 ? (
                <span className="text-rose-400 font-semibold tabular-nums">
                  Задержка {(hud.player.dodgePenaltyTimer ?? 0).toFixed(1)}с
                </span>
              ) : (hud.player.dodgeCooldown ?? 0) > 0 ? (
                <span className="text-amber-400 tabular-nums">
                  КД {(hud.player.dodgeCooldown ?? 0).toFixed(1)}с
                </span>
              ) : (
                <span className="text-cyan-400">Готов</span>
              )}
            </div>

            {hud.player.comboCount > 1 && (
              <div className="mt-1.5 text-xs font-display font-bold text-amber-400">
                Комбо ×{hud.player.comboCount}
              </div>
            )}
          </div>

          {/* Center Timer & Quick Menu Buttons */}
          <div className="pointer-events-auto flex flex-col items-center gap-2">
            <div className="bg-[#0B0F17]/90 border border-slate-800 rounded-xl px-4 py-1.5 flex items-center gap-3">
              <span className="font-mono-num text-sm font-bold text-slate-100 tabular-nums">
                {Math.floor(hud.elapsedTime / 60)}:
                {String(Math.floor(hud.elapsedTime % 60)).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={toggleMute}
                aria-label="Звук"
                className="text-slate-300 hover:text-amber-400 transition-colors"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={togglePause}
                aria-label="Пауза"
                className="text-slate-300 hover:text-amber-400 transition-colors"
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            </div>

            {hud.bannerText && !hud.specialCutIn && (
              <div className="bg-[#0B0F17]/95 border border-amber-500/70 rounded-lg px-4 py-1.5 font-display text-xs md:text-sm font-bold text-amber-400 tracking-wide whitespace-nowrap">
                {hud.bannerText}
              </div>
            )}
          </div>

          {/* Enemy Bar */}
          <div className="w-[min(340px,42vw)] bg-[#0B0F17]/90 border border-slate-800 rounded-xl p-3.5 text-right">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono-num text-xs text-rose-400 shrink-0 tabular-nums">
                {hud.enemy.hp} / {hud.enemy.maxHp}
              </span>
              <span className="font-display text-sm font-bold text-slate-100 truncate">
                {hud.enemy.name} · {hud.enemy.lbxName}
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-rose-500 ml-auto transition-all duration-100"
                style={{ width: `${eHpPct}%` }}
              />
            </div>

            {(() => {
              const totalCells = hud.enemy.maxExplosionCells ?? MAX_EXPLOSION_CELLS;
              const cells = Math.max(0, Math.min(totalCells, hud.enemy.explosionCells ?? totalCells));
              const isCritical = cells <= 2;
              const isWarning = cells <= 4;
              return (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] font-mono-num">
                    <span className={`tabular-nums ${isCritical ? 'text-rose-400 font-bold' : isWarning ? 'text-orange-400' : 'text-amber-300/90'}`}>
                      {cells} / {totalCells}
                    </span>
                    <span className={isCritical ? 'text-rose-400 font-semibold animate-pulse' : isWarning ? 'text-orange-400' : 'text-amber-300/90'}>
                      До взрыва
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-1">
                    {Array.from({ length: totalCells }).map((_, idx) => {
                      const active = totalCells - 1 - idx < cells;
                      return (
                        <span
                          key={idx}
                          className={`w-3 h-3 rounded-full border transition-all duration-150 ${
                            active
                              ? isCritical
                                ? 'bg-rose-500 border-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.75)] animate-pulse'
                                : isWarning
                                  ? 'bg-orange-400 border-orange-200 shadow-[0_0_6px_rgba(251,146,60,0.5)]'
                                  : 'bg-amber-400 border-amber-200 shadow-[0_0_6px_rgba(251,191,36,0.45)]'
                              : 'bg-slate-900/90 border-slate-700/70'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
              <span className="text-cyan-400 truncate">
                ИИ: {hud.enemy.aiState ? AI_STATE_LABELS[hud.enemy.aiState] : 'Оценка'}
              </span>
              <div className="w-24">
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 ml-auto"
                    style={{ width: `${eEnPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Compact Action & Controls Bar */}
      <div className="absolute bottom-4 inset-x-4 z-10 pointer-events-none flex flex-wrap items-end justify-between gap-3">
        <div className="bg-[#0B0F17]/90 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-300 hidden sm:flex items-center gap-4">
          <span>
            <strong className="text-white font-mono-num">Мышь</strong> Камера
          </span>
          <span>
            <strong className="text-white font-mono-num">WASD</strong> Движение
          </span>
          <span>
            <strong className="text-white font-mono-num">ЛКМ / J</strong> Атака
          </span>
          {hud?.player.canGuard !== false ? (
            <span>
              <strong className="text-white font-mono-num">ПКМ / K</strong> Блок
            </span>
          ) : playerWeapon.isRanged ? (
            <span>
              <strong className="text-cyan-300 font-mono-num">ПКМ / K</strong> Прицел
            </span>
          ) : (
            <span className="text-slate-500">Без щита</span>
          )}
          <span>
            <strong className="text-white font-mono-num">Space</strong> Прыжок
          </span>
          <span>
            <strong className="text-white font-mono-num">Shift</strong> Рывок
          </span>
          <span>
            <strong className="text-cyan-300 font-mono-num">Z / X / C</strong> Уклон
          </span>
          {hud?.player.level !== undefined ? (
            <>
              <span>
                <strong className="text-sky-400 font-mono-num">R</strong> Выпад
              </span>
              {hud.player.level >= 5 && (
                <span>
                  <strong className="text-blue-400 font-mono-num">E</strong> Удар грозы
                </span>
              )}
              {hud.player.level >= 10 && (
                <span>
                  <strong className="text-teal-300 font-mono-num">F</strong> Вихрь
                </span>
              )}
            </>
          ) : (
            <span>
              <strong className="text-amber-400 font-mono-num">E</strong> Экстра
            </span>
          )}
          <span>
            <strong className="text-cyan-400 font-mono-num">Tab</strong> Фиксация
          </span>
          <span>
            <strong className="text-slate-200 font-mono-num">Esc</strong> Пауза
          </span>
        </div>

        {/* Interactive On-Screen Combat Controls (useful for mouse/touch & Skill activation) */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => engineRef.current?.toggleLockOn()}
            className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              hud?.lockOnActive
                ? 'bg-[#172235] border-cyan-500 text-cyan-300'
                : 'bg-[#0B0F17]/90 border-slate-700 text-slate-300'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            {hud?.lockOnActive ? 'Фиксация' : 'Свободная'}
          </button>

          {hud?.player.canGuard !== false ? (
            <button
              type="button"
              onMouseDown={() => engineRef.current?.triggerPlayerGuard(true)}
              onMouseUp={() => engineRef.current?.triggerPlayerGuard(false)}
              onMouseLeave={() => engineRef.current?.triggerPlayerGuard(false)}
              onTouchStart={() => engineRef.current?.triggerPlayerGuard(true)}
              onTouchEnd={() => engineRef.current?.triggerPlayerGuard(false)}
              className="px-3 py-2 rounded-lg bg-[#0B0F17]/90 border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              Блок
            </button>
          ) : (
            playerWeapon.isRanged && (
              <button
                type="button"
                onMouseDown={() => engineRef.current?.triggerPlayerGuard(true)}
                onMouseUp={() => engineRef.current?.triggerPlayerGuard(false)}
                onMouseLeave={() => engineRef.current?.triggerPlayerGuard(false)}
                onTouchStart={() => engineRef.current?.triggerPlayerGuard(true)}
                onTouchEnd={() => engineRef.current?.triggerPlayerGuard(false)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  hud?.player.isAiming
                    ? 'bg-[#172235] border-cyan-400 text-cyan-300'
                    : 'bg-[#0B0F17]/90 border-slate-700 hover:border-slate-500 text-slate-200'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Прицел
              </button>
            )
          )}

          {(hud?.playerSkills ?? []).map((slot: BattleSkillSlotHud) => {
            const onClick = () => {
              if (slot.id === 'lunge_r') engineRef.current?.triggerPlayerSkillR();
              else if (slot.id === 'thunder_e') engineRef.current?.triggerPlayerSkillE();
              else if (slot.id === 'cyclone_f') engineRef.current?.triggerPlayerSkillF();
              else engineRef.current?.triggerPlayerSpecial();
            };

            const statusLabel = !slot.unlocked
              ? `Ур. ${slot.unlockLevel}`
              : slot.mode === 'cooldown'
                ? (slot.cooldownRemaining ?? 0) > 0
                  ? `${(slot.cooldownRemaining ?? 0).toFixed(0)}с`
                  : 'Готов'
                : `${slot.gaugePct ?? 0}%`;

            return (
              <button
                key={slot.id}
                type="button"
                disabled={!slot.ready}
                onClick={onClick}
                className={`px-3 py-2 rounded-lg border font-display font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  !slot.unlocked
                    ? 'bg-[#0B0F17]/80 border-slate-800/80 text-slate-600 cursor-not-allowed'
                    : slot.ready
                      ? 'text-slate-950 border-transparent hover:brightness-110'
                      : 'bg-[#0B0F17]/90 border-slate-800 text-slate-400 cursor-not-allowed'
                }`}
                style={slot.unlocked && slot.ready ? { backgroundColor: slot.accentHex } : undefined}
              >
                {!slot.unlocked ? (
                  <Lock className="w-3 h-3 shrink-0" />
                ) : (
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="font-mono-num">[{slot.key}]</span>
                <span>{slot.name}</span>
                <span className="font-mono-num text-[11px] opacity-85 tabular-nums">
                  · {statusLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pause Modal */}
      {paused && !resultModal && (
        <div className="absolute inset-0 z-30 bg-[#070A10]/85 flex items-center justify-center p-4">
          <div className="bg-[#111723] border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="font-display text-xl font-bold text-white">Бой на паузе</h2>
            <p className="text-xs text-slate-400">
              Кликните по арене для захвата и центрирования курсора. Нажмите Esc или P для паузы.
            </p>

            {/* Mouse Sensitivity Control inside Pause Menu */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
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
                onChange={(e) => onChangeMouseSensitivity(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono-num">
                <span>0.20×</span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onChangeMouseSensitivity(1.0);
                  }}
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  Сброс (1.00×)
                </button>
                <span>2.50×</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={togglePause}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm"
              >
                Продолжить бой
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Начать заново
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onExitToMenu();
                }}
                className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-sm"
              >
                Выйти в меню
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory / Defeat Result Modal */}
      {resultModal && (
        <div className="absolute inset-0 z-30 bg-[#070A10]/88 flex items-center justify-center p-4">
          <div className="bg-[#111723] border border-slate-700 rounded-2xl p-6 md:p-8 w-full max-w-lg space-y-5">
            <div>
              <div
                className={`text-xs font-mono-num font-semibold ${
                  resultModal.outcome === 'victory'
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {resultModal.outcome === 'victory'
                  ? 'Бой завершён · Победа'
                  : 'Бой завершён · Поражение'}
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-white mt-1">
                {resultModal.outcome === 'victory'
                  ? 'Противник повержен!'
                  : 'LBX выведен из строя'}
              </h2>
            </div>

            {/* Battle Stats */}
            <div className="grid grid-cols-3 gap-3 bg-[#0B0F17] border border-slate-800 rounded-xl p-4 text-center font-mono-num">
              <div>
                <div className="text-[11px] text-slate-400">Нанесено урона</div>
                <div className="text-lg font-bold text-amber-400 mt-0.5 tabular-nums">
                  {resultModal.snapshot.stats.damageDealt}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Парирований</div>
                <div className="text-lg font-bold text-cyan-400 mt-0.5 tabular-nums">
                  {resultModal.snapshot.stats.parriesLanded}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Время боя</div>
                <div className="text-lg font-bold text-slate-100 mt-0.5 tabular-nums">
                  {Math.round(resultModal.snapshot.elapsedTime)}с
                </div>
              </div>
            </div>

            {resultModal.progression && (
              <div className="bg-[#0B0F17] border border-amber-500/40 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono-num">
                  <span className="text-slate-300">Опыт обучения LBX</span>
                  <span className="text-amber-400 font-bold tabular-nums">
                    +{resultModal.progression.xpGained} XP · Ур. {resultModal.progression.levelAfter}
                  </span>
                </div>
                {resultModal.progression.levelAfter > resultModal.progression.levelBefore && (
                  <div className="text-xs text-emerald-400 font-semibold">
                    Повышение уровня: {resultModal.progression.levelBefore} →{' '}
                    {resultModal.progression.levelAfter}!
                  </div>
                )}
                {resultModal.progression.newlyUnlockedSkills.length > 0 && (
                  <div className="text-xs text-cyan-300 font-medium">
                    Открыта новая атака: {resultModal.progression.newlyUnlockedSkills.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Story Victory Dialogue & Reward */}
            {resultModal.outcome === 'victory' && storyChapter && (
              <div className="space-y-3">
                <div className="bg-[#0B0F17] border border-emerald-500/40 rounded-xl p-4">
                  <div className="text-xs text-emerald-400 font-semibold">
                    Открыта награда кампании
                  </div>
                  <div className="font-display text-sm font-bold text-white mt-0.5">
                    {storyChapter.rewardLabel}
                  </div>
                </div>
                {storyChapter.victoryDialogue[0] && (
                  <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-semibold text-amber-400">
                      {storyChapter.victoryDialogue[0].speaker}
                    </div>
                    <p className="text-sm text-slate-200 mt-1">
                      «{storyChapter.victoryDialogue[0].text}»
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onOpenGarage();
                }}
                className="px-4 py-2.5 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800"
              >
                Ангар LBX
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white"
              >
                Реванш
              </button>
              {resultModal.outcome === 'victory' && hasNextChapter && onNextChapter && storyChapter ? (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onNextChapter(storyChapter.id);
                  }}
                  className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm"
                >
                  Следующая глава
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onExitToMenu();
                  }}
                  className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm"
                >
                  К кампании
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
