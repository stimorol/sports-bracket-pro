import React, { useState } from 'react';
import { ModalDialog } from './ModalDialog';

export const GITHUB_REPO_URL = 'https://github.com/stimorol/sports-bracket-pro';

/**
 * 應用程式全域版權頁尾與非商業授權聲明對話框
 * © 2026 Hao. GEG TAIWAN. All Rights Reserved.
 */
export const CopyrightFooter = () => {
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);

  return (
    <>
      <footer className="no-print mt-auto border-t border-stone-200/80 bg-white/80 backdrop-blur-sm px-4 py-3 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-extrabold text-stone-700">
              © 2026 Hao. GEG TAIWAN. All Rights Reserved.
            </span>
            <span className="hidden sm:inline text-stone-300" aria-hidden="true">
              |
            </span>
            <span>免費供學校與民間賽事非商業使用（嚴禁商業販售）</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsLicenseOpen(true)}
              className="font-bold text-stone-600 hover:text-orange-700 underline underline-offset-2 transition-colors"
            >
              版權與授權條款
            </button>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-stone-600 hover:text-stone-950 flex items-center gap-1 transition-colors"
            >
              <i className="fa-brands fa-github text-sm" aria-hidden="true"></i>
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </footer>

      <ModalDialog
        isOpen={isLicenseOpen}
        onClose={() => setIsLicenseOpen(false)}
        closedBy="any"
        widthClass="w-full max-w-lg"
      >
        {({ titleId }) => (
          <div className="flex flex-col max-h-[85vh]">
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                  <i className="fa-solid fa-scale-balanced text-sm" aria-hidden="true"></i>
                </span>
                <h2 id={titleId} className="text-base sm:text-lg font-extrabold text-stone-800">
                  版權與非商業授權聲明
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsLicenseOpen(false)}
                aria-label="關閉版權聲明視窗"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-200/60"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-stone-700 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-extrabold text-center">
                © 2026 Hao. GEG TAIWAN. All Rights Reserved.
              </div>

              <div className="space-y-2.5">
                <p>
                  <strong className="text-stone-900">1. 免費非商業賽事與教學使用：</strong>
                  本系統免費授權予各級學校、體育教師、學生社團及民間非營利體育賽事活動自由使用、部署與分享。
                </p>
                <p>
                  <strong className="text-stone-900">2. 姓名標示與版權保留：</strong>
                  任何公開部署、複製或衍生修改之版本，均須完整保留應用程式頁尾、匯出紀錄單與原始碼中之「
                  <code className="font-mono font-bold text-stone-900">
                    © 2026 Hao. GEG TAIWAN. All Rights Reserved.
                  </code>
                  」版權聲明，不得移除或遮蔽原作者署名。
                </p>
                <p>
                  <strong className="text-stone-900">3. 禁止商業販售：</strong>
                  未經著作權人（Hao. GEG TAIWAN）事前書面授權，嚴禁將本軟體或其修改版本用於商業販售、付費租賃、商業標案交付或任何營利行為。
                </p>
              </div>

              <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
                <span>專案開源分享與版本控管：</span>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-orange-700 hover:underline flex items-center gap-1"
                >
                  <i className="fa-brands fa-github" aria-hidden="true"></i>
                  stimorol/sports-bracket-pro
                </a>
              </div>
            </div>

            <div className="bg-stone-50 px-6 py-3.5 border-t border-stone-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsLicenseOpen(false)}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs sm:text-sm font-bold transition-colors"
              >
                我瞭解了
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </>
  );
};
