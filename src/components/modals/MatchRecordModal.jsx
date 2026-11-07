import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  buildMatchRecordData,
  getMatchDisplayTitle,
  sanitizeFilename,
} from '../../utils/matchRecordBuilder';
import { ModalDialog } from '../common/ModalDialog';

const getMetaStorageKey = (stageId, matchId) =>
  `tournament_record_meta_s${stageId}_${matchId}`;

const loadSavedCustomMeta = (stageId, matchId) => {
  if (!matchId) return { court: '', referee: '', notes: '' };
  try {
    const raw = sessionStorage.getItem(getMetaStorageKey(stageId, matchId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        court: parsed.court || '',
        referee: parsed.referee || '',
        scorer: parsed.scorer,
        notes: parsed.notes || '',
      };
    }
  } catch {
    /* ignore */
  }
  return { court: '', referee: '', notes: '' };
};

/**
 * 單張標準 A4 正式比賽成績紀錄單（同時用於螢幕即時預覽與 @media print 實體列印／匯出 PDF）
 * 依循 modern-web-guidance `security` 與 `responsive-table`：
 * - 純 React 節點渲染，零 innerHTML / document.write 注入風險
 * - 語意化 <table> + <th scope="col"> / <th scope="row"> 確保結構清晰與螢幕報讀相容
 */
export const MatchRecordSheet = ({ record }) => {
  const tableRegionLabel = `${record.matchTitle} 各節局比分明細表`;

  return (
    <article className="match-record-page bg-white text-stone-950 border-2 border-stone-800 rounded-xl p-5 sm:p-7 shadow-sm print:shadow-none print:rounded-none print:border-2 print:border-black print:p-5">
      {/* 1. 大會標頭與正式紀錄單標題 */}
      <header className="border-b-2 border-stone-900 pb-3.5 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold tracking-widest text-stone-600 uppercase">
            OFFICIAL MATCH RECORD · 正式比賽成績紀錄表
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-stone-950 mt-0.5 leading-tight">
            {record.tournamentTitle}
          </h3>
        </div>

        <div className="text-right">
          <span
            className={`inline-block px-3 py-1 rounded-md text-xs font-black border ${
              record.statusType === 'COMPLETED'
                ? 'bg-stone-900 text-white border-stone-900 print:bg-stone-900 print:text-white'
                : record.statusType === 'FORFEIT'
                  ? 'bg-red-50 text-red-900 border-red-400'
                  : 'bg-stone-100 text-stone-800 border-stone-400'
            }`}
          >
            {record.statusLabel}
          </span>
          <div className="text-[11px] font-mono text-stone-600 mt-1">
            紀錄單號：{record.matchId}
          </div>
        </div>
      </header>

      {/* 2. 賽務基本資訊欄 */}
      <section
        aria-label="場次基本資訊"
        className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs border border-stone-400 rounded-lg p-3 mb-4 bg-stone-50/70 print:bg-white"
      >
        <div>
          <span className="font-bold text-stone-500">比賽項目：</span>
          <span className="font-extrabold text-stone-900">{record.sportName}</span>
        </div>
        <div>
          <span className="font-bold text-stone-500">賽事階段：</span>
          <span className="font-extrabold text-stone-900">{record.stageName}</span>
        </div>
        <div>
          <span className="font-bold text-stone-500">場次名稱：</span>
          <span className="font-extrabold text-stone-900">{record.matchTitle}</span>
        </div>
        <div className="col-span-2">
          <span className="font-bold text-stone-500">適用賽制：</span>
          <span className="font-bold text-stone-800">{record.rulesSummary}</span>
        </div>
        <div>
          <span className="font-bold text-stone-500">比賽場地：</span>
          {record.court ? (
            <span className="font-extrabold text-stone-900">{record.court}</span>
          ) : (
            <span className="inline-block w-24 border-b border-stone-400 align-bottom">&nbsp;</span>
          )}
        </div>
        <div className="col-span-2 sm:col-span-2">
          <span className="font-bold text-stone-500">製表時間：</span>
          <span className="font-mono font-semibold text-stone-800">{record.recordedAtText}</span>
        </div>
        <div>
          <span className="font-bold text-stone-500">紀錄設備：</span>
          <span className="font-semibold text-stone-800">{record.scorer || '現場紀錄台'}</span>
        </div>
      </section>

      {/* 3. 對戰總成績大字看板區 */}
      <section
        aria-label="對戰雙方與總比分"
        className="border-2 border-stone-800 rounded-xl p-4 mb-4 bg-white"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          {/* A 隊 */}
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-stone-500 mb-0.5">
              A 方（上方籤位）
              {record.teamA.isSeed && <span className="ml-1 text-amber-700">★種子</span>}
            </div>
            <div className="text-base sm:text-xl font-black text-stone-950 break-words leading-snug">
              {record.teamA.name}
            </div>
            {record.teamA.isWinner && (
              <span className="mt-1 inline-block px-2.5 py-0.5 rounded bg-stone-900 text-white text-[11px] font-black">
                ★ 勝方 (WINNER)
              </span>
            )}
            {record.teamA.isForfeit && (
              <span className="mt-1 inline-block px-2 py-0.5 rounded border border-red-500 text-red-700 text-[11px] font-bold">
                棄權 (FORFEIT)
              </span>
            )}
          </div>

          {/* 中央大比分 */}
          <div className="px-3 sm:px-5 py-2 rounded-xl border-2 border-stone-800 bg-stone-50 print:bg-white shrink-0">
            <div className="text-[10px] font-extrabold text-stone-500 tracking-wider mb-0.5">
              {record.effectiveBestOf > 1 ? `系列賽總勝${record.unitWord}` : '總比分'}
            </div>
            <div className="text-2xl sm:text-4xl font-black font-mono tabular-nums text-stone-950 flex items-center justify-center gap-2.5 leading-none">
              <span>{record.teamA.headlineScore}</span>
              <span className="text-stone-400 text-xl">:</span>
              <span>{record.teamB.headlineScore}</span>
            </div>
          </div>

          {/* B 隊 */}
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-stone-500 mb-0.5">
              B 方（下方籤位）
              {record.teamB.isSeed && <span className="ml-1 text-amber-700">★種子</span>}
            </div>
            <div className="text-base sm:text-xl font-black text-stone-950 break-words leading-snug">
              {record.teamB.name}
            </div>
            {record.teamB.isWinner && (
              <span className="mt-1 inline-block px-2.5 py-0.5 rounded bg-stone-900 text-white text-[11px] font-black">
                ★ 勝方 (WINNER)
              </span>
            )}
            {record.teamB.isForfeit && (
              <span className="mt-1 inline-block px-2 py-0.5 rounded border border-red-500 text-red-700 text-[11px] font-bold">
                棄權 (FORFEIT)
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 4. 各節 / 各局 / 各戰比分明細表 */}
      <section className="mb-4">
        <div className="text-xs font-extrabold text-stone-800 mb-1.5 flex items-center justify-between">
          <span>各{record.effectiveBestOf > 1 ? record.unitWord : '節／局'}比分明細</span>
          {record.winnerName && (
            <span className="font-black text-stone-950">
              本場裁定勝方：{record.winnerName}
            </span>
          )}
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label={tableRegionLabel}
          className="overflow-x-auto print:overflow-visible"
        >
          <table className="w-full border-collapse border-2 border-stone-800 text-xs sm:text-sm font-mono tabular-nums">
            <thead>
              <tr className="bg-stone-100 print:bg-stone-100 border-b-2 border-stone-800">
                <th
                  scope="col"
                  className="border border-stone-600 px-3 py-2 text-left font-sans font-extrabold text-stone-900 min-w-[130px]"
                >
                  參賽隊伍
                </th>
                {record.columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`border border-stone-600 px-2.5 py-2 text-center font-sans font-extrabold ${
                      col.isSummary
                        ? 'bg-stone-200/80 text-stone-950 min-w-[68px]'
                        : 'text-stone-800 min-w-[52px]'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Row A */}
              <tr className="border-b border-stone-600">
                <th
                  scope="row"
                  className="border border-stone-600 px-3 py-2.5 text-left font-sans font-extrabold text-stone-950 bg-white"
                >
                  {record.teamA.name}
                </th>
                {record.columns.map((col) => (
                  <td
                    key={col.key}
                    className={`border border-stone-600 px-2.5 py-2.5 text-center ${
                      col.isSummary
                        ? 'font-black text-base bg-stone-50 text-stone-950'
                        : col.highlightA
                          ? 'font-black text-stone-950 underline decoration-2 underline-offset-4'
                          : 'font-semibold text-stone-800'
                    }`}
                  >
                    {col.valA}
                  </td>
                ))}
              </tr>

              {/* Row B */}
              <tr>
                <th
                  scope="row"
                  className="border border-stone-600 px-3 py-2.5 text-left font-sans font-extrabold text-stone-950 bg-white"
                >
                  {record.teamB.name}
                </th>
                {record.columns.map((col) => (
                  <td
                    key={col.key}
                    className={`border border-stone-600 px-2.5 py-2.5 text-center ${
                      col.isSummary
                        ? 'font-black text-base bg-stone-50 text-stone-950'
                        : col.highlightB
                          ? 'font-black text-stone-950 underline decoration-2 underline-offset-4'
                          : 'font-semibold text-stone-800'
                    }`}
                  >
                    {col.valB}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* 多戰制下若附帶單戰各節/各局細分（如籃球3戰2勝的每場Q1~Q4），一併列印呈現 */}
        {record.subGames && record.subGames.length > 0 && (
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {record.subGames.map((sg, idx) => (
              <div key={idx} className="border border-stone-400 rounded p-2 bg-stone-50/50 print:bg-white">
                <div className="font-extrabold text-stone-800 mb-1">
                  {sg.title}（{sg.totalA} : {sg.totalB}）
                </div>
                <div className="font-mono text-stone-700 flex flex-wrap gap-x-3 gap-y-0.5">
                  {sg.items.map((it, i) => (
                    <span key={i}>
                      <strong>{it.label}</strong>: {it.a}-{it.b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {record.liveStatsNote && (
          <div className="mt-2 text-[11px] font-semibold text-stone-700 border border-stone-300 rounded px-2.5 py-1.5 bg-stone-50 print:bg-white">
            {record.liveStatsNote}
          </div>
        )}
      </section>

      {/* 5. 賽務記事與特殊狀況備註欄 */}
      <section aria-label="賽務記事與備註" className="mb-5">
        <div className="text-xs font-extrabold text-stone-800 mb-1">
          賽務記事／特殊判例備註（如延長加賽、傷停、棄權事由、申訴紀錄）：
        </div>
        <div className="border border-stone-600 rounded-lg p-2.5 min-h-[52px] text-xs text-stone-900 whitespace-pre-wrap leading-relaxed">
          {record.notes ? (
            record.notes
          ) : (
            <span className="text-stone-400 select-none print:hidden">
              （無特殊備註，列印後可於此處手寫補充）
            </span>
          )}
        </div>
      </section>

      {/* 6. 正式簽認核章欄 (雙方隊長 + 紀錄員 + 主審裁判) */}
      <footer aria-label="賽後簽名確認欄" className="pt-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="border border-stone-700 rounded-lg p-2.5 flex flex-col justify-between min-h-[78px]">
            <div className="font-extrabold text-stone-700 border-b border-stone-300 pb-1 truncate">
              A 方隊長簽認
            </div>
            <div className="text-[10px] text-stone-500 truncate mt-6">
              隊伍：{record.teamA.name}
            </div>
          </div>

          <div className="border border-stone-700 rounded-lg p-2.5 flex flex-col justify-between min-h-[78px]">
            <div className="font-extrabold text-stone-700 border-b border-stone-300 pb-1 truncate">
              B 方隊長簽認
            </div>
            <div className="text-[10px] text-stone-500 truncate mt-6">
              隊伍：{record.teamB.name}
            </div>
          </div>

          <div className="border border-stone-700 rounded-lg p-2.5 flex flex-col justify-between min-h-[78px]">
            <div className="font-extrabold text-stone-700 border-b border-stone-300 pb-1">
              紀錄員簽章
            </div>
            <div className="text-xs font-bold text-stone-800 mt-4 truncate">
              {record.scorer || '\u00A0'}
            </div>
          </div>

          <div className="border border-stone-700 rounded-lg p-2.5 flex flex-col justify-between min-h-[78px]">
            <div className="font-extrabold text-stone-700 border-b border-stone-300 pb-1">
              主審／裁判簽章
            </div>
            <div className="text-xs font-bold text-stone-800 mt-4 truncate">
              {record.referee || '\u00A0'}
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-between items-center text-[10px] text-stone-500">
          <span>請雙方隊長確認比分無誤後簽名，簽認後即以本紀錄表為大會正式成績依據。</span>
          <span className="font-mono">{record.tournamentTitle} 賽務系統製表 · © 2026 Hao. GEG TAIWAN</span>
        </div>
      </footer>
    </article>
  );
};

/**
 * 專供列印引擎輸出之頂層容器（掛載於 #app-main-shell 之外，不受任何彈窗高度與捲軸裁切限制）
 */
export const MatchRecordPrintRoot = ({ records }) => {
  if (!records || records.length === 0) return null;
  return (
    <div id="match-record-print-root" className="match-record-print-only" aria-hidden="true">
      {records.map((rec) => (
        <MatchRecordSheet key={rec.matchId} record={rec} />
      ))}
    </div>
  );
};

/**
 * 比賽紀錄單預覽、賽務欄位補充與一鍵匯出 PDF / 列印對話框
 */
export const MatchRecordModal = ({
  isOpen,
  onClose,
  stage,
  tournamentTitle,
  deviceName,
  initialMatchId = null,
  liveSbState = null,
  onPreparedRecordsChange,
}) => {
  const formId = useId();

  // 過濾出有效場次（排除雙輪空與單方 BYE 輪空卡）
  const printableMatches = useMemo(() => {
    if (!stage?.matches) return [];
    return stage.matches.filter(
      (m) =>
        !m.isDoubleBye &&
        !m.isSkipped &&
        m.topTeam?.id !== 'BYE' &&
        m.bottomTeam?.id !== 'BYE'
    );
  }, [stage]);

  const completedMatches = useMemo(
    () =>
      printableMatches.filter(
        (m) =>
          m.topTeam?.isWinner ||
          m.bottomTeam?.isWinner ||
          m.topTeam?.isForfeit ||
          m.bottomTeam?.isForfeit ||
          (stage?.config?.format === 'ROUND_ROBIN' &&
            m.topTeam?.score !== null &&
            m.bottomTeam?.score !== null &&
            !m.liveMeta)
      ),
    [printableMatches, stage?.config?.format]
  );

  const [selectedTarget, setSelectedTarget] = useState('');
  const [court, setCourt] = useState('');
  const [referee, setReferee] = useState('');
  const [scorer, setScorer] = useState('');
  const [notes, setNotes] = useState('');

  // 開啟時初始化預設選取場次與先前暫存的場地/裁判備註
  useEffect(() => {
    if (!isOpen || !stage) return;

    let defaultTarget = initialMatchId;
    if (!defaultTarget) {
      if (completedMatches.length > 0) {
        defaultTarget = completedMatches[completedMatches.length - 1].id;
      } else if (printableMatches.length > 0) {
        defaultTarget = printableMatches[0].id;
      }
    }
    setSelectedTarget(defaultTarget || '');

    const saved = loadSavedCustomMeta(stage.id, defaultTarget);
    setCourt(saved.court || '');
    setReferee(saved.referee || '');
    setScorer(saved.scorer !== undefined ? saved.scorer : deviceName || '');
    setNotes(saved.notes || '');
  }, [isOpen, initialMatchId, stage?.id]);

  const handleSelectTargetChange = (nextTarget) => {
    setSelectedTarget(nextTarget);
    if (nextTarget && !nextTarget.startsWith('BATCH_') && stage) {
      const saved = loadSavedCustomMeta(stage.id, nextTarget);
      setCourt(saved.court || '');
      setReferee(saved.referee || '');
      setScorer(saved.scorer !== undefined ? saved.scorer : deviceName || '');
      setNotes(saved.notes || '');
    }
  };

  // 將單場補充的場地/裁判/備註存入 sessionStorage，方便同場次重印時自動保留
  useEffect(() => {
    if (!isOpen || !stage || !selectedTarget || selectedTarget.startsWith('BATCH_')) return;
    try {
      sessionStorage.setItem(
        getMetaStorageKey(stage.id, selectedTarget),
        JSON.stringify({ court, referee, scorer, notes })
      );
    } catch {
      /* ignore */
    }
  }, [court, referee, scorer, notes, isOpen, stage, selectedTarget]);

  // 計算目前預覽與準備列印之 1~N 張紀錄單
  const activeRecords = useMemo(() => {
    if (!isOpen || !stage) return [];

    if (selectedTarget === 'BATCH_COMPLETED') {
      return completedMatches.map((m) =>
        buildMatchRecordData({
          match: m,
          stage,
          tournamentTitle,
          deviceName,
          customMeta: loadSavedCustomMeta(stage.id, m.id),
        })
      );
    }

    if (selectedTarget === 'BATCH_ALL') {
      return printableMatches.map((m) =>
        buildMatchRecordData({
          match: m,
          stage,
          tournamentTitle,
          deviceName,
          customMeta: loadSavedCustomMeta(stage.id, m.id),
        })
      );
    }

    const targetMatch = printableMatches.find((m) => m.id === selectedTarget);
    if (!targetMatch) return [];

    const useLiveSb =
      liveSbState && initialMatchId && targetMatch.id === initialMatchId
        ? liveSbState
        : null;

    const single = buildMatchRecordData({
      match: targetMatch,
      stage,
      tournamentTitle,
      sbState: useLiveSb,
      deviceName,
      customMeta: { court, referee, scorer, notes },
    });

    return single ? [single] : [];
  }, [
    isOpen,
    stage,
    selectedTarget,
    completedMatches,
    printableMatches,
    tournamentTitle,
    deviceName,
    liveSbState,
    initialMatchId,
    court,
    referee,
    scorer,
    notes,
  ]);

  // 同步通知父層 #match-record-print-root 更新列印內容，並切換 body[data-print-target="match-record"]
  useEffect(() => {
    if (!isOpen) {
      onPreparedRecordsChange?.([]);
      delete document.body.dataset.printTarget;
      return undefined;
    }

    onPreparedRecordsChange?.(activeRecords);
    document.body.dataset.printTarget = 'match-record';

    return () => {
      delete document.body.dataset.printTarget;
    };
  }, [isOpen, activeRecords, onPreparedRecordsChange]);

  const handlePrintOrExportPdf = () => {
    if (activeRecords.length === 0) return;

    const prevTitle = document.title;
    const pdfTitle =
      activeRecords.length === 1
        ? activeRecords[0].suggestedFilename
        : sanitizeFilename(
            `${tournamentTitle}_${stage?.name || '賽程'}_批次比賽紀錄單_${activeRecords.length}場`
          );

    document.title = pdfTitle;

    const restoreTitle = () => {
      document.title = prevTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);

    // 給予瀏覽器 1 個繪製幀更新 document.title 與列印節點後呼叫原生列印／另存 PDF
    requestAnimationFrame(() => {
      window.print();
      setTimeout(restoreTitle, 2500);
    });
  };

  const isSingleMode = Boolean(initialMatchId);
  const isBatchSelection = selectedTarget.startsWith('BATCH_');

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      closedBy="any"
      widthClass="w-full max-w-4xl"
      surfaceClass="bg-stone-100 rounded-2xl border border-stone-300 overflow-hidden flex flex-col max-h-[92vh]"
    >
      {({ titleId }) => (
        <div className="flex flex-col h-full max-h-[92vh]">
          {/* 頂部標題列 */}
          <div className="bg-white px-5 py-3.5 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-file-pdf text-lg" aria-hidden="true"></i>
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="text-base sm:text-lg font-extrabold text-stone-900 truncate">
                  匯出比賽紀錄單 PDF ／ 直接列印簽認表
                </h2>
                <p className="text-xs text-stone-500 truncate">
                  標準 A4 單頁排版 · 支援隊長與裁判簽章欄 · 列印目標選「另存為 PDF」即可存檔
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="關閉比賽紀錄單預覽"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors shrink-0"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
            </button>
          </div>

          {/* 場次選擇器與選填欄位列 */}
          <div className="bg-stone-50 px-5 py-3 border-b border-stone-200 space-y-3 shrink-0">
            {!isSingleMode && printableMatches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`${formId}-target`}
                  className="text-xs font-extrabold text-stone-700 shrink-0"
                >
                  選擇匯出場次：
                </label>
                <select
                  id={`${formId}-target`}
                  value={selectedTarget}
                  onChange={(e) => handleSelectTargetChange(e.target.value)}
                  className="flex-grow max-w-md text-xs sm:text-sm font-bold bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-800"
                >
                  {completedMatches.length > 0 && (
                    <option value="BATCH_COMPLETED">
                      📚 批次匯出：本階段全部「已完賽」紀錄單（共 {completedMatches.length} 場，一頁一場）
                    </option>
                  )}
                  <option value="BATCH_ALL">
                    📋 批次匯出：本階段「全部場次」紀錄單／空白檢錄表（共 {printableMatches.length} 場）
                  </option>
                  <optgroup label="── 單場獨立匯出 ──">
                    {printableMatches.map((m) => {
                      const tA = m.topTeam?.name || m.topTeam?.placeholder || '待定';
                      const tB = m.bottomTeam?.name || m.bottomTeam?.placeholder || '待定';
                      const done =
                        m.topTeam?.isWinner ||
                        m.bottomTeam?.isWinner ||
                        m.topTeam?.isForfeit ||
                        m.bottomTeam?.isForfeit;
                      const scoreTag =
                        m.topTeam?.score !== null && m.bottomTeam?.score !== null
                          ? ` (${m.topTeam.score}:${m.bottomTeam.score})`
                          : '';
                      return (
                        <option key={m.id} value={m.id}>
                          {done ? '✓ ' : '○ '}
                          {getMatchDisplayTitle(m)}：{tA} vs {tB}
                          {scoreTag}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
              </div>
            )}

            {/* 單場選填資訊（場地、裁判、紀錄員、備註） */}
            {!isBatchSelection && activeRecords.length === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label htmlFor={`${formId}-court`} className="block font-bold text-stone-600 mb-1">
                    比賽場地／桌次（選填）
                  </label>
                  <input
                    id={`${formId}-court`}
                    type="text"
                    value={court}
                    onChange={(e) => setCourt(e.target.value)}
                    placeholder="例：第一場地 / A桌"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800 font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor={`${formId}-scorer`} className="block font-bold text-stone-600 mb-1">
                    紀錄員／設備（選填）
                  </label>
                  <input
                    id={`${formId}-scorer`}
                    type="text"
                    value={scorer}
                    onChange={(e) => setScorer(e.target.value)}
                    placeholder="例：王小明 / 第一場地平板"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800 font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor={`${formId}-referee`} className="block font-bold text-stone-600 mb-1">
                    主審／裁判姓名（選填）
                  </label>
                  <input
                    id={`${formId}-referee`}
                    type="text"
                    value={referee}
                    onChange={(e) => setReferee(e.target.value)}
                    placeholder="可留白於印出後手寫簽名"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800 font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor={`${formId}-notes`} className="block font-bold text-stone-600 mb-1">
                    賽務備註（選填）
                  </label>
                  <input
                    id={`${formId}-notes`}
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="例：OT1 延長決勝 / 傷停紀錄"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800 font-semibold"
                  />
                </div>
              </div>
            )}
          </div>

          {/* A4 紙張即時預覽捲動區 */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-grow space-y-5 bg-stone-200/70">
            {activeRecords.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-stone-500 font-bold">
                目前尚無可匯出的比賽場次。
              </div>
            ) : (
              activeRecords.map((rec) => (
                <div key={rec.matchId} className="max-w-3xl mx-auto">
                  <MatchRecordSheet record={rec} />
                </div>
              ))
            )}
          </div>

          {/* 底部動作列 */}
          <div className="bg-white px-5 py-3.5 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-stone-600 flex items-center gap-1.5">
              <i className="fa-solid fa-circle-info text-orange-600" aria-hidden="true"></i>
              <span>
                點擊右側按鈕後，印表機選「<strong>另存為 PDF</strong>」可存成電子檔，或直接選擇現場印表機印出紙本。
              </span>
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold text-stone-600 hover:bg-stone-100 transition-colors"
              >
                關閉
              </button>
              <button
                type="button"
                disabled={activeRecords.length === 0}
                onClick={handlePrintOrExportPdf}
                className="min-h-[42px] px-5 py-2 rounded-xl text-sm font-black bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 disabled:opacity-40 text-white shadow-md flex items-center gap-2 transition-all"
              >
                <i className="fa-solid fa-print" aria-hidden="true"></i>
                {activeRecords.length > 1
                  ? `列印／匯出全部 ${activeRecords.length} 張 PDF`
                  : '列印 ／ 儲存為 PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
