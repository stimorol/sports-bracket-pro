import React, { useEffect, useRef } from 'react';

const TOAST_STYLES = {
  success: {
    bg: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    icon: 'fa-circle-check text-emerald-600',
  },
  error: {
    bg: 'bg-red-50 border-red-300 text-red-900',
    icon: 'fa-triangle-exclamation text-red-600',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-300 text-amber-900',
    icon: 'fa-circle-exclamation text-amber-600',
  },
  info: {
    bg: 'bg-stone-800 border-stone-700 text-white',
    icon: 'fa-circle-info text-orange-400',
  },
};

const ToastItem = ({ toast, index, onDismiss }) => {
  const ref = useRef(null);
  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;

  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.showPopover === 'function') {
      try {
        if (!el.matches(':popover-open')) {
          el.showPopover();
        }
      } catch {
        // Ignore if polyfill uses class fallback
        try {
          el.showPopover();
        } catch {
          /* no-op */
        }
      }
    }

    const timer = setTimeout(() => {
      if (el && typeof el.hidePopover === 'function') {
        try {
          el.hidePopover();
        } catch {
          /* no-op */
        }
      }
      onDismiss(toast.id);
    }, toast.duration || 4000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const handleClose = () => {
    const el = ref.current;
    if (el && typeof el.hidePopover === 'function') {
      try {
        el.hidePopover();
      } catch {
        /* no-op */
      }
    }
    onDismiss(toast.id);
  };

  return (
    <div
      ref={ref}
      id={`toast-${toast.id}`}
      {...({ popover: 'manual' })}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      style={{ '--toast-offset': `${index * 68}px` }}
      className="toast-popover z-50 no-print"
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-[280px] max-w-md ${style.bg}`}
      >
        <i className={`fa-solid ${style.icon} text-lg shrink-0`} aria-hidden="true"></i>
        <p className="text-sm font-bold flex-grow leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={handleClose}
          {...({ popovertarget: `toast-${toast.id}`, popovertargetaction: 'hide' })}
          aria-label="關閉通知"
          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-black/5 transition-opacity shrink-0"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
};

export const ToastRegion = ({ toasts, onDismiss }) => {
  return (
    <div className="no-print" aria-label="系統通知區">
      {toasts.map((t, idx) => (
        <ToastItem key={t.id} toast={t} index={idx} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
