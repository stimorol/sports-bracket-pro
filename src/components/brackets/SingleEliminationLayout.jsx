import React from 'react';
import { BracketBranch } from './BracketBranch';
import { MatchCard } from './MatchCard';
import { PanZoomViewport } from './PanZoomViewport';

export const SingleEliminationLayout = ({
  matches,
  onMatchClick,
  config,
  isReadOnly,
}) => {
  const finalMatch = matches?.find((m) => m.bracketType === 'final');
  const thirdPlaceMatch = matches?.find((m) => m.bracketType === 'third_place');

  if (!matches || matches.length === 0 || !finalMatch) {
    return (
      <div className="text-center p-12 text-stone-600 font-medium">
        尚無賽程資料
      </div>
    );
  }

  const leftFinalistSource = matches.find(
    (m) => m.nextMatchId === finalMatch.id && m.nextMatchPosition === 'top'
  );
  const rightFinalistSource = matches.find(
    (m) => m.nextMatchId === finalMatch.id && m.nextMatchPosition === 'bottom'
  );
  const hasSubBranches = Boolean(leftFinalistSource || rightFinalistSource);

  return (
    <PanZoomViewport label="單淘汰賽程樹狀圖畫布（支援方向鍵與滑鼠拖曳平移）">
      <div className="flex items-center justify-center p-10 sm:p-14">
        {hasSubBranches && (
          <div className="flex flex-col justify-center">
            {leftFinalistSource && (
              <BracketBranch
                matchId={leftFinalistSource.id}
                matches={matches}
                side="left"
                onMatchClick={onMatchClick}
                config={config}
                isReadOnly={isReadOnly}
              />
            )}
          </div>
        )}

        <div
          className={`${
            hasSubBranches ? 'mx-12 sm:mx-16' : ''
          } flex flex-col items-center justify-center relative z-30 space-y-10`}
        >
          <div className="flex flex-col items-center">
            <div className="text-amber-500 mb-3 drop-shadow-sm" aria-hidden="true">
              <i className="fa-solid fa-crown text-4xl"></i>
            </div>
            <div className="flex items-center justify-center">
              {hasSubBranches && leftFinalistSource && (
                <div className="w-8 h-0.5 line-color mr-2" aria-hidden="true"></div>
              )}
              <MatchCard
                match={finalMatch}
                onClick={onMatchClick}
                config={config}
                isReadOnly={isReadOnly}
              />
              {hasSubBranches && rightFinalistSource && (
                <div className="w-8 h-0.5 line-color ml-2" aria-hidden="true"></div>
              )}
            </div>
          </div>

          {thirdPlaceMatch && (
            <div className="flex flex-col items-center pt-8 border-t-2 border-dashed border-stone-300 relative">
              <span className="absolute -top-3 bg-stone-100 px-3 py-0.5 rounded-full border border-stone-300 text-stone-700 text-xs font-extrabold tracking-wider">
                季軍排名賽
              </span>
              <MatchCard
                match={thirdPlaceMatch}
                onClick={onMatchClick}
                config={config}
                isReadOnly={isReadOnly}
              />
            </div>
          )}
        </div>

        {hasSubBranches && (
          <div className="flex flex-col justify-center">
            {rightFinalistSource && (
              <BracketBranch
                matchId={rightFinalistSource.id}
                matches={matches}
                side="right"
                onMatchClick={onMatchClick}
                config={config}
                isReadOnly={isReadOnly}
              />
            )}
          </div>
        )}
      </div>
    </PanZoomViewport>
  );
};
