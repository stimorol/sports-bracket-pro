import React, { useId, useMemo, useState } from 'react';
import { SPORTS } from '../../constants/sports';
import { isLockActive } from '../../utils/deviceLock';

/**
 * 即時戰況看板 (SpectatorLiveBoard)
 * - 專為家長、同學、參賽選手與大會大螢幕打造的零誤觸即時賽事中心
 * - 自動將目前階段所有有效場次分類為：
 *   1. 🔴 進行中賽事 (LIVE)
 *   2. ⏳ 即將開打 (雙方隊伍已確定、待開賽)
 *   3. ✅ 已完賽結果 (含各局/各節/PK比分摘要)
 * - 支援「搜尋隊伍名稱」快速篩選家長／同學關心的班級或隊伍！
 */
export const SpectatorLiveBoard = ({
  stage,
  onInspectMatch,
  onOpenShareModal,
}) => {
  const searchInputId = useId();
  const [teamFilter, setTeamFilter] = useState('');

  const sport = SPORTS[stage?.config?.sport] || SPORTS.OTHER;

  const categorized = useMemo(() => {
    const allMatches = stage?.matches || [];
    const normalizedFilter = teamFilter.trim().toLowerCase();

    const validMatches = allMatches.filter((m) => {
      if (m.isDoubleBye || m.isSkipped) return false;
      const isBye = m.topTeam.id === 'BYE' || m.bottomTeam.id === 'BYE';
      if (isBye && m.bracketType !== 'loser') return false;
      if (normalizedFilter) {
        const topName = (m.topTeam.name || m.topTeam.placeholder || '').toLowerCase();
        const botName = (m.bottomTeam.name || m.bottomTeam.placeholder || '').toLowerCase();
        const code = (m.id || '').toLowerCase();
        if (
          !topName.includes(normalizedFilter) &&
          !botName.includes(normalizedFilter) &&
          !code.includes(normalizedFilter)
        ) {
          return false;
        }
      }
      return true;
    });

    const liveMatches = [];
    const upcomingMatches = [];
    const completedMatches = [];

    validMatches.forEach((m) => {
      const activeLock = isLockActive(m.lockInfo) ? m.lockInfo : null;
      const isFinished =
        Boolean(m.topTeam.isWinner || m.bottomTeam.isWinner) ||
        Boolean(m.topTeam.isForfeit || m.bottomTeam.isForfeit) ||
        (stage?.config?.format === 'ROUND_ROBIN' &&
          m.topTeam.score !== null &&
          m.bottomTeam.score !== null);

      const isLive = Boolean((m.liveMeta || activeLock) && !isFinished);

      if (isLive) {
        liveMatches.push(m);
      } else if (isFinished) {
        completedMatches.push(m);
      } else {
        upcomingMatches.push(m);
      }
    });

    // 已完賽場次將編號較後（最新打完）排前面
    const totalPlayable = allMatches.filter(
      (m) =>
        !m.isDoubleBye &&
        !m.isSkipped &&
        !(
          (m.topTeam.id === 'BYE' || m.bottomTeam.id === 'BYE') &&
          m.bracketType !== 'loser'
        )
    ).length;

    const totalFinished = allMatches.filter((m) => {
      if (m.isDoubleBye || m.isSkipped) return false;
      const isBye = m.topTeam.id === 'BYE' || m.bottomTeam.id === 'BYE';
      if (isBye && m.bracketType !== 'loser') return false;
      return (
        Boolean(m.topTeam.isWinner || m.bottomTeam.isWinner) ||
        Boolean(m.topTeam.isForfeit || m.bottomTeam.isForfeit) ||
        (stage?.config?.format === 'ROUND_ROBIN' &&
          m.topTeam.score !== null &&
          m.bottomTeam.score !== null)
      );
    }).length;

    return {
      liveMatches,
      upcomingMatches,
      completedMatches: [...completedMatches].reverse(),
      totalPlayable,
      totalFinished,
    };
  }, [stage, teamFilter]);

  const getMatchBadgeTitle = (match) => {
    const matchNumber = match.id.split('-').pop();
    if (match.bracketType === 'final') return '🏆 總冠軍賽';
    if (match.bracketType === 'final_reset') return '🔥 總冠軍驟死加賽';
    if (match.bracketType === 'third_place') return '🥉 季軍排名賽';
    if (match.bracketType === 'loser') return `敗部 #${matchNumber}`;
    if (match.bracketType === 'group') return `循環賽 第${match.roundIndex + 1}輪 · #${matchNumber}`;
    return `勝部 R${match.roundIndex + 1} · 場次 #${matchNumber}`;
  };

  const renderBoardMatchCard = (match, statusType) => {
    const activeLock = isLockActive(match.lockInfo) ? match.lockInfo : null;
    const bothReady = Boolean(
      match.topTeam.id &&
        match.bottomTeam.id &&
        match.topTeam.id !== 'BYE' &&
        match.bottomTeam.id !== 'BYE'
    );
    const setSummary =
      match.setScores && match.setScores.length > 0
        ? match.setScores.map((s) => `${s.a}-${s.b}`).join(' , ')
        : null;
    const pkSummary =
      match.penaltyScore &&
      match.penaltyScore.a !== undefined &&
      match.penaltyScore.b !== undefined
        ? `PK ${match.penaltyScore.a}-${match.penaltyScore.b}`
        : null;

    return (
      <button
        key={match.id}
        type="button"
        onClick={() => onInspectMatch?.(match)}
        aria-label={`查看 ${getMatchBadgeTitle(match)}：${match.topTeam.name || '待定'} 對戰 ${match.bottomTeam.name || '待定'} 戰況明細`}
        className={`w-full text-left rounded-2xl border transition-all p-4 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md cursor-pointer group ${
          statusType === 'LIVE'
            ? 'bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/50 border-emerald-400 ring-2 ring-emerald-400/30'
            : statusType === 'COMPLETED'
              ? 'bg-white border-stone-200 hover:border-orange-300'
              : 'bg-white border-stone-200 hover:border-sky-300'
        }`}
      >
        {/* 卡片標頭 */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-extrabold text-stone-700 flex items-center gap-1.5 truncate">
            <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200">
              #{match.id.split('-').pop()}
            </span>
            <span className="truncate">{getMatchBadgeTitle(match)}</span>
          </span>

          {statusType === 'LIVE' && (
            <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center gap-1.5 shrink-0 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
              LIVE 進行中
            </span>
          )}
          {statusType === 'UPCOMING' && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                bothReady
                  ? 'bg-sky-100 text-sky-800 border border-sky-200'
                  : 'bg-stone-100 text-stone-500'
              }`}
            >
              {bothReady ? '對陣已定 · 待開賽' : '等待前場晉級'}
            </span>
          )}
          {statusType === 'COMPLETED' && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold shrink-0">
              ✓ 已完賽
            </span>
          )}
        </div>

        {/* 雙隊比分列 */}
        <div className="space-y-2 bg-stone-50/80 rounded-xl p-3 border border-stone-200/80">
          {['topTeam', 'bottomTeam'].map((pos) => {
            const team = match[pos];
            const isDetermined = Boolean(team.id && team.id !== 'BYE');
            const displayName =
              team.id === 'BYE'
                ? '輪空 (BYE)'
                : team.name || team.placeholder || '待定';
            return (
              <div
                key={pos}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-5 rounded-full shrink-0 ${
                      team.isWinner
                        ? 'bg-orange-500'
                        : isDetermined
                          ? 'bg-stone-300'
                          : 'bg-stone-200'
                    }`}
                  ></span>
                  <span
                    className={`text-sm sm:text-base truncate ${
                      team.isWinner
                        ? 'font-black text-stone-900'
                        : isDetermined
                          ? 'font-bold text-stone-700'
                          : 'font-medium text-stone-400 italic'
                    } ${team.isForfeit ? 'line-through opacity-60' : ''}`}
                    title={displayName}
                  >
                    {displayName}
                  </span>
                  {team.isWinner && (
                    <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px] font-black shrink-0">
                      勝
                    </span>
                  )}
                </div>

                <span
                  className={`font-mono text-base sm:text-lg shrink-0 ${
                    team.isForfeit
                      ? 'text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded'
                      : team.isWinner
                        ? 'font-black text-orange-700 bg-orange-100/80 px-2.5 py-0.5 rounded-lg'
                        : team.score !== null && team.score !== undefined
                          ? 'font-bold text-stone-700 px-2'
                          : 'text-stone-400 px-2'
                  }`}
                >
                  {team.isForfeit
                    ? '棄權'
                    : team.score !== null && team.score !== undefined
                      ? team.score
                      : '-'}
                </span>
              </div>
            );
          })}
        </div>

        {/* 底部即時資訊或各局明細 */}
        <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
          <div className="min-w-0 truncate text-stone-600 font-medium">
            {match.liveMeta ? (
              <span className="text-emerald-800 font-bold">
                📡 {match.liveMeta}
                {activeLock?.deviceName ? `（${activeLock.deviceName}）` : ''}
              </span>
            ) : setSummary || pkSummary ? (
              <span className="font-mono text-stone-600">
                明細：{setSummary}
                {setSummary && pkSummary ? ' · ' : ''}
                {pkSummary && <strong className="text-amber-800">{pkSummary}</strong>}
              </span>
            ) : (
              <span className="text-stone-400">點擊卡片查看完整各局／各半場戰況表</span>
            )}
          </div>

          <span className="text-sky-700 group-hover:text-sky-900 font-extrabold shrink-0 inline-flex items-center gap-1">
            <span>詳情</span>
            <i
              className="fa-solid fa-chevron-right text-[10px] group-hover:translate-x-0.5 transition-transform"
              aria-hidden="true"
            ></i>
          </span>
        </div>
      </button>
    );
  };

  return (
    <section
      aria-label="即時戰況看板"
      className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6"
    >
      {/* 頂部賽事進度與搜尋篩選列 */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-black flex items-center gap-1.5">
              <i className={`fa-solid ${sport.icon}`} aria-hidden="true"></i>
              {sport.name}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-stone-800">
              📺 {stage?.name || '本階段賽事'} · 即時戰況看板
            </h2>
            <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full">
              🛡️ 防誤觸唯讀檢視（點擊場次僅顯示明細）
            </span>
          </div>

          {/* 進度條 */}
          <div className="flex items-center gap-3 text-xs font-bold text-stone-600">
            <label htmlFor={`${searchInputId}-progress`}>
              完賽進度：{categorized.totalFinished} / {categorized.totalPlayable} 場
            </label>
            <progress
              id={`${searchInputId}-progress`}
              value={categorized.totalFinished}
              max={Math.max(1, categorized.totalPlayable)}
              className="w-36 sm:w-48 h-2.5 rounded-full overflow-hidden accent-orange-600"
            />
            {categorized.liveMatches.length > 0 && (
              <span className="text-red-600 font-black flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                {categorized.liveMatches.length} 場進行中
              </span>
            )}
          </div>
        </div>

        {/* 隊伍搜尋框 + 觀賽 QR Code 按鈕 */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
            <label htmlFor={searchInputId} className="visually-hidden">
              搜尋班級或隊伍名稱
            </label>
            <i
              className="fa-solid fa-magnifying-glass text-stone-400 text-xs absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            ></i>
            <input
              id={searchInputId}
              type="search"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              placeholder="輸入班級或隊伍名稱篩選..."
              className="w-full pl-9 pr-3 py-2 min-h-[40px] text-xs sm:text-sm font-bold bg-stone-50 border border-stone-300 rounded-xl text-stone-800"
            />
          </div>

          {onOpenShareModal && (
            <button
              type="button"
              onClick={onOpenShareModal}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <i className="fa-solid fa-qrcode" aria-hidden="true"></i>
              <span>家長／同學觀賽 QR Code</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. 🔴 進行中賽事 (LIVE) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-black text-stone-800 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></span>
            <span>正在進行中賽事 (LIVE)</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-extrabold">
              {categorized.liveMatches.length} 場
            </span>
          </h3>
        </div>

        {categorized.liveMatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorized.liveMatches.map((m) => renderBoardMatchCard(m, 'LIVE'))}
          </div>
        ) : (
          <div className="bg-white/80 border border-dashed border-stone-300 rounded-2xl p-6 text-center text-xs sm:text-sm text-stone-500 font-medium">
            目前沒有正在進行中的場次；當場邊裁判平板開啟記分板時，即時比分會自動顯示於此。
          </div>
        )}
      </div>

      {/* 2. ⏳ 即將開打 / 待開賽場次 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-black text-stone-800 flex items-center gap-2">
            <i className="fa-solid fa-clock text-sky-600" aria-hidden="true"></i>
            <span>即將開打／待開賽場次</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-extrabold">
              {categorized.upcomingMatches.length} 場
            </span>
          </h3>
        </div>

        {categorized.upcomingMatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorized.upcomingMatches.map((m) => renderBoardMatchCard(m, 'UPCOMING'))}
          </div>
        ) : (
          <div className="bg-white/80 border border-dashed border-stone-300 rounded-2xl p-5 text-center text-xs sm:text-sm text-stone-500 font-medium">
            所有待開賽場次皆已完成或無符合篩選條件的隊伍。
          </div>
        )}
      </div>

      {/* 3. ✅ 已完賽結果 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-black text-stone-800 flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-emerald-600" aria-hidden="true"></i>
            <span>已完賽結果與各局明細</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
              {categorized.completedMatches.length} 場
            </span>
          </h3>
        </div>

        {categorized.completedMatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorized.completedMatches.map((m) => renderBoardMatchCard(m, 'COMPLETED'))}
          </div>
        ) : (
          <div className="bg-white/80 border border-dashed border-stone-300 rounded-2xl p-5 text-center text-xs sm:text-sm text-stone-500 font-medium">
            尚無已完賽場次。
          </div>
        )}
      </div>
    </section>
  );
};
