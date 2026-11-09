import React from 'react';
import { getOrCreateDeviceId, isLockActive } from '../../utils/deviceLock';

export const MatchCard = ({
  match,
  onClick,
  config,
  isCompact = false,
  isReadOnly = false,
}) => {
  const isLoserBracket = match.bracketType === 'loser';
  const isFinal = match.bracketType === 'final';
  const isFinalReset = match.bracketType === 'final_reset';
  const isThirdPlace = match.bracketType === 'third_place';

  // 1. 雙輪空自動推進卡片 (例如 9 隊雙敗淘汰時的敗部空籤)
  if (match.isDoubleBye) {
    return (
      <div className="match-card is-bye-card w-60 rounded-lg border-stone-300 opacity-75">
        <div className="text-xs font-bold text-stone-600 flex items-center w-full justify-between">
          <span>
            <i className="fa-solid fa-forward mr-1.5 text-stone-500" aria-hidden="true"></i>
            雙輪空籤位
          </span>
          <span className="font-mono text-[11px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
            自動推進
          </span>
        </div>
      </div>
    );
  }

  // 2. 勝部種子輪空卡片
  const isByeMatch = match.topTeam.id === 'BYE' || match.bottomTeam.id === 'BYE';
  if (isByeMatch && !isLoserBracket) {
    const seedTeam = match.topTeam.id === 'BYE' ? match.bottomTeam : match.topTeam;
    return (
      <div className="match-card is-bye-card w-60 rounded-lg">
        <div className="text-sm font-bold text-stone-800 flex items-center min-w-0 pr-2">
          <span className="truncate">{seedTeam.name || '待定'}</span>
          {seedTeam.isSeed && (
            <i
              className="fa-solid fa-star text-amber-500 ml-1.5 text-xs shrink-0"
              aria-hidden="true"
            ></i>
          )}
        </div>
        <div className="ml-auto text-xs text-orange-800 font-bold bg-orange-100 px-2 py-0.5 rounded shrink-0">
          輪空晉級
        </div>
      </div>
    );
  }

  // 3. 雙敗淘汰「勝部冠軍直落封王、無需加賽」狀態卡片
  if (isFinalReset && match.isSkipped) {
    return (
      <div className="match-card w-64 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 p-4 text-center">
        <div className="text-emerald-700 font-extrabold text-xs uppercase tracking-wider mb-1">
          <i className="fa-solid fa-circle-check mr-1.5" aria-hidden="true"></i>
          總冠軍加賽 (免戰)
        </div>
        <div className="text-xs text-emerald-900 font-medium">
          勝部冠軍於首戰直落封王，無須進行驟死加賽
        </div>
      </div>
    );
  }

  const bothTeamsReady = Boolean(
    match.topTeam.id &&
      match.bottomTeam.id &&
      match.topTeam.id !== 'BYE' &&
      match.bottomTeam.id !== 'BYE'
  );
  const canInteract = Boolean(onClick) && !isByeMatch && !match.isSkipped && bothTeamsReady;

  const effectiveBestOf = match.customBestOf || config.bestOf || 1;

  const getScoreText = (team) => {
    if (team.isForfeit) {
      return <span className="text-xs font-bold text-red-700">棄權</span>;
    }
    if (isByeMatch && team.id === 'BYE') {
      return <span className="text-xs font-medium text-stone-500">輪空</span>;
    }
    if (team.score !== null && team.score !== undefined) {
      return team.score;
    }
    return effectiveBestOf > 1 ? '-' : '-';
  };

  const getScoreStyle = (team) => {
    if (team.isForfeit) return 'text-red-700 bg-red-50 px-1.5 py-0.5 rounded';
    if (team.score === null || team.score === undefined) return 'text-stone-500';
    if (team.isWinner) return 'text-orange-800 font-extrabold bg-orange-100 px-2 py-0.5 rounded';
    return 'text-stone-700 font-bold';
  };

  const setDetails =
    match.setScores && match.setScores.length > 0
      ? match.setScores.map((s) => `${s.a}-${s.b}`).join(' , ')
      : null;

  const pkText =
    match.penaltyScore &&
    match.penaltyScore.a !== undefined &&
    match.penaltyScore.b !== undefined
      ? `PK ${match.penaltyScore.a}-${match.penaltyScore.b}`
      : null;

  const myDeviceId = getOrCreateDeviceId();
  const activeLock = isLockActive(match.lockInfo) ? match.lockInfo : null;
  const isLockedByMe = Boolean(activeLock && activeLock.deviceId === myDeviceId);
  const isLockedByOther = Boolean(activeLock && activeLock.deviceId !== myDeviceId);

  const isDraw =
    config.format === 'ROUND_ROBIN' &&
    match.topTeam.score !== null &&
    match.bottomTeam.score !== null &&
    match.topTeam.score === match.bottomTeam.score &&
    !match.topTeam.isForfeit &&
    !match.bottomTeam.isForfeit;

  const matchNumber = match.id.split('-').pop();
  let title = `場次 ${matchNumber}`;
  if (isFinal) title = '總冠軍賽';
  else if (isFinalReset) title = '總冠軍驟死加賽';
  else if (isThirdPlace) title = '季軍排名賽';
  else if (isLoserBracket) title = `敗部 ${matchNumber}`;
  else if (match.bracketType === 'group') title = `第 ${match.roundIndex + 1} 輪 · ${matchNumber}`;

  let headerClass =
    'px-3 py-2 flex justify-between items-center text-xs border-b font-bold tracking-wide ';
  if (isFinal) headerClass += 'bg-amber-100 border-amber-300 text-amber-900';
  else if (isFinalReset) headerClass += 'bg-orange-100 border-orange-300 text-orange-900';
  else if (isThirdPlace) headerClass += 'bg-amber-50 border-amber-300 text-amber-900';
  else if (isLoserBracket) headerClass += 'bg-red-50 border-red-200 text-red-800';
  else headerClass += 'bg-stone-100 border-stone-200 text-stone-700';

  const widthClass = isFinal || isFinalReset ? 'w-72' : isCompact ? 'w-full' : 'w-60';

  const containerClass = [
    'match-card rounded-xl overflow-hidden',
    widthClass,
    isFinal ? 'border-2 is-final' : '',
    isFinalReset ? 'border-2 is-reset' : '',
    isThirdPlace ? 'border-2 is-third' : '',
    !isFinal && !isFinalReset && !isThirdPlace
      ? isLoserBracket
        ? 'border border-red-200 shadow-sm'
        : 'border border-stone-300 shadow-sm'
      : '',
    canInteract ? 'interactive cursor-pointer' : 'opacity-95',
  ]
    .filter(Boolean)
    .join(' ');

  const cardContent = (
    <>
      <div className={headerClass}>
        <span className="flex items-center truncate">
          {isFinal && (
            <i className="fa-solid fa-trophy mr-1.5 text-amber-600" aria-hidden="true"></i>
          )}
          {isFinalReset && (
            <i className="fa-solid fa-fire mr-1.5 text-orange-600" aria-hidden="true"></i>
          )}
          {isThirdPlace && (
            <i className="fa-solid fa-medal mr-1.5 text-amber-700" aria-hidden="true"></i>
          )}
          {title}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {effectiveBestOf > 1 && (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-extrabold">
              {effectiveBestOf}戰{Math.ceil(effectiveBestOf / 2)}勝
            </span>
          )}
          {!isFinal && !isFinalReset && !isThirdPlace && match.bracketType !== 'group' && (
            <span className="bg-white px-1.5 py-0.5 rounded border border-stone-300 text-[11px] text-stone-600 font-mono">
              {isLoserBracket ? 'L' : 'W'}R{match.roundIndex + 1}
            </span>
          )}
          {pkText && (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-extrabold">
              {pkText}
            </span>
          )}
          {isDraw && (
            <span className="bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded text-[11px] font-bold">
              平手
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col bg-white divide-y divide-stone-100">
        {['topTeam', 'bottomTeam'].map((pos) => {
          const team = match[pos];
          const displayName =
            team.id === 'BYE'
              ? '輪空 (BYE)'
              : team.name || team.placeholder || '待定';
          const isDetermined = Boolean(team.id && team.id !== 'BYE');

          return (
            <div
              key={pos}
              className={`flex justify-between items-center px-3.5 py-2.5 ${
                team.isWinner ? 'bg-orange-50/60' : ''
              } ${team.isForfeit ? 'opacity-65' : ''}`}
            >
              <div className="flex items-center min-w-0 pr-2">
                <div
                  className={`w-1.5 h-5 rounded-full mr-2.5 shrink-0 ${
                    team.isWinner
                      ? 'bg-orange-600'
                      : isDetermined
                        ? 'bg-stone-300'
                        : 'bg-stone-200'
                  }`}
                  aria-hidden="true"
                ></div>
                <span
                  className={`truncate text-sm ${
                    isDetermined
                      ? 'font-bold text-stone-800'
                      : 'font-medium text-stone-500 italic'
                  } ${team.isForfeit ? 'line-through' : ''}`}
                  title={displayName}
                >
                  {displayName}
                </span>
                {team.isSeed && isDetermined && (
                  <i
                    className="fa-solid fa-star text-amber-500 ml-1.5 text-[11px] shrink-0"
                    title="種子隊"
                    aria-hidden="true"
                  ></i>
                )}
              </div>
              <span className={`text-sm font-mono shrink-0 ${getScoreStyle(team)}`}>
                {getScoreText(team)}
              </span>
            </div>
          );
        })}
      </div>

      {(match.liveMeta || activeLock) && (
        <div
          className={`px-3 py-1.5 text-[11px] font-bold flex items-center justify-between gap-1.5 border-t ${
            isLockedByOther
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-emerald-50 text-emerald-900 border-emerald-200'
          }`}
        >
          {match.liveMeta ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0"></span>
              <span className="truncate">{match.liveMeta}</span>
            </span>
          ) : (
            <span className="truncate">記分板開啟中</span>
          )}
          {activeLock && (
            <span className="inline-flex items-center gap-1 shrink-0 font-extrabold">
              <i
                className={`fa-solid ${isLockedByMe ? 'fa-tablet-screen-button' : 'fa-lock'} text-[10px]`}
                aria-hidden="true"
              ></i>
              {isLockedByMe ? '本機記分中' : activeLock.deviceName || '鎖定中'}
            </span>
          )}
        </div>
      )}

      {(setDetails || pkText) && (
        <div className="px-3 py-1.5 bg-stone-50 text-[11px] text-stone-600 font-mono text-center border-t border-stone-200">
          {setDetails}
          {setDetails && pkText ? ' · ' : ''}
          {pkText && <span className="font-bold text-amber-800">{pkText}</span>}
        </div>
      )}
    </>
  );

  // 依循 modern-web-guidance `accessibility`：可互動對戰卡使用原生 <button type="button"> 確保完整鍵盤操作性
  if (canInteract) {
    const ariaSummary = isReadOnly
      ? `${title}：${match.topTeam.name} 對戰 ${match.bottomTeam.name}，點擊查看唯讀比賽戰況明細`
      : `${title}：${match.topTeam.name} 對戰 ${match.bottomTeam.name}，點擊登錄或修改比分`;
    return (
      <button
        type="button"
        aria-label={ariaSummary}
        onClick={() => onClick(match)}
        className={containerClass}
      >
        {cardContent}
      </button>
    );
  }

  return <article className={containerClass}>{cardContent}</article>;
};
