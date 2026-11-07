import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// 依循 modern-web-guidance `persistent-toast-notifications` 規範：
// 僅在瀏覽器缺乏原生 Popover 支援時才按需動態載入 @oddbird/popover-polyfill
if (typeof HTMLElement !== 'undefined' && !('popover' in HTMLElement.prototype)) {
  import('@oddbird/popover-polyfill');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
