import React from 'react';
import { ModalDialog } from '../common/ModalDialog';

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = '確認操作',
  message,
  confirmLabel = '確定執行',
  variant = 'danger',
}) => {
  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} closedBy="closerequest" widthClass="w-full max-w-md">
      {({ titleId }) => (
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-extrabold text-stone-800 mb-3 flex items-center">
            <i
              className={`fa-solid ${
                variant === 'danger'
                  ? 'fa-triangle-exclamation text-red-600'
                  : 'fa-circle-exclamation text-orange-600'
              } mr-2.5`}
              aria-hidden="true"
            ></i>
            {title}
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed mb-6">{message}</p>
          <div className="flex justify-end gap-3">
            {/* 依循 modern-web-guidance `dialog`：破壞性確認對話框預設將焦點放在安全的「取消」按鈕 */}
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors min-h-[44px]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-5 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm transition-colors min-h-[44px] ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
