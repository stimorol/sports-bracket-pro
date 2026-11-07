import React, { useEffect, useId, useState } from 'react';
import gasSourceCode from '../../../google_apps_script.js?raw';
import { setStoredDeviceName } from '../../utils/deviceLock';
import {
  OFFICIAL_SHEET_TEMPLATE_COPY_URL,
  validateGasWebAppUrl,
} from '../../utils/gasUrlValidator';
import { ModalDialog } from '../common/ModalDialog';

export const CloudSetupModal = ({
  isOpen,
  onClose,
  gasUrl,
  setGasUrl,
  passcode,
  setPasscode,
  deviceName,
  setDeviceName,
  isScorerMode = false,
  cloudHasPasscode,
  onSync,
  onLoad,
  lastSyncTime,
  onNotify,
}) => {
  const formId = useId();
  const [urlInput, setUrlInput] = useState(gasUrl || '');
  const [passInput, setPassInput] = useState(passcode || '');
  const [devNameInput, setDevNameInput] = useState(deviceName || '');
  const [showPasscode, setShowPasscode] = useState(false);

  const [urlWarning, setUrlWarning] = useState(null);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testFeedback, setTestFeedback] = useState(null);
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(gasUrl || '');
      setPassInput(passcode || '');
      setDevNameInput(deviceName || '');
      setUrlWarning(null);
      setTestFeedback(null);
      setCopiedScript(false);
    }
  }, [isOpen, gasUrl, passcode, deviceName]);

  const persistCredentials = () => {
    const cleanUrl = urlInput.trim();
    const cleanPass = passInput.trim();
    const cleanDev = devNameInput.trim() || '紀錄台平板';
    setGasUrl(cleanUrl);
    setPasscode(cleanPass);
    setDeviceName?.(cleanDev);
    setStoredDeviceName(cleanDev);
    localStorage.setItem('tournament_gas_url', cleanUrl);
    localStorage.setItem('tournament_gas_passcode', cleanPass);
    return { cleanUrl, cleanPass, cleanDev };
  };

  // 依循 modern-web-guidance `forms`：於 blur 時驗證網址，於 input 時立即清除錯誤提示
  const handleUrlBlur = () => {
    const check = validateGasWebAppUrl(urlInput);
    setUrlWarning(check.warning);
    if (check.isValid) {
      persistCredentials();
    }
  };

  const handleCopyGasSource = async () => {
    try {
      await navigator.clipboard.writeText(gasSourceCode);
      setCopiedScript(true);
      onNotify?.('已複製最新 Google Apps Script 程式碼 (v2.2)！', 'success');
      setTimeout(() => setCopiedScript(false), 3000);
    } catch {
      onNotify?.('無法自動複製，請從 GitHub 儲存庫複製 google_apps_script.js', 'warning');
    }
  };

  const handleTestConnection = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlWarning('請先貼上部署完成的 Google Apps Script 網頁應用程式網址 (.../exec)。');
      return;
    }

    const check = validateGasWebAppUrl(trimmed);
    if (!check.isValid) {
      setUrlWarning(check.warning);
      setTestFeedback(null);
      return;
    }

    setUrlWarning(null);
    setTestFeedback(null);
    setIsTestingUrl(true);
    persistCredentials();

    try {
      const response = await fetch(trimmed, {
        method: 'GET',
        redirect: 'follow',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      if (json.status === 'empty') {
        setTestFeedback({
          type: 'success',
          text: '連線成功！此試算表目前為全新空白狀態，請點擊下方「上傳賽程結構」即可自動建立資料表與報表分頁。',
        });
      } else if (json.status === 'success') {
        const title = json.data?.tournamentTitle || '既有賽事';
        const passNote = json.hasPasscode ? '（雲端已啟用通行碼保護）' : '';
        setTestFeedback({
          type: 'success',
          text: `連線成功！已偵測到雲端賽事：「${title}」${passNote}。`,
        });
      } else {
        setTestFeedback({
          type: 'error',
          text: json.message || '雲端回傳狀態異常，請確認 GAS 程式碼是否為最新版本。',
        });
      }
    } catch {
      setTestFeedback({
        type: 'error',
        text: '連線失敗！最常見原因為部署時「誰可以存取」未選「所有人 (Anyone)」。請回 Apps Script 點選「部署 ➔ 管理部署作業 ➔ 鉛筆編輯 ➔ 建立新版本」並確認權限為所有人。',
      });
    } finally {
      setIsTestingUrl(false);
    }
  };

  const isUrlValidForSharing =
    Boolean(urlInput.trim()) && validateGasWebAppUrl(urlInput).isValid;

  const baseSharePrefix = isUrlValidForSharing
    ? `${window.location.origin}${window.location.pathname}?gas=${encodeURIComponent(
        urlInput.trim()
      )}`
    : '';

  const scorerShareUrl = baseSharePrefix ? `${baseSharePrefix}&mode=scorer` : '';
  const viewerShareUrl = baseSharePrefix ? `${baseSharePrefix}&mode=view` : '';

  const handleCopyLink = async (targetUrl, label) => {
    if (!targetUrl) return;
    persistCredentials();
    try {
      await navigator.clipboard.writeText(targetUrl);
      onNotify?.(`已複製「${label}」！`, 'success');
    } catch {
      onNotify?.('複製失敗，請手動選取網址複製。', 'warning');
    }
  };

  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} closedBy="any" widthClass="w-full max-w-2xl">
      {({ titleId }) => (
        <div className="flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-700 to-green-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
            <h2 id={titleId} className="text-lg font-extrabold flex items-center">
              <i className="fa-brands fa-google-drive mr-2.5" aria-hidden="true"></i>
              {isScorerMode
                ? '紀錄組平板設定（設備名稱與寫入通行碼）'
                : '雲端同步、試算表範本設定與平板派發'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉雲端設定視窗"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white/90 hover:text-white hover:bg-white/15 transition-colors"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            {/* 首次設定／開新盃賽引導精靈 (依循 modern-web-guidance `content-first-noise-reduction` 使用原生 <details>：未填網址時自動展開，已設定時自動收合不干擾！) */}
            {!isScorerMode && (
              <details
                open={!Boolean(gasUrl?.trim())}
                className="group rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 overflow-hidden"
              >
                <summary className="cursor-pointer list-none px-4 py-3.5 bg-emerald-100/70 hover:bg-emerald-100 flex items-center justify-between gap-2 font-extrabold text-sm text-emerald-950 select-none">
                  <span className="flex items-center gap-2">
                    <i className="fa-solid fa-wand-magic-sparkles text-emerald-700" aria-hidden="true"></i>
                    <span>
                      首次使用或舉辦新比賽？點此查看「3 分鐘建立專屬雲端試算表」引導
                    </span>
                  </span>
                  <i
                    className="fa-solid fa-chevron-down text-xs text-emerald-800 transition-transform group-open:rotate-180 shrink-0"
                    aria-hidden="true"
                  ></i>
                </summary>

                <div className="p-4 space-y-3.5 text-xs sm:text-sm text-stone-700 border-t border-emerald-200/80 bg-white">
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 font-semibold leading-relaxed">
                    💡 <strong>萬用自適應設計：</strong>
                    同一份試算表範本<strong>通吃全部 9 種運動與單淘汰／雙敗淘汰／循環賽</strong>（上傳時系統會自動建立資料表與積分榜，無須手動改欄位）！建議<strong>「每辦一場新盃賽，就建立一份新的試算表副本」</strong>，將各屆成績獨立保存在您的 Google 雲端硬碟。
                  </div>

                  {/* Step 1 */}
                  <div className="rounded-xl border border-stone-200 p-3.5 bg-stone-50/70 space-y-2.5">
                    <div className="font-extrabold text-stone-900 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span>建立您的專屬賽事試算表副本（已預載好 GAS 程式碼，免手動貼上！）</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      <a
                        href={OFFICIAL_SHEET_TEMPLATE_COPY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm inline-flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <i className="fa-solid fa-copy" aria-hidden="true"></i>
                        點此建立「萬用賽事試算表範本」副本
                        <i className="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i>
                      </a>

                      <button
                        type="button"
                        onClick={handleCopyGasSource}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                        title="若您想使用自己的空白試算表，或想手動更新舊試算表的程式碼，可點此複製完整 GAS 原始碼"
                      >
                        <i
                          className={`fa-solid ${copiedScript ? 'fa-check text-emerald-600' : 'fa-code text-stone-500'}`}
                          aria-hidden="true"
                        ></i>
                        {copiedScript ? '已複製 GAS 程式碼！' : '備用：複製最新 GAS 程式碼'}
                      </button>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="rounded-xl border border-stone-200 p-3.5 bg-stone-50/70 space-y-1.5">
                    <div className="font-extrabold text-stone-900 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span>在剛建立的試算表副本中發布「網頁應用程式」</span>
                    </div>
                    <ol className="list-decimal list-inside pl-7 space-y-1 text-xs text-stone-700 leading-relaxed">
                      <li>
                        在試算表上方選單點選 <strong>「擴充功能」➔「Apps Script」</strong>。
                      </li>
                      <li>
                        點選右上角藍色按鈕 <strong>「部署」➔「新增部署作業」</strong>（左上角齒輪類型請確認為<strong>「網頁應用程式」</strong>）。
                      </li>
                      <li>
                        「執行身分」選 <strong className="text-emerald-800">我 (Me)</strong>；「誰可以存取」請務必選 <strong className="text-emerald-800">所有人 (Anyone)</strong>，再點選「部署」。
                      </li>
                      <li className="text-stone-600">
                        首次授權時若出現「Google 尚未驗證此應用程式」，請點左下角 <strong>「進階」➔「前往…(不安全)」➔「允許」</strong>（這是授權給您自己雲端硬碟腳本的正常流程）。
                      </li>
                    </ol>
                  </div>

                  {/* Step 3 */}
                  <div className="rounded-xl border border-stone-200 p-3.5 bg-stone-50/70">
                    <div className="font-extrabold text-stone-900 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center shrink-0">
                        3
                      </span>
                      <span>
                        複製部署產生的「網頁應用程式網址 (<code className="font-mono text-emerald-800">.../exec</code>)」貼入下方，點擊「測試連線」後即可上傳賽程！
                      </span>
                    </div>
                  </div>
                </div>
              </details>
            )}

            {/* 0. 本機設備識別名稱 */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
              <label
                htmlFor={`${formId}-device-name`}
                className="block text-sm font-bold text-stone-800 mb-1.5 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-tablet-screen-button text-orange-600" aria-hidden="true"></i>
                本裝置識別名稱（開啟記分板鎖定場次時顯示給其他設備）
              </label>
              <input
                id={`${formId}-device-name`}
                name="deviceName"
                type="text"
                placeholder="例如：1號場平板、中央紀錄台、A場地裁判"
                value={devNameInput}
                onChange={(e) => setDevNameInput(e.target.value)}
                onBlur={persistCredentials}
                className="w-full min-h-[44px] px-3.5 py-2 border border-stone-300 rounded-xl text-base sm:text-sm font-bold bg-white text-stone-800"
              />
            </div>

            {/* 1. GAS URL + 智慧防呆驗證 + 測試連線按鈕 */}
            {!isScorerMode && (
              <div>
                <label
                  htmlFor={`${formId}-gas-url`}
                  className="block text-sm font-bold text-stone-700 mb-1.5"
                >
                  Google Apps Script 網頁應用程式網址 (Web App URL)
                </label>
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                  <input
                    id={`${formId}-gas-url`}
                    name="gasUrl"
                    type="url"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (urlWarning) setUrlWarning(null);
                      if (testFeedback) setTestFeedback(null);
                    }}
                    onBlur={handleUrlBlur}
                    aria-invalid={Boolean(urlWarning)}
                    aria-describedby={`${formId}-gas-hint`}
                    className={`flex-grow min-w-[220px] min-h-[48px] px-3.5 py-2.5 border rounded-xl text-base sm:text-sm font-mono text-stone-700 bg-stone-50 focus:bg-white ${
                      urlWarning ? 'border-red-400 bg-red-50/40' : 'border-stone-300'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={isTestingUrl}
                    onClick={handleTestConnection}
                    className="px-3.5 min-h-[48px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-extrabold text-xs sm:text-sm transition-colors shrink-0 flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <i
                      className={`fa-solid ${isTestingUrl ? 'fa-spinner fa-spin' : 'fa-plug-circle-check'}`}
                      aria-hidden="true"
                    ></i>
                    {isTestingUrl ? '測試中...' : '測試連線'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const check = validateGasWebAppUrl(urlInput);
                      if (!check.isValid) {
                        setUrlWarning(check.warning);
                        return;
                      }
                      persistCredentials();
                      onNotify?.('雲端與設備設定已儲存於本機', 'success');
                    }}
                    aria-label="儲存雲端網址設定"
                    className="px-3.5 min-h-[48px] bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs sm:text-sm transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                    儲存
                  </button>
                </div>

                {/* 網址誤貼即時防呆警告 */}
                {urlWarning && (
                  <div
                    role="alert"
                    className="mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-bold flex items-start gap-2 leading-relaxed"
                  >
                    <i className="fa-solid fa-triangle-exclamation text-red-600 mt-0.5 shrink-0" aria-hidden="true"></i>
                    <span>{urlWarning}</span>
                  </div>
                )}

                {/* 連線測試結果回饋 */}
                {testFeedback && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`mt-2 p-3 rounded-xl border text-xs font-bold flex items-start gap-2 leading-relaxed ${
                      testFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <i
                      className={`fa-solid ${
                        testFeedback.type === 'success'
                          ? 'fa-circle-check text-emerald-600'
                          : 'fa-circle-xmark text-red-600'
                      } mt-0.5 shrink-0`}
                      aria-hidden="true"
                    ></i>
                    <span>{testFeedback.text}</span>
                  </div>
                )}

                <p
                  id={`${formId}-gas-hint`}
                  className="mt-1.5 text-xs text-stone-600 flex items-start gap-1.5"
                >
                  <i className="fa-solid fa-circle-info text-blue-600 mt-0.5" aria-hidden="true"></i>
                  <span>
                    請貼上以 <code className="font-mono font-bold">https://script.google.com/macros/s/.../exec</code> 結尾的網址；執行身分選「<strong>我 (Me)</strong>」，存取權限選「<strong>所有人 (Anyone)</strong>」。
                  </span>
                </p>
              </div>
            )}

            {/* 2. 簡易寫入通行碼保護 */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor={`${formId}-passcode`}
                  className="text-sm font-bold text-stone-800 flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-shield-halved text-amber-600" aria-hidden="true"></i>
                  {isScorerMode ? '輸入主辦單位提供的寫入通行碼' : '寫入通行碼保護（選填）'}
                </label>
                {cloudHasPasscode && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    雲端已啟用通行碼
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  id={`${formId}-passcode`}
                  name="passcode"
                  type={showPasscode ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={
                    isScorerMode
                      ? '若主辦單位有設定通行碼請在此輸入'
                      : '設定或輸入裁判寫入通行碼（留空代表不設密碼）'
                  }
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  onBlur={persistCredentials}
                  aria-describedby={`${formId}-pass-hint`}
                  className="w-full min-h-[44px] pl-3.5 pr-20 py-2 border border-stone-300 rounded-xl text-base sm:text-sm bg-white text-stone-800"
                />
                <button
                  type="button"
                  aria-pressed={showPasscode}
                  aria-label={showPasscode ? '隱藏通行碼' : '顯示通行碼'}
                  onClick={() => setShowPasscode((v) => !v)}
                  className="absolute right-2 px-2.5 py-1 text-xs font-bold text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100"
                >
                  <i
                    className={`fa-solid ${showPasscode ? 'fa-eye-slash' : 'fa-eye'} mr-1`}
                    aria-hidden="true"
                  ></i>
                  {showPasscode ? '隱藏' : '顯示'}
                </button>
              </div>
              <p id={`${formId}-pass-hint`} className="mt-1.5 text-xs text-stone-600 leading-relaxed">
                {isScorerMode
                  ? '輸入正確通行碼後，平板即可鎖定場次並將記分板分數直接回傳至大會雲端。'
                  : '首次上傳填入通行碼即自動鎖定雲端寫入權限；紀錄組平板需輸入相同通行碼才能回傳成績。'}
              </p>
            </div>

            {/* 3. 雲端上傳 / 下載操作 */}
            {isScorerMode ? (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const { cleanUrl } = persistCredentials();
                    onNotify?.('平板設定已儲存', 'success');
                    if (cleanUrl) onLoad(cleanUrl);
                    onClose();
                  }}
                  className="px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow"
                >
                  儲存設定並載入最新賽程
                </button>
              </div>
            ) : (
              <>
                <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                  <div className="text-xs font-bold text-stone-600 uppercase tracking-wider mb-3">
                    大會主控台同步操作
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!urlInput.trim()) {
                          setUrlWarning(
                            '請先完成上方「3 分鐘建立專屬雲端試算表」並貼上網頁應用程式網址 (.../exec) 後再上傳！'
                          );
                          document.getElementById(`${formId}-gas-url`)?.focus();
                          return;
                        }
                        const check = validateGasWebAppUrl(urlInput);
                        if (!check.isValid) {
                          setUrlWarning(check.warning);
                          document.getElementById(`${formId}-gas-url`)?.focus();
                          return;
                        }
                        const { cleanUrl, cleanPass } = persistCredentials();
                        onSync(cleanUrl, cleanPass);
                      }}
                      className="flex items-center gap-3 p-4 bg-white border-2 border-emerald-200 hover:border-emerald-600 hover:bg-emerald-50/60 rounded-xl transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-cloud-arrow-up text-lg" aria-hidden="true"></i>
                      </div>
                      <div>
                        <div className="font-extrabold text-stone-800 text-sm">上傳賽程結構</div>
                        <div className="text-xs text-stone-600 mt-0.5">自動建立資料表並輸出報表</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!urlInput.trim()) {
                          setUrlWarning(
                            '請先貼上既有的 Google Apps Script 網頁應用程式網址 (.../exec) 後再載入賽況！'
                          );
                          document.getElementById(`${formId}-gas-url`)?.focus();
                          return;
                        }
                        const check = validateGasWebAppUrl(urlInput);
                        if (!check.isValid) {
                          setUrlWarning(check.warning);
                          document.getElementById(`${formId}-gas-url`)?.focus();
                          return;
                        }
                        const { cleanUrl } = persistCredentials();
                        onLoad(cleanUrl);
                      }}
                      className="flex items-center gap-3 p-4 bg-white border-2 border-blue-200 hover:border-blue-600 hover:bg-blue-50/60 rounded-xl transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-cloud-arrow-down text-lg" aria-hidden="true"></i>
                      </div>
                      <div>
                        <div className="font-extrabold text-stone-800 text-sm">從雲端載入賽況</div>
                        <div className="text-xs text-stone-600 mt-0.5">讀取各場地最新回傳成績</div>
                      </div>
                    </button>
                  </div>
                  {lastSyncTime && (
                    <div className="text-center text-xs font-medium text-stone-600 mt-3">
                      上次雲端同步時間：{lastSyncTime}
                    </div>
                  )}
                </div>

                {/* 4. 派發專用連結：僅於網址格式正確時展示，避免誤發錯誤連結 */}
                {isUrlValidForSharing && (
                  <div className="space-y-3">
                    {/* 紀錄組平板專屬連結 */}
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2">
                      <div className="text-sm font-bold text-stone-800 flex items-center gap-2">
                        <i className="fa-solid fa-tablet-screen-button text-indigo-600" aria-hidden="true"></i>
                        紀錄組平板專屬連結（僅限開啟數位記分板與匯出 PDF，禁止刪改賽程結構）
                      </div>
                      <p className="text-xs text-stone-600">
                        提供給各場地紀錄員平板開啟：點擊對戰卡即直接進入全螢幕「數位記分板」並自動鎖定該場次，隱藏重設賽制、改隊名與開新賽事等危險按鈕：
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          aria-label="紀錄組平板專屬連結"
                          value={scorerShareUrl}
                          onFocus={(e) => e.target.select()}
                          className="flex-grow px-3 py-2 text-xs font-mono bg-white border border-indigo-200 rounded-lg text-stone-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyLink(scorerShareUrl, '紀錄組平板專屬連結')}
                          className="px-3.5 py-2 min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shrink-0 transition-colors"
                        >
                          <i className="fa-regular fa-copy mr-1.5" aria-hidden="true"></i>
                          複製平板連結
                        </button>
                      </div>
                    </div>

                    {/* 選手/觀眾唯讀觀賽連結 */}
                    <div className="bg-orange-50/60 border border-orange-200 rounded-xl p-4 space-y-2">
                      <div className="text-sm font-bold text-stone-800 flex items-center gap-2">
                        <i className="fa-solid fa-share-nodes text-orange-600" aria-hidden="true"></i>
                        選手 / 觀眾唯讀即時觀賽連結
                      </div>
                      <p className="text-xs text-stone-600">
                        開啟此連結者僅能瀏覽即時賽程、進行中場次比分與榮耀榜（支援 30 秒自動更新），無法修改分數：
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          aria-label="選手與觀眾唯讀觀賽分享網址"
                          value={viewerShareUrl}
                          onFocus={(e) => e.target.select()}
                          className="flex-grow px-3 py-2 text-xs font-mono bg-white border border-orange-200 rounded-lg text-stone-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyLink(viewerShareUrl, '選手/觀眾唯讀觀賽連結')}
                          className="px-3.5 py-2 min-h-[40px] bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shrink-0 transition-colors"
                        >
                          <i className="fa-regular fa-copy mr-1.5" aria-hidden="true"></i>
                          複製觀賽連結
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
