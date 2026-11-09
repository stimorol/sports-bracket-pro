import React, { useMemo } from 'react';
import { isLockActive } from '../../utils/deviceLock';
import { buildMatchRecordData } from '../../utils/matchRecordBuilder';
import { ModalDialog } from '../common/ModalDialog';

/**
 * 觀賽者專用唯讀比賽戰況明細視窗 (SpectatorMatchModal)
 * - 100% 唯讀防誤觸設計：不包含任何比分輸入框、棄權按鈕或賽程修改控制項
 * - 提供家長、同學與觀眾清楚查看：目前即時比分、各節／各局／各半場明細表、PK 點球結果、特殊備註與晉級動向
 */
export const SpectatorMatchModal = ({
  match,
  stage,
  tournamentTitle,
  isOpen,
  onClose,
}) => {
  const record = useMemo(() => {
    if (!match || !stage) return null;
    return buildMatchRecordData({
      match,
      stage,
      tournamentTitle,
    });
  }, [match, stage, tournamentTitle]);

  const activeLock = match && isLockActive(match.lockInfo) ? match.lockInfo : null;

  // 推算晉級下一場次提示（若有 nextMatchId）
  const advancementHint = useMemo(() => {
    if (!match || !stage?.matches) return null;
    const hints = [];
    if (match.nextMatchId) {
      const nextNum = match.nextMatchId.split('-').pop();
      hints.push(`勝方晉級至「場次 #${nextNum}」`);
    }
    if (match.loserNextMatchId) {
      const loserNum = match.loserNextMatchId.split('-').pop();
      hints.push(`敗方進入「場次 #${loserNum}」`);
    }
    return hints.length > 0 ? hints.join(' ｜ ') : null;
  }, [match, stage]);

  if (!isOpen || !match || !record) return null;

  const isLive = Boolean(match.liveMeta || activeLock);
  const isFinished = record.statusType === 'COMPLETED' || record.statusType === 'FORFEIT';

  return (
    <ModalDialog
      isOpen={isOpen && Boolean(match)}
      onClose={onClose}
      closedBy="any"
      widthClass="w-full max-w-2xl"
    >
      {({ titleId }) => (
        <div className="flex flex-col max-h-[88vh] bg-white">
          {/* 頂部觀賽唯讀標頭 */}
          <div className="bg-stone-900 text-white px-5 py-4 flex items-center justify-between gap-3 border-b border-stone-800">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-extrabold flex items-center gap-1.5">
                <i className="fa-solid fa-eye" aria-hidden="true"></i>
                觀賽戰況明細 (唯讀防誤觸)
              </span>
              <h2 id={titleId} className="text-base sm:text-lg font-black truncate">
                {record.stageName} · {record.matchTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="關閉戰況明細視窗"
              className="w-9 h-9 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
            </button>
          </div>

          {/* 內容區 */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            {/* 賽事與賽制膠囊列 */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 font-bold border border-stone-200">
                  <i className={`fa-solid ${record.sportIcon} mr-1.5 text-orange-600`} aria-hidden="true"></i>
                  {record.sportName}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 font-bold border border-stone-200">
                  {record.rulesSummary}
                </span>
              </div>

              <span
                className={`px-3 py-1 rounded-full font-extrabold flex items-center gap-1.5 ${
                  isLive
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : isFinished
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-stone-100 text-stone-600 border border-stone-200'
                }`}
              >
                {isLive && (
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                )}
                {isLive ? '進行中 LIVE' : record.statusLabel}
              </span>
            </div>

            {/* 即時賽況橫幅 (若場邊平板正在記分) */}
            {(match.liveMeta || activeLock) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-bold text-emerald-950">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                  <span>
                    場邊即時狀態：
                    <strong className="ml-1 text-emerald-900">
                      {match.liveMeta || '場邊裁判平板記分進行中'}
                    </strong>
                  </span>
                </div>
                {activeLock?.deviceName && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-800 font-extrabold">
                    <i className="fa-solid fa-tablet-screen-button mr-1" aria-hidden="true"></i>
                    {activeLock.deviceName}
                  </span>
                )}
              </div>
            )}

            {/* 主計分板大字對戰卡 */}
            <div className="rounded-2xl bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 text-white p-5 sm:p-6 shadow-lg border border-stone-800">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
                {/* A 隊 */}
                <div className="text-center space-y-1.5 min-w-0">
                  <div className="flex items-center justify-center gap-1.5">
                    {record.teamA.isSeed && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black border border-amber-400/40">
                        種子
                      </span>
                    )}
                    {record.teamA.isWinner && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 text-[11px] font-black">
                        👑 勝方
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-lg sm:text-2xl font-black truncate ${
                      record.teamA.isWinner ? 'text-amber-300' : 'text-white'
                    }`}
                    title={record.teamA.name}
                  >
                    {record.teamA.name}
                  </div>
                  {record.teamA.isForfeit && (
                    <div className="text-xs font-bold text-red-400">棄權</div>
                  )}
                </div>

                {/* 中央大比分 */}
                <div className="flex flex-col items-center justify-center px-4 py-2.5 rounded-2xl bg-black/50 border border-stone-800">
                  <div className="flex items-center gap-3 sm:gap-4 font-mono font-black text-2xl sm:text-4xl tracking-tight">
                    <span className={record.teamA.isWinner ? 'text-amber-400' : 'text-white'}>
                      {record.teamA.headlineScore}
                    </span>
                    <span className="text-stone-600 text-xl sm:text-2xl">:</span>
                    <span className={record.teamB.isWinner ? 'text-amber-400' : 'text-white'}>
                      {record.teamB.headlineScore}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-stone-400 mt-1">
                    {record.effectiveBestOf > 1 ? `勝${record.unitWord}比數` : '比賽比分'}
                  </span>
                </div>

                {/* B 隊 */}
                <div className="text-center space-y-1.5 min-w-0">
                  <div className="flex items-center justify-center gap-1.5">
                    {record.teamB.isSeed && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black border border-amber-400/40">
                        種子
                      </span>
                    )}
                    {record.teamB.isWinner && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 text-[11px] font-black">
                        👑 勝方
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-lg sm:text-2xl font-black truncate ${
                      record.teamB.isWinner ? 'text-amber-300' : 'text-white'
                    }`}
                    title={record.teamB.name}
                  >
                    {record.teamB.name}
                  </div>
                  {record.teamB.isForfeit && (
                    <div className="text-xs font-bold text-red-400">棄權</div>
                  )}
                </div>
              </div>
            </div>

            {/* 各節 / 各局 / 各半場比分明細表 (嚴格遵循 modern-web-guidance `accessibility` 表格語意規範) */}
            <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse text-center">
                  <caption className="bg-stone-50 px-4 py-2.5 text-left text-xs font-extrabold text-stone-700 border-b border-stone-200">
                    📊 各節／各局／各半場比分明細表
                  </caption>
                  <thead>
                    <tr className="bg-stone-100/80 text-stone-600 text-xs font-extrabold border-b border-stone-200">
                      <th scope="col" className="py-2.5 px-3 text-left min-w-[120px]">
                        參賽隊伍
                      </th>
                      {record.columns.map((col) => (
                        <th
                          key={col.key}
                          scope="col"
                          className={`py-2.5 px-2.5 font-mono ${
                            col.isSummary
                              ? 'bg-orange-50/80 text-orange-900 font-extrabold border-l border-stone-200'
                              : ''
                          }`}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {[record.teamA, record.teamB].map((team, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={team.isWinner ? 'bg-amber-50/40 font-bold' : 'bg-white'}
                      >
                        <th
                          scope="row"
                          className="py-3 px-3 text-left font-extrabold text-stone-800 truncate max-w-[160px]"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {team.isWinner && (
                              <i
                                className="fa-solid fa-crown text-amber-500 text-xs"
                                aria-hidden="true"
                              ></i>
                            )}
                            <span>{team.name}</span>
                          </span>
                        </th>
                        {record.columns.map((col) => (
                          <td
                            key={col.key}
                            className={`py-3 px-2.5 font-mono ${
                              col.isSummary
                                ? 'text-base font-black text-orange-800 bg-orange-50/50 border-l border-stone-200'
                                : 'text-stone-700 font-bold'
                            }`}
                          >
                            {(rowIdx === 0 ? col.valA : col.valB) || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 特殊賽況備註（紅黃牌、犯規、PK、目前攻守等）與晉級路徑 */}
            {(record.liveStatsNote || advancementHint) && (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-2 text-xs text-stone-700">
                {record.liveStatsNote && (
                  <div className="space-y-1">
                    <div className="font-extrabold text-stone-800">📋 場邊賽況與統計備註：</div>
                    <div className="font-medium text-stone-600">{record.liveStatsNote}</div>
                  </div>
                )}
                {advancementHint && (
                  <div className="pt-2 border-t border-stone-200/80 flex items-center gap-2 font-bold text-orange-800">
                    <i className="fa-solid fa-route text-orange-600" aria-hidden="true"></i>
                    <span>晉級路線：{advancementHint}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部關閉列 */}
          <div className="bg-stone-50 px-6 py-3.5 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
            <span>
              <i className="fa-solid fa-shield-halved mr-1.5 text-sky-600" aria-hidden="true"></i>
              觀賽防誤觸保護中：點擊任何區域皆不會改動大會比賽成績
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 min-h-[40px] rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-extrabold text-xs transition-colors"
            >
              關閉視窗
            </button>
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
