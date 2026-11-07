import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DoubleEliminationLayout } from './components/brackets/DoubleEliminationLayout';
import { ResultsView } from './components/brackets/ResultsView';
import { RoundRobinLayout } from './components/brackets/RoundRobinLayout';
import { SingleEliminationLayout } from './components/brackets/SingleEliminationLayout';
import { CopyrightFooter } from './components/common/CopyrightFooter';
import { InlineEditableText } from './components/common/InlineEditableText';
import { ToastRegion } from './components/common/ToastRegion';
import { CloudSetupModal } from './components/modals/CloudSetupModal';
import { ConfirmationModal } from './components/modals/ConfirmationModal';
import { DigitalScoreboardModal } from './components/modals/DigitalScoreboardModal';
import {
  MatchRecordModal,
  MatchRecordPrintRoot,
} from './components/modals/MatchRecordModal';
import { PromotionModal } from './components/modals/PromotionModal';
import { ScoreModal } from './components/modals/ScoreModal';
import { TeamManagerModal } from './components/modals/TeamManagerModal';
import { SetupPanel } from './components/setup/SetupPanel';
import {
  createLockInfo,
  getOrCreateDeviceId,
  getStoredDeviceName,
  isLockedByAnotherDevice,
} from './utils/deviceLock';
import {
  applyMatchResultToStage,
  calculateStats,
  computePodium,
  createEmptyStats,
  generateMatches,
  generateUUID,
  reconcileBracket,
  renameParticipantInStage,
} from './utils/tournamentEngine';

const LOCAL_STORAGE_KEY = 'tournament_pro_state_v2';

const createInitialStage = () => ({
  id: 1,
  name: '第一階段',
  status: 'SETUP',
  config: {
    format: 'SINGLE',
    sport: 'BASKETBALL',
    bestOf: 1,
    hasThirdPlace: false,
    hasBracketReset: true,
    groupCount: 1,
  },
  participants: [],
  matches: [],
});

const normalizeLoadedStages = (rawStages) => {
  if (!Array.isArray(rawStages) || rawStages.length === 0) {
    return [createInitialStage()];
  }
  return rawStages.map((s, idx) => {
    const config = {
      format: 'SINGLE',
      sport: 'BASKETBALL',
      bestOf: 1,
      hasThirdPlace: false,
      hasBracketReset: true,
      groupCount: 1,
      ...(s.config || {}),
    };
    const reconciled =
      s.status === 'ACTIVE'
        ? reconcileBracket(s.matches || [], config.format)
        : s.matches || [];
    const participantsWithStats = calculateStats(s.participants || [], reconciled);
    return {
      ...s,
      id: s.id ?? idx + 1,
      name: s.name || `第 ${idx + 1} 階段`,
      config,
      matches: reconciled,
      participants: participantsWithStats,
    };
  });
};

export const App = () => {
  // 解析網址參數決定角色模式：'admin' (主辦裁判) | 'scorer' (場邊紀錄組平板) | 'view' (選手/觀眾唯讀)
  const initialQuery = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    const role =
      modeParam === 'view' ? 'view' : modeParam === 'scorer' ? 'scorer' : 'admin';
    return {
      queryGasUrl: params.get('gas') || '',
      initialRole: role,
    };
  }, []);

  const [userRole, setUserRole] = useState(initialQuery.initialRole);
  const isReadOnly = userRole === 'view';
  const isScorerMode = userRole === 'scorer';
  const isAdminMode = userRole === 'admin';

  const [autoRefresh, setAutoRefresh] = useState(
    initialQuery.initialRole === 'view' || initialQuery.initialRole === 'scorer'
  );

  // 本機設備唯一識別碼與名稱 (用於場次鎖定防撞)
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const [deviceName, setDeviceName] = useState(() => getStoredDeviceName());

  // 初始化本地狀態 (非觀眾/非平板連線模式時自動從 localStorage 還原)
  const initialSavedState = useMemo(() => {
    if (initialQuery.initialRole !== 'admin') return null;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [initialQuery.initialRole]);

  const [tournamentTitle, setTournamentTitle] = useState(
    initialSavedState?.tournamentTitle || '運動錦標賽'
  );
  const [stages, setStages] = useState(() =>
    initialSavedState?.stages
      ? normalizeLoadedStages(initialSavedState.stages)
      : [createInitialStage()]
  );
  const [activeStageId, setActiveStageId] = useState(
    initialSavedState?.activeStageId || 1
  );
  const [viewTab, setViewTab] = useState('BRACKET'); // 'BRACKET' | 'PODIUM'

  // Modals & UI States
  const [selectedMatch, setSelectedMatch] = useState(null); // 快速成績輸入視窗 (Admin)
  const [scoreboardMatchId, setScoreboardMatchId] = useState(null); // 數位記分板開啟中之場次 ID
  const [scoreboardOverrideBestOf, setScoreboardOverrideBestOf] = useState(null);
  const [isScoreboardSyncing, setIsScoreboardSyncing] = useState(false);

  const [showPromoModal, setShowPromoModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [recordModalState, setRecordModalState] = useState({
    isOpen: false,
    matchId: null,
    liveSbState: null,
  });
  const [preparedPrintRecords, setPreparedPrintRecords] = useState([]);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '確認操作',
    message: '',
    confirmLabel: '確定',
    variant: 'danger',
    onConfirm: () => {},
  });

  // Cloud Sync States
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [gasUrl, setGasUrl] = useState(
    () => initialQuery.queryGasUrl || localStorage.getItem('tournament_gas_url') || ''
  );
  const [passcode, setPasscode] = useState(
    () => localStorage.getItem('tournament_gas_passcode') || ''
  );
  const [cloudHasPasscode, setCloudHasPasscode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('資料同步中...');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [hasUnsavedCloudChanges, setHasUnsavedCloudChanges] = useState(false);

  // Non-blocking Popover Toasts
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = 'info', duration = 4000) => {
    const id = generateUUID();
    setToasts((prev) => [...prev.slice(-3), { id, message, type, duration }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 同步網頁標題
  useEffect(() => {
    const roleSuffix = isReadOnly
      ? ' (即時觀賽)'
      : isScorerMode
        ? ' (紀錄組平板)'
        : '';
    document.title = `${tournamentTitle}${roleSuffix} | TournamentPro`;
  }, [tournamentTitle, isReadOnly, isScorerMode]);

  // 自動儲存至 localStorage（唯讀觀賽模式不覆寫本機草稿）
  useEffect(() => {
    if (isReadOnly) return;
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          tournamentTitle,
          stages,
          activeStageId,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      /* ignore quota errors */
    }
  }, [tournamentTitle, stages, activeStageId, isReadOnly]);

  const activeStage = useMemo(
    () => stages.find((s) => s.id === activeStageId) || stages[0],
    [stages, activeStageId]
  );

  const scoreboardMatch = useMemo(() => {
    if (!scoreboardMatchId || !activeStage) return null;
    return activeStage.matches.find((m) => m.id === scoreboardMatchId) || null;
  }, [scoreboardMatchId, activeStage]);

  // 從階段對戰列表中同步最新的 selectedMatch
  const liveSelectedMatch = useMemo(() => {
    if (!selectedMatch || !activeStage) return null;
    return activeStage.matches.find((m) => m.id === selectedMatch.id) || selectedMatch;
  }, [selectedMatch, activeStage]);

  const podiumWinners = useMemo(() => computePodium(activeStage), [activeStage]);
  const hasChampion = Boolean(podiumWinners[0]);

  const applyCloudSnapshotToState = useCallback(
    (appData) => {
      if (!appData) return;
      const loadedStages = Array.isArray(appData) ? appData : appData.stages;
      const loadedTitle = Array.isArray(appData)
        ? tournamentTitle
        : appData.tournamentTitle || '運動錦標賽';

      const normalized = normalizeLoadedStages(loadedStages);
      setTournamentTitle(loadedTitle);
      setStages(normalized);
      setActiveStageId((prevId) =>
        normalized.some((s) => s.id === prevId)
          ? prevId
          : normalized[normalized.length - 1].id
      );
      setLastSyncTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
      setHasUnsavedCloudChanges(false);
    },
    [tournamentTitle]
  );

  const updateActiveStage = useCallback(
    (updates) => {
      setStages((prev) =>
        prev.map((s) => (s.id === activeStage.id ? { ...s, ...updates } : s))
      );
      setHasUnsavedCloudChanges(true);
    },
    [activeStage?.id]
  );

  const resetActiveStageToSetup = () => {
    if (!isAdminMode) return;
    const activeIndex = stages.findIndex((s) => s.id === activeStage.id);
    const keptStages = stages.slice(0, activeIndex + 1);
    const updatedStages = keptStages.map((s) =>
      s.id === activeStage.id
        ? {
            ...s,
            status: 'SETUP',
            matches: [],
            participants: s.participants.map((p) => ({
              ...p,
              stats: createEmptyStats(),
            })),
          }
        : s
    );
    setStages(updatedStages);
    setViewTab('BRACKET');
    setHasUnsavedCloudChanges(true);
    notify('已返回本階段賽制設定模式', 'info');
  };

  const resetEntireTournament = () => {
    if (!isAdminMode) return;
    const fresh = createInitialStage();
    setTournamentTitle('運動錦標賽');
    setStages([fresh]);
    setActiveStageId(1);
    setViewTab('BRACKET');
    setHasUnsavedCloudChanges(true);
    notify('已建立全新空白賽事', 'info');
  };

  // --- 雲端讀取與寫入 (真 CORS JSON 回應驗證 + 單場局部合併同步) ---
  const executeCloudLoad = useCallback(
    async (targetUrl, { silent = false } = {}) => {
      const urlToUse = (targetUrl || gasUrl || '').trim();
      if (!urlToUse) return;

      if (!silent) {
        setLoadingMessage('正在從雲端試算表讀取最新賽況...');
        setIsLoading(true);
      }

      try {
        const separator = urlToUse.includes('?') ? '&' : '?';
        const response = await fetch(`${urlToUse}${separator}action=read&_t=${Date.now()}`, {
          method: 'GET',
          redirect: 'follow',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (typeof result.hasPasscode === 'boolean') {
          setCloudHasPasscode(result.hasPasscode);
        }

        if (result.status === 'success' && result.data) {
          applyCloudSnapshotToState(result.data);
          setIsCloudModalOpen(false);
          if (!silent) {
            notify('已成功載入雲端最新賽況！', 'success');
          }
        } else if (!silent) {
          notify(result.message || '雲端試算表目前尚無存檔資料', 'warning');
        }
      } catch (err) {
        console.error('Cloud Load Error:', err);
        if (!silent) {
          notify('雲端讀取失敗！請確認 GAS 網址正確且存取權限設為「所有人 (Anyone)」', 'error', 5500);
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [gasUrl, notify, applyCloudSnapshotToState]
  );

  const handleRequestCloudLoad = (targetUrl) => {
    const hasLocalMatches = stages.some((s) => s.matches.length > 0);
    if (isAdminMode && hasLocalMatches && hasUnsavedCloudChanges) {
      setConfirmModal({
        isOpen: true,
        title: '載入雲端存檔確認',
        message: '本機尚有未上傳的賽況變更，從雲端載入將會覆蓋目前的本機進度。確定要載入嗎？',
        confirmLabel: '確定覆蓋本機',
        variant: 'warning',
        onConfirm: () => executeCloudLoad(targetUrl),
      });
      return;
    }
    executeCloudLoad(targetUrl);
  };

  const executeCloudSync = async (targetUrl, targetPasscode) => {
    const urlToUse = (targetUrl ?? gasUrl).trim();
    const passToUse = (targetPasscode ?? passcode).trim();
    if (!urlToUse) return;

    setLoadingMessage('正在同步賽況並產生 Google 試算表報表...');
    setIsLoading(true);
    try {
      const payload = {
        action: 'save',
        passcode: passToUse,
        deviceId,
        data: {
          version: 2,
          tournamentTitle,
          updatedAt: new Date().toISOString(),
          stages,
        },
      };

      const response = await fetch(urlToUse, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.status !== 'success') {
        if (result.code === 'INVALID_PASSCODE') {
          setIsCloudModalOpen(true);
        }
        notify(result.message || '雲端儲存失敗，請檢查通行碼或權限設定', 'error', 5500);
        return;
      }

      if (typeof result.hasPasscode === 'boolean') {
        setCloudHasPasscode(result.hasPasscode);
      }
      if (result.data) {
        applyCloudSnapshotToState(result.data);
      } else {
        setLastSyncTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
        setHasUnsavedCloudChanges(false);
      }

      setIsCloudModalOpen(false);
      notify('雲端同步完成！賽程表與積分榜分頁已更新。', 'success');
    } catch (err) {
      console.error('Cloud Sync Error:', err);
      notify(
        '同步失敗！請確認 GAS 已重新部署最新版本 (v2.1)，且權限設為「所有人 (Anyone)」。',
        'error',
        5500
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 單場次局部雲端 API 呼叫器 (claim_match_lock / sync_match_progress / finalize_match / release_match_lock)
   */
  const postGranularMatchAction = useCallback(
    async (actionBody) => {
      const cleanUrl = (gasUrl || '').trim();
      if (!cleanUrl) return { offlineOnly: true };

      const response = await fetch(cleanUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          ...actionBody,
          passcode: (passcode || '').trim(),
          deviceId,
          deviceName,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const resJson = await response.json();
      if (typeof resJson.hasPasscode === 'boolean') {
        setCloudHasPasscode(resJson.hasPasscode);
      }
      if (resJson.data) {
        applyCloudSnapshotToState(resJson.data);
      }
      return resJson;
    },
    [gasUrl, passcode, deviceId, deviceName, applyCloudSnapshotToState]
  );

  // 唯讀觀賽模式與紀錄組平板模式：初次進入自動讀取雲端，並支援每 30 秒背景靜默更新 (記分板開啟中暫停背景輪詢避免干擾)
  useEffect(() => {
    if ((isReadOnly || isScorerMode) && initialQuery.queryGasUrl) {
      executeCloudLoad(initialQuery.queryGasUrl);
    }
  }, [isReadOnly, isScorerMode, initialQuery.queryGasUrl, executeCloudLoad]);

  useEffect(() => {
    if ((!isReadOnly && !isScorerMode) || !autoRefresh || !gasUrl || scoreboardMatchId) {
      return undefined;
    }
    const timer = setInterval(() => {
      executeCloudLoad(gasUrl, { silent: true });
    }, 30000);
    return () => clearInterval(timer);
  }, [isReadOnly, isScorerMode, autoRefresh, gasUrl, scoreboardMatchId, executeCloudLoad]);

  // 單場修改「幾戰幾勝 (customBestOf)」設定，確保平板開啟記分板時完整繼承
  const handleUpdateMatchBestOf = useCallback(
    async (matchId, nextBestOf) => {
      if (!activeStage || !matchId) return;
      const cleanBestOf = Number(nextBestOf) || 1;
      setStages((prev) =>
        prev.map((s) =>
          s.id === activeStage.id
            ? {
                ...s,
                matches: s.matches.map((m) =>
                  m.id === matchId ? { ...m, customBestOf: cleanBestOf } : m
                ),
              }
            : s
        )
      );
      setHasUnsavedCloudChanges(true);

      if (gasUrl.trim()) {
        try {
          await postGranularMatchAction({
            action: 'update_match_best_of',
            stageId: activeStage.id,
            matchId,
            customBestOf: cleanBestOf,
          });
        } catch {
          /* ignore background sync error; saved locally */
        }
      }
    },
    [activeStage, gasUrl, postGranularMatchAction]
  );

  // --- 開啟數位記分板與單場鎖定控制 ---
  const launchScoreboardWithLock = useCallback(
    async (targetMatch, { forceTakeover = false, customBestOf = null } = {}) => {
      if (!targetMatch || !activeStage) return;

      const resolvedBestOf = Number(
        customBestOf || targetMatch.customBestOf || activeStage.config.bestOf || 1
      );

      // 若從 ScoreModal 帶入新的幾戰幾勝設定，立即同步寫入該場次
      if (customBestOf && customBestOf !== targetMatch.customBestOf) {
        setStages((prev) =>
          prev.map((s) =>
            s.id === activeStage.id
              ? {
                  ...s,
                  matches: s.matches.map((m) =>
                    m.id === targetMatch.id ? { ...m, customBestOf: resolvedBestOf } : m
                  ),
                }
              : s
          )
        );
      }

      // 本地鎖定檢查
      if (!forceTakeover && isLockedByAnotherDevice(targetMatch, deviceId)) {
        const holder = targetMatch.lockInfo?.deviceName || '其他裝置';
        setConfirmModal({
          isOpen: true,
          title: '場次已由其他設備記分鎖定中',
          message: `此場次目前正由「${holder}」開啟數位記分板。為避免多台設備同時計分互相覆蓋，系統已鎖定保護。若該設備已沒電或斷線，確定要強制接管本場次記分權嗎？`,
          confirmLabel: '強制接管記分板',
          variant: 'warning',
          onConfirm: () =>
            launchScoreboardWithLock(targetMatch, {
              forceTakeover: true,
              customBestOf: resolvedBestOf,
            }),
        });
        return;
      }

      // 若有連線 Google Sheets 雲端，先向雲端申請互斥鎖
      if (gasUrl.trim()) {
        setLoadingMessage(
          forceTakeover ? '正在強制接管場次記分鎖定...' : '正在鎖定本場次並開啟數位記分板...'
        );
        setIsLoading(true);
        try {
          const res = await postGranularMatchAction({
            action: 'claim_match_lock',
            stageId: activeStage.id,
            matchId: targetMatch.id,
            forceTakeover,
          });

          if (res.status === 'error') {
            if (res.code === 'MATCH_LOCKED') {
              const holder = res.lockInfo?.deviceName || '其他場邊平板';
              setSelectedMatch(null);
              setConfirmModal({
                isOpen: true,
                title: '場次已由其他平板鎖定中',
                message: `雲端顯示此場次正由「${holder}」記分中！若該平板發生異常斷線，您可選擇強制接管本場次：`,
                confirmLabel: '強制接管本場次',
                variant: 'warning',
                onConfirm: () =>
                  launchScoreboardWithLock(targetMatch, {
                    forceTakeover: true,
                    customBestOf: resolvedBestOf,
                  }),
              });
              return;
            }
            if (res.code === 'INVALID_PASSCODE') {
              setSelectedMatch(null);
              setIsCloudModalOpen(true);
              notify('請先輸入正確的「寫入通行碼」以鎖定場次並記分！', 'warning', 5000);
              return;
            }
            notify(res.message || '雲端鎖定回應異常，已先開啟本機記分板', 'warning');
          }
        } catch (err) {
          console.error('Claim lock failed:', err);
          if (isScorerMode) {
            notify('無法連線至雲端鎖定場次，請檢查網路連線後重試！', 'error', 5000);
            return;
          }
          notify('目前離線中，已在本機模式開啟數位記分板', 'warning');
        } finally {
          setIsLoading(false);
        }
      } else {
        // 純本機離線模式：寫入本機鎖定資訊與幾戰幾勝設定
        const localLock = createLockInfo(deviceId, deviceName);
        setStages((prev) =>
          prev.map((s) =>
            s.id === activeStage.id
              ? {
                  ...s,
                  matches: s.matches.map((m) =>
                    m.id === targetMatch.id
                      ? { ...m, customBestOf: resolvedBestOf, lockInfo: localLock }
                      : m
                  ),
                }
              : s
          )
        );
      }

      setSelectedMatch(null);
      setScoreboardOverrideBestOf(resolvedBestOf);
      setScoreboardMatchId(targetMatch.id);
    },
    [activeStage, deviceId, deviceName, gasUrl, isScorerMode, notify, postGranularMatchAction]
  );

  // 點擊對戰卡：紀錄組平板直接開啟數位記分板；主辦端開啟快速輸入/記分板雙模選單
  const handleMatchCardClick = useCallback(
    (match) => {
      if (isReadOnly) return;
      if (isScorerMode) {
        launchScoreboardWithLock(match);
        return;
      }
      setSelectedMatch(match);
    },
    [isReadOnly, isScorerMode, launchScoreboardWithLock]
  );

  // 記分板：同步中場各節/各局進度
  const handleSyncScoreboardProgress = useCallback(
    async (progressPayload, { silentToast = false } = {}) => {
      if (!scoreboardMatchId || !activeStage) return;
      const localLock = createLockInfo(deviceId, deviceName);

      // 先即時更新本機畫面
      setStages((prev) =>
        prev.map((s) =>
          s.id === activeStage.id
            ? applyMatchResultToStage(s, scoreboardMatchId, {
                ...progressPayload,
                lockInfo: localLock,
              })
            : s
        )
      );

      if (!gasUrl.trim()) {
        if (!silentToast) {
          notify('目前比分進度已更新至本機賽程表', 'success', 2400);
        }
        return;
      }

      setIsScoreboardSyncing(true);
      try {
        const res = await postGranularMatchAction({
          action: 'sync_match_progress',
          stageId: activeStage.id,
          matchId: scoreboardMatchId,
          progress: progressPayload,
        });
        if (res.status === 'success') {
          if (!silentToast) {
            notify('已將本局/本節即時比分同步至大會雲端！', 'success', 2600);
          }
        } else {
          notify(res.message || '雲端進度同步失敗（本機草稿已安全保留）', 'warning', 4500);
        }
      } catch {
        notify('網路暫時不穩，比分已安全保存在平板本機，稍後完賽再重試即可', 'warning', 4500);
      } finally {
        setIsScoreboardSyncing(false);
      }
    },
    [scoreboardMatchId, activeStage, deviceId, deviceName, gasUrl, notify, postGranularMatchAction]
  );

  // 多戰系列賽 (3戰2勝/5戰3勝/7戰4勝)：儲存本戰結果、釋放場次鎖定並關閉記分板，供下次續戰！
  const handleSaveGameAndExit = useCallback(
    async (matchId, progressPayload) => {
      if (!activeStage) return false;

      setStages((prev) =>
        prev.map((s) =>
          s.id === activeStage.id
            ? applyMatchResultToStage(s, matchId, {
                ...progressPayload,
                lockInfo: null,
              })
            : s
        )
      );

      if (gasUrl.trim()) {
        setIsScoreboardSyncing(true);
        try {
          const res = await postGranularMatchAction({
            action: 'sync_match_progress',
            stageId: activeStage.id,
            matchId,
            releaseLock: true,
            progress: progressPayload,
          });
          if (res.status !== 'success') {
            notify(res.message || '雲端儲存本戰失敗，請重試', 'error', 4800);
            return false;
          }
        } catch {
          if (isScorerMode) {
            notify('網路連線異常，請確認網路後重試儲存本戰！', 'error', 5000);
            return false;
          }
          setHasUnsavedCloudChanges(true);
        } finally {
          setIsScoreboardSyncing(false);
        }
      } else {
        setHasUnsavedCloudChanges(true);
      }

      setScoreboardMatchId(null);
      setScoreboardOverrideBestOf(null);
      notify(
        `已儲存目前系列賽進度 (${progressPayload.scoreA}:${progressPayload.scoreB}) 並解鎖場次！下次點開即可繼續記下一戰。`,
        'success',
        4200
      );
      return true;
    },
    [activeStage, deviceName, gasUrl, isScorerMode, notify, postGranularMatchAction]
  );

  const handleOpenMatchRecord = useCallback((targetMatch = null, liveSbState = null) => {
    setRecordModalState({
      isOpen: true,
      matchId: targetMatch?.id || null,
      liveSbState: liveSbState ? structuredClone(liveSbState) : null,
    });
  }, []);

  // 完賽或快速儲存單場成績 (同時支援數位記分板與 ScoreModal)
  const handleMatchUpdate = useCallback(
    async (matchId, updatePayload) => {
      if (!activeStage) return false;

      const enrichedPayload =
        updatePayload.action === 'clear'
          ? updatePayload
          : {
              ...updatePayload,
              recordMeta: updatePayload.recordMeta || {
                recordedBy: deviceName,
                recordedAt: new Date().toISOString(),
              },
            };

      // 1. 本地樂觀更新
      setStages((prev) =>
        prev.map((s) =>
          s.id === activeStage.id
            ? applyMatchResultToStage(s, matchId, {
                ...enrichedPayload,
                liveMeta: null,
                lockInfo: null,
              })
            : s
        )
      );

      // 2. 若已設定雲端 GAS，優先使用單場局部合併寫入 (finalize_match)，絕不覆蓋其他場地進行中的比賽！
      if (gasUrl.trim()) {
        setIsScoreboardSyncing(true);
        try {
          const res = await postGranularMatchAction({
            action: 'finalize_match',
            stageId: activeStage.id,
            matchId,
            result: enrichedPayload,
          });

          if (res.status === 'success') {
            setScoreboardMatchId(null);
            notify('完賽成績已上傳雲端並更新晉級表！', 'success', 3200);
            return true;
          }

          if (res.code === 'INVALID_PASSCODE') {
            setIsCloudModalOpen(true);
            notify('寫入通行碼不正確，請重新輸入後再上傳完賽！', 'error', 5000);
            return false;
          }

          notify(res.message || '雲端寫入未完成，請重試', 'error', 4800);
          return !isScorerMode;
        } catch (err) {
          console.error('Finalize match sync error:', err);
          if (isScorerMode) {
            notify('上傳失敗！請確認平板網路連線後再次點擊完賽上傳（本機比分已保留）', 'error', 5500);
            return false;
          }
          setHasUnsavedCloudChanges(true);
          setScoreboardMatchId(null);
          notify('雲端暫時無法連線，成績已儲存於本機（請稍後點擊一鍵上傳）', 'warning', 4500);
          return true;
        } finally {
          setIsScoreboardSyncing(false);
        }
      }

      setHasUnsavedCloudChanges(true);
      setScoreboardMatchId(null);
      notify('比賽成績已更新並完成晉級推演', 'success', 2600);
      return true;
    },
    [activeStage, deviceName, gasUrl, isScorerMode, notify, postGranularMatchAction]
  );

  // 釋放場次鎖定並關閉記分板
  const handleReleaseLockAndClose = useCallback(
    async (matchId) => {
      if (!activeStage) return;
      setScoreboardMatchId(null);

      setStages((prev) =>
        prev.map((s) =>
          s.id === activeStage.id
            ? {
                ...s,
                matches: s.matches.map((m) =>
                  m.id === matchId ? { ...m, lockInfo: null } : m
                ),
              }
            : s
        )
      );

      if (gasUrl.trim()) {
        try {
          await postGranularMatchAction({
            action: 'release_match_lock',
            stageId: activeStage.id,
            matchId,
          });
          notify('已釋放本場次記分鎖定', 'info', 2200);
        } catch {
          /* ignore release network failure */
        }
      } else {
        notify('已釋放本場次記分鎖定', 'info', 2200);
      }
    },
    [activeStage, gasUrl, notify, postGranularMatchAction]
  );

  // --- 賽程生成與階段管理 (僅限 Admin 主辦模式) ---
  const handleGenerate = () => {
    if (!isAdminMode) return;
    const generated = generateMatches(
      activeStage.id,
      activeStage.config,
      activeStage.participants
    );
    const updatedParticipants = calculateStats(activeStage.participants, generated);
    updateActiveStage({
      matches: generated,
      participants: updatedParticipants,
      status: 'ACTIVE',
    });
    setViewTab('BRACKET');
    notify(`${activeStage.name} 賽程已產生！點擊任一對戰卡即可開啟記分板或登錄比分。`, 'success');
  };

  const handleRenameTeamInActiveStage = (participantId, newName) => {
    if (!isAdminMode) return;
    setStages((prev) =>
      prev.map((s) =>
        s.id === activeStage.id
          ? renameParticipantInStage(s, participantId, newName)
          : s
      )
    );
    setHasUnsavedCloudChanges(true);
    notify(`隊伍名稱已更新為「${newName}」`, 'success', 2500);
  };

  const createNextStage = (qualifiers) => {
    if (!isAdminMode) return;
    const currentStageIndex = stages.findIndex((s) => s.id === activeStage.id);
    const keptStages = stages.slice(0, currentStageIndex + 1);
    const newId = keptStages.length + 1;

    const newStage = {
      id: newId,
      name: `第 ${newId} 階段 (決賽)`,
      status: 'SETUP',
      config: {
        format: 'SINGLE',
        sport: activeStage.config.sport,
        bestOf: activeStage.config.bestOf,
        hasThirdPlace: qualifiers.length >= 4,
        hasBracketReset: true,
        groupCount: 1,
      },
      participants: qualifiers.map((p, i) => ({
        ...p,
        isSeed: i < 2,
        groupId: 'A',
        stats: createEmptyStats(),
      })),
      matches: [],
    };

    setStages([...keptStages, newStage]);
    setActiveStageId(newId);
    setViewTab('BRACKET');
    setShowPromoModal(false);
    setHasUnsavedCloudChanges(true);
    notify(`已建立「${newStage.name}」，請確認賽制後產生賽程`, 'info');
  };

  return (
    <>
      <div id="app-main-shell" className="min-h-screen flex flex-col font-sans">
      {/* 無障礙跳過導覽連結 */}
      <a
        href="#main-content"
        className="visually-hidden focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:bg-orange-600 focus:text-white focus:rounded-xl focus:font-bold focus:shadow-lg"
      >
        跳至主要賽程內容
      </a>

      {/* 全頁雲端載入遮罩 */}
      {isLoading && (
        <div className="loading-overlay animate-fade-in" role="status" aria-live="polite">
          <div className="spinner mb-4" aria-hidden="true"></div>
          <div className="text-stone-800 font-extrabold text-lg">{loadingMessage}</div>
          <div className="text-stone-600 text-sm mt-1">請稍候，正在與 Google 試算表通訊...</div>
        </div>
      )}

      {/* 右上角非阻斷式 Popover Toast 通知 */}
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      {/* 頂部導覽列 */}
      <header className="bg-white/95 backdrop-blur border-b border-stone-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap justify-between items-center gap-3">
          {/* 左側：賽事標題與身分狀態列 */}
          <div className="flex items-center flex-wrap gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-sm shrink-0"
              aria-hidden="true"
            >
              <i className="fa-solid fa-trophy text-sm"></i>
            </span>

            <h1 className="m-0 flex items-center">
              <InlineEditableText
                value={tournamentTitle}
                disabled={!isAdminMode}
                label="修改賽事總標題"
                onSave={(next) => {
                  setTournamentTitle(next);
                  setHasUnsavedCloudChanges(true);
                }}
                textClassName="text-lg sm:text-xl font-extrabold text-stone-800 truncate max-w-[220px] sm:max-w-xs"
                inputClassName="text-base sm:text-lg font-extrabold px-2.5 py-1 border border-orange-500 rounded-lg bg-white text-stone-800 w-48 sm:w-64"
              />
            </h1>

            {/* 角色專屬狀態列：1. 唯讀觀賽模式 | 2. 紀錄組平板模式 | 3. 主辦管理模式 */}
            {isReadOnly ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1.5">
                  <i className="fa-solid fa-eye" aria-hidden="true"></i>
                  即時觀賽模式 (唯讀)
                </span>
                {gasUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => executeCloudLoad(gasUrl)}
                      className="no-print text-xs font-bold px-3 py-1.5 min-h-[36px] rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors flex items-center gap-1.5"
                    >
                      <i className="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
                      立即更新
                    </button>
                    <label className="no-print text-xs font-bold text-stone-700 flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-stone-100">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="w-4 h-4 accent-orange-600 rounded"
                      />
                      30秒自動更新
                    </label>
                  </>
                )}
                {initialQuery.initialRole !== 'view' && (
                  <button
                    type="button"
                    onClick={() => setUserRole('admin')}
                    className="no-print text-xs font-bold text-stone-600 hover:text-orange-700 underline px-2 py-1"
                  >
                    返回主辦管理
                  </button>
                )}
              </div>
            ) : isScorerMode ? (
              <div className="no-print flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300 flex items-center gap-1.5">
                  <i className="fa-solid fa-tablet-screen-button" aria-hidden="true"></i>
                  紀錄組平板 ({deviceName})
                </span>

                <button
                  type="button"
                  onClick={() => setIsCloudModalOpen(true)}
                  className="text-xs font-bold px-3 py-1.5 min-h-[36px] rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-key" aria-hidden="true"></i>
                  平板名稱 / 通行碼
                </button>

                {gasUrl && (
                  <button
                    type="button"
                    onClick={() => executeCloudLoad(gasUrl)}
                    className="text-xs font-bold px-3 py-1.5 min-h-[36px] rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
                    重新整理賽況
                  </button>
                )}
              </div>
            ) : (
              <div className="no-print flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCloudModalOpen(true)}
                  className={`text-xs font-bold px-3 py-1.5 min-h-[36px] rounded-full flex items-center transition-colors border ${
                    gasUrl
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200'
                  }`}
                >
                  <i
                    className="fa-solid fa-cloud mr-1.5"
                    aria-hidden="true"
                  ></i>
                  {gasUrl ? '雲端與平板派發' : '設定雲端同步'}
                  {gasUrl && hasUnsavedCloudChanges && (
                    <span
                      title="有尚未上傳至雲端的變更"
                      className="ml-1.5 w-2 h-2 rounded-full bg-orange-500 inline-block"
                    ></span>
                  )}
                </button>

                {gasUrl && (
                  <button
                    type="button"
                    onClick={() => executeCloudSync(gasUrl, passcode)}
                    title="快速上傳目前進度至 Google Sheet"
                    className="text-xs font-bold px-3 py-1.5 min-h-[36px] rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors flex items-center gap-1"
                  >
                    <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
                    <span className="hidden md:inline">一鍵上傳</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 右側：階段切換與賽務工具列 */}
          <div className="no-print flex items-center flex-wrap gap-2">
            <nav aria-label="賽事階段切換" className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
              {stages.map((s) => {
                const isActive = activeStage.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      setActiveStageId(s.id);
                      setViewTab('BRACKET');
                    }}
                    className={`px-3 py-1.5 min-h-[34px] text-xs font-extrabold rounded-lg transition-all ${
                      isActive
                        ? 'bg-white text-orange-700 shadow-sm border border-stone-200/80'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </nav>

            {/* 賽程表 / 榮耀榜 視圖切換 & 比賽紀錄單 PDF 匯出入口（紀錄組平板與主辦端皆可使用！） */}
            {activeStage.status === 'ACTIVE' && (
              <>
                <div
                  role="group"
                  aria-label="檢視模式切換"
                  className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200"
                >
                  <button
                    type="button"
                    aria-pressed={viewTab === 'BRACKET'}
                    onClick={() => setViewTab('BRACKET')}
                    className={`px-3 py-1.5 min-h-[34px] text-xs font-extrabold rounded-lg transition-all ${
                      viewTab === 'BRACKET'
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <i className="fa-solid fa-diagram-project mr-1.5" aria-hidden="true"></i>
                    賽程表
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewTab === 'PODIUM'}
                    onClick={() => setViewTab('PODIUM')}
                    className={`px-3 py-1.5 min-h-[34px] text-xs font-extrabold rounded-lg transition-all flex items-center gap-1 ${
                      viewTab === 'PODIUM'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-stone-700 hover:text-amber-800'
                    }`}
                  >
                    <i className="fa-solid fa-medal" aria-hidden="true"></i>
                    榮耀榜
                    {hasChampion && viewTab !== 'PODIUM' && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenMatchRecord(null, null)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-extrabold bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                  title="匯出單場或批次正式比賽紀錄單 PDF（可直接列印簽認）"
                >
                  <i className="fa-solid fa-file-pdf text-orange-600" aria-hidden="true"></i>
                  比賽紀錄 PDF
                </button>
              </>
            )}

            {/* 賽程結構管理工具按鈕群 — 嚴格限制僅 Admin 主辦端可見，紀錄組平板禁止刪改結構！ */}
            {isAdminMode && activeStage.status === 'ACTIVE' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowTeamModal(true)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold bg-white border border-stone-300 text-stone-700 rounded-xl hover:bg-stone-50 transition-colors"
                >
                  <i className="fa-solid fa-user-pen mr-1" aria-hidden="true"></i>
                  改隊名
                </button>

                <button
                  type="button"
                  onClick={() => setShowPromoModal(true)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300 rounded-xl hover:bg-orange-200 transition-colors"
                >
                  <i className="fa-solid fa-stairs mr-1" aria-hidden="true"></i>
                  晉級下一階段
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  aria-label="列印賽程表或匯出 PDF"
                  className="w-9 h-9 flex items-center justify-center bg-white border border-stone-300 text-stone-700 rounded-xl hover:bg-stone-50 transition-colors"
                  title="列印 / 匯出 PDF"
                >
                  <i className="fa-solid fa-print" aria-hidden="true"></i>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setConfirmModal({
                      isOpen: true,
                      title: '重設本階段賽制',
                      message:
                        '確定要返回設定畫面嗎？這將會清空本階段已登錄的比分，並移除此階段之後的所有後續階段。（若只需更正隊伍名稱，請點選「改隊名」按鈕即可保留所有分數！）',
                      confirmLabel: '清空並重新設定',
                      variant: 'danger',
                      onConfirm: resetActiveStageToSetup,
                    })
                  }
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold bg-stone-100 text-stone-700 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                  <i className="fa-solid fa-gear mr-1" aria-hidden="true"></i>
                  重設賽制
                </button>
              </div>
            )}

            {isAdminMode && (stages.length > 1 || activeStage.participants.length > 0) && (
              <button
                type="button"
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    title: '開新賽事確認',
                    message: '確定要清空目前所有階段與名單，建立全新的空白賽事嗎？',
                    confirmLabel: '確定開新賽事',
                    variant: 'danger',
                    onConfirm: resetEntireTournament,
                  })
                }
                aria-label="清空並建立新賽事"
                title="建立全新賽事"
                className="w-9 h-9 flex items-center justify-center bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-700 rounded-xl transition-colors"
              >
                <i className="fa-solid fa-file-circle-plus text-sm" aria-hidden="true"></i>
              </button>
            )}
          </div>
        </div>

        {/* 階段副標題提示列 */}
        {activeStage.status === 'ACTIVE' && (
          <div className="bg-stone-50/90 border-t border-stone-200/80 px-4 sm:px-6 py-1.5">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-stone-500">目前階段：</span>
                <InlineEditableText
                  value={activeStage.name}
                  disabled={!isAdminMode}
                  label="修改階段名稱"
                  onSave={(nextName) => updateActiveStage({ name: nextName })}
                  textClassName="font-extrabold text-stone-800 text-xs"
                  inputClassName="text-xs font-bold px-2 py-0.5 border border-orange-500 rounded bg-white text-stone-800"
                />
                {isScorerMode && (
                  <span className="text-indigo-700 font-bold ml-2">
                    💡 點擊下方任一場次卡片即可開啟「數位記分板」並自動鎖定該場次
                  </span>
                )}
              </div>
              {lastSyncTime && <span>雲端同步：{lastSyncTime}</span>}
            </div>
          </div>
        )}
      </header>

      {/* 主要內容區 */}
      <main id="main-content" className="flex-grow flex flex-col px-3 sm:px-6">
        {activeStage.status === 'SETUP' ? (
          !isAdminMode ? (
            <div className="max-w-lg mx-auto my-20 bg-white p-10 rounded-3xl border border-stone-200 shadow-sm text-center space-y-4">
              <i
                className="fa-solid fa-clock text-4xl text-orange-500"
                aria-hidden="true"
              ></i>
              <h2 className="text-xl font-extrabold text-stone-800">
                主辦單位正在編排本階段賽程
              </h2>
              <p className="text-sm text-stone-600">
                {isScorerMode
                  ? '賽程產生並上傳至雲端後，點擊下方按鈕即可載入對戰表並開始場邊記分。'
                  : '賽程公布並同步至雲端後，畫面將自動更新顯示最新對戰表。'}
              </p>
              {gasUrl && (
                <button
                  type="button"
                  onClick={() => executeCloudLoad(gasUrl)}
                  className="px-5 py-2.5 min-h-[44px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm shadow"
                >
                  <i className="fa-solid fa-arrows-rotate mr-2" aria-hidden="true"></i>
                  重新檢查雲端賽程
                </button>
              )}
            </div>
          ) : (
            <SetupPanel
              isInitial={activeStage.id === 1}
              participants={activeStage.participants}
              setParticipants={(p) => updateActiveStage({ participants: p })}
              config={activeStage.config}
              setConfig={(c) => updateActiveStage({ config: c })}
              onGenerate={handleGenerate}
              onUpdate={updateActiveStage}
              onNotify={notify}
            />
          )
        ) : viewTab === 'PODIUM' ? (
          <ResultsView stage={activeStage} tournamentTitle={tournamentTitle} />
        ) : activeStage.config.format === 'SINGLE' ? (
          <SingleEliminationLayout
            matches={activeStage.matches}
            onMatchClick={handleMatchCardClick}
            config={activeStage.config}
            isReadOnly={isReadOnly}
          />
        ) : activeStage.config.format === 'ROUND_ROBIN' ? (
          <RoundRobinLayout
            matches={activeStage.matches}
            participants={activeStage.participants}
            onMatchClick={handleMatchCardClick}
            config={activeStage.config}
            isReadOnly={isReadOnly}
          />
        ) : (
          <DoubleEliminationLayout
            matches={activeStage.matches}
            onMatchClick={handleMatchCardClick}
            config={activeStage.config}
            isReadOnly={isReadOnly}
          />
        )}
      </main>

      {/* 全域版權與非商業授權聲明頁尾 */}
      <CopyrightFooter />

      {/* 場邊平板全螢幕數位記分板 */}
      <DigitalScoreboardModal
        isOpen={Boolean(scoreboardMatch) && !isReadOnly}
        stageId={activeStage.id}
        match={scoreboardMatch}
        overrideBestOf={scoreboardOverrideBestOf}
        allMatches={activeStage.matches}
        config={activeStage.config}
        deviceName={deviceName}
        hasCloudConnection={Boolean(gasUrl.trim())}
        isSyncing={isScoreboardSyncing}
        onCloseKeepLock={() => {
          setScoreboardMatchId(null);
          setScoreboardOverrideBestOf(null);
        }}
        onReleaseLockAndClose={(mId) => {
          setScoreboardOverrideBestOf(null);
          handleReleaseLockAndClose(mId);
        }}
        onSyncProgress={handleSyncScoreboardProgress}
        onSaveGameAndExit={handleSaveGameAndExit}
        onFinalizeMatch={handleMatchUpdate}
        onUpdateBestOf={handleUpdateMatchBestOf}
        onOpenMatchRecord={handleOpenMatchRecord}
        onNotify={notify}
      />

      {/* 快速總分登錄視窗 (Admin 模式雙入口) */}
      <ScoreModal
        match={liveSelectedMatch}
        allMatches={activeStage.matches}
        isOpen={Boolean(liveSelectedMatch) && isAdminMode}
        onClose={() => setSelectedMatch(null)}
        onSave={handleMatchUpdate}
        onUpdateBestOf={handleUpdateMatchBestOf}
        onOpenMatchRecord={(m) => handleOpenMatchRecord(m, null)}
        onLaunchScoreboard={(m, chosenBestOf) =>
          launchScoreboardWithLock(m, { customBestOf: chosenBestOf })
        }
        onForceTakeover={(m) => launchScoreboardWithLock(m, { forceTakeover: true })}
        config={activeStage.config}
      />

      {/* 正式比賽紀錄單預覽與匯出 PDF／列印對話框 */}
      <MatchRecordModal
        isOpen={recordModalState.isOpen}
        onClose={() =>
          setRecordModalState({ isOpen: false, matchId: null, liveSbState: null })
        }
        stage={activeStage}
        tournamentTitle={tournamentTitle}
        deviceName={deviceName}
        initialMatchId={recordModalState.matchId}
        liveSbState={recordModalState.liveSbState}
        onPreparedRecordsChange={setPreparedPrintRecords}
      />

      <PromotionModal
        isOpen={showPromoModal && isAdminMode}
        onClose={() => setShowPromoModal(false)}
        prevStageParticipants={activeStage.participants}
        onConfirm={createNextStage}
      />

      <TeamManagerModal
        isOpen={showTeamModal && isAdminMode}
        onClose={() => setShowTeamModal(false)}
        participants={activeStage.participants}
        onRenameTeam={handleRenameTeamInActiveStage}
      />

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
      />

      <CloudSetupModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        gasUrl={gasUrl}
        setGasUrl={setGasUrl}
        passcode={passcode}
        setPasscode={setPasscode}
        deviceName={deviceName}
        setDeviceName={setDeviceName}
        isScorerMode={isScorerMode}
        cloudHasPasscode={cloudHasPasscode}
        onSync={executeCloudSync}
        onLoad={handleRequestCloudLoad}
        lastSyncTime={lastSyncTime}
        onNotify={notify}
      />
      </div>

      {/* 獨立於彈窗與捲軸容器之外的 A4 列印根節點（僅於列印比賽紀錄單時顯示） */}
      <MatchRecordPrintRoot records={preparedPrintRecords} />
    </>
  );
};
