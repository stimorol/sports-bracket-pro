import React, { useState } from 'react';
import { ModalDialog } from '../common/ModalDialog';

/**
 * 觀賽者 QR Code 海報與本機防誤觸鎖定視窗 (SpectatorShareModal)
 * - 提供家長／同學手機掃碼即看的唯讀觀賽 QR Code
 * - 提供本機一鍵進入「觀賽防誤觸鎖定模式」（公用電腦或大螢幕展示時防止路人誤改賽程）
 */
export const SpectatorShareModal = ({
  isOpen,
  onClose,
  gasUrl,
  tournamentTitle,
  onEnterLocalSpectatorLock,
  onOpenCloudSetup,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const baseUrl = window.location.origin + window.location.pathname;
  const trimmedGas = (gasUrl || '').trim();
  const spectatorUrl = trimmedGas
    ? `${baseUrl}?gas=${encodeURIComponent(trimmedGas)}&mode=view`
    : `${baseUrl}?mode=view`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(
    spectatorUrl
  )}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(spectatorUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      closedBy="any"
      widthClass="w-full max-w-lg"
    >
      {({ titleId }) => (
        <div className="flex flex-col max-h-[90vh] bg-white">
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-700 to-indigo-700 text-white px-6 py-4 flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-base sm:text-lg font-black flex items-center gap-2">
              <i className="fa-solid fa-qrcode" aria-hidden="true"></i>
              <span>家長／同學觀賽專區（防誤觸唯讀）</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉觀賽分享視窗"
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-5 text-stone-700">
            {/* 方式一：手機掃描 QR Code 遠端觀賽 */}
            <div className="bg-sky-50/70 border-2 border-sky-200 rounded-2xl p-5 text-center space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-600 text-white text-xs font-extrabold">
                <i className="fa-solid fa-mobile-screen" aria-hidden="true"></i>
                方式一：請家長與同學用手機掃描 QR Code 觀賽
              </div>

              <div className="text-sm font-extrabold text-stone-800">
                {tournamentTitle || '體育賽事即時賽況看板'}
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-sky-200 shadow-sm inline-block mx-auto">
                <img
                  src={qrImageUrl}
                  alt="家長與同學唯讀觀賽模式 QR Code"
                  width="220"
                  height="220"
                  className="w-48 h-48 sm:w-52 sm:h-52 object-contain mx-auto"
                />
              </div>

              <p className="text-xs text-stone-600 leading-relaxed max-w-sm mx-auto">
                掃描後自動進入<strong>「100% 唯讀觀賽模式」</strong>：可查看<strong>即時戰況看板</strong>、<strong>各局／各半場比分明細</strong>與<strong>晉級樹狀圖</strong>，完全無法修改或誤觸任何比賽分數！
              </p>

              {!trimmedGas && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 text-xs text-left flex items-start justify-between gap-2">
                  <div>
                    <i className="fa-solid fa-circle-info text-amber-600 mr-1.5" aria-hidden="true"></i>
                    提醒：目前尚未綁定雲端試算表網址，其他人的手機掃碼將無法讀取雲端最新比分。
                  </div>
                  {onOpenCloudSetup && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenCloudSetup();
                      }}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs"
                    >
                      前往綁定雲端
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="url"
                  readOnly
                  aria-label="唯讀觀賽專用網址"
                  value={spectatorUrl}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-sky-200 rounded-xl text-stone-600"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 min-h-[38px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold transition-colors"
                >
                  {copied ? '✓ 已複製連結' : '複製觀賽連結'}
                </button>
              </div>
            </div>

            {/* 方式二：本機直接進入防誤觸觀賽鎖定模式 */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <div className="font-extrabold text-stone-800 text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-lock text-orange-600" aria-hidden="true"></i>
                  <span>方式二：將本機平板／大螢幕切換為「防誤觸觀賽模式」</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  適合將大會電腦或公用平板放在服務台供家長與同學自行點擊查閱；鎖定期間點擊場次卡只會顯示唯讀戰況明細，不會彈出分數修改框。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEnterLocalSpectatorLock?.();
                }}
                className="shrink-0 w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-300 font-extrabold text-xs shadow transition-colors"
              >
                🔒 啟動本機觀賽防誤觸
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-stone-50 px-6 py-3.5 border-t border-stone-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-extrabold transition-colors"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
