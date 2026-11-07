import React from 'react';
import { BracketBranch } from './BracketBranch';
import { MatchCard } from './MatchCard';
import { PanZoomViewport } from './PanZoomViewport';

export const DoubleEliminationLayout = ({
  matches,
  onMatchClick,
  config,
  isReadOnly,
}) => {
  const grandFinal = matches?.find((m) => m.bracketType === 'final');
  const resetMatch = matches?.find((m) => m.bracketType === 'final_reset');

  if (!grandFinal) {
    return (
      <div className="text-center p-12 text-stone-600 font-medium">
        尚無賽程資料
      </div>
    );
  }

  return (
    <PanZoomViewport label="雙敗淘汰賽程樹狀圖畫布（支援方向鍵與滑鼠拖曳平移）">
      <div className="flex flex-col items-start p-10 sm:p-14">
        {/* 圖例提示 */}
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs font-bold text-stone-700 bg-white/90 px-4 py-2 rounded-xl border border-stone-200 shadow-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-stone-200 border border-stone-400 inline-block"></span>
            勝部 (Winner Bracket)
          </span>
          <span className="text-stone-300">|</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block"></span>
            敗部 (Loser Bracket)
          </span>
          {resetMatch && (
            <>
              <span className="text-stone-300">|</span>
              <span className="inline-flex items-center gap-1.5 text-orange-800">
                <i className="fa-solid fa-fire text-orange-600" aria-hidden="true"></i>
                標準雙敗加賽制：若敗部冠軍贏得總冠軍賽首戰，將自動開啟右側驟死加賽
              </span>
            </>
          )}
        </div>

        <div className="flex items-center">
          <BracketBranch
            matchId={grandFinal.id}
            matches={matches}
            side="left"
            onMatchClick={onMatchClick}
            config={config}
            isReadOnly={isReadOnly}
          />

          {resetMatch && (
            <div className="flex items-center">
              <div
                className="w-10 border-t-2 border-dashed border-orange-400"
                aria-hidden="true"
              ></div>
              <MatchCard
                match={resetMatch}
                onClick={onMatchClick}
                config={config}
                isReadOnly={isReadOnly}
              />
            </div>
          )}
        </div>
      </div>
    </PanZoomViewport>
  );
};
