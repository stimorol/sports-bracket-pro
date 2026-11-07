import React, { useEffect, useId, useState } from 'react';
import { setStoredDeviceName } from '../../utils/deviceLock';
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

  useEffect(() => {
    if (isOpen) {
      setUrlInput(gasUrl || '');
      setPassInput(passcode || '');
      setDevNameInput(deviceName || '');
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

  const baseSharePrefix = urlInput.trim()
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
    <ModalDialog isOpen={isOpen} onClose={onClose} closedBy="any" widthClass="w-full max-w-xl">
      {({ titleId }) => (
        <div className="flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-700 to-green-600 px-6 py-4 text-white flex justify-between items-center">
            <h2 id={titleId} className="text-lg font-extrabold flex items-center">
              <i className="fa-brands fa-google-drive mr-2.5" aria-hidden="true"></i>
              {isScorerMode
                ? '紀錄組平板設定（設備名稱與寫入通行碼）'
                : '雲端同步、平板派發與觀賽分享'}
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
          <div className="p-6 overflow-y-auto space-y-5">
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
                className="w-full min-h-[42px] px-3.5 py-2 border border-stone-300 rounded-xl text-sm font-bold bg-white text-stone-800"
              />
            </div>

            {/* 1. GAS URL (紀錄組平板模式若已由網址帶入可唯讀檢視或微調) */}
            {!isScorerMode && (
              <div>
                <label
                  htmlFor={`${formId}-gas-url`}
                  className="block text-sm font-bold text-stone-700 mb-1.5"
                >
                  Google Apps Script 網頁應用程式網址 (Web App URL)
                </label>
                <div className="flex gap-2">
                  <input
                    id={`${formId}-gas-url`}
                    name="gasUrl"
                    type="url"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onBlur={persistCredentials}
                    aria-describedby={`${formId}-gas-hint`}
                    className="flex-grow min-h-[44px] px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm font-mono text-stone-700 bg-stone-50 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      persistCredentials();
                      onNotify?.('雲端與設備設定已儲存於本機', 'success');
                    }}
                    aria-label="儲存雲端網址設定"
                    className="px-4 min-h-[44px] bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-sm transition-colors shrink-0"
                  >
                    <i className="fa-solid fa-floppy-disk mr-1.5" aria-hidden="true"></i>
                    儲存
                  </button>
                </div>
                <p
                  id={`${formId}-gas-hint`}
                  className="mt-1.5 text-xs text-stone-600 flex items-start gap-1.5"
                >
                  <i className="fa-solid fa-circle-info text-blue-600 mt-0.5" aria-hidden="true"></i>
                  <span>
                    部署 Google Apps Script (v2.1) 時，執行身分請選「<strong>我 (Me)</strong>」，存取權限請選「<strong>所有人 (Anyone)</strong>」。
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
                  className="w-full min-h-[44px] pl-3.5 pr-20 py-2 border border-stone-300 rounded-xl text-sm bg-white text-stone-800"
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

            {/* 3. 雲端上傳 / 下載操作 (主辦模式顯示完整上傳下載；紀錄組模式顯示儲存並同步最新賽程) */}
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
                      disabled={!urlInput.trim()}
                      onClick={() => {
                        const { cleanUrl, cleanPass } = persistCredentials();
                        onSync(cleanUrl, cleanPass);
                      }}
                      className="flex items-center gap-3 p-4 bg-white border-2 border-emerald-200 hover:border-emerald-600 hover:bg-emerald-50/60 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-cloud-arrow-up text-lg" aria-hidden="true"></i>
                      </div>
                      <div>
                        <div className="font-extrabold text-stone-800 text-sm">上傳賽程結構</div>
                        <div className="text-xs text-stone-600 mt-0.5">儲存並輸出試算表報表</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={!urlInput.trim()}
                      onClick={() => {
                        const { cleanUrl } = persistCredentials();
                        onLoad(cleanUrl);
                      }}
                      className="flex items-center gap-3 p-4 bg-white border-2 border-blue-200 hover:border-blue-600 hover:bg-blue-50/60 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
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

                {/* 4. 派發專用連結：紀錄組平板專屬連結 + 觀眾唯讀連結 */}
                {urlInput.trim() && (
                  <div className="space-y-3">
                    {/* 紀錄組平板專屬連結 */}
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2">
                      <div className="text-sm font-bold text-stone-800 flex items-center gap-2">
                        <i className="fa-solid fa-tablet-screen-button text-indigo-600" aria-hidden="true"></i>
                        紀錄組平板專屬連結（僅限開啟數位記分板，禁止刪改賽程結構）
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
