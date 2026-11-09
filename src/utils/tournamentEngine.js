import { SPORTS } from '../constants/sports.js';

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
};

export const createEmptyStats = () => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  gd: 0,
  pts: 0,
});

export const getNextPowerOfTwo = (n) => {
  if (n <= 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export const getSeedingOrder = (size) => {
  if (size <= 0) return [];
  if (size === 1) return [1];
  let seeds = [1, 2];
  while (seeds.length < size) {
    const next = [];
    const limit = seeds.length * 2 + 1;
    for (let i = 0; i < seeds.length; i++) {
      if (i % 2 === 0) {
        next.push(seeds[i]);
        next.push(limit - seeds[i]);
      } else {
        next.push(limit - seeds[i]);
        next.push(seeds[i]);
      }
    }
    seeds = next;
  }
  return seeds;
};

/**
 * 將設定為種子 (isSeed) 的隊伍優先排至前方種子籤位，保留各自相對順序
 */
export const sortParticipantsWithSeeds = (participants) => {
  const seeds = participants.filter((p) => p.isSeed);
  const nonSeeds = participants.filter((p) => !p.isSeed);
  return [...seeds, ...nonSeeds];
};

/**
 * 計算循環賽/階段統計數據 (勝3分、和1分、敗0分；棄權以 0:3 計)
 */
export const calculateStats = (participants, matches) => {
  const statsMap = {};
  participants.forEach((p) => {
    statsMap[p.id] = createEmptyStats();
  });

  matches.forEach((m) => {
    if (m.isSkipped || m.isDoubleBye || m.liveMeta) return;
    const idA = m.topTeam?.id;
    const idB = m.bottomTeam?.id;
    if (!idA || !idB || idA === 'BYE' || idB === 'BYE') return;
    if (!statsMap[idA] || !statsMap[idB]) return;

    const sA = m.topTeam.score;
    const sB = m.bottomTeam.score;
    const fA = Boolean(m.topTeam.isForfeit);
    const fB = Boolean(m.bottomTeam.isForfeit);

    if ((sA !== null && sB !== null) || fA || fB) {
      statsMap[idA].played++;
      statsMap[idB].played++;

      if (fA && !fB) {
        statsMap[idB].won++;
        statsMap[idB].pts += 3;
        statsMap[idA].lost++;
        statsMap[idB].gf += 3;
        statsMap[idB].gd += 3;
        statsMap[idA].ga += 3;
        statsMap[idA].gd -= 3;
      } else if (fB && !fA) {
        statsMap[idA].won++;
        statsMap[idA].pts += 3;
        statsMap[idB].lost++;
        statsMap[idA].gf += 3;
        statsMap[idA].gd += 3;
        statsMap[idB].ga += 3;
        statsMap[idB].gd -= 3;
      } else if (sA !== null && sB !== null) {
        statsMap[idA].gf += sA;
        statsMap[idA].ga += sB;
        statsMap[idA].gd += sA - sB;
        statsMap[idB].gf += sB;
        statsMap[idB].ga += sA;
        statsMap[idB].gd += sB - sA;

        if (sA > sB || (sA === sB && m.topTeam.isWinner)) {
          statsMap[idA].won++;
          statsMap[idA].pts += 3;
          statsMap[idB].lost++;
        } else if (sB > sA || (sA === sB && m.bottomTeam.isWinner)) {
          statsMap[idB].won++;
          statsMap[idB].pts += 3;
          statsMap[idA].lost++;
        } else {
          statsMap[idA].drawn++;
          statsMap[idA].pts += 1;
          statsMap[idB].drawn++;
          statsMap[idB].pts += 1;
        }
      }
    }
  });

  return participants.map((p) => ({
    ...p,
    stats: statsMap[p.id] || p.stats || createEmptyStats(),
  }));
};

/**
 * 依據積分 > 淨勝分 > 總得分排序隊伍
 */
export const rankParticipants = (participants) => {
  return [...participants].sort((a, b) => {
    const sA = a.stats || createEmptyStats();
    const sB = b.stats || createEmptyStats();
    if (sB.pts !== sA.pts) return sB.pts - sA.pts;
    if (sB.gd !== sA.gd) return sB.gd - sA.gd;
    return sB.gf - sA.gf;
  });
};

/**
 * 多分組晉級排序：先依「組內名次 (各組第1、各組第2...)」排序，同組內名次再比勝率/場均積分/場均淨勝分，
 * 解決不同分組隊伍數不同（如 A 組 4 隊、B 組 3 隊）時總積分不公平的問題。
 */
export const rankParticipantsAcrossGroups = (participants) => {
  const groups = [...new Set(participants.map((p) => p.groupId || 'A'))].sort();
  if (groups.length <= 1) {
    return rankParticipants(participants).map((p, idx) => ({
      ...p,
      groupRank: idx + 1,
    }));
  }

  const annotated = [];
  groups.forEach((gId) => {
    const groupMembers = rankParticipants(
      participants.filter((p) => (p.groupId || 'A') === gId)
    );
    groupMembers.forEach((p, idx) => {
      annotated.push({ ...p, groupRank: idx + 1 });
    });
  });

  return annotated.sort((a, b) => {
    if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
    const sA = a.stats || createEmptyStats();
    const sB = b.stats || createEmptyStats();
    const ppgA = sA.played > 0 ? sA.pts / sA.played : 0;
    const ppgB = sB.played > 0 ? sB.pts / sB.played : 0;
    if (Math.abs(ppgB - ppgA) > 1e-6) return ppgB - ppgA;
    const gdpgA = sA.played > 0 ? sA.gd / sA.played : 0;
    const gdpgB = sB.played > 0 ? sB.gd / sB.played : 0;
    if (Math.abs(gdpgB - gdpgA) > 1e-6) return gdpgB - gdpgA;
    return (a.groupId || 'A').localeCompare(b.groupId || 'A');
  });
};

const createEmptySlot = (placeholder = '待定') => ({
  id: null,
  name: null,
  isSeed: false,
  score: null,
  isWinner: false,
  isForfeit: false,
  placeholder,
});

/**
 * 拓撲排序賽程 DAG，確保上游場次永遠先於下游場次計算
 */
const sortMatchesTopologically = (matches) => {
  const idToMatch = new Map(matches.map((m) => [m.id, m]));
  const inDegree = new Map(matches.map((m) => [m.id, 0]));
  const adj = new Map(matches.map((m) => [m.id, []]));

  const finalMatch = matches.find((m) => m.bracketType === 'final');
  const resetMatch = matches.find((m) => m.bracketType === 'final_reset');

  matches.forEach((m) => {
    if (m.nextMatchId && idToMatch.has(m.nextMatchId)) {
      adj.get(m.id).push(m.nextMatchId);
      inDegree.set(m.nextMatchId, inDegree.get(m.nextMatchId) + 1);
    }
    if (m.loserDropsToMatchId && idToMatch.has(m.loserDropsToMatchId)) {
      adj.get(m.id).push(m.loserDropsToMatchId);
      inDegree.set(m.loserDropsToMatchId, inDegree.get(m.loserDropsToMatchId) + 1);
    }
  });

  if (finalMatch && resetMatch) {
    adj.get(finalMatch.id).push(resetMatch.id);
    inDegree.set(resetMatch.id, inDegree.get(resetMatch.id) + 1);
  }

  const queue = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const ordered = [];
  while (queue.length > 0) {
    const currId = queue.shift();
    ordered.push(idToMatch.get(currId));
    for (const nextId of adj.get(currId) || []) {
      inDegree.set(nextId, inDegree.get(nextId) - 1);
      if (inDegree.get(nextId) === 0) {
        queue.push(nextId);
      }
    }
  }

  // Fallback 若有任何遺漏節點
  if (ordered.length < matches.length) {
    const seen = new Set(ordered.map((m) => m.id));
    matches.forEach((m) => {
      if (!seen.has(m.id)) ordered.push(m);
    });
  }
  return ordered;
};

const clearMatchScores = (m) => {
  m.topTeam = {
    ...m.topTeam,
    score: null,
    isWinner: false,
    isForfeit: false,
  };
  m.bottomTeam = {
    ...m.bottomTeam,
    score: null,
    isWinner: false,
    isForfeit: false,
  };
  m.setScores = [];
  m.penaltyScore = null;
  m.cards = null;
  m.isDoubleBye = false;
  m.liveMeta = null;
  m.lockInfo = null;
};

/**
 * 純函式：決定性地推演淘汰賽晉級、敗部掉落、輪空自動推進、下游比分重置與雙敗加賽 (Bracket Reset)
 */
export const reconcileBracket = (rawMatches, format) => {
  if (format === 'ROUND_ROBIN' || !rawMatches || rawMatches.length === 0) {
    return rawMatches;
  }

  // 深拷貝場次避免直接變更 React State
  const cloned = rawMatches.map((m) => ({
    ...m,
    topTeam: { ...m.topTeam },
    bottomTeam: { ...m.bottomTeam },
    setScores: m.setScores ? m.setScores.map((s) => ({ ...s })) : [],
    penaltyScore: m.penaltyScore ? { ...m.penaltyScore } : null,
    cards: m.cards ? structuredClone(m.cards) : null,
    lockInfo: m.lockInfo ? { ...m.lockInfo } : null,
  }));

  const idMap = new Map(cloned.map((m) => [m.id, m]));

  // 建立反向來源索引：targetMatchId -> { top: { sourceId, type }, bottom: { sourceId, type } }
  const feeders = new Map();
  cloned.forEach((m) => {
    if (m.nextMatchId && idMap.has(m.nextMatchId) && m.nextMatchPosition) {
      if (!feeders.has(m.nextMatchId)) feeders.set(m.nextMatchId, {});
      feeders.get(m.nextMatchId)[m.nextMatchPosition] = {
        sourceId: m.id,
        path: 'winner',
      };
    }
    if (m.loserDropsToMatchId && idMap.has(m.loserDropsToMatchId) && m.loserDropsToSlot) {
      if (!feeders.has(m.loserDropsToMatchId)) feeders.set(m.loserDropsToMatchId, {});
      feeders.get(m.loserDropsToMatchId)[m.loserDropsToSlot] = {
        sourceId: m.id,
        path: 'loser',
      };
    }
  });

  const getProducedTeam = (sourceMatch, path) => {
    if (!sourceMatch) return null;
    if (path === 'winner') {
      if (sourceMatch.isDoubleBye) return { id: 'BYE', name: 'BYE', isSeed: false };
      if (sourceMatch.topTeam.isWinner) return sourceMatch.topTeam;
      if (sourceMatch.bottomTeam.isWinner) return sourceMatch.bottomTeam;
      return null;
    }
    if (path === 'loser') {
      if (sourceMatch.isDoubleBye) return { id: 'BYE', name: 'BYE', isSeed: false };
      if (sourceMatch.topTeam.isWinner) return sourceMatch.bottomTeam;
      if (sourceMatch.bottomTeam.isWinner) return sourceMatch.topTeam;
      return null;
    }
    return null;
  };

  const ordered = sortMatchesTopologically(cloned);
  const finalMatch = cloned.find((m) => m.bracketType === 'final');

  ordered.forEach((m) => {
    // 1. 處理雙敗淘汰總冠軍加賽 (Grand Final Reset)
    if (m.bracketType === 'final_reset' && finalMatch) {
      if (finalMatch.topTeam.isWinner) {
        // 勝部冠軍直落獲勝，無須進行加賽
        m.isSkipped = true;
        m.topTeam = { ...createEmptySlot('勝部冠軍'), placeholder: '無需加賽' };
        m.bottomTeam = { ...createEmptySlot('敗部冠軍'), placeholder: '無需加賽' };
        clearMatchScores(m);
        return;
      } else if (finalMatch.bottomTeam.isWinner) {
        // 敗部冠軍贏得首場，雙方皆一敗，啟動驟死加賽！
        const prevSkipped = m.isSkipped;
        m.isSkipped = false;
        const expectedTop = finalMatch.topTeam;
        const expectedBot = finalMatch.bottomTeam;
        const changed =
          prevSkipped ||
          m.topTeam.id !== expectedTop.id ||
          m.bottomTeam.id !== expectedBot.id;

        m.topTeam = {
          ...m.topTeam,
          id: expectedTop.id,
          name: expectedTop.name,
          isSeed: Boolean(expectedTop.isSeed),
        };
        m.bottomTeam = {
          ...m.bottomTeam,
          id: expectedBot.id,
          name: expectedBot.name,
          isSeed: Boolean(expectedBot.isSeed),
        };
        if (changed) clearMatchScores(m);
        return;
      } else {
        // 總冠軍賽首戰尚未完賽
        m.isSkipped = false;
        const hadTeams = Boolean(m.topTeam.id || m.bottomTeam.id);
        m.topTeam = { ...createEmptySlot('總冠軍賽勝部代表'), placeholder: '若敗部奪勝則加賽' };
        m.bottomTeam = { ...createEmptySlot('總冠軍賽敗部代表'), placeholder: '若敗部奪勝則加賽' };
        if (hadTeams) clearMatchScores(m);
        return;
      }
    }

    // 2. 同步一般場次的上游晉級/掉落隊伍
    const matchFeeders = feeders.get(m.id);
    if (matchFeeders) {
      ['top', 'bottom'].forEach((slotKey) => {
        const feederInfo = matchFeeders[slotKey];
        if (!feederInfo) return;
        const sourceMatch = idMap.get(feederInfo.sourceId);
        const incoming = getProducedTeam(sourceMatch, feederInfo.path);
        const teamProp = slotKey === 'top' ? 'topTeam' : 'bottomTeam';
        const currentSlot = m[teamProp];
        const expectedId = incoming?.id || null;
        const currentId = currentSlot?.id || null;

        if (expectedId !== currentId) {
          // 上游結果改變！更新此籤位隊伍並清除本場既有比分（連鎖傳遞至更下游）
          m[teamProp] = {
            ...currentSlot,
            id: incoming ? incoming.id : null,
            name: incoming ? incoming.name : null,
            isSeed: incoming ? Boolean(incoming.isSeed) : false,
            score: null,
            isWinner: false,
            isForfeit: false,
          };
          clearMatchScores(m);
        } else if (incoming && incoming.name !== currentSlot.name) {
          // 同隊但隊名於賽中被更名，僅同步名稱不重置比分
          m[teamProp] = {
            ...currentSlot,
            name: incoming.name,
          };
        }
      });
    }

    // 3. 處理輪空 (BYE) 與雙輪空 (BYE vs BYE)
    const topId = m.topTeam.id;
    const botId = m.bottomTeam.id;

    if (topId === 'BYE' && botId === 'BYE') {
      m.isDoubleBye = true;
      m.topTeam.isWinner = false;
      m.bottomTeam.isWinner = false;
      m.topTeam.score = 0;
      m.bottomTeam.score = 0;
    } else if (botId === 'BYE' && topId && topId !== 'BYE') {
      m.isDoubleBye = false;
      m.topTeam.isWinner = true;
      m.bottomTeam.isWinner = false;
      m.topTeam.score = 0;
      m.bottomTeam.score = 0;
    } else if (topId === 'BYE' && botId && botId !== 'BYE') {
      m.isDoubleBye = false;
      m.bottomTeam.isWinner = true;
      m.topTeam.isWinner = false;
      m.topTeam.score = 0;
      m.bottomTeam.score = 0;
    } else if (topId === 'BYE' || botId === 'BYE') {
      // 其中一方為 BYE，另一方尚未出爐 (id === null)，保持等待狀態
      m.isDoubleBye = false;
      m.topTeam.isWinner = false;
      m.bottomTeam.isWinner = false;
      m.topTeam.score = null;
      m.bottomTeam.score = null;
    } else {
      m.isDoubleBye = false;
    }
  });

  // 依照原始順序回傳
  return cloned;
};

/**
 * 檢查修改某場比賽時，是否有下游場次已經輸入過真實比分（供 UI 彈出確認提示）
 */
export const hasPlayedDownstreamMatches = (matches, targetMatchId) => {
  const idToMatch = new Map(matches.map((m) => [m.id, m]));
  const finalMatch = matches.find((m) => m.bracketType === 'final');
  const resetMatch = matches.find((m) => m.bracketType === 'final_reset');

  const visited = new Set();
  const stack = [targetMatchId];

  while (stack.length > 0) {
    const currId = stack.pop();
    const curr = idToMatch.get(currId);
    if (!curr) continue;

    const nextIds = [];
    if (curr.nextMatchId) nextIds.push(curr.nextMatchId);
    if (curr.loserDropsToMatchId) nextIds.push(curr.loserDropsToMatchId);
    if (finalMatch && resetMatch && curr.id === finalMatch.id) {
      nextIds.push(resetMatch.id);
    }

    for (const nId of nextIds) {
      if (!visited.has(nId)) {
        visited.add(nId);
        const nm = idToMatch.get(nId);
        if (nm) {
          const isBye = nm.topTeam.id === 'BYE' || nm.bottomTeam.id === 'BYE' || nm.isDoubleBye;
          const hasUserResult =
            !isBye &&
            !nm.isSkipped &&
            (nm.topTeam.score !== null ||
              nm.bottomTeam.score !== null ||
              nm.topTeam.isForfeit ||
              nm.bottomTeam.isForfeit);
          if (hasUserResult) return true;
          stack.push(nId);
        }
      }
    }
  }
  return false;
};

/**
 * 生成賽程表 (支援 SINGLE / DOUBLE [含2隊與加賽制] / ROUND_ROBIN)
 */
export const generateMatches = (stageId, config, participants) => {
  const generatedMatches = [];
  const count = participants.length;
  if (count < 2) return [];

  if (config.format === 'SINGLE') {
    const size = getNextPowerOfTwo(count);
    const rounds = Math.log2(size);
    let mId = 1;
    let prevR = [];

    for (let r = 0; r < rounds; r++) {
      const mCount = size / Math.pow(2, r + 1);
      const cR = [];
      const isFinal = r === rounds - 1;
      for (let m = 0; m < mCount; m++) {
        const id = `S${stageId}-R${r + 1}-M${mId++}`;
        cR.push(id);
        generatedMatches.push({
          id,
          roundIndex: r,
          bracketType: isFinal ? 'final' : 'winner',
          topTeam: createEmptySlot('待定'),
          bottomTeam: createEmptySlot('待定'),
          nextMatchId: null,
          nextMatchPosition: null,
          loserDropsToMatchId: null,
          loserDropsToSlot: null,
        });
      }
      if (r > 0) {
        prevR.forEach((pid, i) => {
          const match = generatedMatches.find((x) => x.id === pid);
          match.nextMatchId = cR[Math.floor(i / 2)];
          match.nextMatchPosition = i % 2 === 0 ? 'top' : 'bottom';
        });
      }
      prevR = cR;
    }

    // 種子優先排序並放入標準種子籤位
    const r1 = generatedMatches.filter((m) => m.roundIndex === 0);
    const sortedP = sortParticipantsWithSeeds(participants);
    const slots = r1.length * 2;
    const seedOrder = getSeedingOrder(slots);
    const finalSlots = Array(slots).fill(null);

    sortedP.forEach((p, i) => {
      const slotIdx = seedOrder.indexOf(i + 1);
      if (slotIdx !== -1) finalSlots[slotIdx] = p;
    });

    r1.forEach((m, i) => {
      const t = finalSlots[i * 2];
      const b = finalSlots[i * 2 + 1];
      m.topTeam = t
        ? { ...createEmptySlot(), id: t.id, name: t.name, isSeed: Boolean(t.isSeed) }
        : { ...createEmptySlot(), id: 'BYE', name: 'BYE' };
      m.bottomTeam = b
        ? { ...createEmptySlot(), id: b.id, name: b.name, isSeed: Boolean(b.isSeed) }
        : { ...createEmptySlot(), id: 'BYE', name: 'BYE' };
    });

    // 單淘汰季軍賽 (至少 4 隊才有四強落敗者)
    if (config.hasThirdPlace && count >= 4) {
      const semiFinalRoundIndex = rounds - 2;
      const semiFinalMatches = generatedMatches.filter(
        (m) => m.roundIndex === semiFinalRoundIndex && m.bracketType === 'winner'
      );
      if (semiFinalMatches.length === 2) {
        const thirdPlaceId = `S${stageId}-R${rounds}-3rd`;
        generatedMatches.push({
          id: thirdPlaceId,
          roundIndex: rounds - 1,
          bracketType: 'third_place',
          topTeam: createEmptySlot(`四強 M${semiFinalMatches[0].id.split('-').pop().replace('M', '')} 落敗方`),
          bottomTeam: createEmptySlot(`四強 M${semiFinalMatches[1].id.split('-').pop().replace('M', '')} 落敗方`),
          nextMatchId: null,
          nextMatchPosition: null,
        });
        semiFinalMatches[0].loserDropsToMatchId = thirdPlaceId;
        semiFinalMatches[0].loserDropsToSlot = 'top';
        semiFinalMatches[1].loserDropsToMatchId = thirdPlaceId;
        semiFinalMatches[1].loserDropsToSlot = 'bottom';
      }
    }

    return reconcileBracket(generatedMatches, 'SINGLE');
  }

  if (config.format === 'ROUND_ROBIN') {
    const groups = [...new Set(participants.map((p) => p.groupId || 'A'))].sort();
    let mId = 1;
    groups.forEach((gId) => {
      const gP = participants.filter((p) => (p.groupId || 'A') === gId);
      if (gP.length < 2) return;
      const rrP = [...gP];
      if (rrP.length % 2 !== 0) rrP.push({ id: 'BYE', name: 'BYE' });
      const n = rrP.length;
      const rCount = n - 1;
      const mPerR = n / 2;
      const rot = [...rrP];

      for (let r = 0; r < rCount; r++) {
        for (let m = 0; m < mPerR; m++) {
          const p1 = rot[m];
          const p2 = rot[n - 1 - m];
          if (p1.id !== 'BYE' && p2.id !== 'BYE') {
            generatedMatches.push({
              id: `S${stageId}-G${gId}-R${r + 1}-M${mId++}`,
              groupId: gId,
              roundIndex: r,
              bracketType: 'group',
              topTeam: { ...createEmptySlot(), id: p1.id, name: p1.name, groupId: gId },
              bottomTeam: { ...createEmptySlot(), id: p2.id, name: p2.name, groupId: gId },
            });
          }
        }
        const last = rot.pop();
        rot.splice(1, 0, last);
      }
    });
    return generatedMatches;
  }

  if (config.format === 'DOUBLE') {
    const size = getNextPowerOfTwo(count);
    const wbRounds = Math.log2(size);
    let mId = 1;

    // 特例：恰好 2 隊進行雙敗淘汰 (WB 1 場 -> 勝者與敗者進入總冠軍賽 -> 必要時加賽)
    if (size === 2) {
      const wbId = `S${stageId}-WB-R1-M${mId++}`;
      const finalId = `S${stageId}-GRAND-FINAL`;
      const sortedP = sortParticipantsWithSeeds(participants);

      generatedMatches.push({
        id: wbId,
        roundIndex: 0,
        bracketType: 'winner',
        topTeam: { ...createEmptySlot(), id: sortedP[0].id, name: sortedP[0].name, isSeed: Boolean(sortedP[0].isSeed) },
        bottomTeam: { ...createEmptySlot(), id: sortedP[1].id, name: sortedP[1].name, isSeed: Boolean(sortedP[1].isSeed) },
        nextMatchId: finalId,
        nextMatchPosition: 'top',
        loserDropsToMatchId: finalId,
        loserDropsToSlot: 'bottom',
      });

      generatedMatches.push({
        id: finalId,
        roundIndex: 1,
        bracketType: 'final',
        topTeam: createEmptySlot('勝部冠軍'),
        bottomTeam: createEmptySlot('敗部代表 (首戰落敗方)'),
        nextMatchId: null,
        nextMatchPosition: null,
      });

      if (config.hasBracketReset !== false) {
        generatedMatches.push({
          id: `S${stageId}-GRAND-FINAL-RESET`,
          roundIndex: 2,
          bracketType: 'final_reset',
          isSkipped: false,
          topTeam: createEmptySlot('若敗部奪勝則加賽'),
          bottomTeam: createEmptySlot('若敗部奪勝則加賽'),
          nextMatchId: null,
          nextMatchPosition: null,
        });
      }

      return reconcileBracket(generatedMatches, 'DOUBLE');
    }

    // 一般規模 (>= 3 隊，size >= 4)
    const lbRounds = (wbRounds - 1) * 2;
    const wbIds = [];

    for (let r = 0; r < wbRounds; r++) {
      const matchCount = size / Math.pow(2, r + 1);
      const roundIds = [];
      for (let m = 0; m < matchCount; m++) {
        const id = `S${stageId}-WB-R${r + 1}-M${mId++}`;
        roundIds.push(id);
        generatedMatches.push({
          id,
          roundIndex: r,
          bracketType: 'winner',
          topTeam: createEmptySlot('待定'),
          bottomTeam: createEmptySlot('待定'),
          nextMatchId: null,
          nextMatchPosition: null,
          loserDropsToMatchId: null,
          loserDropsToSlot: null,
        });
      }
      wbIds.push(roundIds);
      if (r > 0) {
        wbIds[r - 1].forEach((prevId, idx) => {
          const match = generatedMatches.find((m) => m.id === prevId);
          match.nextMatchId = roundIds[Math.floor(idx / 2)];
          match.nextMatchPosition = idx % 2 === 0 ? 'top' : 'bottom';
        });
      }
    }

    const lbIds = [];
    for (let r = 0; r < lbRounds; r++) {
      const matchCount = size / Math.pow(2, Math.floor(r / 2) + 2);
      const roundIds = [];
      for (let m = 0; m < matchCount; m++) {
        const id = `S${stageId}-LB-R${r + 1}-M${mId++}`;
        roundIds.push(id);
        generatedMatches.push({
          id,
          roundIndex: r,
          bracketType: 'loser',
          topTeam: createEmptySlot('等待晉級...'),
          bottomTeam: createEmptySlot('等待晉級...'),
          nextMatchId: null,
          nextMatchPosition: null,
        });
      }
      lbIds.push(roundIds);
    }

    for (let r = 0; r < lbRounds - 1; r++) {
      const currRound = lbIds[r];
      const nextRound = lbIds[r + 1];
      if (r % 2 === 0) {
        currRound.forEach((currId, idx) => {
          const match = generatedMatches.find((m) => m.id === currId);
          match.nextMatchId = nextRound[idx];
          match.nextMatchPosition = 'top';
        });
      } else {
        currRound.forEach((currId, idx) => {
          const match = generatedMatches.find((m) => m.id === currId);
          match.nextMatchId = nextRound[Math.floor(idx / 2)];
          match.nextMatchPosition = idx % 2 === 0 ? 'top' : 'bottom';
        });
      }
    }

    // 勝部 R1 落敗者掉入敗部 R1
    const wbR1 = wbIds[0];
    const lbR1 = lbIds[0];
    wbR1.forEach((wbId, idx) => {
      const wbMatch = generatedMatches.find((m) => m.id === wbId);
      const lbMatchId = lbR1[Math.floor(idx / 2)];
      const lbMatch = generatedMatches.find((m) => m.id === lbMatchId);
      const slot = idx % 2 === 0 ? 'top' : 'bottom';
      wbMatch.loserDropsToMatchId = lbMatchId;
      wbMatch.loserDropsToSlot = slot;
      const matchNum = wbMatch.id.split('-').pop();
      if (slot === 'top') lbMatch.topTeam.placeholder = `勝部 ${matchNum} 落敗方`;
      else lbMatch.bottomTeam.placeholder = `勝部 ${matchNum} 落敗方`;
    });

    // 勝部 R2+ 落敗者交叉掉入敗部對應輪次 (奇數輪反向交叉避免過早重逢)
    for (let r = 1; r < wbRounds; r++) {
      const dropRoundIdx = r * 2 - 1;
      if (dropRoundIdx < lbIds.length) {
        const wbRound = wbIds[r];
        const lbRound = lbIds[dropRoundIdx];
        wbRound.forEach((wbId, idx) => {
          const wbMatch = generatedMatches.find((m) => m.id === wbId);
          const targetIdx =
            r % 2 === 1 && lbRound.length > 1 ? lbRound.length - 1 - idx : idx;
          if (targetIdx >= 0 && targetIdx < lbRound.length) {
            const lbMatchId = lbRound[targetIdx];
            const lbMatch = generatedMatches.find((m) => m.id === lbMatchId);
            wbMatch.loserDropsToMatchId = lbMatchId;
            wbMatch.loserDropsToSlot = 'bottom';
            lbMatch.bottomTeam.placeholder = `勝部 ${wbMatch.id.split('-').pop()} 落敗方`;
          }
        });
      }
    }

    const finalId = `S${stageId}-GRAND-FINAL`;
    generatedMatches.push({
      id: finalId,
      roundIndex: 98,
      bracketType: 'final',
      topTeam: createEmptySlot('勝部冠軍'),
      bottomTeam: createEmptySlot('敗部冠軍'),
      nextMatchId: null,
      nextMatchPosition: null,
    });

    const wbFinalMatch = generatedMatches.find((m) => m.id === wbIds[wbRounds - 1][0]);
    wbFinalMatch.nextMatchId = finalId;
    wbFinalMatch.nextMatchPosition = 'top';

    const lbFinalMatch = generatedMatches.find((m) => m.id === lbIds[lbRounds - 1][0]);
    lbFinalMatch.nextMatchId = finalId;
    lbFinalMatch.nextMatchPosition = 'bottom';

    // 標準雙敗淘汰總冠軍加賽 (Bracket Reset)
    if (config.hasBracketReset !== false) {
      generatedMatches.push({
        id: `S${stageId}-GRAND-FINAL-RESET`,
        roundIndex: 99,
        bracketType: 'final_reset',
        isSkipped: false,
        topTeam: createEmptySlot('若敗部奪勝則加賽'),
        bottomTeam: createEmptySlot('若敗部奪勝則加賽'),
        nextMatchId: null,
        nextMatchPosition: null,
      });
    }

    // 種子分配至 WB R1
    const r1 = generatedMatches.filter(
      (m) => m.roundIndex === 0 && m.bracketType === 'winner'
    );
    const sortedP = sortParticipantsWithSeeds(participants);
    const slots = r1.length * 2;
    const seedOrder = getSeedingOrder(slots);
    const finalSlots = Array(slots).fill(null);

    sortedP.forEach((p, i) => {
      const slotIdx = seedOrder.indexOf(i + 1);
      if (slotIdx !== -1) finalSlots[slotIdx] = p;
    });

    r1.forEach((m, i) => {
      const t = finalSlots[i * 2];
      const b = finalSlots[i * 2 + 1];
      m.topTeam = t
        ? { ...createEmptySlot(), id: t.id, name: t.name, isSeed: Boolean(t.isSeed) }
        : { ...createEmptySlot(), id: 'BYE', name: 'BYE' };
      m.bottomTeam = b
        ? { ...createEmptySlot(), id: b.id, name: b.name, isSeed: Boolean(b.isSeed) }
        : { ...createEmptySlot(), id: 'BYE', name: 'BYE' };
    });

    return reconcileBracket(generatedMatches, 'DOUBLE');
  }

  return generatedMatches;
};

/**
 * 驗證單場比賽輸入的局分/總分，並回傳標準化結果或錯誤訊息
 */
export const validateAndComputeScore = ({
  sets,
  localBestOf,
  sportId,
  format,
  allowCustomMargin = false,
  penaltySet = null,
}) => {
  const sport = SPORTS[sportId] || SPORTS.OTHER;
  let winsA = 0;
  let winsB = 0;
  let totalA = 0;
  let totalB = 0;
  const validSets = [];
  const neededWins = Math.ceil(localBestOf / 2);

  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const rawA = String(s.a ?? '').trim();
    const rawB = String(s.b ?? '').trim();

    if (rawA === '' && rawB === '') continue;
    if (rawA === '' || rawB === '') {
      return { error: `第 ${i + 1} ${sport.type === 'sets' ? '局' : '場'}請完整輸入雙方分數` };
    }

    const scoreA = Number(rawA);
    const scoreB = Number(rawB);
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
      return { error: `第 ${i + 1} ${sport.type === 'sets' ? '局' : '場'}分數須為 0 以上的整數` };
    }

    // 若前幾局已分出系列賽勝負，不應再有多餘局數
    if (localBestOf > 1 && (winsA >= neededWins || winsB >= neededWins)) {
      return {
        error: `前 ${validSets.length} ${sport.type === 'sets' ? '局' : '場'}已分出勝負 (${winsA}:${winsB})，請清空第 ${i + 1} ${sport.type === 'sets' ? '局' : '場'}分數`,
      };
    }

    if (sport.type === 'sets' && !allowCustomMargin) {
      const diff = Math.abs(scoreA - scoreB);
      const maxS = Math.max(scoreA, scoreB);
      const minLead = sport.minLead ?? 2;

      if (scoreA === scoreB && (localBestOf > 1 || format !== 'ROUND_ROBIN')) {
        return { error: `第 ${i + 1} 局不可平手` };
      }

      if (scoreA !== scoreB && minLead >= 2) {
        const isCapWin = sport.capScore && maxS === sport.capScore && diff === 1;
        if (!isCapWin && diff < minLead) {
          return {
            error: sport.capScore
              ? `第 ${i + 1} 局須領先 ${minLead} 分（或達 ${sport.capScore} 分封頂勝 1 分）。若為特殊賽制請勾選下方「允許自訂分差」`
              : `第 ${i + 1} 局須領先至少 ${minLead} 分。若為特殊賽制請勾選下方「允許自訂分差」`,
          };
        }
      }
    }

    if (localBestOf > 1 && scoreA === scoreB) {
      return { error: `多戰制下第 ${i + 1} ${sport.type === 'sets' ? '局' : '場'}不可平手` };
    }

    if (scoreA > scoreB) winsA++;
    else if (scoreB > scoreA) winsB++;

    totalA += scoreA;
    totalB += scoreB;
    validSets.push({ a: scoreA, b: scoreB });
  }

  if (validSets.length === 0) {
    return { error: '請至少輸入一局有效比分，或使用下方「重設此場未開賽 / 設定棄權」功能' };
  }

  const finalA = localBestOf > 1 ? winsA : totalA;
  const finalB = localBestOf > 1 ? winsB : totalB;

  let resolvedPenaltyScore = null;
  const rawPkA = String(penaltySet?.a ?? '').trim();
  const rawPkB = String(penaltySet?.b ?? '').trim();

  if (localBestOf === 1 && finalA === finalB && (rawPkA !== '' || rawPkB !== '')) {
    if (rawPkA === '' || rawPkB === '') {
      return { error: '請完整輸入雙方 PK 點球大戰比分' };
    }
    const pkA = Number(rawPkA);
    const pkB = Number(rawPkB);
    if (!Number.isInteger(pkA) || !Number.isInteger(pkB) || pkA < 0 || pkB < 0) {
      return { error: 'PK 點球大戰比分須為 0 以上的整數' };
    }
    if (pkA === pkB) {
      return { error: 'PK 點球大戰不可平手，請輸入最終分出勝負的 PK 比分' };
    }
    resolvedPenaltyScore = { a: pkA, b: pkB };
  }

  if (format !== 'ROUND_ROBIN') {
    if (localBestOf === 1 && finalA === finalB && !resolvedPenaltyScore) {
      return {
        error:
          sport.scoreboardTemplate === 'SOCCER'
            ? '淘汰賽正規時間平手！請在下方輸入「⚽ PK 點球大戰比分」或延長賽進球以分出晉級隊伍'
            : '淘汰賽制不可平手，請輸入延長賽或決勝後比分',
      };
    }
  }

  // 判定系列賽最終勝方 (未達過半勝場時可暫存目前局數，但雙方 isWinner 皆為 false！)
  let topIsWinner = false;
  let bottomIsWinner = false;

  if (localBestOf > 1) {
    if (winsA >= neededWins && winsA > winsB) topIsWinner = true;
    else if (winsB >= neededWins && winsB > winsA) bottomIsWinner = true;
  } else if (resolvedPenaltyScore) {
    topIsWinner = resolvedPenaltyScore.a > resolvedPenaltyScore.b;
    bottomIsWinner = resolvedPenaltyScore.b > resolvedPenaltyScore.a;
  } else {
    if (finalA > finalB) topIsWinner = true;
    else if (finalB > finalA) bottomIsWinner = true;
  }

  return {
    error: null,
    result: {
      scoreA: finalA,
      scoreB: finalB,
      setScores: validSets,
      penaltyScore: resolvedPenaltyScore,
      topIsWinner,
      bottomIsWinner,
      isForfeit: false,
      customBestOf: localBestOf,
    },
  };
};

/**
 * 套用單場比賽更新並重新推演整個階段的晉級與統計數據
 */
export const applyMatchResultToStage = (stage, matchId, updatePayload) => {
  const updatedRawMatches = stage.matches.map((m) => {
    if (m.id !== matchId) return m;

    if (updatePayload.action === 'clear') {
      return {
        ...m,
        topTeam: { ...m.topTeam, score: null, isWinner: false, isForfeit: false },
        bottomTeam: { ...m.bottomTeam, score: null, isWinner: false, isForfeit: false },
        setScores: [],
        penaltyScore: null,
        cards: null,
        recordMeta: null,
        liveMeta: null,
        lockInfo: null,
      };
    }

    if (updatePayload.isForfeit) {
      const topWins = updatePayload.winnerId === m.topTeam.id;
      return {
        ...m,
        topTeam: {
          ...m.topTeam,
          score: null,
          isWinner: topWins,
          isForfeit: !topWins,
        },
        bottomTeam: {
          ...m.bottomTeam,
          score: null,
          isWinner: !topWins,
          isForfeit: topWins,
        },
        setScores: [],
        penaltyScore: null,
        cards: null,
        customBestOf: updatePayload.customBestOf || m.customBestOf,
        recordMeta: updatePayload.recordMeta || m.recordMeta || null,
        liveMeta: null,
        lockInfo: null,
      };
    }

    return {
      ...m,
      topTeam: {
        ...m.topTeam,
        score: updatePayload.scoreA,
        isWinner: Boolean(updatePayload.topIsWinner),
        isForfeit: false,
      },
      bottomTeam: {
        ...m.bottomTeam,
        score: updatePayload.scoreB,
        isWinner: Boolean(updatePayload.bottomIsWinner),
        isForfeit: false,
      },
      setScores: updatePayload.setScores || [],
      penaltyScore:
        updatePayload.penaltyScore !== undefined ? updatePayload.penaltyScore : null,
      cards:
        updatePayload.cards !== undefined ? updatePayload.cards : m.cards || null,
      customBestOf: updatePayload.customBestOf || m.customBestOf,
      recordMeta: updatePayload.recordMeta || m.recordMeta || null,
      liveMeta: updatePayload.liveMeta ?? null,
      lockInfo:
        updatePayload.lockInfo !== undefined ? updatePayload.lockInfo : m.lockInfo || null,
    };
  });

  const reconciledMatches = reconcileBracket(updatedRawMatches, stage.config.format);
  const updatedParticipants = calculateStats(stage.participants, reconciledMatches);

  return {
    ...stage,
    matches: reconciledMatches,
    participants: updatedParticipants,
  };
};

/**
 * 賽中安全修改隊名：同步更新參與者清單與該階段所有賽程卡名稱，不影響任何既有分數與晉級狀態
 */
export const renameParticipantInStage = (stage, participantId, newName) => {
  const trimmed = newName.trim();
  if (!trimmed) return stage;

  const updatedParticipants = stage.participants.map((p) =>
    p.id === participantId ? { ...p, name: trimmed } : p
  );

  const updatedMatches = stage.matches.map((m) => ({
    ...m,
    topTeam: m.topTeam.id === participantId ? { ...m.topTeam, name: trimmed } : m.topTeam,
    bottomTeam: m.bottomTeam.id === participantId ? { ...m.bottomTeam, name: trimmed } : m.bottomTeam,
  }));

  return {
    ...stage,
    participants: updatedParticipants,
    matches: updatedMatches,
  };
};

/**
 * 計算榮耀榜名次 (前四名)
 */
export const computePodium = (stage) => {
  if (!stage) return [];
  const { matches, participants, config } = stage;
  const format = config.format;
  const podium = [];

  if (format === 'SINGLE') {
    const finalMatch = matches.find((m) => m.bracketType === 'final');
    const thirdMatch = matches.find((m) => m.bracketType === 'third_place');

    if (finalMatch) {
      if (finalMatch.topTeam.isWinner) {
        podium[0] = finalMatch.topTeam;
        podium[1] = finalMatch.bottomTeam;
      } else if (finalMatch.bottomTeam.isWinner) {
        podium[0] = finalMatch.bottomTeam;
        podium[1] = finalMatch.topTeam;
      }
    }

    if (thirdMatch) {
      if (thirdMatch.topTeam.isWinner) {
        podium[2] = thirdMatch.topTeam;
        podium[3] = thirdMatch.bottomTeam;
      } else if (thirdMatch.bottomTeam.isWinner) {
        podium[2] = thirdMatch.bottomTeam;
        podium[3] = thirdMatch.topTeam;
      }
    }
    return podium;
  }

  if (format === 'DOUBLE') {
    const finalMatch = matches.find((m) => m.bracketType === 'final');
    const resetMatch = matches.find((m) => m.bracketType === 'final_reset');

    // 若加賽已啟動且未跳過，以加賽決定冠亞軍；若勝部冠軍首場直落奪冠 (resetMatch.isSkipped)，以首場決定冠亞軍
    if (resetMatch && !resetMatch.isSkipped && finalMatch?.bottomTeam.isWinner) {
      if (resetMatch.topTeam.isWinner) {
        podium[0] = resetMatch.topTeam;
        podium[1] = resetMatch.bottomTeam;
      } else if (resetMatch.bottomTeam.isWinner) {
        podium[0] = resetMatch.bottomTeam;
        podium[1] = resetMatch.topTeam;
      }
    } else if (finalMatch) {
      if (finalMatch.topTeam.isWinner) {
        podium[0] = finalMatch.topTeam;
        podium[1] = finalMatch.bottomTeam;
      } else if (finalMatch.bottomTeam.isWinner && !resetMatch) {
        podium[0] = finalMatch.bottomTeam;
        podium[1] = finalMatch.topTeam;
      }
    }

    // 雙敗淘汰自然產生第 3 名（敗部決賽落敗者）與第 4 名（敗部準決賽落敗者）
    if (finalMatch) {
      const lbFinal = matches.find(
        (m) => m.nextMatchId === finalMatch.id && m.bracketType === 'loser'
      );
      if (lbFinal && (lbFinal.topTeam.isWinner || lbFinal.bottomTeam.isWinner)) {
        const lbLoser = lbFinal.topTeam.isWinner ? lbFinal.bottomTeam : lbFinal.topTeam;
        if (lbLoser?.id && lbLoser.id !== 'BYE') podium[2] = lbLoser;

        const lbSemi = matches.find(
          (m) => m.nextMatchId === lbFinal.id && m.bracketType === 'loser'
        );
        if (lbSemi && (lbSemi.topTeam.isWinner || lbSemi.bottomTeam.isWinner)) {
          const lbSemiLoser = lbSemi.topTeam.isWinner ? lbSemi.bottomTeam : lbSemi.topTeam;
          if (lbSemiLoser?.id && lbSemiLoser.id !== 'BYE') podium[3] = lbSemiLoser;
        }
      }
    }
    return podium;
  }

  if (format === 'ROUND_ROBIN') {
    const withStats = calculateStats(participants, matches);
    const hasPlayedAny = withStats.some((p) => (p.stats?.played || 0) > 0);
    if (!hasPlayedAny) return [];
    const sorted = rankParticipantsAcrossGroups(withStats);
    return sorted.slice(0, 4);
  }

  return podium;
};
