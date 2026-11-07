/**
 * 官方萬用賽事雲端試算表母版連結（自動觸發 Google Drive「建立副本」，內建 GAS 程式碼）
 */
export const OFFICIAL_SHEET_TEMPLATE_COPY_URL =
  'https://docs.google.com/spreadsheets/d/1FzM6Sy4cFkzWfKahzxes5gtv4ZzSACoFutu3uCeYosI/copy';

/**
 * 檢查使用者貼上的 Google Apps Script Web App 網址是否正確，並針對常見誤貼情境給出明確中文指引
 * @param {string} rawUrl
 * @returns {{ isValid: boolean, warning: string | null }}
 */
export const validateGasWebAppUrl = (rawUrl) => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { isValid: true, warning: null };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      warning:
        '網址格式不正確！請貼上以 https://script.google.com/macros/s/.../exec 開頭與結尾的完整網址。',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      isValid: false,
      warning: '安全性檢查未通過：Google Apps Script 網址必須以 https:// 開頭。',
    };
  }

  // 常見誤貼 1：直接複製了 Google 試算表本身的網址
  if (parsed.hostname.includes('docs.google.com') && parsed.pathname.includes('/spreadsheets/')) {
    return {
      isValid: false,
      warning:
        '您貼上的是「Google 試算表網址」而非 Apps Script 部署網址！請在試算表上方點選「擴充功能 ➔ Apps Script ➔ 右上角部署 ➔ 新增部署作業」，複製以 /exec 結尾的網頁應用程式網址。',
    };
  }

  // 常見誤貼 2：複製了 Apps Script 程式碼編輯器網址 (/home/projects/.../edit)
  if (
    parsed.hostname === 'script.google.com' &&
    (parsed.pathname.includes('/home/') || parsed.pathname.endsWith('/edit'))
  ) {
    return {
      isValid: false,
      warning:
        '您貼上的是「Apps Script 編輯器網址」！請點選編輯器右上角藍色「部署 ➔ 新增部署作業」，複製部署完成後產生的「網頁應用程式網址 (.../exec)」。',
    };
  }

  // 常見誤貼 3：複製了 /dev 測試部署網址（其他裝置與平板無法存取 /dev）
  if (parsed.hostname === 'script.google.com' && parsed.pathname.endsWith('/dev')) {
    return {
      isValid: false,
      warning:
        '您貼上的是「測試部署網址 (/dev)」，其他場地平板與觀眾手機將無法連線！請點選「部署 ➔ 新增部署作業」，改用正式產生的「/exec」結尾網址。',
    };
  }

  // 標準 GAS Web App URL 結構：https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec (或 Google Workspace 網域 /a/macros/...)
  const isStandardExec =
    parsed.hostname === 'script.google.com' &&
    parsed.pathname.includes('/macros/') &&
    parsed.pathname.endsWith('/exec');

  if (!isStandardExec) {
    return {
      isValid: false,
      warning:
        '此網址看起來不是標準的 Google Apps Script 網頁應用程式網址（應為 https://script.google.com/macros/s/.../exec）。請確認是否複製正確。',
    };
  }

  return { isValid: true, warning: null };
};
