import React, { useRef, useState } from 'react';

/**
 * 2D 自由平移與縮放畫布容器
 * 依循 modern-web-guidance `2d-panning`：
 * - CSS 設定 `scroll-axis-lock: none` 與 `overscroll-behavior: contain`
 * - 以真實 `scrollLeft` / `scrollTop` 進行指標抓握平移（不使用 CSS transform 平移，保留原生捲軸、邊界限制與方向鍵捲動）
 * - 提供 `tabIndex={0}`、`role="region"`、`aria-label` 讓純鍵盤使用者可用方向鍵平移畫布
 */
export const PanZoomViewport = ({ children, label = '賽程樹狀圖畫布' }) => {
  const viewportRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef(null);

  const handlePointerDown = (e) => {
    // 僅針對滑鼠主要按鍵啟動抓握拖曳；觸控螢幕保留原生慣性滾動與雙指縮放
    if (e.pointerType === 'touch' || !e.isPrimary || e.button !== 0) return;

    // 若點擊在對戰卡按鈕或其他互動元素上，不攔截點擊事件，除非拖拉超過閾值
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const clickedScrollbar =
      e.clientX - rect.left - viewport.clientLeft >= viewport.clientWidth ||
      e.clientY - rect.top - viewport.clientTop >= viewport.clientHeight;
    if (clickedScrollbar) return;

    const isInteractiveTarget = Boolean(
      e.target.closest('button, a, input, select, textarea')
    );

    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      isInteractiveTarget,
      captured: false,
    };
  };

  const handlePointerMove = (e) => {
    const state = dragStateRef.current;
    const viewport = viewportRef.current;
    if (!state || !viewport || e.pointerId !== state.pointerId) return;

    const totalDx = Math.abs(e.clientX - state.startX);
    const totalDy = Math.abs(e.clientY - state.startY);

    if (!state.captured) {
      // 超過 5px 移動距離才進入抓握平移模式，確保一般點擊按鈕不受干擾
      if (totalDx < 5 && totalDy < 5) return;
      state.captured = true;
      setIsDragging(true);
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    e.preventDefault();
    viewport.scrollLeft -= e.clientX - state.lastX;
    viewport.scrollTop -= e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  };

  const endDrag = (e) => {
    const state = dragStateRef.current;
    if (!state) return;
    if (state.captured) {
      setIsDragging(false);
      // 若剛結束拖曳，阻止緊隨其後的誤觸 click
      const suppressClick = (clickEvent) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };
      window.addEventListener('click', suppressClick, { capture: true, once: true });
      setTimeout(() => {
        window.removeEventListener('click', suppressClick, { capture: true });
      }, 50);
    }
    dragStateRef.current = null;
  };

  const adjustZoom = (delta) => {
    setZoom((prev) => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.min(1.4, Math.max(0.55, next));
    });
  };

  const centerCanvas = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const targetLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTo({ left: targetLeft, top: 0, behavior: 'smooth' });
  };

  return (
    <div className="relative flex-grow flex flex-col min-h-0">
      <div
        ref={viewportRef}
        tabIndex={0}
        role="region"
        aria-label={label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`pan-viewport flex-grow w-full ${
          isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
      >
        <div
          className="min-w-max min-h-full flex items-center justify-center"
          style={{ zoom }}
        >
          {children}
        </div>
      </div>

      {/* 右下角懸浮縮放與置中工具列 */}
      <div
        className="no-print fixed bottom-5 right-5 z-30 flex items-center gap-1 bg-white/95 backdrop-blur border border-stone-300 shadow-lg rounded-xl p-1.5"
        role="toolbar"
        aria-label="畫布縮放與置中控制"
      >
        <button
          type="button"
          onClick={() => adjustZoom(-0.15)}
          disabled={zoom <= 0.55}
          aria-label="縮小賽程圖"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-700 hover:bg-stone-100 disabled:opacity-40 transition-colors"
        >
          <i className="fa-solid fa-magnifying-glass-minus text-sm" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label="重設縮放比例為 100%"
          className="px-2.5 h-9 rounded-lg text-xs font-mono font-bold text-stone-700 hover:bg-stone-100 transition-colors"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => adjustZoom(0.15)}
          disabled={zoom >= 1.4}
          aria-label="放大賽程圖"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-700 hover:bg-stone-100 disabled:opacity-40 transition-colors"
        >
          <i className="fa-solid fa-magnifying-glass-plus text-sm" aria-hidden="true"></i>
        </button>
        <div className="w-px h-5 bg-stone-200 mx-0.5" aria-hidden="true"></div>
        <button
          type="button"
          onClick={centerCanvas}
          aria-label="水平置中賽程圖"
          className="px-2.5 h-9 rounded-lg text-xs font-bold text-stone-700 hover:bg-stone-100 transition-colors flex items-center gap-1"
        >
          <i className="fa-solid fa-arrows-to-dot" aria-hidden="true"></i>
          <span className="hidden sm:inline">置中</span>
        </button>
      </div>
    </div>
  );
};
