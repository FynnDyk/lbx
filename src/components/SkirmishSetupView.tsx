import React, { useState } from 'react';
import { Swords, MapPin, Cpu } from 'lucide-react';
import { ARENAS, getWeaponById } from '../game/catalog';
import { soundEngine } from '../game/sound';
import { AI_PRESETS, STORY_CHAPTERS } from '../game/story';
import { AiPersonality, ArenaId, LbxLoadout } from '../game/types';

export interface SkirmishConfig {
  enemyName: string;
  enemyLoadout: LbxLoadout;
  arenaId: ArenaId;
  aiPersonality: AiPersonality;
}

interface SkirmishSetupViewProps {
  onLaunchSkirmish: (config: SkirmishConfig) => void;
}

export const SkirmishSetupView: React.FC<SkirmishSetupViewProps> = ({
  onLaunchSkirmish,
}) => {
  const [selectedOppIdx, setSelectedOppIdx] = useState(1);
  const [selectedArenaId, setSelectedArenaId] = useState<ArenaId>('meadow');
  const [selectedAiKey, setSelectedAiKey] = useState<string>('tactical_flanker');

  const opponentPresets = STORY_CHAPTERS.map((ch) => ({
    name: ch.opponentName,
    title: ch.opponentTitle,
    lbxName: ch.opponentLbxName,
    loadout: ch.opponentLoadout,
  }));

  const selectedOpp = opponentPresets[selectedOppIdx] ?? opponentPresets[0];
  const selectedAi = AI_PRESETS[selectedAiKey] ?? AI_PRESETS.tactical_flanker;
  const selectedArena = ARENAS.find((a) => a.id === selectedArenaId) ?? ARENAS[0];

  return (
    <div className="h-full w-full overflow-y-auto pt-20 pb-10 px-6 md:px-10 bg-[#0B0F17]">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-100">
              Свободная диорамная битва
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Выбери соперника, диорамную арену и тактический профиль искусственного интеллекта.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onLaunchSkirmish({
                enemyName: selectedOpp.name,
                enemyLoadout: selectedOpp.loadout,
                arenaId: selectedArena.id,
                aiPersonality: selectedAi,
              });
            }}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Swords className="w-4 h-4" />
            Начать поединок
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Opponent */}
          <div className="bg-[#111723] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-slate-100">
              <Swords className="w-4 h-4 text-amber-400" />
              Соперник LBX
            </div>
            <div className="space-y-2">
              {opponentPresets.map((opp, idx) => (
                <button
                  key={opp.name}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setSelectedOppIdx(idx);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    selectedOppIdx === idx
                      ? 'bg-[#172235] border-amber-500 text-white'
                      : 'bg-[#0D121C] border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-display text-sm font-semibold">
                    {opp.name} · {opp.lbxName}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {getWeaponById(opp.loadout.weaponId).name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Diorama Arena */}
          <div className="bg-[#111723] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-slate-100">
              <MapPin className="w-4 h-4 text-cyan-400" />
              Диорамная арена
            </div>
            <div className="space-y-2">
              {ARENAS.map((arena) => (
                <button
                  key={arena.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setSelectedArenaId(arena.id);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    selectedArenaId === arena.id
                      ? 'bg-[#172235] border-cyan-500 text-white'
                      : 'bg-[#0D121C] border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-display text-sm font-semibold">{arena.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{arena.subtitle}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Column 3: Tactical AI Brain */}
          <div className="bg-[#111723] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-slate-100">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Тактика ИИ
            </div>
            <div className="space-y-2">
              {Object.entries(AI_PRESETS).map(([key, ai]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setSelectedAiKey(key);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    selectedAiKey === key
                      ? 'bg-[#172235] border-emerald-500 text-white'
                      : 'bg-[#0D121C] border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-display text-sm font-semibold">{ai.label}</div>
                  <div className="text-xs text-slate-400 font-mono-num mt-0.5">
                    Агрессия {Math.round(ai.aggression * 100)}% · Уклонение{' '}
                    {Math.round(ai.evadeSkill * 100)}% · Парирование{' '}
                    {Math.round(ai.parryChance * 100)}%
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
