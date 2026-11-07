import React, { useEffect, useMemo, useState } from 'react';
import { rankParticipantsAcrossGroups } from '../../utils/tournamentEngine';
import { ModalDialog } from '../common/ModalDialog';

export const PromotionModal = ({
  isOpen,
  onClose,
  prevStageParticipants,
  onConfirm,
}) => {
  const ranked = useMemo(
    () => rankParticipantsAcrossGroups(prevStageParticipants || []),
    [prevStageParticipants]
  );

  // 使用單一 orderedIds 陣列同時紀錄「已勾選晉級的隊伍」與「手動調整後的種子順位」
  // 解決原版在左欄新增/取消勾選時，右欄手動調好的種子順序被重置洗掉的 Bug！
  const [orderedIds, setOrderedIds] = useState([]);

  useEffect(() => {
    if (isOpen && ranked.length > 0) {
      const defaultCount = Math.max(2, Math.ceil(ranked.length / 2));
      setOrderedIds(ranked.slice(0, defaultCount).map((p) => p.id));
    }
  }, [isOpen, ranked]);

  const selectedSet = useMemo(() => new Set(orderedIds), [orderedIds]);

  const toggleSelect = (id) => {
    setOrderedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectTopNPerGroup = (n) => {
    const picked = ranked.filter((p) => (p.groupRank || 1) <= n).map((p) => p.id);
    setOrderedIds(picked);
  };

  const moveItem = (index, direction) => {
    setOrderedIds((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const orderedParticipants = useMemo(() => {
    const byId = new Map(ranked.map((p) => [p.id, p]));
    return orderedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [orderedIds, ranked]);

  const hasMultipleGroups = useMemo(() => {
    const groups = new Set(ranked.map((p) => p.groupId || 'A'));
    return groups.size > 1;
  }, [ranked]);

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      closedBy="closerequest"
      widthClass="w-full max-w-4xl"
    >
      {({ titleId }) => (
        <div className="flex flex-col h-[82vh]">
          {/* Header */}
          <div className="bg-gradient-to-r from-stone-800 to-stone-700 px-6 py-4 text-white flex justify-between items-center">
            <h2 id={titleId} className="text-lg font-extrabold flex items-center">
              <i className="fa-solid fa-ranking-star mr-2.5 text-orange-400" aria-hidden="true"></i>
              晉級下一階段隊伍與種子順位設定
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉晉級設定視窗"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
            </button>
          </div>

          {/* Content */}
          <div className="flex-grow grid grid-cols-1 md:grid-cols-2 overflow-hidden">
            {/* 左欄：勾選晉級隊伍 */}
            <div className="border-b md:border-b-0 md:border-r border-stone-200 p-5 overflow-y-auto bg-stone-50/70">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-stone-800 flex items-center text-sm">
                  <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs mr-2 font-extrabold">
                    1
                  </span>
                  勾選晉級隊伍（已選 {orderedIds.length} 隊）
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {hasMultipleGroups && (
                    <>
                      <button
                        type="button"
                        onClick={() => selectTopNPerGroup(1)}
                        className="text-xs px-2.5 py-1 bg-white border border-stone-300 hover:border-orange-500 rounded-lg font-bold text-stone-700"
                      >
                        各組第 1
                      </button>
                      <button
                        type="button"
                        onClick={() => selectTopNPerGroup(2)}
                        className="text-xs px-2.5 py-1 bg-white border border-stone-300 hover:border-orange-500 rounded-lg font-bold text-stone-700"
                      >
                        各組前 2
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setOrderedIds(ranked.map((p) => p.id))}
                    className="text-xs px-2.5 py-1 bg-white border border-stone-300 hover:border-orange-500 rounded-lg font-bold text-stone-700"
                  >
                    全選
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {ranked.map((p, idx) => {
                  const isChecked = selectedSet.has(p.id);
                  const s = p.stats || { won: 0, drawn: 0, lost: 0, pts: 0, gd: 0 };
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all select-none ${
                        isChecked
                          ? 'bg-orange-50 border-orange-400 shadow-sm'
                          : 'bg-white border-stone-200 hover:border-orange-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(p.id)}
                        className="w-5 h-5 accent-orange-600 rounded mr-3 shrink-0"
                      />
                      <div className="flex-grow min-w-0">
                        <div className="font-bold text-stone-800 truncate">{p.name}</div>
                        <div className="text-xs text-stone-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                          {hasMultipleGroups && (
                            <span className="px-1.5 py-0.5 bg-stone-200 rounded text-[11px] font-bold text-stone-700">
                              Group {p.groupId} #{p.groupRank}
                            </span>
                          )}
                          <span>
                            {s.won}勝 {s.drawn}和 {s.lost}敗
                          </span>
                          <span>|</span>
                          <span>淨勝 {s.gd >= 0 ? `+${s.gd}` : s.gd}</span>
                          <span>|</span>
                          <span>
                            積分 <strong className="text-orange-700">{s.pts}</strong>
                          </span>
                        </div>
                      </div>
                      <div className="text-lg font-black text-stone-400 font-mono ml-2">
                        #{idx + 1}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 右欄：調整籤表順位 */}
            <div className="p-5 overflow-y-auto bg-white">
              <h3 className="font-bold text-stone-800 mb-3 flex items-center text-sm">
                <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs mr-2 font-extrabold">
                  2
                </span>
                調整下一輪籤表順位（保留手動調整順序）
              </h3>
              <div className="text-xs text-stone-700 mb-4 bg-orange-50 p-3 rounded-xl border border-orange-200 flex items-start gap-2">
                <i className="fa-solid fa-circle-info text-orange-600 mt-0.5" aria-hidden="true"></i>
                <span>
                  第 1 順位即為下一輪第 1 種子籤位（標準交叉配對：#1 對最後順位、#1 與 #2 分處左右半區）。
                </span>
              </div>

              {orderedParticipants.length === 0 ? (
                <div className="text-center py-12 text-sm text-stone-500 border-2 border-dashed border-stone-200 rounded-xl">
                  請先從左側勾選至少 2 支晉級隊伍
                </div>
              ) : (
                <div className="space-y-2">
                  {orderedParticipants.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center p-2.5 bg-stone-50 rounded-xl border border-stone-200"
                    >
                      <span className="w-8 text-center font-mono text-orange-700 font-extrabold text-base">
                        {idx + 1}
                      </span>
                      <div className="flex-grow min-w-0">
                        <span className="font-bold text-stone-800 truncate block">{p.name}</span>
                        {hasMultipleGroups && (
                          <span className="text-[11px] text-stone-600">
                            Group {p.groupId} 第 {p.groupRank} 名
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveItem(idx, -1)}
                          aria-label={`將 ${p.name} 往上移一順位`}
                          className="w-9 h-9 flex items-center justify-center bg-white border border-stone-200 hover:border-orange-400 rounded-lg text-stone-600 hover:text-orange-600 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                        >
                          <i className="fa-solid fa-chevron-up" aria-hidden="true"></i>
                        </button>
                        <button
                          type="button"
                          disabled={idx === orderedParticipants.length - 1}
                          onClick={() => moveItem(idx, 1)}
                          aria-label={`將 ${p.name} 往下移一順位`}
                          className="w-9 h-9 flex items-center justify-center bg-white border border-stone-200 hover:border-orange-400 rounded-lg text-stone-600 hover:text-orange-600 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                        >
                          <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex justify-between items-center">
            <span className="text-xs font-medium text-stone-600">
              {orderedParticipants.length < 2 ? '至少需選擇 2 支隊伍才能建立下一階段' : `共 ${orderedParticipants.length} 隊晉級`}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 min-h-[44px] text-sm font-bold text-stone-600 hover:bg-stone-200/70 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={orderedParticipants.length < 2}
                onClick={() => onConfirm(orderedParticipants)}
                className="px-6 py-2.5 min-h-[44px] text-sm bg-stone-800 text-white rounded-xl font-bold hover:bg-stone-900 disabled:bg-stone-300 disabled:cursor-not-allowed shadow transition-all flex items-center"
              >
                建立下一階段賽程
                <i className="fa-solid fa-arrow-right ml-2" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
