import React from 'react';
import { MatchCard } from './MatchCard';

export const BracketBranch = ({
  matchId,
  matches,
  side,
  onMatchClick,
  config,
  isReadOnly,
}) => {
  const match = matches.find((m) => m.id === matchId);
  if (!match) return <div className="w-60 h-24 invisible"></div>;

  const sourceMatches = matches.filter((m) => m.nextMatchId === match.id);
  const topSource = sourceMatches.find((m) => m.nextMatchPosition === 'top');
  const bottomSource = sourceMatches.find((m) => m.nextMatchPosition === 'bottom');

  const hasTop = Boolean(topSource);
  const hasBottom = Boolean(bottomSource);
  const hasAny = hasTop || hasBottom;
  const hasBoth = hasTop && hasBottom;
  const connectorLen = 24;
  const lineWidth = 2;

  return (
    <div className={`flex items-center ${side === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
      {hasAny && (
        <div className="flex flex-col justify-center self-stretch">
          {hasTop && (
            <div
              className={`flex-1 flex flex-col justify-center relative ${
                side === 'left' ? 'items-end pr-6' : 'items-start pl-6'
              }`}
            >
              <BracketBranch
                matchId={topSource.id}
                matches={matches}
                side={side}
                onMatchClick={onMatchClick}
                config={config}
                isReadOnly={isReadOnly}
              />
              {hasBoth && (
                <div
                  className={`absolute ${
                    side === 'left' ? 'right-0' : 'left-0'
                  } bottom-0 line-color`}
                  style={{ width: lineWidth, height: '50%' }}
                ></div>
              )}
              <div
                className={`absolute ${
                  side === 'left' ? 'right-0' : 'left-0'
                } line-color`}
                style={{
                  width: connectorLen,
                  height: lineWidth,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              ></div>
            </div>
          )}

          {hasBottom && (
            <div
              className={`flex-1 flex flex-col justify-center relative ${
                side === 'left' ? 'items-end pr-6' : 'items-start pl-6'
              }`}
            >
              <BracketBranch
                matchId={bottomSource.id}
                matches={matches}
                side={side}
                onMatchClick={onMatchClick}
                config={config}
                isReadOnly={isReadOnly}
              />
              {hasBoth && (
                <div
                  className={`absolute ${
                    side === 'left' ? 'right-0' : 'left-0'
                  } top-0 line-color`}
                  style={{ width: lineWidth, height: '50%' }}
                ></div>
              )}
              <div
                className={`absolute ${
                  side === 'left' ? 'right-0' : 'left-0'
                } line-color`}
                style={{
                  width: connectorLen,
                  height: lineWidth,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              ></div>
            </div>
          )}
        </div>
      )}

      {hasAny && (
        <div style={{ width: connectorLen, height: lineWidth }} className="line-color"></div>
      )}

      <div className="z-10 py-3">
        <MatchCard
          match={match}
          onClick={onMatchClick}
          config={config}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
};
