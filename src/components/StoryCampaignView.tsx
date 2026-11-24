import React, { useState } from 'react';
import { ChevronRight, CheckCircle2, Lock, Swords, Shield, Zap } from 'lucide-react';
import { computeLoadoutStats, getArenaById, getWeaponById } from '../game/catalog';
import { soundEngine } from '../game/sound';
import { STORY_CHAPTERS } from '../game/story';
import { StoryChapter } from '../game/types';

interface StoryCampaignViewProps {
  completedChapterIds: string[];
  onStartChapter: (chapter: StoryChapter) => void;
  onOpenGarage: () => void;
}

export const StoryCampaignView: React.FC<StoryCampaignViewProps> = ({
  completedChapterIds,
  onStartChapter,
  onOpenGarage,
}) => {
  const nextUnlockedIndex = Math.min(
    STORY_CHAPTERS.length - 1,
    completedChapterIds.length,
  );
  const [selectedId, setSelectedId] = useState<string>(
    STORY_CHAPTERS[nextUnlockedIndex]?.id ?? STORY_CHAPTERS[0].id,
  );
  const [dialogueStep, setDialogueStep] = useState<number>(0);

  const selectedChapter =
    STORY_CHAPTERS.find((c) => c.id === selectedId) ?? STORY_CHAPTERS[0];
  const selectedIndex = STORY_CHAPTERS.findIndex((c) => c.id === selectedChapter.id);
  const isChapterUnlocked =
    selectedIndex <= completedChapterIds.length ||
    completedChapterIds.includes(selectedChapter.id);
  const isCompleted = completedChapterIds.includes(selectedChapter.id);

  const opponentStats = computeLoadoutStats(selectedChapter.opponentLoadout);
  const opponentWeapon = getWeaponById(selectedChapter.opponentLoadout.weaponId);
  const arena = getArenaById(selectedChapter.arenaId);

  const currentDialogue =
    selectedChapter.preBattleDialogue[
      Math.min(dialogueStep, selectedChapter.preBattleDialogue.length - 1)
    ];

  const handleSelectChapter = (chapterId: string) => {
    soundEngine.playClick();
    setSelectedId(chapterId);
    setDialogueStep(0);
  };

  return (
    <div className="h-full w-full overflow-y-auto pt-20 pb-10 px-6 md:px-10 bg-[#0B0F17]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Story Chapters */}
        <div className="lg:col-span-5 space-y-3">
          <div className="mb-5">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">
              Сюжетная кампания
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Пройди путь от магазина «Тайни Орбит» до финала мирового турнира «Артемида».
            </p>
          </div>

          <div className="space-y-2.5">
            {STORY_CHAPTERS.map((ch, idx) => {
              const unlocked =
                idx <= completedChapterIds.length ||
                completedChapterIds.includes(ch.id);
              const done = completedChapterIds.includes(ch.id);
              const active = ch.id === selectedChapter.id;

              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => handleSelectChapter(ch.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    active
                      ? 'bg-[#161F30] border-amber-500/70 text-slate-100'
                      : unlocked
                        ? 'bg-[#111723] border-slate-800 hover:border-slate-700 text-slate-200'
                        : 'bg-[#0E131D] border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-amber-400 font-mono-num">
                      Глава 0{ch.number} · {ch.opponentName}
                    </span>
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : !unlocked ? (
                      <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                  </div>
                  <div className="font-display text-lg font-semibold mt-1">
                    {ch.title}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {ch.opponentLbxName} · {getArenaById(ch.arenaId).name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right column: Chapter Dossier & Dialogue */}
        <div className="lg:col-span-7 bg-[#111723] border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
            <div>
              <div className="text-xs text-slate-400 font-mono-num">
                Глава 0{selectedChapter.number} · {arena.name} ·{' '}
                {isCompleted ? 'Пройдено' : isChapterUnlocked ? 'Доступно' : 'Заблокировано'}
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-100 mt-1">
                {selectedChapter.title}
              </h2>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed max-w-2xl">
                {selectedChapter.briefing}
              </p>
            </div>
          </div>

          {/* Opponent Dossier */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-800/80 pb-5">
            <div>
              <div className="text-xs text-slate-400">Противник</div>
              <div className="font-display text-base font-semibold text-slate-100 mt-0.5">
                {selectedChapter.opponentName}
              </div>
              <div className="text-xs text-slate-400">{selectedChapter.opponentTitle}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Модель LBX</div>
              <div className="font-display text-base font-semibold text-amber-400 mt-0.5">
                {selectedChapter.opponentLbxName}
              </div>
              <div className="text-xs text-slate-400">{opponentWeapon.name}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Тактика ИИ</div>
              <div className="font-display text-base font-semibold text-cyan-400 mt-0.5">
                {selectedChapter.aiPersonality.label}
              </div>
              <div className="text-xs text-slate-400 font-mono-num">
                HP {opponentStats.maxHp} · Броня {opponentStats.armor}%
              </div>
            </div>
          </div>

          {/* Opponent Key Capabilities */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300 font-mono-num">
            <div className="flex items-center gap-1.5">
              <Swords className="w-4 h-4 text-amber-400" />
              <span>Урон оружия: {opponentWeapon.damage}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span>
                {opponentStats.canGuard
                  ? `Блок: ${Math.round(opponentWeapon.blockMitigation * 100)}%`
                  : 'Блок: Нет (без щита)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Награда: {selectedChapter.rewardLabel}</span>
            </div>
          </div>

          {/* Pre-battle anime dialogue box */}
          {currentDialogue && (
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-display font-semibold text-amber-400">
                  {currentDialogue.speaker} · {currentDialogue.role}
                </span>
                <span className="text-slate-500 font-mono-num">
                  {dialogueStep + 1} / {selectedChapter.preBattleDialogue.length}
                </span>
              </div>
              <p className="text-sm md:text-base text-slate-100 leading-relaxed">
                «{currentDialogue.text}»
              </p>
              {selectedChapter.preBattleDialogue.length > 1 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setDialogueStep(
                        (s) => (s + 1) % selectedChapter.preBattleDialogue.length,
                      );
                    }}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Следующая реплика →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onOpenGarage();
              }}
              className="px-4 py-2.5 rounded-lg border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Настроить LBX в ангаре
            </button>

            <button
              type="button"
              disabled={!isChapterUnlocked}
              onClick={() => {
                soundEngine.playClick();
                onStartChapter(selectedChapter);
              }}
              className={`px-6 py-2.5 rounded-lg font-display font-semibold text-sm transition-colors whitespace-nowrap shrink-0 ${
                isChapterUnlocked
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isChapterUnlocked
                ? 'Начать сюжетный бой'
                : `Пройдите главу 0${selectedChapter.number - 1}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
