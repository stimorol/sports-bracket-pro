import { FORMAT_LABELS, SPORTS } from '../constants/sports.js';
import { getCurrentGameTotals } from './scoreboardEngine.js';

/**
 * 將比賽場次轉換為易讀標題（與賽程卡片一致）
 */
export const getMatchDisplayTitle = (match) => {
  if (!match) return '未指定場次';
  const matchNumber = String(match.id || '').split('-').pop() || '';
  if (match.bracketType === 'final') return '總冠軍賽';
  if (match.bracketType === 'final_reset') return '總冠軍驟死加賽';
  if (match.bracketType === 'third_place') return '季軍排名賽';
  if (match.bracketType === 'loser') return `敗部 ${matchNumber} (LR${(match.roundIndex ?? 0) + 1})`;
  if (match.bracketType === 'group') return `循環賽 第 ${(match.roundIndex ?? 0) + 1} 輪 · ${matchNumber}`;
  return `場次 ${matchNumber} (WR${(match.roundIndex ?? 0) + 1})`;
};

/**
 * 清理檔名非法字元，供瀏覽器「另存為 PDF」自動帶入乾淨檔名
 */
export const sanitizeFilename = (raw) =>
  String(raw || '比賽紀錄單')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 90);

/**
 * 格式化時間戳記為台灣賽務常用格式 (YYYY/MM/DD HH:mm)
 */
export const formatRecordTimestamp = (isoOrDate) => {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleString('zh-TW', { hour12: false });
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
};

/**
 * 產生該運動與賽制之規則摘要文字
 */
const buildRulesSummary = (sport, effectiveBestOf, sbState) => {
  const rules = sbState?.rules || sport.defaultRules || {};
  const unitLabel =
    effectiveBestOf > 1
      ? `${effectiveBestOf} 戰 ${Math.ceil(effectiveBestOf / 2)} 勝制`
      : '單場決勝制';

  if (sport.scoreboardTemplate === 'BASKETBALL') {
    const pCount = rules.totalPeriods || 4;
    const pMins = rules.periodMinutes || 10;
    return `${unitLabel} · 每戰 ${pCount} 節（每節 ${pMins} 分鐘）`;
  }

  if (sport.scoreboardTemplate === 'BASEBALL') {
    const innCount = rules.totalInnings || 7;
    return `${unitLabel} · 正規 ${innCount} 局制`;
  }

  if (sport.scoreboardTemplate === 'PICKLEBALL') {
    const modeMap = {
      SIDEOUT_DOUBLES: '雙打發球得分制 (0-0-2)',
      SIDEOUT_SINGLES: '單打發球得分制',
      RALLY: '落地得分制 (Rally)',
    };
    const modeText = modeMap[rules.scoringMode] || '標準匹克球規則';
    const pts = rules.targetPoints || 11;
    return `${unitLabel} · ${modeText} · ${pts} 分制${rules.winByTwo !== false ? ' (須贏2分)' : ''}`;
  }

  if (sport.scoreboardTemplate === 'RACKET_SETS') {
    const pts = rules.targetPoints || 21;
    const capText = rules.capScore ? `（${rules.capScore} 分封頂）` : '（Deuce 須贏 2 分）';
    return `${unitLabel} · 每局 ${pts} 分制${capText}`;
  }

  if (sport.scoreboardTemplate === 'TIMED_SETS') {
    const mins = rules.periodMinutes || 5;
    return `${unitLabel} · 單局計時 ${mins} 分鐘`;
  }

  return unitLabel;
};

/**
 * 將單場比賽（結合即時數位記分板 sbState 或已存檔 match 資料）建構為標準 A4 比賽紀錄單結構
 */
export const buildMatchRecordData = ({
  match,
  stage,
  tournamentTitle = '運動錦標賽',
  sbState = null,
  deviceName = '',
  customMeta = {},
}) => {
  if (!match) return null;

  const config = stage?.config || { sport: 'OTHER', format: 'SINGLE', bestOf: 1 };
  const sport = SPORTS[config.sport] || SPORTS.OTHER;
  const template = sbState?.template || sport.scoreboardTemplate || 'TIMED_SETS';
  const effectiveBestOf = Number(
    sbState?.rules?.bestOf || match.customBestOf || config.bestOf || 1
  );
  const neededWins = Math.ceil(effectiveBestOf / 2);
  const unitWord = sport.type === 'sets' ? '局' : '戰';

  const teamAName =
    match.topTeam?.id === 'BYE'
      ? '輪空 (BYE)'
      : match.topTeam?.name || match.topTeam?.placeholder || '待定隊伍 A';
  const teamBName =
    match.bottomTeam?.id === 'BYE'
      ? '輪空 (BYE)'
      : match.bottomTeam?.name || match.bottomTeam?.placeholder || '待定隊伍 B';

  const isForfeitA = Boolean(match.topTeam?.isForfeit);
  const isForfeitB = Boolean(match.bottomTeam?.isForfeit);
  const isForfeit = isForfeitA || isForfeitB;

  // 解析來源數據：若有傳入開啟中的 sbState，優先呈現最即時完整的節數/局數明細
  let rawSets = [];
  let liveStatsNote = null;

  if (sbState && !isForfeit) {
    if (effectiveBestOf === 1) {
      if (template === 'BASKETBALL') {
        rawSets = (sbState.periodScores || []).map((p, idx) => ({
          label:
            idx < (sbState.rules?.totalPeriods || 4)
              ? `Q${idx + 1}`
              : `OT${idx - (sbState.rules?.totalPeriods || 4) + 1}`,
          a: Number(p.a) || 0,
          b: Number(p.b) || 0,
        }));
        liveStatsNote = `本節團犯：${teamAName} ${sbState.fouls?.a ?? 0} 次 ／ ${teamBName} ${sbState.fouls?.b ?? 0} 次 ｜ 剩餘暫停：${teamAName} ${sbState.timeoutsLeft?.a ?? 0} 次 ／ ${teamBName} ${sbState.timeoutsLeft?.b ?? 0} 次`;
      } else if (template === 'BASEBALL') {
        rawSets = (sbState.innings || []).map((inn, idx) => ({
          label: `${idx + 1}局`,
          a: Number(inn.a) || 0,
          b: Number(inn.b) || 0,
        }));
      } else {
        const cur = getCurrentGameTotals(sbState);
        rawSets = [{ label: '全場比分', a: cur.a, b: cur.b }];
      }
    } else {
      // 多戰制 (3戰2勝 / 5戰3勝 / 7戰4勝)
      const completed = (sbState.completedSets || []).map((s, idx) => ({
        label: `第 ${idx + 1} ${unitWord}`,
        a: Number(s.a) || 0,
        b: Number(s.b) || 0,
        breakdown: Array.isArray(s.breakdown) ? s.breakdown : null,
      }));
      const curWinsA = completed.filter((s) => s.a > s.b).length;
      const curWinsB = completed.filter((s) => s.b > s.a).length;
      const cur = getCurrentGameTotals(sbState);
      const startVal = sbState.rules?.startingScore || 0;
      const hasCurrentActivity = cur.a !== startVal || cur.b !== startVal;

      if (curWinsA < neededWins && curWinsB < neededWins && hasCurrentActivity) {
        let activeBreakdown = null;
        if (template === 'BASKETBALL') {
          const regP = sbState.rules?.totalPeriods || 4;
          activeBreakdown = (sbState.periodScores || []).map((p, idx) => ({
            label: idx < regP ? `Q${idx + 1}` : `OT${idx - regP + 1}`,
            a: Number(p.a) || 0,
            b: Number(p.b) || 0,
          }));
        } else if (template === 'BASEBALL') {
          activeBreakdown = (sbState.innings || []).map((inn, idx) => ({
            label: `${idx + 1}局`,
            a: Number(inn.a) || 0,
            b: Number(inn.b) || 0,
          }));
        }
        completed.push({
          label: `第 ${completed.length + 1} ${unitWord}`,
          a: cur.a,
          b: cur.b,
          breakdown: activeBreakdown,
        });
      }
      rawSets = completed;
    }
  } else if (!isForfeit && Array.isArray(match.setScores) && match.setScores.length > 0) {
    rawSets = match.setScores.map((s, idx) => ({
      a: Number(s.a) || 0,
      b: Number(s.b) || 0,
      breakdown: Array.isArray(s.breakdown) ? s.breakdown : null,
      label:
        effectiveBestOf > 1
          ? `第 ${idx + 1} ${unitWord}`
          : template === 'BASKETBALL' && match.setScores.length > 1
            ? idx < (sport.defaultRules?.totalPeriods || 4)
              ? `Q${idx + 1}`
              : `OT${idx - (sport.defaultRules?.totalPeriods || 4) + 1}`
            : template === 'BASEBALL' && match.setScores.length > 1
              ? `${idx + 1}局`
              : '全場比分',
    }));
  } else if (
    !isForfeit &&
    match.topTeam?.score !== null &&
    match.topTeam?.score !== undefined &&
    match.bottomTeam?.score !== null &&
    match.bottomTeam?.score !== undefined
  ) {
    rawSets = [
      {
        label: '全場比分',
        a: Number(match.topTeam.score) || 0,
        b: Number(match.bottomTeam.score) || 0,
      },
    ];
  }

  // 判定目前比賽狀態、總比分與勝方
  const hasAnyScore =
    isForfeit ||
    rawSets.length > 0 ||
    (match.topTeam?.score !== null && match.topTeam?.score !== undefined);

  let statusType = 'PRE_MATCH';
  let statusLabel = '賽前檢錄／空白紀錄表';
  let headlineScoreA = '—';
  let headlineScoreB = '—';
  let winnerSide = null; // 'a' | 'b' | null

  if (isForfeit) {
    statusType = 'FORFEIT';
    statusLabel = '特殊裁定：棄權完賽';
    winnerSide = isForfeitA ? 'b' : 'a';
    headlineScoreA = isForfeitA ? '棄權' : '勝';
    headlineScoreB = isForfeitB ? '棄權' : '勝';
  } else if (sbState) {
    // 來自記分板即時狀態
    if (effectiveBestOf > 1) {
      const winsA = rawSets.filter((s) => s.a > s.b).length;
      const winsB = rawSets.filter((s) => s.b > s.a).length;
      headlineScoreA = String(winsA);
      headlineScoreB = String(winsB);
      if (winsA >= neededWins) {
        statusType = 'COMPLETED';
        statusLabel = '系列賽達標完賽';
        winnerSide = 'a';
      } else if (winsB >= neededWins) {
        statusType = 'COMPLETED';
        statusLabel = '系列賽達標完賽';
        winnerSide = 'b';
      } else {
        statusType = 'IN_PROGRESS';
        statusLabel = '系列賽進行中紀錄';
      }
    } else {
      const sumA = rawSets.reduce((acc, s) => acc + s.a, 0);
      const sumB = rawSets.reduce((acc, s) => acc + s.b, 0);
      headlineScoreA = String(sumA);
      headlineScoreB = String(sumB);
      if (match.topTeam?.isWinner || match.bottomTeam?.isWinner) {
        statusType = 'COMPLETED';
        statusLabel = '正式完賽紀錄';
        winnerSide = match.topTeam?.isWinner ? 'a' : 'b';
      } else if (sumA !== sumB) {
        statusType = 'COMPLETED';
        statusLabel = '場邊記分結算紀錄';
        winnerSide = sumA > sumB ? 'a' : 'b';
      } else if (config.format === 'ROUND_ROBIN' && (sumA > 0 || sumB > 0)) {
        statusType = 'DRAW';
        statusLabel = '循環賽平手紀錄';
      } else {
        statusType = 'IN_PROGRESS';
        statusLabel = '比賽進行中紀錄';
      }
    }
  } else if (hasAnyScore) {
    headlineScoreA = String(match.topTeam?.score ?? 0);
    headlineScoreB = String(match.bottomTeam?.score ?? 0);
    if (match.topTeam?.isWinner) {
      statusType = 'COMPLETED';
      statusLabel = '正式完賽紀錄';
      winnerSide = 'a';
    } else if (match.bottomTeam?.isWinner) {
      statusType = 'COMPLETED';
      statusLabel = '正式完賽紀錄';
      winnerSide = 'b';
    } else if (
      config.format === 'ROUND_ROBIN' &&
      !match.liveMeta &&
      match.topTeam?.score === match.bottomTeam?.score
    ) {
      statusType = 'DRAW';
      statusLabel = '正式完賽（和局）';
    } else {
      statusType = 'IN_PROGRESS';
      statusLabel = match.liveMeta ? `進行中 (${match.liveMeta})` : '比賽進行中紀錄';
    }
  }

  // 建立語意化明細表格欄位 (columns & row cells)
  const columns = [];
  const subGames = [];

  if (effectiveBestOf > 1) {
    const slotCount = Math.max(effectiveBestOf, rawSets.length);
    for (let i = 0; i < slotCount; i++) {
      const entry = rawSets[i];
      columns.push({
        key: `g-${i}`,
        header: `第 ${i + 1} ${unitWord}`,
        valA: entry ? String(entry.a) : statusType === 'PRE_MATCH' ? '' : '—',
        valB: entry ? String(entry.b) : statusType === 'PRE_MATCH' ? '' : '—',
        highlightA: Boolean(entry && entry.a > entry.b),
        highlightB: Boolean(entry && entry.b > entry.a),
      });
      if (entry?.breakdown && entry.breakdown.length > 0) {
        subGames.push({
          title: `第 ${i + 1} ${unitWord} 各節／各局明細`,
          items: entry.breakdown,
          totalA: entry.a,
          totalB: entry.b,
        });
      }
    }

    const totalPtsA = rawSets.reduce((sum, s) => sum + s.a, 0);
    const totalPtsB = rawSets.reduce((sum, s) => sum + s.b, 0);
    const winsA = rawSets.filter((s) => s.a > s.b).length;
    const winsB = rawSets.filter((s) => s.b > s.a).length;

    columns.push({
      key: 'series-wins',
      header: `勝${unitWord}數`,
      valA: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreA : String(winsA),
      valB: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreB : String(winsB),
      isSummary: true,
      highlightA: winnerSide === 'a',
      highlightB: winnerSide === 'b',
    });

    columns.push({
      key: 'total-pts',
      header: '總得分合計',
      valA: statusType === 'PRE_MATCH' || isForfeit ? (isForfeit ? '—' : '') : String(totalPtsA),
      valB: statusType === 'PRE_MATCH' || isForfeit ? (isForfeit ? '—' : '') : String(totalPtsB),
      isSubtleSummary: true,
    });
  } else if (template === 'BASKETBALL') {
    const defaultPeriods = sport.defaultRules?.totalPeriods || 4;
    if (statusType === 'PRE_MATCH') {
      for (let i = 0; i < defaultPeriods; i++) {
        columns.push({ key: `q-${i}`, header: `Q${i + 1}`, valA: '', valB: '' });
      }
      columns.push({ key: 'ot', header: 'OT', valA: '', valB: '' });
    } else if (rawSets.length > 1) {
      rawSets.forEach((s, idx) => {
        columns.push({
          key: `q-${idx}`,
          header: s.label || `Q${idx + 1}`,
          valA: String(s.a),
          valB: String(s.b),
          highlightA: s.a > s.b,
          highlightB: s.b > s.a,
        });
      });
    }
    const sumA = rawSets.reduce((acc, s) => acc + s.a, 0);
    const sumB = rawSets.reduce((acc, s) => acc + s.b, 0);
    columns.push({
      key: 'final-score',
      header: '全場總分',
      valA: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreA : String(sumA),
      valB: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreB : String(sumB),
      isSummary: true,
      highlightA: winnerSide === 'a',
      highlightB: winnerSide === 'b',
    });
  } else if (template === 'BASEBALL') {
    const defaultInnings = sport.defaultRules?.totalInnings || 7;
    if (statusType === 'PRE_MATCH') {
      for (let i = 0; i < defaultInnings; i++) {
        columns.push({ key: `inn-${i}`, header: `${i + 1}局`, valA: '', valB: '' });
      }
    } else if (rawSets.length > 1) {
      rawSets.forEach((s, idx) => {
        columns.push({
          key: `inn-${idx}`,
          header: s.label || `${idx + 1}局`,
          valA: String(s.a),
          valB: String(s.b),
          highlightA: s.a > s.b,
          highlightB: s.b > s.a,
        });
      });
    }
    const sumA = rawSets.reduce((acc, s) => acc + s.a, 0);
    const sumB = rawSets.reduce((acc, s) => acc + s.b, 0);
    columns.push({
      key: 'runs-total',
      header: '總得分 (R)',
      valA: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreA : String(sumA),
      valB: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreB : String(sumB),
      isSummary: true,
      highlightA: winnerSide === 'a',
      highlightB: winnerSide === 'b',
    });
  } else {
    // 單場制球拍/計時賽
    const s0 = rawSets[0];
    columns.push({
      key: 'single-game',
      header: sport.type === 'sets' ? '第 1 局' : '本場得分',
      valA: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreA : String(s0?.a ?? 0),
      valB: statusType === 'PRE_MATCH' ? '' : isForfeit ? headlineScoreB : String(s0?.b ?? 0),
      isSummary: true,
      highlightA: winnerSide === 'a',
      highlightB: winnerSide === 'b',
    });
  }

  const matchTitle = getMatchDisplayTitle(match);
  const stageName = stage?.name || '第 1 階段';
  const recordedBy =
    customMeta.scorer !== undefined
      ? customMeta.scorer
      : match.recordMeta?.recordedBy || deviceName || '';
  const recordedAtText =
    customMeta.recordedAtText ||
    formatRecordTimestamp(match.recordMeta?.recordedAt || new Date());

  const winnerName =
    winnerSide === 'a' ? teamAName : winnerSide === 'b' ? teamBName : null;

  const suggestedFilename = sanitizeFilename(
    `${tournamentTitle}_${stageName}_${matchTitle}_${teamAName}vs${teamBName}_比賽紀錄單`
  );

  return {
    matchId: match.id,
    tournamentTitle,
    stageName,
    formatName: FORMAT_LABELS[config.format] || config.format,
    sportName: sport.name,
    sportIcon: sport.icon,
    matchTitle,
    effectiveBestOf,
    unitWord,
    rulesSummary: buildRulesSummary(sport, effectiveBestOf, sbState),
    statusType,
    statusLabel,
    teamA: {
      name: teamAName,
      isSeed: Boolean(match.topTeam?.isSeed),
      isForfeit: isForfeitA,
      isWinner: winnerSide === 'a',
      headlineScore: headlineScoreA,
    },
    teamB: {
      name: teamBName,
      isSeed: Boolean(match.bottomTeam?.isSeed),
      isForfeit: isForfeitB,
      isWinner: winnerSide === 'b',
      headlineScore: headlineScoreB,
    },
    winnerSide,
    winnerName,
    columns,
    subGames,
    liveStatsNote,
    court: customMeta.court || '',
    referee: customMeta.referee || '',
    scorer: recordedBy,
    notes: customMeta.notes || '',
    recordedAtText,
    suggestedFilename,
  };
};
