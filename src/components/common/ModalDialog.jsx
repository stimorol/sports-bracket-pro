import React, { useEffect, useId, useRef } from 'react';

/**
 * 原生 <dialog> 封裝元件
 * 依循 modern-web-guidance `dialog` 規範：
 * - 使用 showModal() 開啟，瀏覽器自動處理 Top Layer、背景 inert、焦點鎖定、Esc 關閉與關閉後焦點歸還
 * - 不手動加入 role="dialog"、aria-modal、手動 focus trap 或 Esc 監聽
 * - 針對不支援 closedby="any" 的瀏覽器提供座標點擊外部關閉 (Light Dismiss) 降級備援
 */
export const ModalDialog = ({
  isOpen,
  onClose,
  titleId: externalTitleId,
  closedBy = 'any',
  widthClass = 'w-full max-w-lg',
  surfaceClass = 'bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[88vh]',
  children,
}) => {
  const dialogRef = useRef(null);
  const generatedId = useId();
  const titleId = externalTitleId || `dialog-title-${generatedId}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // 處理原生 close 事件同步 React 狀態，並清除 returnValue 防止殘留
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      dialog.returnValue = '';
      if (isOpen) {
        onClose?.();
      }
    };

    dialog.addEventListener('close', handleNativeClose);
    return () => dialog.removeEventListener('close', handleNativeClose);
  }, [isOpen, onClose]);

  // 針對不支援 <dialog closedby="any"> 的瀏覽器提供精準指標座標點擊外部關閉備援
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || closedBy !== 'any') return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const onPointerDown = (e) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [closedBy]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={`${widthClass} rounded-2xl shadow-2xl overflow-hidden`}
      {...({ closedby: closedBy })}
    >
      {isOpen && (
        <div className={surfaceClass}>
          {typeof children === 'function' ? children({ titleId }) : children}
        </div>
      )}
    </dialog>
  );
};
