import { SPORTS } from '../constants/sports.js';

/**
 * 運動數位記分板純函式狀態引擎
 * - 完整支援五大專業記分模板 (BASKETBALL / PICKLEBALL / RACKET_SETS / BASEBALL / TIMED_SETS)
 * - 完整支援多戰系列賽 (3戰2勝 / 5戰3勝 / 7戰4勝)，包含籃球與棒壘球「每一戰皆可使用完整記分板」及跨時段續戰！
 */

const countSeriesWins = (sets = []) => {
  let winsA = 0;
  let winsB = 0;
  sets.forEach((s) => {
    const a = Number(s.a) || 0;
    const b = Number(s.b) || 0;
    if (a > b) winsA++;
    else if (b > a) winsB++;
  });
  return { winsA, winsB };
};

export const createInitialScoreboardState = (match, config, overrideBestOf = null) => {
  const sport = SPORTS[config?.sport] || SPORTS.OTHER;
  const bestOf = Number(overrideBestOf || match?.customBestOf || config?.bestOf || 1);
  const neededWins = Math.ceil(bestOf / 2);
  const rules = { ...(sport.defaultRules || {}), bestOf };
  const template = sport.scoreboardTemplate || 'TIMED_SETS';

  const existingSets =
    match?.setScores && match.setScores.length > 0
      ? match.setScores.map((s) => ({
          a: Number(s.a) || 0,
          b: Number(s.b) || 0,
          ...(Array.isArray(s.breakdown) ? { breakdown: s.breakdown } : {}),
        }))
      : [];

  // 多戰制 (bestOf > 1) 時區分「未分出系列賽勝負 (載入已完成戰數，開啟全新下一戰 0:0)」與「已完賽回顧 (載入最後一戰供檢視/微調)」
  const splitSeriesSets = () => {
    if (bestOf <= 1 || existingSets.length === 0) {
      return { completedSets: [], activeSeed: null };
    }
    const { winsA, winsB } = countSeriesWins(existingSets);
    const seriesAlreadyDecided = winsA >= neededWins || winsB >= neededWins;
    if (seriesAlreadyDecided) {
      return {
        completedSets: existingSets.slice(0, -1),
        activeSeed: existingSets[existingSets.length - 1],
      };
    }
    return {
      completedSets: existingSets.slice(),
      activeSeed: null,
    };
  };

  if (template === 'BASKETBALL') {
    if (bestOf > 1) {
      const { completedSets, activeSeed } = splitSeriesSets();
      const freshPeriods =
        activeSeed?.breakdown && activeSeed.breakdown.length > 0
          ? activeSeed.breakdown.map((p) => ({ a: Number(p.a) || 0, b: Number(p.b) || 0 }))
          : Array.from({ length: rules.totalPeriods }, (_, idx) =>
              idx === 0 && activeSeed ? { a: activeSeed.a, b: activeSeed.b } : { a: 0, b: 0 }
            );
      return {
        template,
        sportId: sport.id,
        rules,
        swappedSides: completedSets.length % 2 === 1,
        completedSets, // 已完成的各場總分與各節明細
        currentPeriod: 0,
        periodScores: freshPeriods,
        fouls: { a: 0, b: 0 },
        timeoutsLeft: { a: rules.timeoutsPerHalf, b: rules.timeoutsPerHalf },
        possession: completedSets.length % 2 === 1 ? 'b' : 'a',
        clockRemainingMs: rules.periodMinutes * 60 * 1000,
      };
    }

    // 單場決勝 (bestOf === 1)
    let periodScores;
    if (existingSets.length >= rules.totalPeriods) {
      periodScores = existingSets;
    } else if (existingSets.length > 0) {
      periodScores = Array.from({ length: rules.totalPeriods }, (_, idx) =>
        existingSets[idx] ? { ...existingSets[idx] } : { a: 0, b: 0 }
      );
    } else {
      periodScores = Array.from({ length: rules.totalPeriods }, () => ({ a: 0, b: 0 }));
    }

    return {
      template,
      sportId: sport.id,
      rules,
      swappedSides: false,
      completedSets: [],
      currentPeriod: 0,
      periodScores,
      fouls: { a: 0, b: 0 },
      timeoutsLeft: { a: rules.timeoutsPerHalf, b: rules.timeoutsPerHalf },
      possession: 'a',
      clockRemainingMs: rules.periodMinutes * 60 * 1000,
    };
  }

  if (template === 'BASEBALL') {
    if (bestOf > 1) {
      const { completedSets, activeSeed } = splitSeriesSets();
      const freshInnings =
        activeSeed?.breakdown && activeSeed.breakdown.length > 0
          ? activeSeed.breakdown.map((inn) => ({ a: Number(inn.a) || 0, b: Number(inn.b) || 0 }))
          : Array.from({ length: rules.totalInnings }, (_, idx) =>
              idx === 0 && activeSeed ? { a: activeSeed.a, b: activeSeed.b } : { a: 0, b: 0 }
            );
      return {
        template,
        sportId: sport.id,
        rules,
        swappedSides: false,
        completedSets,
        currentInning: 0,
        half: 'top',
        innings: freshInnings,
        balls: 0,
        strikes: 0,
        outs: 0,
      };
    }

    let innings;
    if (existingSets.length >= rules.totalInnings) {
      innings = existingSets;
    } else if (existingSets.length > 0) {
      innings = Array.from({ length: rules.totalInnings }, (_, idx) =>
        existingSets[idx] ? { ...existingSets[idx] } : { a: 0, b: 0 }
      );
    } else {
      innings = Array.from({ length: rules.totalInnings }, () => ({ a: 0, b: 0 }));
    }

    return {
      template,
      sportId: sport.id,
      rules,
      swappedSides: false,
      completedSets: [],
      currentInning: 0,
      half: 'top',
      innings,
      balls: 0,
      strikes: 0,
      outs: 0,
    };
  }

  if (template === 'PICKLEBALL') {
    const { completedSets, activeSeed } =
      bestOf > 1
        ? splitSeriesSets()
        : { completedSets: [], activeSeed: existingSets[0] || null };
    return {
      template,
      sportId: sport.id,
      rules,
      swappedSides: completedSets.length % 2 === 1,
      completedSets,
      currentScore: activeSeed ? { a: activeSeed.a, b: activeSeed.b } : { a: 0, b: 0 },
      servingSide: completedSets.length % 2 === 1 ? 'b' : 'a',
      serverNumber: 2, // 匹克球雙打傳統規則：每局開局皆由 0-0-2 (第2發球員) 開始！
      midGameSwapNotified: false,
    };
  }

  if (template === 'RACKET_SETS') {
    const { completedSets, activeSeed } =
      bestOf > 1
        ? splitSeriesSets()
        : { completedSets: [], activeSeed: existingSets[0] || null };
    const initialServer = completedSets.length % 2 === 1 ? 'b' : 'a';
    return {
      template,
      sportId: sport.id,
      rules,
      swappedSides: completedSets.length % 2 === 1,
      completedSets,
      currentScore: activeSeed ? { a: activeSeed.a, b: activeSeed.b } : { a: 0, b: 0 },
      firstServerOfSet: initialServer,
      servingSide: initialServer,
      midGameSwapNotified: false,
    };
  }

  // TIMED_SETS (躲避球 / 通用)
  const startVal = rules.startingScore || 0;
  const { completedSets, activeSeed } =
    bestOf > 1
      ? splitSeriesSets()
      : { completedSets: [], activeSeed: existingSets[0] || null };
  return {
    template: 'TIMED_SETS',
    sportId: sport.id,
    rules,
    swappedSides: completedSets.length % 2 === 1,
    completedSets,
    currentScore: activeSeed
      ? { a: activeSeed.a, b: activeSeed.b }
      : { a: startVal, b: startVal },
    clockRemainingMs: (rules.periodMinutes || 5) * 60 * 1000,
  };
};

/**
 * 取得目前進行中單場/單局的即時總分
 */
export const getCurrentGameTotals = (state) => {
  if (!state) return { a: 0, b: 0 };
  if (state.template === 'BASKETBALL') {
    return {
      a: (state.periodScores || []).reduce((sum, p) => sum + (Number(p.a) || 0), 0),
      b: (state.periodScores || []).reduce((sum, p) => sum + (Number(p.b) || 0), 0),
    };
  }
  if (state.template === 'BASEBALL') {
    return {
      a: (state.innings || []).reduce((sum, inn) => sum + (Number(inn.a) || 0), 0),
      b: (state.innings || []).reduce((sum, inn) => sum + (Number(inn.b) || 0), 0),
    };
  }
  return {
    a: Number(state.currentScore?.a) || 0,
    b: Number(state.currentScore?.b) || 0,
  };
};

const buildCurrentGameBreakdown = (state) => {
  if (!state) return undefined;
  if (state.template === 'BASKETBALL' && Array.isArray(state.periodScores)) {
    const totalReg = state.rules?.totalPeriods || 4;
    return state.periodScores.map((p, idx) => ({
      label: idx < totalReg ? `Q${idx + 1}` : `OT${idx - totalReg + 1}`,
      a: Number(p.a) || 0,
      b: Number(p.b) || 0,
    }));
  }
  if (state.template === 'BASEBALL' && Array.isArray(state.innings)) {
    return state.innings.map((inn, idx) => ({
      label: `${idx + 1}局`,
      a: Number(inn.a) || 0,
      b: Number(inn.b) || 0,
    }));
  }
  return undefined;
};

/**
 * 將目前這一戰/這一局成績寫入 completedSets，並重置全新記分板供下一戰/下一局使用
 */
export const advanceSeriesToNextGame = (state) => {
  const next = structuredClone(state);
  const cur = getCurrentGameTotals(next);
  const breakdown = buildCurrentGameBreakdown(next);
  if (!Array.isArray(next.completedSets)) {
    next.completedSets = [];
  }
  next.completedSets.push({
    a: cur.a,
    b: cur.b,
    ...(breakdown ? { breakdown } : {}),
  });
  next.swappedSides = !next.swappedSides;

  if (next.template === 'BASKETBALL') {
    next.currentPeriod = 0;
    next.periodScores = Array.from(
      { length: next.rules.totalPeriods || 4 },
      () => ({ a: 0, b: 0 })
    );
    next.fouls = { a: 0, b: 0 };
    next.timeoutsLeft = {
      a: next.rules.timeoutsPerHalf || 2,
      b: next.rules.timeoutsPerHalf || 2,
    };
    next.possession = next.completedSets.length % 2 === 1 ? 'b' : 'a';
    next.clockRemainingMs = (next.rules.periodMinutes || 10) * 60 * 1000;
    return next;
  }

  if (next.template === 'BASEBALL') {
    next.currentInning = 0;
    next.half = 'top';
    next.innings = Array.from(
      { length: next.rules.totalInnings || 7 },
      () => ({ a: 0, b: 0 })
    );
    next.balls = 0;
    next.strikes = 0;
    next.outs = 0;
    return next;
  }

  const startVal = next.rules.startingScore || 0;
  next.currentScore = { a: startVal, b: startVal };
  next.midGameSwapNotified = false;

  if (next.template === 'PICKLEBALL') {
    next.servingSide = next.completedSets.length % 2 === 1 ? 'b' : 'a';
    next.serverNumber = 2;
  } else if (next.template === 'RACKET_SETS') {
    const nextFirst = next.firstServerOfSet === 'a' ? 'b' : 'a';
    next.firstServerOfSet = nextFirst;
    next.servingSide = nextFirst;
  } else if (next.template === 'TIMED_SETS') {
    next.clockRemainingMs = (next.rules.periodMinutes || 5) * 60 * 1000;
  }

  return next;
};

/**
 * 評估多戰系列賽 (3戰2勝 / 5戰3勝 / 7戰4勝) 整體勝場進度與按鈕狀態
 */
export const evaluateSeriesProgress = (state) => {
  const bestOf = Number(state?.rules?.bestOf) || 1;
  const neededWins = Math.ceil(bestOf / 2);
  const completed = state?.completedSets || [];
  const { winsA: completedWinsA, winsB: completedWinsB } = countSeriesWins(completed);
  const currentTotals = getCurrentGameTotals(state);

  const sport = SPORTS[state?.sportId] || SPORTS.OTHER;
  const unitName = sport.type === 'sets' ? '局' : '戰';

  // 若把目前進行中這一戰也算進去，雙方勝場為何？
  let projectedWinsA = completedWinsA;
  let projectedWinsB = completedWinsB;
  if (
    bestOf > 1 &&
    completedWinsA < neededWins &&
    completedWinsB < neededWins &&
    currentTotals.a !== currentTotals.b
  ) {
    if (currentTotals.a > currentTotals.b) projectedWinsA++;
    else projectedWinsB++;
  }

  const seriesAlreadyWonInCompleted =
    completedWinsA >= neededWins || completedWinsB >= neededWins;
  const canFinalizeSeriesNow =
    bestOf === 1
      ? true
      : projectedWinsA >= neededWins || projectedWinsB >= neededWins;

  const canFinishCurrentGame =
    bestOf > 1 &&
    !seriesAlreadyWonInCompleted &&
    currentTotals.a !== currentTotals.b &&
    projectedWinsA < neededWins &&
    projectedWinsB < neededWins;

  const currentGameNumber = Math.min(bestOf, completed.length + 1);

  return {
    bestOf,
    neededWins,
    unitName,
    completedWinsA,
    completedWinsB,
    projectedWinsA,
    projectedWinsB,
    currentTotals,
    currentGameNumber,
    canFinishCurrentGame,
    canFinalizeSeriesNow,
    seriesAlreadyWonInCompleted,
  };
};

/**
 * 計算桌球「每 2 分換發、Deuce (雙方 >= target-1) 後每 1 分換發」的當前發球方
 */
export const computeTableTennisServer = (scoreA, scoreB, firstServer, targetPoints = 11) => {
  const other = firstServer === 'a' ? 'b' : 'a';
  const deuceThreshold = Math.max(1, targetPoints - 1);
  if (scoreA >= deuceThreshold && scoreB >= deuceThreshold) {
    const extraPoints = scoreA - deuceThreshold + (scoreB - deuceThreshold);
    return extraPoints % 2 === 0 ? firstServer : other;
  }
  const totalPoints = scoreA + scoreB;
  return Math.floor(totalPoints / 2) % 2 === 0 ? firstServer : other;
};

/**
 * 匹克球官方報分字串與發球站位計算
 */
export const getPickleballCallout = (state) => {
  const { currentScore, servingSide, serverNumber, rules } = state;
  const serverScore = servingSide === 'a' ? currentScore.a : currentScore.b;
  const receiverScore = servingSide === 'a' ? currentScore.b : currentScore.a;
  const courtSideLabel = serverScore % 2 === 0 ? '右發球區 (偶數)' : '左發球區 (奇數)';

  if (rules.scoringMode === 'SIDEOUT_DOUBLES') {
    return {
      code: `${serverScore} - ${receiverScore} - ${serverNumber}`,
      modeLabel: '雙打發球得分制',
      courtSideLabel,
    };
  }
  if (rules.scoringMode === 'SIDEOUT_SINGLES') {
    return {
      code: `${serverScore} - ${receiverScore}`,
      modeLabel: '單打發球得分制',
      courtSideLabel,
    };
  }
  return {
    code: `${currentScore.a} - ${currentScore.b}`,
    modeLabel: '落地得分制 (Rally)',
    courtSideLabel,
  };
};

/**
 * 匹克球一球回合結果處理 (純函式)
 */
export const applyPickleballRally = (state, action) => {
  const next = structuredClone(state);
  const { scoringMode } = next.rules;

  if (scoringMode === 'SIDEOUT_DOUBLES') {
    if (action === 'SERVER_SCORES') {
      next.currentScore[next.servingSide] += 1;
    } else if (action === 'SIDE_OUT_OR_FAULT') {
      if (next.serverNumber === 1) {
        next.serverNumber = 2;
      } else {
        next.servingSide = next.servingSide === 'a' ? 'b' : 'a';
        next.serverNumber = 1;
      }
    }
    return next;
  }

  if (scoringMode === 'SIDEOUT_SINGLES') {
    if (action === 'SERVER_SCORES') {
      next.currentScore[next.servingSide] += 1;
    } else if (action === 'SIDE_OUT_OR_FAULT') {
      next.servingSide = next.servingSide === 'a' ? 'b' : 'a';
      next.serverNumber = 1;
    }
    return next;
  }

  return next;
};

/**
 * 判斷局數制運動（排球、羽球、桌球、匹克球）本局狀態：是否達局點 / 賽末點 / 本局已分勝負
 */
export const evaluateSetStatus = (state) => {
  const { completedSets = [], currentScore, rules } = state;
  const bestOf = rules.bestOf || 3;
  const neededSets = Math.ceil(bestOf / 2);

  const { winsA: setsWonA, winsB: setsWonB } = countSeriesWins(completedSets);

  const isDecidingSet = bestOf > 1 && completedSets.length === bestOf - 1;
  const target =
    isDecidingSet && rules.decidingSetPoints
      ? rules.decidingSetPoints
      : rules.targetPoints || 21;
  const cap = rules.capScore || null;
  const winByTwo = rules.winByTwo !== false;
  const minMargin = winByTwo ? 2 : 1;

  const { a, b } = currentScore;

  const hasWonSet = (self, opp) => {
    if (cap && self >= cap && self > opp) return true;
    return self >= target && self - opp >= minMargin;
  };

  const setWinner = hasWonSet(a, b) ? 'a' : hasWonSet(b, a) ? 'b' : null;

  const wouldWinNextPoint = (nextA, nextB, side) =>
    side === 'a' ? hasWonSet(nextA, nextB) : hasWonSet(nextB, nextA);

  let pointAlert = null;
  if (!setWinner) {
    const aOnSetPoint = wouldWinNextPoint(a + 1, b, 'a');
    const bOnSetPoint = wouldWinNextPoint(a, b + 1, 'b');

    if (a >= target - 1 && b >= target - 1 && a === b && winByTwo) {
      pointAlert = { type: 'DEUCE', side: null, label: 'DEUCE 平分拉鋸' };
    } else if (aOnSetPoint) {
      const isMatchPt = setsWonA === neededSets - 1;
      pointAlert = {
        type: isMatchPt ? 'MATCH_POINT' : 'SET_POINT',
        side: 'a',
        label: isMatchPt ? '賽末點 (Match Point)' : '局點 (Set Point)',
      };
    } else if (bOnSetPoint) {
      const isMatchPt = setsWonB === neededSets - 1;
      pointAlert = {
        type: isMatchPt ? 'MATCH_POINT' : 'SET_POINT',
        side: 'b',
        label: isMatchPt ? '賽末點 (Match Point)' : '局點 (Set Point)',
      };
    }
  }

  const midpointScore = Math.ceil(target / 2);
  const reachedDecidingMidpoint =
    isDecidingSet &&
    Math.max(a, b) === midpointScore &&
    Math.min(a, b) < midpointScore;

  return {
    setsWonA,
    setsWonB,
    neededSets,
    target,
    isDecidingSet,
    setWinner,
    pointAlert,
    reachedDecidingMidpoint,
    matchWinner:
      setsWonA >= neededSets ? 'a' : setsWonB >= neededSets ? 'b' : null,
  };
};

/**
 * 棒壘球好壞球與出局數狀態機
 */
export const applyBaseballPitchAction = (state, action) => {
  const next = structuredClone(state);
  let notification = null;

  if (action === 'BALL') {
    next.balls += 1;
    if (next.balls >= 4) {
      next.balls = 0;
      next.strikes = 0;
      notification = '四壞球保送！（球數已自動歸零）';
    }
  } else if (action === 'STRIKE') {
    next.strikes += 1;
    if (next.strikes >= 3) {
      next.balls = 0;
      next.strikes = 0;
      next.outs += 1;
      notification =
        next.outs >= 3 ? '三振出局！已滿三出局，請點擊攻守交換' : '三振出局！(+1 Out)';
    }
  } else if (action === 'OUT') {
    next.balls = 0;
    next.strikes = 0;
    next.outs = Math.min(3, next.outs + 1);
    if (next.outs >= 3) {
      notification = '已滿三出局！請點擊「攻守交換」進入下一半局';
    }
  } else if (action === 'RESET_COUNT') {
    next.balls = 0;
    next.strikes = 0;
  } else if (action === 'SWITCH_SIDE') {
    next.balls = 0;
    next.strikes = 0;
    next.outs = 0;
    if (next.half === 'top') {
      next.half = 'bottom';
    } else {
      next.half = 'top';
      next.currentInning += 1;
      if (next.currentInning >= next.innings.length) {
        next.innings.push({ a: 0, b: 0 });
      }
    }
  }
  return { state: next, notification };
};

/**
 * 將目前記分板狀態轉換為賽程表 Match 的標準成績結構
 * - 完整支援 bestOf === 1 (單場決勝) 與 bestOf > 1 (3戰2勝 / 5戰3勝 / 7戰4勝，含籃球與棒壘球多場系列賽！)
 */
export const summarizeScoreboardToMatchResult = (state, format, finalize = false) => {
  const { template, rules } = state;
  const bestOf = Number(rules.bestOf) || 1;
  const neededWins = Math.ceil(bestOf / 2);
  const sport = SPORTS[state.sportId] || SPORTS.OTHER;
  const unitName = sport.type === 'sets' ? '局' : '戰';
  const curTotals = getCurrentGameTotals(state);

  // ==================== 情況 A：單場決勝 (bestOf === 1) ====================
  if (bestOf === 1) {
    if (template === 'BASKETBALL') {
      const { a: totalA, b: totalB } = curTotals;
      const periodLabel =
        state.currentPeriod < rules.totalPeriods
          ? `Q${state.currentPeriod + 1}`
          : `OT${state.currentPeriod - rules.totalPeriods + 1}`;

      if (finalize && format !== 'ROUND_ROBIN' && totalA === totalB) {
        return { error: '淘汰賽制不可平手完賽，請點擊「+ OT延長」繼續比賽！' };
      }

      return {
        error: null,
        result: {
          scoreA: totalA,
          scoreB: totalB,
          setScores: state.periodScores.map((p) => ({ a: p.a, b: p.b })),
          topIsWinner: finalize ? totalA > totalB : false,
          bottomIsWinner: finalize ? totalB > totalA : false,
          isForfeit: false,
          customBestOf: 1,
          liveMeta: finalize ? null : `${periodLabel} (${totalA}:${totalB})`,
        },
      };
    }

    if (template === 'BASEBALL') {
      const { a: totalA, b: totalB } = curTotals;
      const halfLabel = `${state.currentInning + 1}局${state.half === 'top' ? '上' : '下'}`;

      if (finalize && format !== 'ROUND_ROBIN' && totalA === totalB) {
        return { error: '淘汰賽制不可平手完賽，請進行突破僵局延長局數！' };
      }

      return {
        error: null,
        result: {
          scoreA: totalA,
          scoreB: totalB,
          setScores: state.innings.map((inn) => ({ a: inn.a, b: inn.b })),
          topIsWinner: finalize ? totalA > totalB : false,
          bottomIsWinner: finalize ? totalB > totalA : false,
          isForfeit: false,
          customBestOf: 1,
          liveMeta: finalize ? null : `${halfLabel} (${totalA}:${totalB})`,
        },
      };
    }

    // 單場制球拍/計時運動
    const { a: curA, b: curB } = curTotals;
    if (finalize && format !== 'ROUND_ROBIN' && curA === curB) {
      return { error: '淘汰賽制不可平手完賽，請分出勝負後再上傳！' };
    }
    return {
      error: null,
      result: {
        scoreA: curA,
        scoreB: curB,
        setScores: [{ a: curA, b: curB }],
        topIsWinner: finalize ? curA > curB : false,
        bottomIsWinner: finalize ? curB > curA : false,
        isForfeit: false,
        customBestOf: 1,
        liveMeta: finalize ? null : `進行中 (${curA}:${curB})`,
      },
    };
  }

  // ==================== 情況 B：多戰系列賽 (bestOf > 1：3戰2勝 / 5戰3勝 / 7戰4勝) ====================
  const completed = (state.completedSets || []).map((s) => ({
    a: Number(s.a) || 0,
    b: Number(s.b) || 0,
    ...(Array.isArray(s.breakdown) ? { breakdown: s.breakdown } : {}),
  }));
  const startVal = rules.startingScore || 0;

  // 1. 中場或跨戰暫存同步 (finalize === false)：僅將「已完成」之各戰計入勝場，進行中比分顯示於 liveMeta
  if (!finalize) {
    const { winsA, winsB } = countSeriesWins(completed);
    const nextGameNum = Math.min(bestOf, completed.length + 1);
    const hasActivePoints = curTotals.a !== startVal || curTotals.b !== startVal;

    let liveMeta;
    if (hasActivePoints) {
      if (template === 'BASKETBALL') {
        const pLabel =
          state.currentPeriod < rules.totalPeriods
            ? `Q${state.currentPeriod + 1}`
            : `OT${state.currentPeriod - rules.totalPeriods + 1}`;
        liveMeta = `第${nextGameNum}戰 ${pLabel} (${curTotals.a}:${curTotals.b})`;
      } else if (template === 'BASEBALL') {
        const hLabel = `${state.currentInning + 1}局${state.half === 'top' ? '上' : '下'}`;
        liveMeta = `第${nextGameNum}戰 ${hLabel} (${curTotals.a}:${curTotals.b})`;
      } else {
        liveMeta = `第${nextGameNum}${unitName} (${curTotals.a}:${curTotals.b})`;
      }
    } else if (completed.length > 0) {
      liveMeta = `系列賽 ${winsA}:${winsB} (待第${nextGameNum}${unitName})`;
    } else {
      liveMeta = `第1${unitName}準備中`;
    }

    return {
      error: null,
      result: {
        scoreA: winsA,
        scoreB: winsB,
        setScores: completed,
        topIsWinner: false,
        bottomIsWinner: false,
        isForfeit: false,
        customBestOf: bestOf,
        liveMeta,
      },
    };
  }

  // 2. 最終系列賽完賽結算 (finalize === true)
  const allGames = [...completed];
  let { winsA, winsB } = countSeriesWins(allGames);

  // 若已完成場數尚未達過半勝場，將當前進行中的這一戰納入結算
  if (winsA < neededWins && winsB < neededWins) {
    if (curTotals.a === curTotals.b) {
      return {
        error: `第 ${allGames.length + 1} ${unitName}目前平手 (${curTotals.a}:${curTotals.b})，請先分出本${unitName}勝負！`,
      };
    }
    const curBreakdown = buildCurrentGameBreakdown(state);
    allGames.push({
      a: curTotals.a,
      b: curTotals.b,
      ...(curBreakdown ? { breakdown: curBreakdown } : {}),
    });
    const recounted = countSeriesWins(allGames);
    winsA = recounted.winsA;
    winsB = recounted.winsB;
  }

  if (winsA < neededWins && winsB < neededWins) {
    return {
      error: `本對戰為 ${bestOf} 戰 ${neededWins} 勝制（加計本${unitName}後系列賽為 ${winsA}:${winsB}），請點選「結束第 ${allGames.length} ${unitName}」繼續進行下一${unitName}！`,
    };
  }

  return {
    error: null,
    result: {
      scoreA: winsA,
      scoreB: winsB,
      setScores: allGames,
      topIsWinner: winsA > winsB,
      bottomIsWinner: winsB > winsA,
      isForfeit: false,
      customBestOf: bestOf,
      liveMeta: null,
    },
  };
};
