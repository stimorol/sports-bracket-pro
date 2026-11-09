import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SPORTS } from '../../constants/sports';
import {
  advanceSeriesToNextGame,
  applyBaseballPitchAction,
  applyPickleballRally,
  computeTableTennisServer,
  createInitialScoreboardState,
  evaluateSeriesProgress,
  evaluateSetStatus,
  getCurrentGameTotals,
  getPickleballCallout,
  summarizeScoreboardToMatchResult,
} from '../../utils/scoreboardEngine';
import { hasPlayedDownstreamMatches } from '../../utils/tournamentEngine';
import { ModalDialog } from '../common/ModalDialog';

const MAX_HISTORY = 45;

const getDraftStorageKey = (stageId, matchId) =>
  `tournament_scoreboard_draft_s${stageId}_${matchId}`;

const formatClock = (ms) => {
  const clamped = Math.max(0, Math.round(ms));
  if (clamped < 10000 && clamped > 0) {
    const secs = Math.floor(clamped / 1000);
    const tenths = Math.floor((clamped % 1000) / 100);
    return `00:0${secs}.${tenths}`;
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const playBuzzerHorn = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [196, 246.94, 293.66].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1400);
  } catch {
    /* ignore audio restrictions */
  }
};

export const DigitalScoreboardModal = ({
  isOpen,
  stageId,
  match,
  overrideBestOf,
  allMatches,
  config,
  deviceName,
  hasCloudConnection,
  isSyncing,
  onCloseKeepLock,
  onReleaseLockAndClose,
  onSyncProgress,
  onSaveGameAndExit,
  onFinalizeMatch,
  onUpdateBestOf,
  onOpenMatchRecord,
  onNotify,
}) => {
  const sport = SPORTS[config?.sport] || SPORTS.OTHER;
  const containerRef = useRef(null);

  const effectiveBestOf = Number(
    overrideBestOf || match?.customBestOf || config?.bestOf || 1
  );

  const [sbState, setSbState] = useState(() =>
    createInitialScoreboardState(match, config, effectiveBestOf)
  );
  const [history, setHistory] = useState([]);
  const [ultraDisplayMode, setUltraDisplayMode] = useState(false);
  const [showRulesBar, setShowRulesBar] = useState(false);
  const [showForfeitMenu, setShowForfeitMenu] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [statusBanner, setStatusBanner] = useState(null);

  const [timerRunning, setTimerRunning] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastTickRef = useRef(null);

  // 開啟時載入本機草稿或場次最新進度（嚴格比對 bestOf 與已完成場數，防止舊草稿吃掉 3戰2勝 設定！）
  useEffect(() => {
    if (!isOpen || !match) return;
    setTimerRunning(false);
    setShowRulesBar(false);
    setShowForfeitMenu(false);
    setConfirmFinalize(null);
    setErrorMsg(null);
    setStatusBanner(null);

    const draftKey = getDraftStorageKey(stageId, match.id);
    const matchSetCount = match.setScores?.length || 0;

    try {
      const savedRaw = localStorage.getItem(draftKey);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        const draftBestOf = Number(parsed?.sbState?.rules?.bestOf) || 1;
        const draftCompletedCount = parsed?.sbState?.completedSets?.length || 0;

        if (
          parsed?.sbState &&
          parsed.topTeamId === match.topTeam.id &&
          parsed.bottomTeamId === match.bottomTeam.id &&
          draftBestOf === effectiveBestOf &&
          draftCompletedCount >= matchSetCount
        ) {
          setSbState(parsed.sbState);
          setHistory(Array.isArray(parsed.history) ? parsed.history.slice(-15) : []);
          return;
        }
      }
    } catch {
      /* fallback to fresh state */
    }

    setSbState(createInitialScoreboardState(match, config, effectiveBestOf));
    setHistory([]);
  }, [isOpen, match?.id, effectiveBestOf, stageId, config]);

  // 每次比分變動即時寫入本機草稿
  useEffect(() => {
    if (!isOpen || !match) return;
    const draftKey = getDraftStorageKey(stageId, match.id);
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          topTeamId: match.topTeam.id,
          bottomTeamId: match.bottomTeam.id,
          sbState,
          history: history.slice(-10),
          updatedAt: Date.now(),
        })
      );
    } catch {
      /* ignore storage quota */
    }
  }, [sbState, history, isOpen, stageId, match]);

  const clearLocalDraft = useCallback(() => {
    if (!match) return;
    try {
      localStorage.removeItem(getDraftStorageKey(stageId, match.id));
    } catch {
      /* ignore */
    }
  }, [stageId, match]);

  // Screen Wake Lock API：防止平板休眠
  useEffect(() => {
    if (!isOpen) return undefined;
    let sentinel = null;
    let cancelled = false;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (!cancelled) setWakeLockActive(true);
        sentinel.addEventListener('release', () => {
          if (!cancelled) setWakeLockActive(false);
        });
      } catch {
        if (!cancelled) setWakeLockActive(false);
      }
    };

    requestWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isOpen) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      setWakeLockActive(false);
      if (sentinel) {
        sentinel.release().catch(() => {});
      }
    };
  }, [isOpen]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      onNotify?.('此瀏覽器環境不支援全螢幕切換', 'warning');
    }
  };

  // 開啟本場正式比賽紀錄單預覽／匯出 PDF（若處於全螢幕則先自動退回，避免 Top Layer 遮蔽列印預覽）
  const handleTriggerExportRecord = async () => {
    setTimerRunning(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    }
    onOpenMatchRecord?.(match, sbState);
  };

  // 高精準度計時器
  useEffect(() => {
    if (!timerRunning || !isOpen) {
      lastTickRef.current = null;
      return undefined;
    }

    lastTickRef.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const delta = now - (lastTickRef.current || now);
      lastTickRef.current = now;

      setSbState((prev) => {
        if (typeof prev.clockRemainingMs !== 'number') return prev;
        const nextMs = Math.max(0, prev.clockRemainingMs - delta);
        if (nextMs === 0 && prev.clockRemainingMs > 0) {
          setTimerRunning(false);
          playBuzzerHorn();
          setStatusBanner('⏰ 本節/本局時間到！');
        }
        return { ...prev, clockRemainingMs: nextMs };
      });
    }, 100);

    return () => clearInterval(id);
  }, [timerRunning, isOpen]);

  const commitChange = useCallback((updater) => {
    setErrorMsg(null);
    setConfirmFinalize(null);
    setSbState((prev) => {
      const snapshot = structuredClone(prev);
      const next = typeof updater === 'function' ? updater(structuredClone(prev)) : updater;
      setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), snapshot]);
      return next;
    });
  }, []);

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setSbState(previous);
    setErrorMsg(null);
    setConfirmFinalize(null);
    setStatusBanner('已復原上一步操作');
  };

  const toggleSwapSides = () => {
    setSbState((prev) => ({ ...prev, swappedSides: !prev.swappedSides }));
  };

  const handleChangeScoreboardBestOf = (nextBo) => {
    setErrorMsg(null);
    setConfirmFinalize(null);
    setSbState((prev) => ({
      ...prev,
      completedSets: prev.completedSets || [],
      rules: { ...prev.rules, bestOf: nextBo },
    }));
    if (match) {
      onUpdateBestOf?.(match.id, nextBo);
    }
  };

  // 左右視覺方位對應 (a = topTeam, b = bottomTeam)
  const leftKey = sbState.swappedSides ? 'b' : 'a';
  const rightKey = sbState.swappedSides ? 'a' : 'b';

  const teamInfo = useMemo(() => {
    if (!match) return { a: { name: 'A隊' }, b: { name: 'B隊' } };
    return {
      a: {
        id: match.topTeam.id,
        name: match.topTeam.name || '上方隊伍',
        accentText: 'text-orange-400',
        cardBorder: 'border-orange-500/40',
        btnPrimary: 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white',
      },
      b: {
        id: match.bottomTeam.id,
        name: match.bottomTeam.name || '下方隊伍',
        accentText: 'text-sky-400',
        cardBorder: 'border-sky-500/40',
        btnPrimary: 'bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white',
      },
    };
  }, [match]);

  // 多戰系列賽整體進度與單局狀態
  const series = useMemo(() => evaluateSeriesProgress(sbState), [sbState]);

  const setEval = useMemo(() => {
    if (sbState.template === 'PICKLEBALL' || sbState.template === 'RACKET_SETS') {
      return evaluateSetStatus(sbState);
    }
    return null;
  }, [sbState]);

  const digitClassFor = (scoreValue) => {
    const num = Math.abs(Number(scoreValue) || 0);
    return [
      'scoreboard-giant-digit',
      ultraDisplayMode ? 'is-ultra' : '',
      num >= 100 ? 'is-three-digits' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  // --- 各項運動專屬操作處理 ---

  const handlePickleballAction = (action) => {
    commitChange((draft) => applyPickleballRally(draft, action));
  };

  const adjustCurrentScore = (side, delta) => {
    commitChange((draft) => {
      const nextScore = Math.max(0, (draft.currentScore[side] || 0) + delta);
      draft.currentScore[side] = nextScore;

      if (draft.template === 'RACKET_SETS' && delta > 0) {
        if (draft.rules.serviceRotation === 'ALTERNATE_2') {
          const target =
            draft.rules.bestOf > 1 &&
            draft.completedSets.length === draft.rules.bestOf - 1
              ? draft.rules.decidingSetPoints
              : draft.rules.targetPoints;
          draft.servingSide = computeTableTennisServer(
            draft.currentScore.a,
            draft.currentScore.b,
            draft.firstServerOfSet || 'a',
            target
          );
        } else {
          draft.servingSide = side;
        }
      } else if (
        draft.template === 'RACKET_SETS' &&
        delta < 0 &&
        draft.rules.serviceRotation === 'ALTERNATE_2'
      ) {
        const target = draft.rules.targetPoints || 11;
        draft.servingSide = computeTableTennisServer(
          draft.currentScore.a,
          draft.currentScore.b,
          draft.firstServerOfSet || 'a',
          target
        );
      } else if (
        draft.template === 'PICKLEBALL' &&
        draft.rules.scoringMode === 'RALLY' &&
        delta > 0
      ) {
        draft.servingSide = side;
      }
      return draft;
    });
  };

  const adjustBasketballPoints = (side, delta) => {
    commitChange((draft) => {
      const idx = draft.currentPeriod;
      if (!draft.periodScores[idx]) {
        draft.periodScores[idx] = { a: 0, b: 0 };
      }
      draft.periodScores[idx][side] = Math.max(
        0,
        (draft.periodScores[idx][side] || 0) + delta
      );
      return draft;
    });
  };

  const adjustBasketballFouls = (side, delta) => {
    commitChange((draft) => {
      draft.fouls[side] = Math.max(0, (draft.fouls[side] || 0) + delta);
      return draft;
    });
  };

  const useBasketballTimeout = (side) => {
    setTimerRunning(false);
    commitChange((draft) => {
      draft.timeoutsLeft[side] = Math.max(0, (draft.timeoutsLeft[side] || 0) - 1);
      return draft;
    });
    setStatusBanner(`⏸ ${teamInfo[side].name} 請求暫停（計時已自動暫停）`);
  };

  const switchBasketballPeriod = (nextPeriodIdx) => {
    setTimerRunning(false);
    commitChange((draft) => {
      while (draft.periodScores.length <= nextPeriodIdx) {
        draft.periodScores.push({ a: 0, b: 0 });
      }
      const prevIsFirstHalf = draft.currentPeriod < 2;
      const nextIsSecondHalf = nextPeriodIdx >= 2 && nextPeriodIdx < draft.rules.totalPeriods;

      draft.currentPeriod = nextPeriodIdx;
      draft.fouls = { a: 0, b: 0 };
      if (prevIsFirstHalf && nextIsSecondHalf) {
        draft.timeoutsLeft = {
          a: draft.rules.timeoutsPerHalf + 1,
          b: draft.rules.timeoutsPerHalf + 1,
        };
      }
      const mins =
        nextPeriodIdx >= draft.rules.totalPeriods
          ? draft.rules.overtimeMinutes || 5
          : draft.rules.periodMinutes || 10;
      draft.clockRemainingMs = mins * 60 * 1000;
      return draft;
    });
  };

  const adjustBaseballRuns = (side, delta, inningIdx = sbState.currentInning) => {
    commitChange((draft) => {
      while (draft.innings.length <= inningIdx) {
        draft.innings.push({ a: 0, b: 0 });
      }
      draft.innings[inningIdx][side] = Math.max(
        0,
        (draft.innings[inningIdx][side] || 0) + delta
      );
      return draft;
    });
  };

  const handleBaseballPitch = (action) => {
    let note = null;
    commitChange((draft) => {
      const res = applyBaseballPitchAction(draft, action);
      note = res.notification;
      return res.state;
    });
    if (note) setStatusBanner(note);
  };

  // --- 足球 / 五人制足球 (SOCCER) 專屬操作處理 ---
  const adjustSoccerGoals = (side, delta) => {
    commitChange((draft) => {
      const idx = draft.currentHalf || 0;
      if (!draft.halfScores[idx]) {
        draft.halfScores[idx] = { a: 0, b: 0 };
      }
      draft.halfScores[idx][side] = Math.max(
        0,
        (draft.halfScores[idx][side] || 0) + delta
      );
      return draft;
    });
  };

  const adjustSoccerFouls = (side, delta) => {
    let foulAlert = null;
    commitChange((draft) => {
      const nextFoul = Math.max(0, (draft.fouls?.[side] || 0) + delta);
      draft.fouls = { ...(draft.fouls || { a: 0, b: 0 }), [side]: nextFoul };
      const limit = draft.rules?.foulLimitPerHalf;
      if (limit && delta > 0 && nextFoul >= limit) {
        foulAlert =
          nextFoul === limit
            ? `⚠️ ${teamInfo[side].name} 本半場累積滿 ${limit} 次團犯！第 ${limit + 1} 犯起判罰第二罰球點直接自由球`
            : `🚨 ${teamInfo[side].name} 本半場第 ${nextFoul} 次團犯 — 判罰第二罰球點直接自由球！`;
      }
      return draft;
    });
    if (foulAlert) setStatusBanner(foulAlert);
  };

  const useSoccerTimeout = (side) => {
    setTimerRunning(false);
    commitChange((draft) => {
      draft.timeoutsLeft[side] = Math.max(0, (draft.timeoutsLeft?.[side] || 0) - 1);
      return draft;
    });
    setStatusBanner(`⏸ ${teamInfo[side].name} 請求暫停（計時已自動暫停）`);
  };

  const switchSoccerHalf = (nextHalfIdx) => {
    setTimerRunning(false);
    commitChange((draft) => {
      while (draft.halfScores.length <= nextHalfIdx) {
        draft.halfScores.push({ a: 0, b: 0 });
      }
      draft.currentHalf = nextHalfIdx;
      draft.fouls = { a: 0, b: 0 }; // 換半場單半場累積團犯歸零
      draft.timeoutsLeft = {
        a: draft.rules.timeoutsPerHalf || 0,
        b: draft.rules.timeoutsPerHalf || 0,
      };
      const mins =
        nextHalfIdx >= (draft.rules.totalHalves || 2)
          ? draft.rules.extraTimeMinutes || 5
          : draft.rules.halfMinutes || 20;
      draft.clockRemainingMs = mins * 60 * 1000;
      return draft;
    });
  };

  const adjustSoccerCard = (side, cardType, delta) => {
    commitChange((draft) => {
      if (!draft.cards) {
        draft.cards = { a: { yellow: 0, red: 0 }, b: { yellow: 0, red: 0 } };
      }
      const cur = draft.cards[side]?.[cardType] || 0;
      draft.cards[side][cardType] = Math.max(0, cur + delta);
      return draft;
    });
  };

  const togglePenaltyShootout = () => {
    setTimerRunning(false);
    commitChange((draft) => {
      const prevPk = draft.penaltyShootout || { enabled: false, a: 0, b: 0 };
      draft.penaltyShootout = { ...prevPk, enabled: !prevPk.enabled };
      return draft;
    });
  };

  const adjustPenaltyScore = (side, delta) => {
    commitChange((draft) => {
      const prevPk = draft.penaltyShootout || { enabled: true, a: 0, b: 0 };
      draft.penaltyShootout = {
        ...prevPk,
        enabled: true,
        [side]: Math.max(0, (prevPk[side] || 0) + delta),
      };
      return draft;
    });
  };

  // --- 多戰系列賽核心流程：1. 結束本戰立即開始下一戰 | 2. 儲存本戰結果並暫離 (下次點開續記下一戰！) ---

  const handleFinishGameAndContinueNext = async () => {
    const cur = getCurrentGameTotals(sbState);
    if (cur.a === cur.b) {
      setErrorMsg(
        `第 ${series.currentGameNumber} ${series.unitName}目前平手 (${cur.a}:${cur.b})，請先分出本${series.unitName}勝負！`
      );
      return;
    }

    setTimerRunning(false);
    const finishedNum = series.currentGameNumber;
    let nextSnapshot = null;

    commitChange((draft) => {
      const advanced = advanceSeriesToNextGame(draft);
      nextSnapshot = structuredClone(advanced);
      return advanced;
    });

    setStatusBanner(
      `✓ 第 ${finishedNum} ${series.unitName}已紀錄 (${cur.a}:${cur.b})！記分板已歸零，現在開始「第 ${finishedNum + 1} ${series.unitName}」`
    );

    if (nextSnapshot && onSyncProgress) {
      const { result } = summarizeScoreboardToMatchResult(
        nextSnapshot,
        config.format,
        false
      );
      if (result) {
        await onSyncProgress(result, { silentToast: true });
      }
    }
  };

  const handleFinishGameAndExitForLater = async () => {
    const cur = getCurrentGameTotals(sbState);
    if (cur.a === cur.b) {
      setErrorMsg(
        `第 ${series.currentGameNumber} ${series.unitName}目前平手 (${cur.a}:${cur.b})，請先分出本${series.unitName}勝負後再存檔！`
      );
      return;
    }

    setTimerRunning(false);
    const advancedState = advanceSeriesToNextGame(sbState);
    const { result } = summarizeScoreboardToMatchResult(
      advancedState,
      config.format,
      false
    );
    if (!result || !match) return;

    const ok = await onSaveGameAndExit?.(match.id, result);
    if (ok !== false) {
      clearLocalDraft();
    }
  };

  // 若紀錄員誤按「結束本戰」，可將上一戰退回至當前畫面重新調整
  const handleReopenPreviousGame = () => {
    if (!sbState.completedSets || sbState.completedSets.length === 0) return;
    setTimerRunning(false);
    commitChange((draft) => {
      const last = draft.completedSets.pop();
      draft.swappedSides = !draft.swappedSides;
      if (draft.template === 'BASKETBALL') {
        draft.currentPeriod = 0;
        draft.periodScores = Array.from(
          { length: draft.rules.totalPeriods || 4 },
          (_, i) => (i === 0 ? { a: last.a, b: last.b } : { a: 0, b: 0 })
        );
      } else if (draft.template === 'BASEBALL') {
        draft.currentInning = 0;
        draft.half = 'top';
        draft.innings = Array.from(
          { length: draft.rules.totalInnings || 7 },
          (_, i) => (i === 0 ? { a: last.a, b: last.b } : { a: 0, b: 0 })
        );
      } else if (draft.template === 'SOCCER') {
        draft.currentHalf = 0;
        draft.halfScores = Array.from(
          { length: draft.rules.totalHalves || 2 },
          (_, i) => (i === 0 ? { a: last.a, b: last.b } : { a: 0, b: 0 })
        );
      } else {
        draft.currentScore = { a: last.a, b: last.b };
      }
      return draft;
    });
    setStatusBanner(`已退回上一${series.unitName}比分供檢視或修正`);
  };

  // --- 中場雲端同步與完賽結算 ---

  const handleManualSyncProgress = async () => {
    const { result } = summarizeScoreboardToMatchResult(
      sbState,
      config.format,
      false
    );
    if (result && onSyncProgress) {
      await onSyncProgress(result, { silentToast: false });
    }
  };

  const handleRequestFinalize = () => {
    setErrorMsg(null);
    const { error, result } = summarizeScoreboardToMatchResult(
      sbState,
      config.format,
      true
    );
    if (error) {
      setErrorMsg(error);
      return;
    }
    const downstreamPlayed =
      config.format !== 'ROUND_ROBIN' &&
      hasPlayedDownstreamMatches(allMatches || [], match.id);
    setConfirmFinalize({ result, downstreamPlayed });
  };

  const handleExecuteFinalize = async () => {
    if (!confirmFinalize || !match) return;
    setTimerRunning(false);
    const ok = await onFinalizeMatch(match.id, confirmFinalize.result);
    if (ok !== false) {
      clearLocalDraft();
      setConfirmFinalize(null);
    }
  };

  const handleForfeitMatch = async (forfeitingSide) => {
    if (!match) return;
    setTimerRunning(false);
    const winnerId =
      forfeitingSide === 'a' ? match.topTeam.id : match.bottomTeam.id;
    const ok = await onFinalizeMatch(match.id, {
      scoreA: null,
      scoreB: null,
      setScores: [],
      isForfeit: true,
      winnerId,
      customBestOf: sbState.rules?.bestOf || config.bestOf || 1,
    });
    if (ok !== false) {
      clearLocalDraft();
      setShowForfeitMenu(false);
    }
  };

  if (!match) return null;

  const matchNum = match.id.split('-').pop();
  const pickleballCallout =
    sbState.template === 'PICKLEBALL' ? getPickleballCallout(sbState) : null;
  const curGameTotals = series.currentTotals;

  const renderSeriesBadgeForSide = (side) => {
    if (series.bestOf <= 1) return null;
    const wins = side === 'a' ? series.completedWinsA : series.completedWinsB;
    return (
      <div className="px-3.5 sm:px-5 py-1 sm:py-1.5 rounded-2xl bg-amber-500/15 border-2 border-amber-400/80 text-center shrink-0 shadow">
        <div className="text-[10px] sm:text-xs text-amber-200 font-extrabold leading-none mb-0.5">
          勝{series.unitName}
        </div>
        <div className="text-3xl sm:text-5xl font-black text-amber-300 leading-none">
          {wins}
        </div>
      </div>
    );
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onCloseKeepLock}
      closedBy="closerequest"
      widthClass="scoreboard-dialog w-[99vw] max-w-none"
      surfaceClass="scoreboard-dark-surface rounded-2xl border border-stone-800 overflow-hidden flex flex-col h-[97vh] max-h-[98vh]"
    >
      {({ titleId }) => (
        <div ref={containerRef} className="scoreboard-dark-surface flex flex-col h-full select-none">
          {/* 1. 精簡頂部工具列 */}
          <header className="bg-stone-900/95 border-b border-stone-800 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center flex-wrap gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-600/20 border border-orange-500/40 text-orange-300 text-xs font-extrabold">
                <i className={`fa-solid ${sport.icon}`} aria-hidden="true"></i>
                {sport.name}
              </span>
              <h2 id={titleId} className="text-sm sm:text-base font-extrabold text-stone-100 truncate">
                場次 {matchNum}
                {series.bestOf > 1 ? (
                  <span className="ml-2 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-black">
                    {series.bestOf}戰{series.neededWins}勝 · 第 {series.currentGameNumber} {series.unitName}
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-bold text-stone-400">(單場決勝)</span>
                )}
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 text-[11px] font-bold">
                <i className="fa-solid fa-lock text-[10px]" aria-hidden="true"></i>
                {deviceName}
              </span>
              {wakeLockActive && (
                <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-amber-300/80 font-semibold">
                  <i className="fa-solid fa-sun text-[10px]" aria-hidden="true"></i>
                  恆亮
                </span>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={ultraDisplayMode}
                onClick={() => setUltraDisplayMode((v) => !v)}
                className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-colors ${
                  ultraDisplayMode
                    ? 'bg-amber-500 text-stone-950 border-amber-400'
                    : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-stone-700'
                }`}
                title="放大分數至極限並隱藏次要明細表，方便場上選手遠距觀看"
              >
                <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
                選手大字模式
              </button>

              <button
                type="button"
                disabled={history.length === 0}
                onClick={handleUndo}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-35 disabled:cursor-not-allowed text-stone-100 text-xs font-bold flex items-center gap-1 border border-stone-700"
              >
                <i className="fa-solid fa-rotate-left" aria-hidden="true"></i>
                復原 ({history.length})
              </button>

              <button
                type="button"
                onClick={toggleSwapSides}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center gap-1 border border-stone-700"
              >
                <i className="fa-solid fa-right-left text-orange-400" aria-hidden="true"></i>
                換邊
              </button>

              <button
                type="button"
                aria-expanded={showRulesBar}
                onClick={() => setShowRulesBar((v) => !v)}
                className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border transition-colors ${
                  showRulesBar
                    ? 'bg-orange-600 text-white border-orange-500'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700'
                }`}
              >
                <i className="fa-solid fa-sliders" aria-hidden="true"></i>
                賽制/規則
              </button>

              {onOpenMatchRecord && (
                <button
                  type="button"
                  onClick={handleTriggerExportRecord}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-orange-300 text-xs font-extrabold flex items-center gap-1 border border-stone-700"
                  title="預覽並列印／匯出本場比賽紀錄單 PDF"
                >
                  <i className="fa-solid fa-file-pdf" aria-hidden="true"></i>
                  匯出紀錄 PDF
                </button>
              )}

              <button
                type="button"
                onClick={playBuzzerHorn}
                aria-label="鳴響比賽號角"
                title="手動鳴響場邊蜂鳴器"
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-amber-600/30 text-amber-300 text-xs font-bold border border-stone-700"
              >
                <i className="fa-solid fa-volume-high" aria-hidden="true"></i>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? '退出全螢幕' : '進入全螢幕記分板'}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold border border-stone-700"
              >
                <i
                  className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}
                  aria-hidden="true"
                ></i>
              </button>
            </div>
          </header>

          {/* 可摺疊：本場賽制與規則微調列（全運動皆支援調整幾戰幾勝！） */}
          {showRulesBar && (
            <div className="bg-stone-900 border-b border-stone-800 px-4 py-2 flex flex-wrap items-center gap-4 text-xs text-stone-300 shrink-0">
              <label className="flex items-center gap-1.5 font-extrabold text-amber-300">
                本場對戰賽制：
                <select
                  value={sbState.rules.bestOf || 1}
                  onChange={(e) => handleChangeScoreboardBestOf(Number(e.target.value))}
                  className="bg-stone-800 border border-amber-500/60 rounded-lg px-2.5 py-1 text-stone-100 font-bold"
                >
                  <option value={1}>單場決勝 (1戰定勝負)</option>
                  <option value={3}>3 戰 2 勝制</option>
                  <option value={5}>5 戰 3 勝制</option>
                  <option value={7}>7 戰 4 勝制</option>
                </select>
              </label>

              {sbState.template === 'PICKLEBALL' && (
                <label className="flex items-center gap-1.5 font-bold">
                  匹克球計分制：
                  <select
                    value={sbState.rules.scoringMode}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setSbState((p) => ({
                        ...p,
                        serverNumber: mode === 'SIDEOUT_DOUBLES' ? 2 : 1,
                        rules: { ...p.rules, scoringMode: mode },
                      }));
                    }}
                    className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-stone-100"
                  >
                    <option value="SIDEOUT_DOUBLES">雙打發球得分制 (0-0-2)</option>
                    <option value="SIDEOUT_SINGLES">單打發球得分制</option>
                    <option value="RALLY">落地得分制 (Rally)</option>
                  </select>
                </label>
              )}

              {(sbState.template === 'PICKLEBALL' || sbState.template === 'RACKET_SETS') && (
                <>
                  <label className="flex items-center gap-1.5 font-bold">
                    目標分數：
                    <select
                      value={sbState.rules.targetPoints}
                      onChange={(e) => {
                        const pts = Number(e.target.value);
                        setSbState((p) => ({
                          ...p,
                          rules: { ...p.rules, targetPoints: pts, decidingSetPoints: pts },
                        }));
                      }}
                      className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-stone-100"
                    >
                      <option value={11}>11 分制</option>
                      <option value={15}>15 分制</option>
                      <option value={21}>21 分制</option>
                      <option value={25}>25 分制</option>
                      <option value={31}>31 分制</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sbState.rules.winByTwo !== false}
                      onChange={(e) =>
                        setSbState((p) => ({
                          ...p,
                          rules: { ...p.rules, winByTwo: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded"
                    />
                    Deuce 須贏 2 分
                  </label>
                </>
              )}

              {(sbState.template === 'BASKETBALL' || sbState.template === 'TIMED_SETS') && (
                <label className="flex items-center gap-1.5 font-bold">
                  單節分鐘數：
                  <select
                    value={sbState.rules.periodMinutes || 10}
                    onChange={(e) => {
                      const mins = Number(e.target.value);
                      setTimerRunning(false);
                      setSbState((p) => ({
                        ...p,
                        clockRemainingMs: mins * 60 * 1000,
                        rules: { ...p.rules, periodMinutes: mins },
                      }));
                    }}
                    className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-stone-100"
                  >
                    {[3, 5, 6, 7, 8, 10, 12, 15, 20].map((m) => (
                      <option key={m} value={m}>
                        {m} 分鐘
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {sbState.template === 'SOCCER' && (
                <label className="flex items-center gap-1.5 font-bold">
                  單半場分鐘數：
                  <select
                    value={sbState.rules.halfMinutes || 20}
                    onChange={(e) => {
                      const mins = Number(e.target.value);
                      setTimerRunning(false);
                      setSbState((p) => ({
                        ...p,
                        clockRemainingMs: mins * 60 * 1000,
                        rules: { ...p.rules, halfMinutes: mins },
                      }));
                    }}
                    className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-stone-100"
                  >
                    {[5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45].map((m) => (
                      <option key={m} value={m}>
                        {m} 分鐘
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {sbState.template === 'TIMED_SETS' && (
                <button
                  type="button"
                  onClick={() =>
                    commitChange((draft) => {
                      draft.rules.startingScore = 12;
                      draft.currentScore = { a: 12, b: 12 };
                      return draft;
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 font-bold text-amber-300"
                >
                  設雙邊初始內場 12 人 (躲避球)
                </button>
              )}

              {sbState.template === 'BASEBALL' && (
                <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(sbState.rules.showBallsStrikes)}
                    onChange={(e) =>
                      setSbState((p) => ({
                        ...p,
                        rules: { ...p.rules, showBallsStrikes: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 rounded"
                  />
                  顯示好壞球燈號 (B / S)
                </label>
              )}
            </div>
          )}

          {/* 多戰系列賽進度橫條 (3戰2勝 / 5戰3勝 / 7戰4勝 時常駐顯示歷次戰果與跨戰切換！) */}
          {series.bestOf > 1 && !ultraDisplayMode && (
            <div className="bg-stone-900/95 border-b border-stone-800 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center flex-wrap gap-2">
                <span className="font-extrabold text-amber-300">
                  🏆 系列賽戰況 ({series.bestOf}戰{series.neededWins}勝)：
                  <span className="ml-1 text-white">
                    {teamInfo.a.name} {series.completedWinsA} - {series.completedWinsB} {teamInfo.b.name}
                  </span>
                </span>
                {sbState.completedSets?.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5">
                    {sbState.completedSets.map((g, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-stone-800 border border-stone-700 font-mono font-bold text-stone-200"
                      >
                        第{idx + 1}{series.unitName}: {g.a}-{g.b}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={handleReopenPreviousGame}
                      className="px-2 py-0.5 rounded-md bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-300 font-bold"
                      title={`退回第 ${sbState.completedSets.length} ${series.unitName}修正分數`}
                    >
                      ↶ 修正上一{series.unitName}
                    </button>
                  </div>
                )}
              </div>

              <span className="font-extrabold text-emerald-300">
                ▶ 正在記分：第 {series.currentGameNumber} {series.unitName}
              </span>
            </div>
          )}

          {/* 即時賽況提示橫幅 */}
          {(errorMsg || setEval?.pointAlert || setEval?.reachedDecidingMidpoint || statusBanner) && (
            <div className="px-3 py-1 bg-stone-900/90 border-b border-stone-800 flex flex-wrap items-center justify-center gap-3 text-xs font-extrabold shrink-0">
              {errorMsg && (
                <span role="alert" className="px-3 py-0.5 rounded-full bg-red-950 border border-red-500 text-red-200">
                  <i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden="true"></i>
                  {errorMsg}
                </span>
              )}
              {setEval?.pointAlert && (
                <span className="px-3.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 animate-pulse text-sm">
                  🔥 {setEval.pointAlert.side ? `${teamInfo[setEval.pointAlert.side].name} — ` : ''}
                  {setEval.pointAlert.label}
                </span>
              )}
              {setEval?.reachedDecidingMidpoint && (
                <span className="px-3 py-0.5 rounded-full bg-sky-950 border border-sky-500 text-sky-200">
                  ⇄ 決勝局達中場分數 ({Math.ceil(setEval.target / 2)} 分)，請雙方交換場地！
                </span>
              )}
              {statusBanner && !errorMsg && (
                <span className="text-stone-300 flex items-center gap-2">
                  <span>{statusBanner}</span>
                  <button
                    type="button"
                    onClick={() => setStatusBanner(null)}
                    className="text-stone-500 hover:text-stone-300"
                    aria-label="關閉提示"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
          )}

          {/* 2. 主記分板核心內容區 (全運動巨型高可視數字設計) */}
          <div className="flex-grow overflow-y-auto p-2.5 sm:p-4 flex flex-col justify-between gap-2.5 min-h-0">
            {/* ==================== 模板 A：匹克球 PICKLEBALL ==================== */}
            {sbState.template === 'PICKLEBALL' && pickleballCallout && (
              <div className="flex flex-col h-full justify-between gap-2.5 min-h-0">
                <div className="bg-gradient-to-r from-emerald-950/90 via-stone-900 to-emerald-950/90 border border-emerald-700/60 rounded-2xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-300">
                      <span className="sr-only">切換匹克球計分方式</span>
                      <select
                        aria-label="切換匹克球計分方式"
                        value={sbState.rules.scoringMode}
                        onChange={(e) => {
                          const mode = e.target.value;
                          setSbState((p) => ({
                            ...p,
                            serverNumber: mode === 'SIDEOUT_DOUBLES' ? 2 : 1,
                            rules: { ...p.rules, scoringMode: mode },
                          }));
                        }}
                        className="px-2.5 py-1 min-h-[32px] rounded-lg bg-emerald-500/20 text-emerald-200 text-xs font-extrabold border border-emerald-500/50 cursor-pointer"
                      >
                        <option value="SIDEOUT_DOUBLES" className="bg-stone-900 text-stone-100">
                          🏓 雙打發球得分制 (0-0-2)
                        </option>
                        <option value="SIDEOUT_SINGLES" className="bg-stone-900 text-stone-100">
                          🏓 單打發球得分制
                        </option>
                        <option value="RALLY" className="bg-stone-900 text-stone-100">
                          ⚡ 落地得分制 (Rally 每球得分)
                        </option>
                      </select>
                    </label>
                    <span className="text-xs sm:text-sm text-stone-200 font-bold">
                      發球：<strong className="text-emerald-300">{teamInfo[sbState.servingSide].name}</strong>
                      <span className="ml-1.5 text-stone-400">({pickleballCallout.courtSideLabel})</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 mx-auto sm:mx-0">
                    <span className="text-xs font-bold text-stone-400">標準報分</span>
                    <span
                      aria-live="polite"
                      className="scoreboard-callout-digit tracking-wider text-amber-300 bg-black/70 px-4 py-1 rounded-xl border border-amber-500/50"
                    >
                      {pickleballCallout.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        commitChange((d) => {
                          d.servingSide = d.servingSide === 'a' ? 'b' : 'a';
                          return d;
                        })
                      }
                      className="px-2.5 py-1 min-h-[32px] rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-200 border border-stone-700"
                    >
                      切換發球方
                    </button>
                    {sbState.rules.scoringMode === 'SIDEOUT_DOUBLES' && (
                      <button
                        type="button"
                        onClick={() =>
                          commitChange((d) => {
                            d.serverNumber = d.serverNumber === 1 ? 2 : 1;
                            return d;
                          })
                        }
                        className="px-2.5 py-1 min-h-[32px] rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-bold text-emerald-300 border border-stone-700"
                      >
                        切換 #{sbState.serverNumber === 1 ? '2' : '1'} 號
                      </button>
                    )}
                  </div>
                </div>

                {/* 雙欄滿版巨型分數卡 */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-grow min-h-0">
                  {[leftKey, rightKey].map((side) => {
                    const info = teamInfo[side];
                    const isServing = sbState.servingSide === side;
                    const scoreVal = sbState.currentScore[side];

                    return (
                      <div
                        key={side}
                        className={`rounded-2xl p-3 sm:p-5 flex flex-col justify-between border-2 transition-all min-h-0 ${
                          isServing
                            ? 'bg-gradient-to-b from-stone-900 to-black border-emerald-400 shadow-[0_0_32px_rgba(16,185,129,0.22)]'
                            : 'bg-gradient-to-b from-stone-900/80 to-stone-950 border-stone-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className={`text-xl sm:text-3xl lg:text-4xl font-black truncate ${info.accentText}`}>
                              {info.name}
                            </div>
                            {isServing && (
                              <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500 text-stone-950 font-black text-xs sm:text-sm">
                                🏓 發球中
                                {sbState.rules.scoringMode === 'SIDEOUT_DOUBLES' && ` #${sbState.serverNumber}`}
                              </span>
                            )}
                          </div>
                          {renderSeriesBadgeForSide(side)}
                        </div>

                        <button
                          type="button"
                          onClick={() => adjustCurrentScore(side, 1)}
                          title={`點擊直接為 ${info.name} +1 分`}
                          className="flex-grow flex items-center justify-center my-1 rounded-2xl hover:bg-white/[0.03] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                          <span className={`${digitClassFor(scoreVal)} text-white`}>
                            {scoreVal}
                          </span>
                        </button>

                        <div className="flex items-center justify-center gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => adjustCurrentScore(side, -1)}
                            className="min-h-[46px] px-4 sm:px-5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-extrabold text-sm sm:text-base border border-stone-700"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustCurrentScore(side, 1)}
                            className={`min-h-[46px] px-5 sm:px-6 rounded-xl font-black text-sm sm:text-lg ${
                              sbState.rules.scoringMode === 'RALLY'
                                ? `${info.btnPrimary} flex-grow`
                                : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700'
                            }`}
                          >
                            +1 {sbState.rules.scoringMode === 'RALLY' ? '得分' : '微調'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sbState.rules.scoringMode !== 'RALLY' && (
                  <div className="grid grid-cols-2 gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePickleballAction('SERVER_SCORES')}
                      className="min-h-[58px] py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-base sm:text-xl shadow-lg flex items-center justify-center gap-2.5"
                    >
                      <i className="fa-solid fa-circle-plus text-xl" aria-hidden="true"></i>
                      <span className="truncate">
                        發球得分 (+1) — {teamInfo[sbState.servingSide].name}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePickleballAction('SIDE_OUT_OR_FAULT')}
                      className="min-h-[58px] py-2.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-black text-base sm:text-xl shadow-lg flex items-center justify-center gap-2.5"
                    >
                      <i className="fa-solid fa-arrows-rotate text-xl" aria-hidden="true"></i>
                      <span className="truncate">
                        {sbState.rules.scoringMode === 'SIDEOUT_DOUBLES' && sbState.serverNumber === 1
                          ? '失誤 → 換同隊 #2 發球'
                          : '失誤換邊發球 (Side-Out)'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 模板 B：球拍/網類局數制 RACKET_SETS (排球/羽球/桌球) ==================== */}
            {sbState.template === 'RACKET_SETS' && (
              <div className="flex flex-col h-full justify-between gap-2.5 min-h-0">
                {!ultraDisplayMode && (
                  <div className="bg-stone-900/90 border border-stone-800 rounded-xl px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-stone-300 shrink-0">
                    <div>
                      目標 <strong className="text-amber-400">{setEval?.target}</strong> 分
                      {sbState.rules.capScore ? ` (封頂 ${sbState.rules.capScore} 分)` : ''}
                      {sbState.rules.serviceRotation === 'ALTERNATE_2' && (
                        <span className="ml-2 text-sky-300">· 桌球自動輪發</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        commitChange((d) => {
                          const flipped = d.servingSide === 'a' ? 'b' : 'a';
                          d.firstServerOfSet = d.firstServerOfSet === 'a' ? 'b' : 'a';
                          d.servingSide = flipped;
                          return d;
                        })
                      }
                      className="px-2.5 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200"
                    >
                      切換發球方
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-grow min-h-0">
                  {[leftKey, rightKey].map((side) => {
                    const info = teamInfo[side];
                    const isServing = sbState.servingSide === side;
                    const scoreVal = sbState.currentScore[side];

                    return (
                      <div
                        key={side}
                        className={`rounded-2xl p-3 sm:p-5 flex flex-col justify-between border-2 transition-all min-h-0 ${
                          isServing
                            ? 'bg-gradient-to-b from-stone-900 to-black border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.2)]'
                            : 'bg-gradient-to-b from-stone-900/80 to-stone-950 border-stone-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className={`text-xl sm:text-3xl lg:text-4xl font-black truncate ${info.accentText}`}>
                              {info.name}
                            </div>
                            {isServing && (
                              <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500 text-stone-950 font-black text-xs sm:text-sm">
                                <i className={`fa-solid ${sport.icon}`} aria-hidden="true"></i>
                                發球權
                              </span>
                            )}
                          </div>
                          {renderSeriesBadgeForSide(side)}
                        </div>

                        <button
                          type="button"
                          onClick={() => adjustCurrentScore(side, 1)}
                          title={`點擊直接為 ${info.name} +1 得分`}
                          className="flex-grow flex items-center justify-center my-1 rounded-2xl hover:bg-white/[0.03] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                          <span className={`${digitClassFor(scoreVal)} text-white`}>
                            {scoreVal}
                          </span>
                        </button>

                        <div className="grid grid-cols-[auto_1fr] gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => adjustCurrentScore(side, -1)}
                            className="min-h-[54px] px-4 sm:px-6 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-extrabold text-lg border border-stone-700"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustCurrentScore(side, 1)}
                            className={`min-h-[54px] rounded-2xl font-black text-lg sm:text-2xl shadow-lg ${info.btnPrimary}`}
                          >
                            +1 得分
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ==================== 模板 C：籃球專業記分板 BASKETBALL (支援單場與 3/5/7 戰系列賽！) ==================== */}
            {sbState.template === 'BASKETBALL' && (
              <div className="flex flex-col h-full justify-between gap-2.5 min-h-0">
                {/* 比賽大鐘與節數切換列 */}
                <div className="bg-stone-900 border border-stone-800 rounded-2xl px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center flex-wrap gap-1">
                    {sbState.periodScores.map((_, idx) => {
                      const label =
                        idx < sbState.rules.totalPeriods
                          ? `Q${idx + 1}`
                          : `OT${idx - sbState.rules.totalPeriods + 1}`;
                      const active = sbState.currentPeriod === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => switchBasketballPeriod(idx)}
                          className={`min-h-[34px] px-2.5 sm:px-3 py-0.5 rounded-xl text-xs font-black border transition-colors ${
                            active
                              ? 'bg-orange-600 text-white border-orange-400'
                              : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => switchBasketballPeriod(sbState.periodScores.length)}
                      className="min-h-[34px] px-2.5 py-0.5 rounded-xl text-xs font-bold bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700"
                    >
                      +OT
                    </button>
                  </div>

                  {/* 大字電子鐘 */}
                  <div className="flex items-center gap-2 mx-auto sm:mx-0">
                    <span
                      className={`scoreboard-clock-digit font-mono px-3.5 py-1 rounded-xl border ${
                        sbState.clockRemainingMs === 0
                          ? 'bg-red-950/90 text-red-300 border-red-500'
                          : timerRunning
                            ? 'bg-black text-emerald-400 border-emerald-500/50'
                            : 'bg-black text-amber-300 border-stone-700'
                      }`}
                    >
                      {formatClock(sbState.clockRemainingMs)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTimerRunning((r) => !r)}
                      className={`min-h-[42px] px-3.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 ${
                        timerRunning
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      <i
                        className={`fa-solid ${timerRunning ? 'fa-pause' : 'fa-play'}`}
                        aria-hidden="true"
                      ></i>
                      {timerRunning ? '暫停' : '開錶'}
                    </button>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setSbState((p) => ({
                            ...p,
                            clockRemainingMs: p.clockRemainingMs + 1000,
                          }))
                        }
                        className="px-2 py-1.5 text-[11px] font-bold bg-stone-800 hover:bg-stone-700 rounded-lg border border-stone-700"
                      >
                        +1s
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSbState((p) => ({
                            ...p,
                            clockRemainingMs: Math.max(0, p.clockRemainingMs - 1000),
                          }))
                        }
                        className="px-2 py-1.5 text-[11px] font-bold bg-stone-800 hover:bg-stone-700 rounded-lg border border-stone-700"
                      >
                        -1s
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSbState((p) => ({
                        ...p,
                        possession: p.possession === 'a' ? 'b' : 'a',
                      }))
                    }
                    className="min-h-[34px] px-3 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-extrabold text-amber-300"
                  >
                    球權：{sbState.possession === leftKey ? '◀ 左側' : '右側 ▶'}
                  </button>
                </div>

                {/* 雙欄滿版巨型分數卡 */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-grow min-h-0">
                  {[leftKey, rightKey].map((side) => {
                    const info = teamInfo[side];
                    const teamFouls = sbState.fouls[side] || 0;
                    const inBonus = teamFouls >= (sbState.rules.bonusFoulLimit || 5);
                    const curPeriodPts = sbState.periodScores[sbState.currentPeriod]?.[side] || 0;
                    const totalScore = curGameTotals[side];

                    return (
                      <div
                        key={side}
                        className={`rounded-2xl p-3 sm:p-4 bg-gradient-to-b from-stone-900 to-black border-2 ${info.cardBorder} flex flex-col justify-between gap-2 min-h-0`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className={`text-xl sm:text-3xl lg:text-4xl font-black truncate ${info.accentText}`}>
                              {info.name}
                            </div>
                            <div className="flex items-center flex-wrap gap-2 mt-1">
                              {inBonus && (
                                <span className="px-2.5 py-0.5 rounded-md bg-red-600 text-white text-xs font-black animate-pulse">
                                  BONUS 加罰
                                </span>
                              )}
                              <span className="text-xs sm:text-sm font-bold text-stone-400">
                                本節 {curPeriodPts} 分 · 團犯{' '}
                                <strong className={inBonus ? 'text-red-400' : 'text-stone-200'}>
                                  {teamFouls}
                                </strong>{' '}
                                · 暫停 <strong className="text-amber-300">{sbState.timeoutsLeft[side]}</strong>
                              </span>
                            </div>
                          </div>
                          {renderSeriesBadgeForSide(side)}
                        </div>

                        {/* 巨型本戰總分 (點擊可直接 +2 或由下方 +1/+2/+3 控制) */}
                        <button
                          type="button"
                          onClick={() => adjustBasketballPoints(side, 2)}
                          title={`點擊直接為 ${info.name} +2 分`}
                          className="flex-grow flex items-center justify-center my-0.5 rounded-2xl hover:bg-white/[0.03] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                          <span className={`${digitClassFor(totalScore)} text-white`}>
                            {totalScore}
                          </span>
                        </button>

                        {/* 緊湊好按的得分 + 團犯暫停列 */}
                        <div className="space-y-2 shrink-0">
                          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                            <button
                              type="button"
                              onClick={() => adjustBasketballPoints(side, -1)}
                              className="min-h-[48px] rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-extrabold text-sm sm:text-base border border-stone-700"
                            >
                              -1
                            </button>
                            {[1, 2, 3].map((pts) => (
                              <button
                                key={pts}
                                type="button"
                                onClick={() => adjustBasketballPoints(side, pts)}
                                className={`min-h-[48px] rounded-xl font-black text-lg sm:text-2xl shadow ${info.btnPrimary}`}
                              >
                                +{pts}
                              </button>
                            ))}
                          </div>

                          {!ultraDisplayMode && (
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => adjustBasketballFouls(side, -1)}
                                  className="px-2.5 min-h-[34px] rounded-lg bg-stone-800 hover:bg-stone-700 font-bold border border-stone-700"
                                >
                                  犯規-1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => adjustBasketballFouls(side, 1)}
                                  className="px-3 min-h-[34px] rounded-lg bg-red-900/75 hover:bg-red-800 text-red-100 font-extrabold"
                                >
                                  +團犯 ({teamFouls})
                                </button>
                              </div>
                              <button
                                type="button"
                                disabled={sbState.timeoutsLeft[side] <= 0}
                                onClick={() => useBasketballTimeout(side)}
                                className="px-3 min-h-[34px] rounded-lg bg-amber-700/60 hover:bg-amber-600 disabled:opacity-35 text-amber-100 font-extrabold"
                              >
                                喊暫停 ({sbState.timeoutsLeft[side]})
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 精簡單列各節小計 */}
                {!ultraDisplayMode && (
                  <div className="bg-stone-900/90 border border-stone-800 rounded-xl px-3 py-1 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-stone-300 shrink-0">
                    <span>
                      本戰各節（{teamInfo.a.name} : {teamInfo.b.name}）：
                    </span>
                    <div className="flex items-center flex-wrap gap-2">
                      {sbState.periodScores.map((p, idx) => {
                        const label =
                          idx < sbState.rules.totalPeriods
                            ? `Q${idx + 1}`
                            : `OT${idx - sbState.rules.totalPeriods + 1}`;
                        return (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded ${
                              idx === sbState.currentPeriod
                                ? 'bg-orange-600/30 text-orange-200 font-bold border border-orange-500/40'
                                : 'bg-stone-800 text-stone-400'
                            }`}
                          >
                            {label} {p.a}:{p.b}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 模板 D：棒壘球 / 樂樂棒球 BASEBALL ==================== */}
            {sbState.template === 'BASEBALL' && (
              <div className="flex flex-col h-full justify-between gap-2.5 min-h-0">
                <div className="bg-stone-900 border border-stone-800 rounded-2xl px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl sm:text-3xl font-black text-amber-400">
                      第 {sbState.currentInning + 1} 局{sbState.half === 'top' ? '上 ▲' : '下 ▼'}
                    </span>
                    <span className="px-3 py-0.5 rounded-full bg-stone-800 border border-stone-700 text-xs font-extrabold text-stone-200">
                      進攻：{sbState.half === 'top' ? teamInfo.a.name : teamInfo.b.name}
                    </span>
                  </div>

                  {/* B / S / O 燈號 */}
                  <div className="flex items-center gap-5 font-mono text-base font-black">
                    {sbState.rules.showBallsStrikes && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-400">B</span>
                          {[1, 2, 3].map((n) => (
                            <span
                              key={n}
                              className={`w-4 h-4 rounded-full border ${
                                sbState.balls >= n
                                  ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_8px_#34d399]'
                                  : 'bg-stone-800 border-stone-600'
                              }`}
                            ></span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-400">S</span>
                          {[1, 2].map((n) => (
                            <span
                              key={n}
                              className={`w-4 h-4 rounded-full border ${
                                sbState.strikes >= n
                                  ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_#fbbf24]'
                                  : 'bg-stone-800 border-stone-600'
                              }`}
                            ></span>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-red-400">O</span>
                      {[1, 2].map((n) => (
                        <span
                          key={n}
                          className={`w-4 h-4 rounded-full border ${
                            sbState.outs >= n
                              ? 'bg-red-500 border-red-300 shadow-[0_0_8px_#ef4444]'
                              : 'bg-stone-800 border-stone-600'
                          }`}
                        ></span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 雙欄巨型總分卡（優先讓場上球員清楚看見總分！） */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-grow min-h-0">
                  {[leftKey, rightKey].map((side) => {
                    const info = teamInfo[side];
                    const isBatting =
                      (side === 'a' && sbState.half === 'top') ||
                      (side === 'b' && sbState.half === 'bottom');
                    const totalRuns = curGameTotals[side];

                    return (
                      <div
                        key={side}
                        className={`rounded-2xl p-3 sm:p-5 flex flex-col justify-between border-2 min-h-0 ${
                          isBatting
                            ? 'bg-gradient-to-b from-stone-900 to-black border-amber-400 shadow-[0_0_26px_rgba(245,158,11,0.18)]'
                            : 'bg-gradient-to-b from-stone-900/80 to-stone-950 border-stone-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className={`text-xl sm:text-3xl lg:text-4xl font-black truncate ${info.accentText}`}>
                              {info.name}
                            </div>
                            <span className="mt-1 inline-block text-xs font-extrabold text-stone-400">
                              {side === 'a' ? '先攻 (上半局)' : '後攻 (下半局)'}
                              {isBatting && (
                                <strong className="ml-2 px-2 py-0.5 rounded bg-amber-500 text-stone-950">
                                  ⚾ 進攻中
                                </strong>
                              )}
                            </span>
                          </div>
                          {renderSeriesBadgeForSide(side)}
                        </div>

                        <button
                          type="button"
                          onClick={() => adjustBaseballRuns(side, 1)}
                          title={`點擊直接為 ${info.name} +1 得分`}
                          className="flex-grow flex items-center justify-center my-1 rounded-2xl hover:bg-white/[0.03] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                          <span className={`${digitClassFor(totalRuns)} text-white`}>
                            {totalRuns}
                          </span>
                        </button>

                        <div className="grid grid-cols-[auto_1fr] gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => adjustBaseballRuns(side, -1)}
                            className="min-h-[48px] px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-extrabold border border-stone-700"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustBaseballRuns(side, 1)}
                            className={`min-h-[48px] rounded-xl font-black text-base sm:text-xl shadow ${info.btnPrimary}`}
                          >
                            +1 得分
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 精簡逐局表 + 好壞球出局控制 */}
                <div className="space-y-2 shrink-0">
                  {!ultraDisplayMode && (
                    <div className="bg-stone-900/90 border border-stone-800 rounded-xl px-3 py-1.5 overflow-x-auto">
                      <table className="w-full text-xs text-center font-mono">
                        <thead>
                          <tr className="text-stone-400">
                            <th className="text-left pr-3 font-sans">局數</th>
                            {sbState.innings.map((_, idx) => (
                              <th
                                key={idx}
                                onClick={() => setSbState((p) => ({ ...p, currentInning: idx }))}
                                className={`px-2 cursor-pointer ${
                                  idx === sbState.currentInning ? 'text-amber-400 font-black' : ''
                                }`}
                              >
                                {idx + 1}
                              </th>
                            ))}
                            <th className="px-2 text-amber-400 font-black">R</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { key: 'a', halfKey: 'top' },
                            { key: 'b', halfKey: 'bottom' },
                          ].map(({ key, halfKey }) => (
                            <tr key={key}>
                              <td className={`text-left pr-3 font-sans font-bold ${teamInfo[key].accentText}`}>
                                {teamInfo[key].name}
                              </td>
                              {sbState.innings.map((inn, idx) => (
                                <td
                                  key={idx}
                                  onClick={() =>
                                    setSbState((p) => ({ ...p, currentInning: idx, half: halfKey }))
                                  }
                                  className={`px-2 py-0.5 cursor-pointer rounded ${
                                    idx === sbState.currentInning && sbState.half === halfKey
                                      ? 'bg-amber-500/25 text-amber-200 font-black'
                                      : 'text-stone-300'
                                  }`}
                                >
                                  {inn[key]}
                                </td>
                              ))}
                              <td className="px-2 font-black text-amber-300">{curGameTotals[key]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {sbState.rules.showBallsStrikes && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleBaseballPitch('BALL')}
                          className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-sm"
                        >
                          🟢 壞球 B
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBaseballPitch('STRIKE')}
                          className="min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-sm"
                        >
                          🟡 好球 S
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBaseballPitch('RESET_COUNT')}
                          className="min-h-[44px] px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs border border-stone-700"
                        >
                          球數歸零
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleBaseballPitch('OUT')}
                      className="min-h-[44px] px-4 rounded-xl bg-red-700 hover:bg-red-600 text-white font-black text-sm"
                    >
                      🔴 出局 (+1 Out)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBaseballPitch('SWITCH_SIDE')}
                      className={`min-h-[44px] px-5 rounded-xl font-black text-sm border ${
                        sbState.outs >= 3
                          ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border-amber-300 animate-pulse'
                          : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-stone-700'
                      }`}
                    >
                      ⇄ 攻守交換
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 模板 F：足球／五人制足球 SOCCER (上下半場 + 延長 + PK點球 + 紅黃牌 + 犯規累計) ==================== */}
            {sbState.template === 'SOCCER' && (
              <div className="flex flex-col h-full justify-between gap-2 min-h-0">
                {/* 半場控制與大字計時器列 */}
                <div className="bg-stone-900 border border-stone-800 rounded-2xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-stone-400 mr-1">半場</span>
                    {(sbState.halfScores || []).map((h, idx) => {
                      const halfLabel =
                        idx === 0 ? '上半場' : idx === 1 ? '下半場' : `延長ET${idx - 1}`;
                      return (
                        <button
                          key={halfLabel}
                          type="button"
                          onClick={() => switchSoccerHalf(idx)}
                          className={`min-h-[38px] px-3 rounded-xl font-black text-xs transition-all ${
                            sbState.currentHalf === idx
                              ? 'bg-emerald-500 text-stone-950 shadow-lg shadow-emerald-500/30'
                              : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                          }`}
                        >
                          {halfLabel}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => switchSoccerHalf((sbState.halfScores || []).length)}
                      className="min-h-[38px] px-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-extrabold border border-stone-700"
                      title="新增延長賽半場 (ET)"
                    >
                      +延長賽 ET
                    </button>
                    <button
                      type="button"
                      onClick={togglePenaltyShootout}
                      className={`min-h-[38px] px-3 rounded-xl text-xs font-extrabold border transition-all ${
                        sbState.penaltyShootout?.enabled
                          ? 'bg-amber-500 text-stone-950 border-amber-300 shadow'
                          : 'bg-stone-800 hover:bg-stone-700 text-amber-200 border-stone-700'
                      }`}
                    >
                      ⚽ PK 點球大戰 {sbState.penaltyShootout?.enabled ? `(${sbState.penaltyShootout.a}:${sbState.penaltyShootout.b})` : ''}
                    </button>
                  </div>

                  {/* 大字計時器 */}
                  <div className="flex items-center gap-2 mx-auto sm:mx-0">
                    <button
                      type="button"
                      onClick={() => adjustClockSeconds(60)}
                      className="min-h-[38px] px-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-300"
                    >
                      +1分
                    </button>
                    <div
                      className={`scoreboard-clock-digit font-mono px-3.5 py-0.5 rounded-xl border-2 tracking-wider ${
                        timerRunning
                          ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
                          : 'bg-black border-stone-700 text-amber-300'
                      }`}
                    >
                      {formatClock(sbState.clockRemainingMs)}
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustClockSeconds(-10)}
                      className="min-h-[38px] px-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-300"
                    >
                      -10秒
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimerRunning((r) => !r)}
                      className={`min-h-[40px] px-4 rounded-xl font-black text-sm shadow transition-all ${
                        timerRunning
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {timerRunning ? '⏸ 暫停' : '▶ 開錶'}
                    </button>
                  </div>

                  {/* 進球語音播報 */}
                  <button
                    type="button"
                    onClick={() => speakScore(`${curGameTotals.a} 比 ${curGameTotals.b}`)}
                    className="min-h-[38px] px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold border border-stone-700"
                  >
                    🔊 播報比分
                  </button>
                </div>

                {/* PK 點球大戰展開操作列（當平手進入 PK 時） */}
                {sbState.penaltyShootout?.enabled && (
                  <div className="bg-amber-950/80 border border-amber-500/70 rounded-2xl px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="text-xs font-extrabold text-amber-200 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-stone-950 font-black">PK 點球大戰</span>
                      <span>正規賽與延長賽平手時，以 PK 點球進球數裁定淘汰賽晉級隊伍：</span>
                    </div>
                    <div className="flex items-center gap-4 mx-auto sm:mx-0">
                      {[leftKey, rightKey].map((side) => {
                        const info = teamInfo[side];
                        const pkVal = sbState.penaltyShootout?.[side] || 0;
                        return (
                          <div key={`pk-${side}`} className="flex items-center gap-1.5 bg-stone-950/90 px-3 py-1 rounded-xl border border-amber-500/40">
                            <span className={`text-xs font-black ${info.accentText}`}>{info.name} PK</span>
                            <button
                              type="button"
                              onClick={() => adjustPenaltyScore(side, -1)}
                              className="w-7 h-7 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-black text-xs"
                            >
                              -1
                            </button>
                            <span className="font-mono font-black text-lg text-amber-300 px-1.5">{pkVal}</span>
                            <button
                              type="button"
                              onClick={() => adjustPenaltyScore(side, 1)}
                              className="w-8 h-7 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs"
                            >
                              +1
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 左右雙隊超巨型進球記分卡 */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-grow min-h-0">
                  {[leftKey, rightKey].map((side) => {
                    const info = teamInfo[side];
                    const totalScore = curGameTotals[side] || 0;
                    const currHalfIdx = sbState.currentHalf || 0;
                    const currHalfLabel =
                      currHalfIdx === 0
                        ? '上半場'
                        : currHalfIdx === 1
                          ? '下半場'
                          : `延長ET${currHalfIdx - 1}`;
                    const currHalfScore = sbState.halfScores?.[currHalfIdx]?.[side] || 0;
                    const fouls = sbState.fouls?.[side] || 0;
                    const foulLimit = sbState.rules.foulLimitPerHalf || 0;
                    const isSecondPenaltyWarn = foulLimit > 0 && fouls >= foulLimit;
                    const timeoutsLeft = sbState.timeoutsLeft?.[side] || 0;
                    const yellowCards = sbState.cards?.[side]?.yellow || 0;
                    const redCards = sbState.cards?.[side]?.red || 0;

                    return (
                      <div
                        key={side}
                        className={`rounded-2xl p-3 sm:p-4 bg-gradient-to-b from-stone-900 to-black border-2 ${info.cardBorder} flex flex-col justify-between min-h-0`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className={`text-xl sm:text-3xl lg:text-4xl font-black truncate ${info.accentText}`}>
                              {info.name}
                            </div>
                            <div className="text-xs font-bold text-stone-400 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>
                                本半場 ({currHalfLabel})：{currHalfScore} 球
                              </span>
                              {sbState.penaltyShootout?.enabled && (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-black">
                                  PK {sbState.penaltyShootout[side] || 0}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {renderSeriesBadgeForSide(side)}
                            {isSecondPenaltyWarn && (
                              <span className="px-2.5 py-1 rounded-full bg-red-600 text-white text-[11px] font-black animate-pulse shadow">
                                ⚠️ 累計達 {foulLimit} 犯 (第二罰球點)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 點擊巨型數字區直接 +1 進球 */}
                        <button
                          type="button"
                          onClick={() => adjustSoccerGoals(side, 1)}
                          title={`點擊直接為 ${info.name} +1 進球`}
                          className="flex-grow flex items-center justify-center my-1 rounded-2xl hover:bg-white/[0.03] active:scale-[0.98] transition-transform cursor-pointer select-none"
                        >
                          <span className="scoreboard-giant-digit font-mono font-black tracking-tighter text-white drop-shadow-[0_6px_28px_rgba(255,255,255,0.18)]">
                            {totalScore}
                          </span>
                        </button>

                        {/* 進球加減 + 紅黃牌 + 團隊犯規/暫停 */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => adjustSoccerGoals(side, 1)}
                              className={`min-h-[48px] sm:min-h-[54px] rounded-xl font-black text-base sm:text-xl shadow-lg active:scale-95 transition-transform ${info.btnPlus}`}
                            >
                              ⚽ +1 進球
                            </button>
                            <button
                              type="button"
                              onClick={() => adjustSoccerGoals(side, -1)}
                              className="min-h-[48px] sm:min-h-[54px] rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-sm border border-stone-700"
                            >
                              -1 更正
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-stone-800 text-xs">
                            {/* 黃牌 / 紅牌紀錄 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => adjustSoccerCard(side, 'yellow', 1)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  adjustSoccerCard(side, 'yellow', -1);
                                }}
                                title="點擊 +1 黃牌（右鍵 -1）"
                                className="min-h-[34px] px-2.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-200 font-black flex items-center gap-1"
                              >
                                <span className="inline-block w-2.5 h-3.5 rounded-xs bg-amber-400"></span>
                                黃牌 {yellowCards}
                              </button>
                              {yellowCards > 0 && (
                                <button
                                  type="button"
                                  onClick={() => adjustSoccerCard(side, 'yellow', -1)}
                                  className="min-h-[34px] px-1.5 rounded-lg bg-stone-800 text-stone-400 hover:text-white text-[10px] font-bold"
                                  title="減少黃牌"
                                >
                                  -
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => adjustSoccerCard(side, 'red', 1)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  adjustSoccerCard(side, 'red', -1);
                                }}
                                title="點擊 +1 紅牌（右鍵 -1）"
                                className="min-h-[34px] px-2.5 rounded-lg bg-red-600/25 hover:bg-red-600/35 border border-red-500/60 text-red-200 font-black flex items-center gap-1"
                              >
                                <span className="inline-block w-2.5 h-3.5 rounded-xs bg-red-500"></span>
                                紅牌 {redCards}
                              </button>
                              {redCards > 0 && (
                                <button
                                  type="button"
                                  onClick={() => adjustSoccerCard(side, 'red', -1)}
                                  className="min-h-[34px] px-1.5 rounded-lg bg-stone-800 text-stone-400 hover:text-white text-[10px] font-bold"
                                  title="減少紅牌"
                                >
                                  -
                                </button>
                              )}
                            </div>

                            {/* 五人制單半場累計犯規 & 暫停 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {foulLimit > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-stone-400 font-bold">
                                    半場犯規 <strong className={isSecondPenaltyWarn ? 'text-red-400' : 'text-white'}>{fouls}</strong>/{foulLimit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => adjustSoccerFouls(side, 1)}
                                    className="px-2 py-1 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-200 font-bold"
                                  >
                                    +犯規
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => adjustSoccerFouls(side, -1)}
                                    className="px-1.5 py-1 rounded-lg bg-stone-800 text-stone-400"
                                  >
                                    -1
                                  </button>
                                </div>
                              )}
                              {sbState.rules.timeoutsPerHalf > 0 && (
                                <button
                                  type="button"
                                  disabled={timeoutsLeft <= 0}
                                  onClick={() => useSoccerTimeout(side)}
                                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-amber-300 font-bold"
                                >
                                  暫停 ({timeoutsLeft})
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 各半場比分明細列 */}
                <div className="bg-stone-900/90 border border-stone-800 rounded-xl px-4 py-1.5 flex items-center justify-between text-xs overflow-x-auto gap-4 shrink-0">
                  <span className="font-bold text-stone-400 shrink-0">各半場進球明細</span>
                  <div className="flex items-center gap-2">
                    {(sbState.halfScores || []).map((p, idx) => {
                      const halfLabel =
                        idx === 0 ? '上半場' : idx === 1 ? '下半場' : `延長ET${idx - 1}`;
                      return (
                        <span
                          key={halfLabel}
                          className={`px-2.5 py-0.5 rounded-lg font-mono font-bold ${
                            idx === sbState.currentHalf
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-stone-800 text-stone-300'
                          }`}
                        >
                          {halfLabel}: {p[leftKey]}-{p[rightKey]}
                        </span>
                      );
                    })}
                    {sbState.penaltyShootout?.enabled && (
                      <span className="px-2.5 py-0.5 rounded-lg font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        PK: {sbState.penaltyShootout[leftKey]}-{sbState.penaltyShootout[rightKey]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 模板 E：計時局數制 TIMED_SETS (躲避球 / 其他通用) ==================== */}
            {sbState.template === 'TIMED_SETS' && (
              <div className="flex flex-col h-full justify-between gap-2.5 min-h-0">
                <div className="bg-stone-900 border border-stone-800 rounded-2xl px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="text-sm font-extrabold text-stone-200">
                    {series.bestOf > 1
                      ? `第 ${series.currentGameNumber} ${series.unitName}（共 ${series.bestOf} 戰 ${series.neededWins} 勝）`
                      : '單場計時賽'}
                  </div>

                  <div className="flex items-center gap-2.5 mx-auto sm:mx-0">
                    <span className="scoreboard-clock-digit font-mono px-4 py-1 rounded-xl bg-black border border-stone-700 text-amber-300">
                      {formatClock(sbState.clockRemainingMs)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTimerRunning((r) => !r)}
                      className={`min-h-[42px] px-4 rounded-xl font-black text-sm ${
                        timerRunning
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {timerRunning ? '⏸ 暫停' : '▶ 開錶'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimerRunning(false);
                        setSbState((p) => ({
                          ...p,
                          clockRemainingMs: (p.rules.periodMinutes || 5) * 60 * 1000,
                        }));
                      }}
                      className="min-h-[42px] px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-300 border border-stone-700"
                    >
                      重設
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-grow min-h-0">
                  {[leftKey, rightKey].map((side) => {
                    const info = teamInfo[side];
                    const scoreVal = sbState.currentScore[side];

                    return (
                      <div
                        key={side}
                        className={`rounded-2xl p-3 sm:p-5 bg-gradient-to-b from-stone-900 to-black border-2 ${info.cardBorder} flex flex-col justify-between min-h-0`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-xl sm:text-3xl lg:text-4xl font-black truncate ${info.accentText}`}>
                            {info.name}
                          </span>
                          {renderSeriesBadgeForSide(side)}
                        </div>

                        <button
                          type="button"
                          onClick={() => adjustCurrentScore(side, 1)}
                          title={`點擊直接為 ${info.name} +1`}
                          className="flex-grow flex items-center justify-center my-1 rounded-2xl hover:bg-white/[0.03] active:scale-[0.98] transition-transform cursor-pointer"
                        >
                          <span className={`${digitClassFor(scoreVal)} text-white`}>
                            {scoreVal}
                          </span>
                        </button>

                        <div className="grid grid-cols-2 gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => adjustCurrentScore(side, -1)}
                            className="min-h-[54px] rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-100 font-black text-xl border border-stone-700"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustCurrentScore(side, 1)}
                            className={`min-h-[54px] rounded-2xl font-black text-xl shadow-lg ${info.btnPrimary}`}
                          >
                            +1
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 完賽前二次確認覆蓋列 */}
          {confirmFinalize && (
            <div
              role="alert"
              className="bg-amber-950/95 border-t-2 border-amber-500 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0"
            >
              <div className="text-sm font-bold text-amber-100 space-y-0.5">
                <div>
                  🏆 確認最終完賽結算：
                  <strong className="text-white mx-1.5">
                    {teamInfo.a.name} {confirmFinalize.result.scoreA} :{' '}
                    {confirmFinalize.result.scoreB} {teamInfo.b.name}
                    {confirmFinalize.result.penaltyScore &&
                      ` (PK ${confirmFinalize.result.penaltyScore.a}:${confirmFinalize.result.penaltyScore.b})`}
                  </strong>
                  {confirmFinalize.result.topIsWinner && `（勝方：${teamInfo.a.name}）`}
                  {confirmFinalize.result.bottomIsWinner && `（勝方：${teamInfo.b.name}）`}
                </div>
                {confirmFinalize.downstreamPlayed && (
                  <div className="text-xs text-amber-300">
                    ⚠️ 注意：後續輪次已有比分，變更晉級者將自動重置受影響的下游場次。
                  </div>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmFinalize(null)}
                  className="min-h-[40px] px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold border border-stone-700"
                >
                  返回修改
                </button>
                {onOpenMatchRecord && (
                  <button
                    type="button"
                    onClick={handleTriggerExportRecord}
                    className="min-h-[40px] px-4 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 text-amber-100 text-xs sm:text-sm font-extrabold border border-amber-400/60 flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-file-pdf" aria-hidden="true"></i>
                    先匯出紀錄單 PDF
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handleExecuteFinalize}
                  className="min-h-[40px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-sm font-black shadow-lg"
                >
                  {isSyncing ? '上傳中...' : '✓ 確定完賽並解鎖場次'}
                </button>
              </div>
            </div>
          )}

          {/* 棄權快捷選單 */}
          {showForfeitMenu && (
            <div className="bg-red-950/95 border-t border-red-700 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
              <span className="font-bold text-red-200">
                特殊賽況裁定（點擊後直接判定對手晉級並完賽解鎖）：
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleForfeitMatch('a')}
                  className="min-h-[36px] px-3.5 rounded-xl bg-red-800 hover:bg-red-700 text-white font-bold"
                >
                  裁定「{teamInfo.a.name}」棄權
                </button>
                <button
                  type="button"
                  onClick={() => handleForfeitMatch('b')}
                  className="min-h-[36px] px-3.5 rounded-xl bg-red-800 hover:bg-red-700 text-white font-bold"
                >
                  裁定「{teamInfo.b.name}」棄權
                </button>
                <button
                  type="button"
                  onClick={() => setShowForfeitMenu(false)}
                  className="min-h-[36px] px-3 rounded-xl bg-stone-800 text-stone-300 font-bold"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 3. 底部智慧型多戰系列賽 & 完賽動作列 */}
          <footer className="bg-stone-950 border-t border-stone-800 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTimerRunning(false);
                  onCloseKeepLock();
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-bold border border-stone-700"
              >
                暫離 (保留鎖定)
              </button>

              <button
                type="button"
                disabled={isSyncing}
                onClick={() => {
                  setTimerRunning(false);
                  onReleaseLockAndClose(match.id);
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-red-950/60 text-stone-400 hover:text-red-300 text-xs font-bold border border-stone-800"
              >
                <i className="fa-solid fa-lock-open mr-1" aria-hidden="true"></i>
                釋放鎖定退出
              </button>

              <button
                type="button"
                onClick={() => setShowForfeitMenu((v) => !v)}
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-400 text-xs font-bold border border-stone-800"
              >
                棄權
              </button>

              {onOpenMatchRecord && (
                <button
                  type="button"
                  onClick={handleTriggerExportRecord}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-orange-300 text-xs font-bold border border-stone-700 flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-print" aria-hidden="true"></i>
                  列印／PDF 紀錄單
                </button>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleManualSyncProgress}
                className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-sky-900/70 hover:bg-sky-800 text-sky-100 text-xs font-extrabold border border-sky-600/60 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-rotate" aria-hidden="true"></i>
                同步即時比分
              </button>

              {/* 多戰系列賽 (3戰2勝/5戰3勝/7戰4勝) 尚未達總勝場時：同時提供「儲存本戰並暫離(下次續戰)」與「立即進入下一戰」！ */}
              {series.bestOf > 1 && !series.canFinalizeSeriesNow ? (
                <>
                  <button
                    type="button"
                    disabled={isSyncing || !series.canFinishCurrentGame}
                    onClick={handleFinishGameAndExitForLater}
                    className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-extrabold flex items-center gap-1.5 shadow"
                    title="儲存本戰結果並釋放鎖定；下次任何平板點開此對戰卡即可直接記下一戰！"
                  >
                    <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                    儲存第 {series.currentGameNumber} {series.unitName}並暫離 (下次續戰)
                  </button>

                  <button
                    type="button"
                    disabled={isSyncing || !series.canFinishCurrentGame}
                    onClick={handleFinishGameAndContinueNext}
                    className="min-h-[42px] px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-black shadow-lg flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-forward-step" aria-hidden="true"></i>
                    結束第 {series.currentGameNumber} {series.unitName} → 進入第 {series.currentGameNumber + 1} {series.unitName}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handleRequestFinalize}
                  className="min-h-[42px] px-5 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs sm:text-sm font-black shadow-lg flex items-center gap-2"
                >
                  <i className="fa-solid fa-flag-checkered" aria-hidden="true"></i>
                  {series.bestOf > 1
                    ? `系列賽決勝完賽 (${series.projectedWinsA}:${series.projectedWinsB}) · 上傳晉級`
                    : hasCloudConnection
                      ? '完賽並上傳最終成績'
                      : '完賽並寫入晉級表'}
                </button>
              )}
            </div>
          </footer>
        </div>
      )}
    </ModalDialog>
  );
};
