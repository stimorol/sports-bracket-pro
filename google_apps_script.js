/**
 * Sports Bracket Pro — Google Apps Script 雲端資料庫與自動報表引擎 (v2.2)
 * Copyright (c) 2026 Hao. All Rights Reserved.
 * 授權規範：免費供學校與民間非營利體育賽事使用，保留所有權利，未經授權嚴禁商業販售。
 *
 * 功能升級亮點：
 * 1. 突破單一儲存格 50,000 字元上限：自動以 35,000 字元分塊寫入 System_Data，且絕不在驗證寫入前清空舊資料。
 * 2. 寫入鎖定安全檢查：僅在 POST 寫入時請求 LockService 並嚴格檢查 tryLock 回傳值，GET 讀取免等待鎖定（支援大量觀眾同時查看即時比分）。
 * 3. 簡易寫入通行碼保護：自動建立隱藏工作表 `_Auth_Config` 儲存通行碼；觀賽讀取公開、覆寫存檔需驗證通行碼。
 * 4. 單場次設備互斥鎖與局部合併同步 (v2.1)：
 *    - `claim_match_lock`: 紀錄組平板開啟場次記分板時自動鎖定該場次（12 分鐘自動續約租期，支援異常斷線強制接管）。
 *    - `sync_match_progress`: 單場各節/各局中場比分同步，不會覆蓋其他場地同時進行中的比賽。
 *    - `finalize_match`: 單場完賽成績寫入並在雲端即時重算晉級樹（含雙敗淘汰加賽）與積分榜。
 *    - `release_match_lock`: 關閉記分板時主動釋放場次鎖定。
 */

const CHUNK_SIZE = 35000;
const LOCK_LEASE_MS = 12 * 60 * 1000; // 12 分鐘鎖定租期
const DATA_SHEET_NAME = 'System_Data';
const AUTH_SHEET_NAME = '_Auth_Config';

/**
 * 處理前端傳來的 GET 請求 (讀取雲端賽事資料 — 供裁判載入、紀錄組平板與觀眾唯讀觀賽模式使用)
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet(DATA_SHEET_NAME, true);
    const rawData = readChunkedJSON(sheet);
    const hasPasscode = Boolean(getStoredPasscode());

    return createJSONOutput({
      status: 'success',
      hasPasscode: hasPasscode,
      data: rawData,
    });
  } catch (error) {
    return createJSONOutput({
      status: 'error',
      message: '讀取失敗：' + error.toString(),
    });
  }
}

/**
 * 處理前端傳來的 POST 請求 (儲存賽事資料、單場鎖定/同步/完賽、或更新通行碼)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJSONOutput({
      status: 'error',
      code: 'LOCK_TIMEOUT',
      message: '目前有其他裝置正在寫入雲端試算表，請稍候幾秒再重試。',
    });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJSONOutput({ status: 'error', message: '無效的請求內容' });
    }

    const payload = JSON.parse(e.postData.contents);
    const storedPasscode = getStoredPasscode();
    const incomingPasscode = String(payload.passcode || '').trim();

    // 通行碼驗證與首次設定邏輯
    if (storedPasscode) {
      if (incomingPasscode !== storedPasscode) {
        return createJSONOutput({
          status: 'error',
          code: 'INVALID_PASSCODE',
          message: '寫入通行碼不正確！若忘記通行碼，試算表擁有者可取消隱藏並清除 _Auth_Config 工作表。',
        });
      }
    } else if (incomingPasscode) {
      // 雲端尚未設定通行碼，且本次上傳附帶了新通行碼 -> 自動啟用保護
      setStoredPasscode(incomingPasscode);
    }

    // 1. 變更通行碼動作
    if (payload.action === 'update_passcode') {
      const nextPasscode = String(payload.newPasscode || '').trim();
      setStoredPasscode(nextPasscode);
      return createJSONOutput({
        status: 'success',
        hasPasscode: Boolean(nextPasscode),
        message: nextPasscode ? '寫入通行碼已更新。' : '已移除寫入通行碼保護。',
      });
    }

    const dataSheet = getOrCreateSheet(DATA_SHEET_NAME, true);
    const nowMs = Date.now();

    // 2. 紀錄台平板申請單場記分鎖定 (claim_match_lock)
    if (payload.action === 'claim_match_lock') {
      const appData = loadNormalizedAppData(dataSheet);
      if (!appData) {
        return createJSONOutput({ status: 'error', message: '雲端尚無賽事資料，請先由主辦端上傳賽程。' });
      }

      const found = findStageAndMatch(appData, payload.stageId, payload.matchId);
      if (!found) {
        return createJSONOutput({ status: 'error', message: '找不到指定的比賽場次 (' + payload.matchId + ')' });
      }

      const match = found.match;
      const incomingDeviceId = String(payload.deviceId || '').trim();
      const incomingDeviceName = String(payload.deviceName || '紀錄台平板').trim();

      if (
        isLockInfoActive(match.lockInfo, nowMs) &&
        match.lockInfo.deviceId !== incomingDeviceId &&
        !payload.forceTakeover
      ) {
        return createJSONOutput({
          status: 'error',
          code: 'MATCH_LOCKED',
          message: '此場次正由「' + (match.lockInfo.deviceName || '其他裝置') + '」開啟記分板鎖定中！',
          lockInfo: match.lockInfo,
          data: appData,
        });
      }

      match.lockInfo = {
        deviceId: incomingDeviceId,
        deviceName: incomingDeviceName,
        lockedAt: nowMs,
        expiresAt: nowMs + LOCK_LEASE_MS,
      };
      appData.updatedAt = new Date(nowMs).toISOString();
      writeChunkedJSON(dataSheet, appData);

      return createJSONOutput({
        status: 'success',
        hasPasscode: Boolean(getStoredPasscode()),
        lockInfo: match.lockInfo,
        data: appData,
      });
    }

    // 3. 釋放單場記分鎖定 (release_match_lock)
    if (payload.action === 'release_match_lock') {
      const appData = loadNormalizedAppData(dataSheet);
      if (!appData) {
        return createJSONOutput({ status: 'success' });
      }

      const found = findStageAndMatch(appData, payload.stageId, payload.matchId);
      if (found) {
        const match = found.match;
        const incomingDeviceId = String(payload.deviceId || '').trim();
        if (
          !isLockInfoActive(match.lockInfo, nowMs) ||
          match.lockInfo.deviceId === incomingDeviceId ||
          payload.forceTakeover
        ) {
          match.lockInfo = null;
          if (payload.clearLiveMeta) {
            match.liveMeta = null;
          }
          appData.updatedAt = new Date(nowMs).toISOString();
          writeChunkedJSON(dataSheet, appData);
        }
      }

      return createJSONOutput({
        status: 'success',
        hasPasscode: Boolean(getStoredPasscode()),
        data: appData,
      });
    }

    // 4. 單場比賽進行中即時局/節進度同步 (sync_match_progress)
    if (payload.action === 'sync_match_progress') {
      const appData = loadNormalizedAppData(dataSheet);
      if (!appData) {
        return createJSONOutput({ status: 'error', message: '雲端尚無賽事資料。' });
      }

      const found = findStageAndMatch(appData, payload.stageId, payload.matchId);
      if (!found) {
        return createJSONOutput({ status: 'error', message: '找不到指定的比賽場次。' });
      }

      const match = found.match;
      const incomingDeviceId = String(payload.deviceId || '').trim();
      const incomingDeviceName = String(payload.deviceName || '紀錄台平板').trim();

      if (
        isLockInfoActive(match.lockInfo, nowMs) &&
        match.lockInfo.deviceId !== incomingDeviceId &&
        !payload.forceTakeover
      ) {
        return createJSONOutput({
          status: 'error',
          code: 'MATCH_LOCKED',
          message: '此場次已被「' + (match.lockInfo.deviceName || '其他裝置') + '」接管鎖定，無法寫入！',
          lockInfo: match.lockInfo,
          data: appData,
        });
      }

      const prog = payload.progress || {};
      match.topTeam.score = prog.scoreA !== undefined ? prog.scoreA : match.topTeam.score;
      match.bottomTeam.score = prog.scoreB !== undefined ? prog.scoreB : match.bottomTeam.score;
      match.topTeam.isWinner = false;
      match.bottomTeam.isWinner = false;
      match.topTeam.isForfeit = false;
      match.bottomTeam.isForfeit = false;
      if (prog.setScores) match.setScores = prog.setScores;
      if (prog.customBestOf) match.customBestOf = prog.customBestOf;
      match.liveMeta = prog.liveMeta !== undefined ? prog.liveMeta : '進行中';

      // 若為跨戰暫離 (例如 3戰2勝 打完第1戰先存檔收工，釋放鎖定供下次續記第2戰)，立即解除鎖定；否則自動續約 12 分鐘租期
      if (payload.releaseLock) {
        match.lockInfo = null;
      } else {
        match.lockInfo = {
          deviceId: incomingDeviceId,
          deviceName: incomingDeviceName,
          lockedAt: (match.lockInfo && match.lockInfo.lockedAt) || nowMs,
          expiresAt: nowMs + LOCK_LEASE_MS,
        };
      }

      appData.updatedAt = new Date(nowMs).toISOString();
      writeChunkedJSON(dataSheet, appData);
      exportToReadableSheets(appData.stages, appData.tournamentTitle);

      return createJSONOutput({
        status: 'success',
        hasPasscode: Boolean(getStoredPasscode()),
        lockInfo: match.lockInfo,
        updatedAt: appData.updatedAt,
        data: appData,
      });
    }

    // 4b. 單場調整幾戰幾勝賽制設定 (update_match_best_of)
    if (payload.action === 'update_match_best_of') {
      const appData = loadNormalizedAppData(dataSheet);
      if (!appData) {
        return createJSONOutput({ status: 'error', message: '雲端尚無賽事資料。' });
      }
      const found = findStageAndMatch(appData, payload.stageId, payload.matchId);
      if (!found) {
        return createJSONOutput({ status: 'error', message: '找不到指定的比賽場次。' });
      }
      found.match.customBestOf = Number(payload.customBestOf) || 1;
      appData.updatedAt = new Date(nowMs).toISOString();
      writeChunkedJSON(dataSheet, appData);
      return createJSONOutput({
        status: 'success',
        hasPasscode: Boolean(getStoredPasscode()),
        updatedAt: appData.updatedAt,
        data: appData,
      });
    }

    // 5. 單場完賽成績寫入與自動晉級重算 (finalize_match — 多平板同時完賽互不覆蓋！)
    if (payload.action === 'finalize_match') {
      const appData = loadNormalizedAppData(dataSheet);
      if (!appData) {
        return createJSONOutput({ status: 'error', message: '雲端尚無賽事資料。' });
      }

      const found = findStageAndMatch(appData, payload.stageId, payload.matchId);
      if (!found) {
        return createJSONOutput({ status: 'error', message: '找不到指定的比賽場次。' });
      }

      const stage = found.stage;
      const match = found.match;
      const incomingDeviceId = String(payload.deviceId || '').trim();

      if (
        isLockInfoActive(match.lockInfo, nowMs) &&
        match.lockInfo.deviceId !== incomingDeviceId &&
        !payload.forceTakeover
      ) {
        return createJSONOutput({
          status: 'error',
          code: 'MATCH_LOCKED',
          message: '此場次正由「' + (match.lockInfo.deviceName || '其他裝置') + '」記分鎖定中，無法覆寫！',
          lockInfo: match.lockInfo,
          data: appData,
        });
      }

      const res = payload.result || {};
      if (!res.recordMeta && payload.deviceName) {
        res.recordMeta = {
          recordedBy: String(payload.deviceName).trim(),
          recordedAt: new Date(nowMs).toISOString(),
        };
      }
      applySingleMatchUpdateBackend(match, res);

      // 完賽後自動解除該場鎖定與進行中標記，並於雲端重算該階段晉級樹與統計積分
      const format = (stage.config && stage.config.format) || 'SINGLE';
      stage.matches = reconcileBracketBackend(stage.matches || [], format);
      stage.participants = computeBackendStats(stage.participants || [], stage.matches);

      appData.updatedAt = new Date(nowMs).toISOString();
      writeChunkedJSON(dataSheet, appData);
      exportToReadableSheets(appData.stages, appData.tournamentTitle);

      return createJSONOutput({
        status: 'success',
        hasPasscode: Boolean(getStoredPasscode()),
        updatedAt: appData.updatedAt,
        data: appData,
        message: '本場比賽成績已寫入雲端並完成晉級更新！',
      });
    }

    // 6. 全域儲存賽事狀態動作 (主辦端建立/修改賽程結構或一鍵上傳)
    if (payload.action === 'save') {
      const appData = payload.data;
      if (!appData) {
        return createJSONOutput({ status: 'error', message: '缺少賽事資料 (data)' });
      }

      // 若雲端已有其他平板正在鎖定記分中的場次，且主辦端未強制覆蓋，保留該場次的進行中鎖定與即時比分避免誤洗掉
      const existingCloud = readChunkedJSON(dataSheet);
      if (existingCloud && !payload.forceOverwriteLocks) {
        preserveActiveLockedMatches(existingCloud, appData, payload.deviceId, nowMs);
      }

      const stagesData = Array.isArray(appData) ? appData : appData.stages || [];
      const tournamentTitle = Array.isArray(appData)
        ? '運動錦標賽'
        : appData.tournamentTitle || '運動錦標賽';

      // 1. 分塊安全寫入原始 JSON 狀態 (先覆寫新區塊，再清除多餘舊列，避免超長字串拋錯清空資料)
      writeChunkedJSON(dataSheet, appData);

      // 2. 匯出人類可讀報表分頁 (賽程表 & 積分榜)
      exportToReadableSheets(stagesData, tournamentTitle);

      return createJSONOutput({
        status: 'success',
        hasPasscode: Boolean(getStoredPasscode()),
        updatedAt: new Date(nowMs).toISOString(),
        data: appData,
        message: '賽事資料已同步至 Google 試算表並更新報表分頁。',
      });
    }

    return createJSONOutput({ status: 'error', message: '未知的操作類型 (action)' });
  } catch (error) {
    return createJSONOutput({
      status: 'error',
      message: '伺服器處理錯誤：' + error.toString(),
    });
  } finally {
    lock.releaseLock();
  }
}

// --- 鎖定與局部更新輔助函式 ---

function isLockInfoActive(lockInfo, nowMs) {
  if (!lockInfo || !lockInfo.deviceId) return false;
  if (!lockInfo.expiresAt) return true;
  return Number(lockInfo.expiresAt) > nowMs;
}

function loadNormalizedAppData(sheet) {
  const raw = readChunkedJSON(sheet);
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return {
      version: 2,
      tournamentTitle: '運動錦標賽',
      updatedAt: new Date().toISOString(),
      stages: raw,
    };
  }
  return raw;
}

function findStageAndMatch(appData, stageId, matchId) {
  const stages = (appData && appData.stages) || [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (stageId !== undefined && stageId !== null && String(s.id) !== String(stageId)) {
      continue;
    }
    const matches = s.matches || [];
    for (let j = 0; j < matches.length; j++) {
      if (matches[j].id === matchId) {
        return { stage: s, match: matches[j] };
      }
    }
  }
  return null;
}

function applySingleMatchUpdateBackend(match, updatePayload) {
  match.lockInfo = null;
  match.liveMeta = null;

  if (updatePayload.action === 'clear') {
    match.topTeam.score = null;
    match.topTeam.isWinner = false;
    match.topTeam.isForfeit = false;
    match.bottomTeam.score = null;
    match.bottomTeam.isWinner = false;
    match.bottomTeam.isForfeit = false;
    match.setScores = [];
    match.recordMeta = null;
    return;
  }

  if (updatePayload.isForfeit) {
    const topWins = updatePayload.winnerId === match.topTeam.id;
    match.topTeam.score = null;
    match.topTeam.isWinner = topWins;
    match.topTeam.isForfeit = !topWins;
    match.bottomTeam.score = null;
    match.bottomTeam.isWinner = !topWins;
    match.bottomTeam.isForfeit = topWins;
    match.setScores = [];
    if (updatePayload.customBestOf) match.customBestOf = updatePayload.customBestOf;
    if (updatePayload.recordMeta) match.recordMeta = updatePayload.recordMeta;
    return;
  }

  match.topTeam.score = updatePayload.scoreA;
  match.topTeam.isWinner = Boolean(updatePayload.topIsWinner);
  match.topTeam.isForfeit = false;
  match.bottomTeam.score = updatePayload.scoreB;
  match.bottomTeam.isWinner = Boolean(updatePayload.bottomIsWinner);
  match.bottomTeam.isForfeit = false;
  match.setScores = updatePayload.setScores || [];
  if (updatePayload.customBestOf) match.customBestOf = updatePayload.customBestOf;
  if (updatePayload.recordMeta) match.recordMeta = updatePayload.recordMeta;
}

function preserveActiveLockedMatches(existingCloud, incomingAppData, senderDeviceId, nowMs) {
  const cloudStages = Array.isArray(existingCloud) ? existingCloud : existingCloud.stages || [];
  const nextStages = Array.isArray(incomingAppData) ? incomingAppData : incomingAppData.stages || [];

  const cloudLockedMap = {};
  cloudStages.forEach(function (cs) {
    (cs.matches || []).forEach(function (cm) {
      if (
        isLockInfoActive(cm.lockInfo, nowMs) &&
        (!senderDeviceId || cm.lockInfo.deviceId !== senderDeviceId)
      ) {
        cloudLockedMap[cs.id + '::' + cm.id] = cm;
      }
    });
  });

  nextStages.forEach(function (ns) {
    let stageTouched = false;
    (ns.matches || []).forEach(function (nm) {
      const lockedCloudMatch = cloudLockedMap[ns.id + '::' + nm.id];
      if (
        lockedCloudMatch &&
        nm.topTeam &&
        nm.bottomTeam &&
        lockedCloudMatch.topTeam &&
        lockedCloudMatch.bottomTeam &&
        nm.topTeam.id === lockedCloudMatch.topTeam.id &&
        nm.bottomTeam.id === lockedCloudMatch.bottomTeam.id
      ) {
        nm.topTeam.score = lockedCloudMatch.topTeam.score;
        nm.topTeam.isWinner = lockedCloudMatch.topTeam.isWinner;
        nm.topTeam.isForfeit = lockedCloudMatch.topTeam.isForfeit;
        nm.bottomTeam.score = lockedCloudMatch.bottomTeam.score;
        nm.bottomTeam.isWinner = lockedCloudMatch.bottomTeam.isWinner;
        nm.bottomTeam.isForfeit = lockedCloudMatch.bottomTeam.isForfeit;
        nm.setScores = lockedCloudMatch.setScores || [];
        nm.liveMeta = lockedCloudMatch.liveMeta || null;
        nm.lockInfo = lockedCloudMatch.lockInfo;
        stageTouched = true;
      }
    });
    if (stageTouched && ns.status === 'ACTIVE') {
      const fmt = (ns.config && ns.config.format) || 'SINGLE';
      ns.matches = reconcileBracketBackend(ns.matches, fmt);
      ns.participants = computeBackendStats(ns.participants || [], ns.matches);
    }
  });
}

/**
 * 後端拓撲排序與淘汰賽晉級樹推演 (與前端 src/utils/tournamentEngine.js 完全一致)
 */
function reconcileBracketBackend(rawMatches, format) {
  if (format === 'ROUND_ROBIN' || !rawMatches || rawMatches.length === 0) {
    return rawMatches;
  }

  const cloned = rawMatches.map(function (m) {
    return Object.assign({}, m, {
      topTeam: Object.assign({}, m.topTeam),
      bottomTeam: Object.assign({}, m.bottomTeam),
      setScores: m.setScores ? m.setScores.map(function (s) { return Object.assign({}, s); }) : [],
      lockInfo: m.lockInfo ? Object.assign({}, m.lockInfo) : null,
    });
  });

  const idMap = {};
  const inDegree = {};
  const adj = {};
  const feeders = {};

  cloned.forEach(function (m) {
    idMap[m.id] = m;
    inDegree[m.id] = 0;
    adj[m.id] = [];
  });

  let finalMatch = null;
  let resetMatch = null;
  cloned.forEach(function (m) {
    if (m.bracketType === 'final') finalMatch = m;
    if (m.bracketType === 'final_reset') resetMatch = m;
  });

  cloned.forEach(function (m) {
    if (m.nextMatchId && idMap[m.nextMatchId]) {
      adj[m.id].push(m.nextMatchId);
      inDegree[m.nextMatchId] = (inDegree[m.nextMatchId] || 0) + 1;
      if (m.nextMatchPosition) {
        if (!feeders[m.nextMatchId]) feeders[m.nextMatchId] = {};
        feeders[m.nextMatchId][m.nextMatchPosition] = { sourceId: m.id, path: 'winner' };
      }
    }
    if (m.loserDropsToMatchId && idMap[m.loserDropsToMatchId]) {
      adj[m.id].push(m.loserDropsToMatchId);
      inDegree[m.loserDropsToMatchId] = (inDegree[m.loserDropsToMatchId] || 0) + 1;
      if (m.loserDropsToSlot) {
        if (!feeders[m.loserDropsToMatchId]) feeders[m.loserDropsToMatchId] = {};
        feeders[m.loserDropsToMatchId][m.loserDropsToSlot] = { sourceId: m.id, path: 'loser' };
      }
    }
  });

  if (finalMatch && resetMatch) {
    adj[finalMatch.id].push(resetMatch.id);
    inDegree[resetMatch.id] = (inDegree[resetMatch.id] || 0) + 1;
  }

  const queue = [];
  cloned.forEach(function (m) {
    if (inDegree[m.id] === 0) queue.push(m.id);
  });

  const ordered = [];
  while (queue.length > 0) {
    const currId = queue.shift();
    ordered.push(idMap[currId]);
    const nextList = adj[currId] || [];
    for (let i = 0; i < nextList.length; i++) {
      const nextId = nextList[i];
      inDegree[nextId]--;
      if (inDegree[nextId] === 0) queue.push(nextId);
    }
  }
  if (ordered.length < cloned.length) {
    const seen = {};
    ordered.forEach(function (m) { seen[m.id] = true; });
    cloned.forEach(function (m) {
      if (!seen[m.id]) ordered.push(m);
    });
  }

  function clearScores(m) {
    m.topTeam = Object.assign({}, m.topTeam, { score: null, isWinner: false, isForfeit: false });
    m.bottomTeam = Object.assign({}, m.bottomTeam, { score: null, isWinner: false, isForfeit: false });
    m.setScores = [];
    m.isDoubleBye = false;
    m.liveMeta = null;
    m.lockInfo = null;
  }

  function getProducedTeam(sourceMatch, path) {
    if (!sourceMatch) return null;
    if (sourceMatch.isDoubleBye) return { id: 'BYE', name: 'BYE', isSeed: false };
    if (path === 'winner') {
      if (sourceMatch.topTeam.isWinner) return sourceMatch.topTeam;
      if (sourceMatch.bottomTeam.isWinner) return sourceMatch.bottomTeam;
      return null;
    }
    if (path === 'loser') {
      if (sourceMatch.topTeam.isWinner) return sourceMatch.bottomTeam;
      if (sourceMatch.bottomTeam.isWinner) return sourceMatch.topTeam;
      return null;
    }
    return null;
  }

  ordered.forEach(function (m) {
    // 1. 雙敗淘汰總冠軍加賽 (Grand Final Reset)
    if (m.bracketType === 'final_reset' && finalMatch) {
      if (finalMatch.topTeam.isWinner) {
        m.isSkipped = true;
        m.topTeam = { id: null, name: null, isSeed: false, score: null, isWinner: false, isForfeit: false, placeholder: '無需加賽' };
        m.bottomTeam = { id: null, name: null, isSeed: false, score: null, isWinner: false, isForfeit: false, placeholder: '無需加賽' };
        clearScores(m);
        return;
      } else if (finalMatch.bottomTeam.isWinner) {
        const prevSkipped = m.isSkipped;
        m.isSkipped = false;
        const expectedTop = finalMatch.topTeam;
        const expectedBot = finalMatch.bottomTeam;
        const changed = prevSkipped || m.topTeam.id !== expectedTop.id || m.bottomTeam.id !== expectedBot.id;
        m.topTeam = Object.assign({}, m.topTeam, { id: expectedTop.id, name: expectedTop.name, isSeed: Boolean(expectedTop.isSeed) });
        m.bottomTeam = Object.assign({}, m.bottomTeam, { id: expectedBot.id, name: expectedBot.name, isSeed: Boolean(expectedBot.isSeed) });
        if (changed) clearScores(m);
        return;
      } else {
        m.isSkipped = false;
        const hadTeams = Boolean(m.topTeam.id || m.bottomTeam.id);
        m.topTeam = { id: null, name: null, isSeed: false, score: null, isWinner: false, isForfeit: false, placeholder: '若敗部奪勝則加賽' };
        m.bottomTeam = { id: null, name: null, isSeed: false, score: null, isWinner: false, isForfeit: false, placeholder: '若敗部奪勝則加賽' };
        if (hadTeams) clearScores(m);
        return;
      }
    }

    // 2. 上游晉級/掉落同步
    const mf = feeders[m.id];
    if (mf) {
      ['top', 'bottom'].forEach(function (slotKey) {
        const feederInfo = mf[slotKey];
        if (!feederInfo) return;
        const sourceMatch = idMap[feederInfo.sourceId];
        const incoming = getProducedTeam(sourceMatch, feederInfo.path);
        const teamProp = slotKey === 'top' ? 'topTeam' : 'bottomTeam';
        const currentSlot = m[teamProp];
        const expectedId = incoming ? incoming.id : null;
        const currentId = currentSlot ? currentSlot.id : null;

        if (expectedId !== currentId) {
          m[teamProp] = Object.assign({}, currentSlot, {
            id: incoming ? incoming.id : null,
            name: incoming ? incoming.name : null,
            isSeed: incoming ? Boolean(incoming.isSeed) : false,
            score: null,
            isWinner: false,
            isForfeit: false,
          });
          clearScores(m);
        } else if (incoming && incoming.name !== currentSlot.name) {
          m[teamProp] = Object.assign({}, currentSlot, { name: incoming.name });
        }
      });
    }

    // 3. 處理 BYE 與雙輪空
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
      m.isDoubleBye = false;
      m.topTeam.isWinner = false;
      m.bottomTeam.isWinner = false;
      m.topTeam.score = null;
      m.bottomTeam.score = null;
    } else {
      m.isDoubleBye = false;
    }
  });

  return cloned;
}

/**
 * 將超長 JSON 字串自動切分為 35,000 字元區塊寫入 A 欄，安全突破單格 50,000 字元限制
 */
function writeChunkedJSON(sheet, dataObj) {
  const jsonStr = JSON.stringify(dataObj);
  const chunks = [];
  for (let i = 0; i < jsonStr.length; i += CHUNK_SIZE) {
    chunks.push([jsonStr.slice(i, i + CHUNK_SIZE)]);
  }
  if (chunks.length === 0) {
    chunks.push(['']);
  }

  const prevLastRow = sheet.getLastRow();
  sheet.getRange(1, 1, chunks.length, 1).setValues(chunks);
  sheet.getRange(1, 2).setValue('Updated: ' + new Date().toLocaleString('zh-TW'));

  // 若先前存檔列數較多，僅清除多出的舊列
  if (prevLastRow > chunks.length) {
    sheet.getRange(chunks.length + 1, 1, prevLastRow - chunks.length, 2).clearContent();
  }
}

/**
 * 從 A 欄串接所有分塊並還原為 JSON 物件
 */
function readChunkedJSON(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return null;

  const values = sheet.getRange(1, 1, lastRow, 1).getValues();
  const joined = values.map(function (row) { return String(row[0] || ''); }).join('');
  if (!joined.trim()) return null;

  return JSON.parse(joined);
}

/**
 * 讀取隱藏的 _Auth_Config 通行碼
 */
function getStoredPasscode() {
  const sheet = getOrCreateSheet(AUTH_SHEET_NAME, true);
  return String(sheet.getRange(1, 2).getValue() || '').trim();
}

/**
 * 寫入或清除隱藏的 _Auth_Config 通行碼
 */
function setStoredPasscode(passcode) {
  const sheet = getOrCreateSheet(AUTH_SHEET_NAME, true);
  sheet.getRange(1, 1).setValue('WRITE_PASSCODE');
  sheet.getRange(1, 2).setValue(passcode);
  sheet.getRange(2, 1).setValue('說明：若忘記通行碼，清空 B1 儲存格即可解除保護');
}

/**
 * 後端即時計算單一階段各隊統計數據（僅統計已完賽場次，進行中暫存比分不誤計入勝敗積分）
 */
function computeBackendStats(participants, matches) {
  const statsMap = {};
  (participants || []).forEach(function (p) {
    statsMap[p.id] = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });

  (matches || []).forEach(function (m) {
    if (m.isSkipped || m.isDoubleBye || m.liveMeta) return;
    const idA = m.topTeam && m.topTeam.id;
    const idB = m.bottomTeam && m.bottomTeam.id;
    if (!idA || !idB || idA === 'BYE' || idB === 'BYE') return;
    if (!statsMap[idA] || !statsMap[idB]) return;

    const sA = m.topTeam.score;
    const sB = m.bottomTeam.score;
    const fA = Boolean(m.topTeam.isForfeit);
    const fB = Boolean(m.bottomTeam.isForfeit);

    if ((sA !== null && sA !== undefined && sB !== null && sB !== undefined) || fA || fB) {
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
      } else {
        statsMap[idA].gf += Number(sA);
        statsMap[idA].ga += Number(sB);
        statsMap[idA].gd += Number(sA) - Number(sB);
        statsMap[idB].gf += Number(sB);
        statsMap[idB].ga += Number(sA);
        statsMap[idB].gd += Number(sB) - Number(sA);

        if (sA > sB) {
          statsMap[idA].won++;
          statsMap[idA].pts += 3;
          statsMap[idB].lost++;
        } else if (sB > sA) {
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

  return (participants || []).map(function (p) {
    return Object.assign({}, p, { stats: statsMap[p.id] || p.stats });
  });
}

/**
 * 將賽事狀態轉換為人類可讀的試算表分頁 (賽程表 & 積分榜)
 */
function exportToReadableSheets(stages, tournamentTitle) {
  // --- 1. 賽程表 (Schedule) ---
  const scheduleSheet = getOrCreateSheet('賽程表 (Schedule)', false);
  scheduleSheet.clear();

  const scheduleHeaders = [
    '賽事名稱',
    '階段 (Stage)',
    '類型 / 組別',
    '場次',
    '上方隊伍 (Top)',
    '比分',
    '下方隊伍 (Bottom)',
    '比分',
    '各局明細',
    '狀態',
    '獲勝者',
  ];
  scheduleSheet
    .getRange(1, 1, 1, scheduleHeaders.length)
    .setValues([scheduleHeaders])
    .setFontWeight('bold')
    .setBackground('#ffedd5');

  const scheduleRows = [];

  // --- 2. 積分榜 (Standings) ---
  const standingsSheet = getOrCreateSheet('積分榜 (Standings)', false);
  standingsSheet.clear();

  const standingsHeaders = [
    '賽事名稱',
    '階段 (Stage)',
    '組別',
    '排名',
    '隊伍名稱',
    '已賽',
    '勝',
    '平',
    '負',
    '得分',
    '失分',
    '淨勝分',
    '積分',
  ];
  standingsSheet
    .getRange(1, 1, 1, standingsHeaders.length)
    .setValues([standingsHeaders])
    .setFontWeight('bold')
    .setBackground('#fef3c7');

  const standingsRows = [];

  (stages || []).forEach(function (stage) {
    const stageName = stage.name || '未命名階段';
    const matches = stage.matches || [];

    matches.forEach(function (m) {
      if (m.isDoubleBye) return;
      if (m.topTeam && m.bottomTeam && (m.topTeam.id === 'BYE' || m.bottomTeam.id === 'BYE')) {
        return; // 輪空場次不重複列印於對戰時程表
      }

      let typeText = '一般';
      if (m.bracketType === 'winner') typeText = '勝部';
      else if (m.bracketType === 'loser') typeText = '敗部';
      else if (m.bracketType === 'final') typeText = '總冠軍賽';
      else if (m.bracketType === 'final_reset') typeText = '總冠軍加賽';
      else if (m.bracketType === 'third_place') typeText = '季軍賽';
      else if (m.bracketType === 'group') {
        typeText = m.groupId ? '小組賽 (Group ' + m.groupId + ')' : '循環賽';
      }

      const topName = (m.topTeam && (m.topTeam.name || m.topTeam.placeholder)) || '待定';
      const botName = (m.bottomTeam && (m.bottomTeam.name || m.bottomTeam.placeholder)) || '待定';
      const hasScoreA = m.topTeam && m.topTeam.score !== null && m.topTeam.score !== undefined;
      const hasScoreB = m.bottomTeam && m.bottomTeam.score !== null && m.bottomTeam.score !== undefined;
      const scoreA = hasScoreA ? m.topTeam.score : '-';
      const scoreB = hasScoreB ? m.bottomTeam.score : '-';

      const setDetailText =
        m.setScores && m.setScores.length > 0
          ? m.setScores.map(function (s) { return s.a + '-' + s.b; }).join(', ')
          : '-';

      let status = '未開賽';
      let winner = '-';

      if (m.isSkipped) {
        status = '無需加賽';
      } else if (m.liveMeta) {
        status = '進行中 (' + m.liveMeta + ')';
      } else if ((m.topTeam && m.topTeam.isForfeit) || (m.bottomTeam && m.bottomTeam.isForfeit)) {
        status = '棄權完賽';
      } else if (hasScoreA && hasScoreB) {
        if (m.topTeam.isWinner || m.bottomTeam.isWinner) {
          status = '已完賽';
        } else if (stage.config && stage.config.format === 'ROUND_ROBIN' && scoreA === scoreB) {
          status = '已完賽 (平手)';
          winner = '平手';
        } else {
          status = '進行中';
        }
      }

      if (m.topTeam && m.topTeam.isWinner) winner = topName;
      else if (m.bottomTeam && m.bottomTeam.isWinner) winner = botName;

      scheduleRows.push([
        tournamentTitle,
        stageName,
        typeText,
        m.id.split('-').pop(),
        topName,
        scoreA,
        botName,
        scoreB,
        setDetailText,
        status,
        winner,
      ]);
    });

    // 處理積分榜：使用後端即時重算，並依組別分組排序
    if (stage.participants && stage.participants.length > 0) {
      const computedParticipants = computeBackendStats(stage.participants, matches);
      const groups = [];
      computedParticipants.forEach(function (p) {
        const g = (stage.config && stage.config.format === 'ROUND_ROBIN' && p.groupId) ? p.groupId : '-';
        if (groups.indexOf(g) === -1) groups.push(g);
      });
      groups.sort();

      groups.forEach(function (gId) {
        const groupMembers = computedParticipants.filter(function (p) {
          const pGroup = (stage.config && stage.config.format === 'ROUND_ROBIN' && p.groupId) ? p.groupId : '-';
          return pGroup === gId;
        });

        groupMembers.sort(function (a, b) {
          const sA = a.stats || { pts: 0, gd: 0, gf: 0 };
          const sB = b.stats || { pts: 0, gd: 0, gf: 0 };
          if (sB.pts !== sA.pts) return sB.pts - sA.pts;
          if (sB.gd !== sA.gd) return sB.gd - sA.gd;
          return sB.gf - sA.gf;
        });

        groupMembers.forEach(function (p, index) {
          const s = p.stats || { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
          standingsRows.push([
            tournamentTitle,
            stageName,
            gId === '-' ? '全區' : 'Group ' + gId,
            index + 1,
            p.name,
            s.played,
            s.won,
            s.drawn,
            s.lost,
            s.gf,
            s.ga,
            s.gd,
            s.pts,
          ]);
        });
      });
    }
  });

  if (scheduleRows.length > 0) {
    scheduleSheet
      .getRange(2, 1, scheduleRows.length, scheduleRows[0].length)
      .setValues(scheduleRows);
  }
  if (standingsRows.length > 0) {
    standingsSheet
      .getRange(2, 1, standingsRows.length, standingsRows[0].length)
      .setValues(standingsRows);
  }
}

// --- 輔助函式 ---

function getOrCreateSheet(name, shouldHide) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (shouldHide && !sheet.isSheetHidden()) {
    // 確保試算表至少留有一張可見工作表才隱藏系統表
    if (ss.getSheets().length > 1) {
      sheet.hideSheet();
    }
  }
  return sheet;
}

function createJSONOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}
