import React from 'react';
import { rankParticipants } from '../../utils/tournamentEngine';
import { MatchCard } from './MatchCard';

export const RoundRobinLayout = ({
  matches,
  participants,
  config,
  onMatchClick,
  isReadOnly,
}) => {
  const groups = [...new Set(participants.map((p) => p.groupId || 'A'))].sort();

  return (
    <div className="p-5 sm:p-8 max-w-7xl w-full mx-auto space-y-12">
      {groups.map((groupId) => {
        const groupParticipants = participants.filter(
          (p) => (p.groupId || 'A') === groupId
        );
        const groupMatches = matches.filter((m) => {
          if (m.groupId) return m.groupId === groupId;
          const p1 = participants.find((p) => p.id === m.topTeam.id);
          const p2 = participants.find((p) => p.id === m.bottomTeam.id);
          if (m.topTeam.id === 'BYE' || m.bottomTeam.id === 'BYE') return false;
          return (
            (p1 && (p1.groupId || 'A') === groupId) ||
            (p2 && (p2.groupId || 'A') === groupId)
          );
        });

        const sortedP = rankParticipants(groupParticipants);
        const headingId = `group-heading-${groupId}`;
        const captionText =
          config.groupCount > 1 ? `Group ${groupId} 循環賽積分榜` : '循環賽積分榜';

        return (
          <section
            key={groupId}
            aria-labelledby={headingId}
            className="flex flex-col xl:flex-row gap-8 animate-fade-in"
          >
            {/* 左側：響應式積分榜表格 (responsive-table) */}
            <div className="flex-grow xl:w-7/12 min-w-0">
              <h3
                id={headingId}
                className="text-xl font-extrabold mb-4 text-stone-800 flex items-center"
              >
                <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center mr-3 text-sm font-black shadow-sm border border-orange-200">
                  {groupId}
                </span>
                {captionText}
              </h3>

              <div
                tabIndex={0}
                role="region"
                aria-labelledby={headingId}
                className="table-wrapper bg-white border border-stone-300 rounded-2xl shadow-sm"
              >
                <table className="standings-table text-sm">
                  <caption className="visually-hidden">{captionText}</caption>
                  <thead className="bg-stone-100 border-b border-stone-300">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-bold text-stone-700">
                        名次
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-bold text-stone-700">
                        隊伍名稱
                      </th>
                      <th scope="col" className="px-3 py-3 text-center font-bold text-stone-700">
                        已賽
                      </th>
                      <th scope="col" className="px-3 py-3 text-center font-bold text-stone-700">
                        勝
                      </th>
                      <th scope="col" className="px-3 py-3 text-center font-bold text-stone-700">
                        和
                      </th>
                      <th scope="col" className="px-3 py-3 text-center font-bold text-stone-700">
                        敗
                      </th>
                      <th scope="col" className="px-3 py-3 text-center font-bold text-stone-700">
                        得分
                      </th>
                      <th scope="col" className="px-3 py-3 text-center font-bold text-stone-700">
                        失分
                      </th>
                      <th scope="col" className="px-3 py-3 text-center font-bold text-stone-700">
                        淨勝分
                      </th>
                      <th scope="col" className="px-4 py-3 text-center font-bold text-stone-700">
                        積分
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {sortedP.map((p, idx) => {
                      const s = p.stats || {
                        played: 0,
                        won: 0,
                        drawn: 0,
                        lost: 0,
                        gf: 0,
                        ga: 0,
                        gd: 0,
                        pts: 0,
                      };
                      let rowClass = 'bg-white hover:bg-stone-50 transition-colors';
                      if (idx === 0 && s.played > 0) {
                        rowClass =
                          'bg-amber-50/70 hover:bg-amber-50 border-l-4 border-amber-500';
                      } else if (idx === 1 && s.played > 0) {
                        rowClass =
                          'bg-orange-50/40 hover:bg-orange-50/70 border-l-4 border-orange-400';
                      }

                      return (
                        <tr key={p.id} className={rowClass}>
                          <td data-col="名次" className="px-4 py-3 font-extrabold text-stone-700">
                            #{idx + 1}
                            {idx === 0 && s.played > 0 && (
                              <i
                                className="fa-solid fa-trophy text-amber-500 ml-1.5"
                                aria-hidden="true"
                              ></i>
                            )}
                          </td>
                          <th
                            scope="row"
                            className="px-4 py-3 font-extrabold text-stone-800 text-left"
                          >
                            {p.name}
                          </th>
                          <td
                            data-col="已賽"
                            className="px-3 py-3 text-center font-medium text-stone-700 font-mono"
                          >
                            {s.played}
                          </td>
                          <td
                            data-col="勝"
                            className="px-3 py-3 text-center font-bold text-emerald-700 font-mono"
                          >
                            {s.won}
                          </td>
                          <td
                            data-col="和"
                            className="px-3 py-3 text-center font-medium text-stone-600 font-mono"
                          >
                            {s.drawn}
                          </td>
                          <td
                            data-col="敗"
                            className="px-3 py-3 text-center font-bold text-red-700 font-mono"
                          >
                            {s.lost}
                          </td>
                          <td
                            data-col="得分"
                            className="px-3 py-3 text-center text-stone-700 font-mono"
                          >
                            {s.gf}
                          </td>
                          <td
                            data-col="失分"
                            className="px-3 py-3 text-center text-stone-700 font-mono"
                          >
                            {s.ga}
                          </td>
                          <td
                            data-col="淨勝分"
                            className={`px-3 py-3 text-center font-bold font-mono ${
                              s.gd > 0
                                ? 'text-emerald-700'
                                : s.gd < 0
                                  ? 'text-red-700'
                                  : 'text-stone-600'
                            }`}
                          >
                            {s.gd > 0 ? `+${s.gd}` : s.gd}
                          </td>
                          <td
                            data-col="積分"
                            className="px-4 py-3 text-center font-black text-orange-700 text-base font-mono"
                          >
                            {s.pts}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-stone-600">
                排序規則：積分（勝 3 分、和 1 分、敗 0 分）→ 淨勝分 → 總得分。
              </p>
            </div>

            {/* 右側：該組對戰賽程卡片 */}
            <div className="w-full xl:w-5/12 min-w-[290px]">
              <h3 className="text-xl font-extrabold mb-4 text-stone-800 flex items-center justify-between">
                <span>
                  <i
                    className="fa-regular fa-calendar-days mr-2 text-stone-600"
                    aria-hidden="true"
                  ></i>
                  對戰場次 ({groupMatches.length} 場)
                </span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3.5 max-h-[560px] overflow-y-auto pr-1">
                {groupMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onClick={onMatchClick}
                    isCompact={true}
                    config={config}
                    isReadOnly={isReadOnly}
                  />
                ))}
                {groupMatches.length === 0 && (
                  <div className="text-stone-600 text-sm text-center py-8 border-2 border-dashed border-stone-300 rounded-xl col-span-full">
                    本組至少需 2 支隊伍才能產生對戰場次
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};
