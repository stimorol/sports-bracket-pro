import React, { useEffect, useId, useState } from 'react';
import { SPORTS } from '../../constants/sports';
import { getOrCreateDeviceId, isLockedByAnotherDevice } from '../../utils/deviceLock';
import {
  hasPlayedDownstreamMatches,
  validateAndComputeScore,
} from '../../utils/tournamentEngine';
import { ModalDialog } from '../common/ModalDialog';

export const ScoreModal = ({
  match,
  allMatches,
  isOpen,
  onClose,
  onSave,
  onLaunchScoreboard,
  onForceTakeover,
  onUpdateBestOf,
  onOpenMatchRecord,
  config,
}) => {
  const formId = useId();
  const sport = SPORTS[config?.sport] || SPORTS.OTHER;
  const [localBestOf, setLocalBestOf] = useState(config?.bestOf || 1);
  const [sets, setSets] = useState([{ a: '', b: '' }]);
  const [penaltySet, setPenaltySet] = useState({ a: '', b: '' });
  const [allowCustomMargin, setAllowCustomMargin] = useState(false);
  const [error, setError] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);

  useEffect(() => {
    if (!match || !isOpen) return;
    const targetBestOf = match.customBestOf || config.bestOf || 1;
    setLocalBestOf(targetBestOf);
    setError(null);
    setPendingPayload(null);

    const initial = Array.from({ length: targetBestOf }, () => ({ a: '', b: '' }));
    if (match.setScores && match.setScores.length > 0) {
      match.setScores.forEach((s, i) => {
        if (i < initial.length) {
          initial[i] = { a: String(s.a), b: String(s.b) };
        }
      });
    } else if (
      targetBestOf === 1 &&
      match.topTeam.score !== null &&
      match.bottomTeam.score !== null &&
      !match.topTeam.isForfeit &&
      !match.bottomTeam.isForfeit
    ) {
      initial[0] = {
        a: String(match.topTeam.score),
        b: String(match.bottomTeam.score),
      };
    }
    setSets(initial);
    if (match.penaltyScore && match.penaltyScore.a !== undefined && match.penaltyScore.b !== undefined) {
      setPenaltySet({
        a: String(match.penaltyScore.a),
        b: String(match.penaltyScore.b),
      });
    } else {
      setPenaltySet({ a: '', b: '' });
    }
  }, [match, isOpen, config?.bestOf]);

  const handleBestOfChange = (nextBestOf) => {
    setLocalBestOf(nextBestOf);
    setError(null);
    setPendingPayload(null);
    if (match) {
      onUpdateBestOf?.(match.id, nextBestOf);
    }
    setSets((prev) => {
      const next = Array.from({ length: nextBestOf }, () => ({ a: '', b: '' }));
      prev.forEach((s, i) => {
        if (i < next.length) next[i] = s;
      });
      return next;
    });
  };

  const updateSet = (index, side, value) => {
    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [side]: value };
      return next;
    });
    // 依循 modern-web-guidance `forms`：使用者開始修正時立即清除錯誤訊息
    if (error) setError(null);
    if (pendingPayload) setPendingPayload(null);
  };

  const commitWithDownstreamGuard = (payload) => {
    if (
      config.format !== 'ROUND_ROBIN' &&
      !pendingPayload &&
      hasPlayedDownstreamMatches(allMatches || [], match.id)
    ) {
      setPendingPayload(payload);
      return;
    }
    onSave(match.id, payload);
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!match) return;

    const { error: validationError, result } = validateAndComputeScore({
      sets,
      localBestOf,
      sportId: config.sport,
      format: config.format,
      allowCustomMargin,
      penaltySet,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    commitWithDownstreamGuard(result);
  };

  const handleForfeit = (forfeitingSide) => {
    const winnerId =
      forfeitingSide === 'top' ? match.bottomTeam.id : match.topTeam.id;
    commitWithDownstreamGuard({
      scoreA: null,
      scoreB: null,
      setScores: [],
      isForfeit: true,
      winnerId,
      customBestOf: localBestOf,
    });
  };

  const handleClearMatch = () => {
    commitWithDownstreamGuard({ action: 'clear' });
  };

  const hasExistingResult =
    match &&
    (match.topTeam.score !== null ||
      match.bottomTeam.score !== null ||
      match.topTeam.isForfeit ||
      match.bottomTeam.isForfeit);

  const lockedByOther =
    match && isLockedByAnotherDevice(match, getOrCreateDeviceId());

  return (
    <ModalDialog isOpen={isOpen && Boolean(match)} onClose={onClose} closedBy="any" widthClass="w-full max-w-lg">
      {({ titleId }) =>
        match && (
          <form onSubmit={handleSubmit} className="flex flex-col max-h-[88vh]">
            {/* Header */}
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 id={titleId} className="text-lg font-extrabold text-stone-800">
                  登錄比賽成績
                </h2>
                <div className="flex items-center gap-1.5">
                  <label htmlFor={`${formId}-bestof`} className="text-xs font-bold text-stone-600">
                    賽制：
                  </label>
                  <select
                    id={`${formId}-bestof`}
                    name="bestOf"
                    value={localBestOf}
                    onChange={(e) => handleBestOfChange(parseInt(e.target.value, 10))}
                    className="text-xs font-bold bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-stone-700"
                  >
                    <option value={1}>單場決勝</option>
                    <option value={3}>3 戰 2 勝</option>
                    <option value={5}>5 戰 3 勝</option>
                    <option value={7}>7 戰 4 勝</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉成績輸入視窗"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 transition-colors"
              >
                <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* 一鍵切換至場邊平板數位記分板入口 (完整帶入目前選擇的幾戰幾勝賽制！) */}
              {onLaunchScoreboard && !lockedByOther && (
                <button
                  type="button"
                  onClick={() => onLaunchScoreboard(match, localBestOf)}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 hover:from-stone-800 hover:to-stone-800 text-white border border-stone-700 shadow-md flex items-center justify-between gap-3 text-left transition-all group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-tablet-screen-button text-xl" aria-hidden="true"></i>
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-sm sm:text-base flex items-center flex-wrap gap-2">
                        <span>開啟「{sport.name}數位記分板模式」</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500 text-stone-950 font-black">
                          {localBestOf > 1
                            ? `${localBestOf}戰${Math.ceil(localBestOf / 2)}勝制`
                            : '單場決勝'}
                        </span>
                      </div>
                      <div className="text-xs text-stone-300 mt-0.5 truncate">
                        {localBestOf > 1
                          ? `支援每一戰獨立使用記分板、跨戰存檔續記與自動統計勝場`
                          : `變身大字標準比賽記分板，自動鎖定本場次防他人誤改`}
                      </div>
                    </div>
                  </div>
                  <i
                    className="fa-solid fa-chevron-right text-orange-400 group-hover:translate-x-1 transition-transform shrink-0"
                    aria-hidden="true"
                  ></i>
                </button>
              )}

              {/* 其他裝置鎖定中保護提示 */}
              {lockedByOther && (
                <div
                  role="alert"
                  className="bg-amber-50 border-2 border-amber-300 text-amber-950 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start gap-2.5 text-xs sm:text-sm font-bold">
                    <i className="fa-solid fa-lock text-amber-600 mt-0.5 text-base" aria-hidden="true"></i>
                    <div>
                      <div>
                        此場次正由「<strong>{match.lockInfo?.deviceName || '場邊平板'}</strong>」開啟記分板鎖定中！
                      </div>
                      <div className="text-xs font-medium text-amber-800 mt-1">
                        為防止多台裝置同時覆寫分數，目前禁止從本裝置直接輸入。若該平板沒電或斷線，您可強制接管：
                      </div>
                    </div>
                  </div>
                  {onForceTakeover && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onForceTakeover(match)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition-colors"
                      >
                        <i className="fa-solid fa-bolt mr-1.5" aria-hidden="true"></i>
                        強制接管並開啟記分板
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 對戰隊伍標頭 */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <div className="font-extrabold text-stone-800 text-center truncate text-base" title={match.topTeam.name}>
                  {match.topTeam.name}
                </div>
                <div className="text-xs font-black text-orange-600 px-2 py-0.5 bg-orange-100 rounded-full">
                  VS
                </div>
                <div className="font-extrabold text-stone-800 text-center truncate text-base" title={match.bottomTeam.name}>
                  {match.bottomTeam.name}
                </div>
              </div>

              {/* 各局/場分數輸入 */}
              <fieldset disabled={Boolean(lockedByOther)} className={`space-y-3 ${lockedByOther ? 'opacity-45' : ''}`}>
                <legend className="visually-hidden">各局比分輸入</legend>
                {sets.map((set, idx) => {
                  const rowLabel =
                    localBestOf > 1
                      ? sport.type === 'sets'
                        ? `第 ${idx + 1} 局`
                        : `第 ${idx + 1} 場`
                      : '全場比分';
                  return (
                    <div key={idx} className="flex items-center justify-center gap-3">
                      <span className="text-xs font-mono font-bold text-stone-600 w-16 text-right">
                        {rowLabel}
                      </span>
                      <input
                        id={`${formId}-s${idx}-a`}
                        name={`set_${idx}_a`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="0"
                        autoFocus={idx === 0}
                        aria-label={`${match.topTeam.name} ${rowLabel}分數`}
                        value={set.a}
                        onChange={(e) => updateSet(idx, 'a', e.target.value)}
                        className="w-24 min-h-[48px] text-center text-2xl font-extrabold p-2 border border-stone-300 rounded-xl bg-white text-stone-800"
                      />
                      <span className="text-stone-400 font-bold" aria-hidden="true">
                        :
                      </span>
                      <input
                        id={`${formId}-s${idx}-b`}
                        name={`set_${idx}_b`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="0"
                        aria-label={`${match.bottomTeam.name} ${rowLabel}分數`}
                        value={set.b}
                        onChange={(e) => updateSet(idx, 'b', e.target.value)}
                        className="w-24 min-h-[48px] text-center text-2xl font-extrabold p-2 border border-stone-300 rounded-xl bg-white text-stone-800"
                      />
                    </div>
                  );
                })}

                {/* 足球／五人制足球（或單場淘汰平手）：PK 點球大戰比分欄 */}
                {sport.scoreboardTemplate === 'SOCCER' && localBestOf === 1 && (
                  <div className="mt-3 pt-3 border-t border-dashed border-stone-200 bg-amber-50/60 p-3 rounded-xl space-y-2">
                    <div className="text-center text-xs font-extrabold text-amber-900">
                      ⚽ PK 點球大戰比分（正規賽平手需分勝負時填寫，非平手可留空）
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-xs font-mono font-bold text-amber-800 w-16 text-right">
                        PK 比分
                      </span>
                      <input
                        id={`${formId}-pk-a`}
                        name="penalty_a"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="-"
                        aria-label={`${match.topTeam.name} PK 點球分數`}
                        value={penaltySet.a}
                        onChange={(e) => {
                          setPenaltySet((prev) => ({ ...prev, a: e.target.value }));
                          if (error) setError(null);
                        }}
                        className="w-20 min-h-[42px] text-center text-lg font-extrabold p-1.5 border border-amber-300 rounded-xl bg-white text-stone-800"
                      />
                      <span className="text-amber-700 font-bold" aria-hidden="true">
                        :
                      </span>
                      <input
                        id={`${formId}-pk-b`}
                        name="penalty_b"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="-"
                        aria-label={`${match.bottomTeam.name} PK 點球分數`}
                        value={penaltySet.b}
                        onChange={(e) => {
                          setPenaltySet((prev) => ({ ...prev, b: e.target.value }));
                          if (error) setError(null);
                        }}
                        className="w-20 min-h-[42px] text-center text-lg font-extrabold p-1.5 border border-amber-300 rounded-xl bg-white text-stone-800"
                      />
                    </div>
                  </div>
                )}
              </fieldset>

              {/* 特殊局分差彈性開關 */}
              {sport.type === 'sets' && sport.minLead >= 2 && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <input
                    id={`${formId}-custom-margin`}
                    type="checkbox"
                    checked={allowCustomMargin}
                    onChange={(e) => {
                      setAllowCustomMargin(e.target.checked);
                      setError(null);
                    }}
                    className="w-4 h-4 accent-orange-600 rounded cursor-pointer"
                  />
                  <label
                    htmlFor={`${formId}-custom-margin`}
                    className="text-xs font-medium text-stone-600 cursor-pointer select-none"
                  >
                    允許自訂分差（如特別封頂制、時間到定勝負，不強制贏 2 分）
                  </label>
                </div>
              )}

              {/* 錯誤訊息宣告區 */}
              {error && (
                <div
                  role="alert"
                  className="text-center text-xs text-red-700 font-bold bg-red-50 p-3 rounded-xl border border-red-200 flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
                  <span>{error}</span>
                </div>
              )}

              {/* 下游已完賽變更警告 */}
              {pendingPayload && (
                <div
                  role="alert"
                  className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-4 text-xs space-y-3"
                >
                  <div className="font-bold flex items-start gap-2">
                    <i className="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5" aria-hidden="true"></i>
                    <span>
                      注意：後續輪次已有登錄比分！若修改本場結果並改變晉級隊伍，受影響的下游場次比分將會自動重置。確定要套用變更嗎？
                    </span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingPayload(null)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-bold text-stone-700 hover:bg-stone-50"
                    >
                      返回檢查
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSave(match.id, pendingPayload);
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold"
                    >
                      確定覆寫並重算晉級
                    </button>
                  </div>
                </div>
              )}

              {/* 棄權與重置操作區 */}
              {!lockedByOther && (
                <div className="border-t border-stone-200 pt-4 space-y-3">
                  <div className="text-xs text-stone-600 text-center font-bold">
                    特殊賽況處理（點擊即判定對手晉級）
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleForfeit('top')}
                      className="min-h-[44px] py-2.5 px-3 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors truncate"
                    >
                      <i className="fa-solid fa-ban mr-1.5" aria-hidden="true"></i>
                      {match.topTeam.name} 棄權
                    </button>
                    <button
                      type="button"
                      onClick={() => handleForfeit('bottom')}
                      className="min-h-[44px] py-2.5 px-3 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors truncate"
                    >
                      <i className="fa-solid fa-ban mr-1.5" aria-hidden="true"></i>
                      {match.bottomTeam.name} 棄權
                    </button>
                  </div>
                  {hasExistingResult && (
                    <button
                      type="button"
                      onClick={handleClearMatch}
                      className="w-full min-h-[40px] py-2 px-3 bg-stone-100 text-stone-700 hover:bg-stone-200 rounded-xl text-xs font-bold transition-colors"
                    >
                      <i className="fa-solid fa-rotate-left mr-1.5" aria-hidden="true"></i>
                      清除本場結果（恢復為未開賽）
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-stone-50 px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200">
              {onOpenMatchRecord ? (
                <button
                  type="button"
                  onClick={() => onOpenMatchRecord(match)}
                  className="px-3.5 py-2 min-h-[44px] text-xs sm:text-sm bg-white border border-stone-300 text-stone-800 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-800 rounded-xl font-extrabold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="預覽並列印／匯出本場正式比賽紀錄單 PDF（含雙方隊長與裁判簽名欄）"
                >
                  <i className="fa-solid fa-file-pdf text-orange-600" aria-hidden="true"></i>
                  {hasExistingResult ? '匯出紀錄單 PDF' : '列印空白紀錄單'}
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 min-h-[44px] text-sm text-stone-600 hover:bg-stone-200/70 rounded-xl font-bold transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={Boolean(lockedByOther)}
                  className="px-6 py-2.5 min-h-[44px] text-sm bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-xl hover:from-orange-700 hover:to-amber-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold shadow-md transition-all"
                >
                  確認儲存 (Enter)
                </button>
              </div>
            </div>
          </form>
        )
      }
    </ModalDialog>
  );
};
