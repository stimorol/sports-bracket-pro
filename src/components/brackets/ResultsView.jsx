import React from 'react';
import { computePodium, rankParticipants } from '../../utils/tournamentEngine';

const PodiumStep = ({ team, rank, badgeLabel, colorClass, heightPx, delayClass }) => (
  <div className={`flex flex-col items-center justify-end podium-item ${delayClass}`}>
    <div className="mb-3 flex flex-col items-center text-center max-w-[140px]">
      <span className="text-xs font-bold text-stone-600 mb-0.5">{badgeLabel}</span>
      <span className="font-extrabold text-base sm:text-lg text-stone-800 break-words leading-tight">
        {team?.name || '待產生'}
      </span>
      {team?.isForfeit && (
        <span className="text-xs text-red-700 font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded mt-1">
          棄權
        </span>
      )}
    </div>
    <div
      className={`w-24 sm:w-32 rounded-t-2xl shadow-xl flex items-center justify-center text-white text-4xl sm:text-5xl font-black ${colorClass} relative overflow-hidden`}
      style={{ height: `${heightPx}px` }}
    >
      <div
        className="absolute inset-0 bg-white opacity-10"
        style={{
          backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.6), transparent)',
        }}
        aria-hidden="true"
      ></div>
      <span>{rank}</span>
    </div>
  </div>
);

export const ResultsView = ({ stage, tournamentTitle }) => {
  const winners = computePodium(stage);
  const isMultiGroupRR =
    stage?.config.format === 'ROUND_ROBIN' && (stage?.config.groupCount || 1) > 1;
  const groups = isMultiGroupRR
    ? [...new Set(stage.participants.map((p) => p.groupId || 'A'))].sort()
    : [];

  return (
    <section
      aria-labelledby="podium-heading"
      className="flex flex-col items-center justify-center min-h-[65vh] p-6 sm:p-10 animate-fade-in"
    >
      <div className="text-center mb-12">
        <p className="text-sm font-bold text-orange-700 mb-1">
          {tournamentTitle} · {stage?.name}
        </p>
        <h2
          id="podium-heading"
          className="text-3xl font-black text-stone-800 tracking-wider border-b-4 border-orange-500 pb-2 inline-block"
        >
          <i className="fa-solid fa-trophy text-amber-500 mr-2.5" aria-hidden="true"></i>
          賽事榮耀頒獎台
        </h2>
      </div>

      {!winners[0] && !winners[1] ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center max-w-md shadow-sm">
          <i
            className="fa-solid fa-hourglass-half text-4xl text-orange-500 mb-3"
            aria-hidden="true"
          ></i>
          <h3 className="text-lg font-extrabold text-stone-800 mb-1">決賽結果尚未出爐</h3>
          <p className="text-sm text-stone-600">
            完成決賽（或循環賽計分）後，冠、亞、季、殿軍名次將自動呈現於頒獎台上！
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-center gap-3 sm:gap-6 mb-10">
            <PodiumStep
              team={winners[1]}
              rank="2"
              badgeLabel="亞軍"
              colorClass="bg-stone-500"
              heightPx={175}
              delayClass="podium-2"
            />
            <PodiumStep
              team={winners[0]}
              rank="1"
              badgeLabel="總冠軍"
              colorClass="bg-amber-500"
              heightPx={235}
              delayClass="podium-1"
            />
            {(winners[2] || stage?.config.hasThirdPlace || stage?.config.format !== 'SINGLE') && (
              <PodiumStep
                team={winners[2]}
                rank="3"
                badgeLabel="季軍"
                colorClass="bg-orange-700"
                heightPx={135}
                delayClass="podium-3"
              />
            )}
          </div>

          {winners[3] && (
            <div className="bg-white px-8 py-4 rounded-2xl shadow-sm border border-stone-300 podium-item podium-4 flex items-center gap-4 mb-8">
              <span className="text-stone-600 font-extrabold text-xs uppercase tracking-wider px-2.5 py-1 bg-stone-100 rounded-lg">
                第 4 名 (殿軍)
              </span>
              <span className="text-xl font-extrabold text-stone-800">
                {winners[3].name}
              </span>
            </div>
          )}
        </>
      )}

      {/* 多組循環賽時額外呈現各組前兩名摘要 */}
      {isMultiGroupRR && (
        <div className="w-full max-w-4xl mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {groups.map((gId) => {
            const topInGroup = rankParticipants(
              stage.participants.filter((p) => (p.groupId || 'A') === gId)
            ).slice(0, 3);
            return (
              <div
                key={gId}
                className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm"
              >
                <h3 className="font-extrabold text-stone-800 text-sm border-b border-stone-100 pb-2 mb-2.5 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-xs">
                    Group {gId}
                  </span>
                  分組前三名
                </h3>
                <ol className="space-y-1.5 text-sm">
                  {topInGroup.map((team, i) => (
                    <li key={team.id} className="flex justify-between items-center">
                      <span className="font-bold text-stone-700 truncate">
                        {i + 1}. {team.name}
                      </span>
                      <span className="text-xs font-mono font-bold text-orange-700">
                        {team.stats?.pts ?? 0} pts
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
