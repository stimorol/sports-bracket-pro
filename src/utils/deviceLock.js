import { generateUUID } from './tournamentEngine.js';

const DEVICE_ID_KEY = 'tournament_device_id';
const DEVICE_NAME_KEY = 'tournament_device_name';

export const LOCK_LEASE_MS = 12 * 60 * 1000; // 12 分鐘租約自動過期防死鎖

export const getOrCreateDeviceId = () => {
  if (typeof localStorage === 'undefined') return 'DEV-SERVER';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `DEV-${generateUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

export const getStoredDeviceName = () => {
  if (typeof localStorage === 'undefined') return '紀錄台設備';
  const saved = localStorage.getItem(DEVICE_NAME_KEY);
  if (saved && saved.trim()) return saved.trim();
  const id = getOrCreateDeviceId();
  return `紀錄台平板 #${id.slice(-4).toUpperCase()}`;
};

export const setStoredDeviceName = (name) => {
  if (typeof localStorage === 'undefined') return;
  const clean = String(name || '').trim();
  if (clean) {
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  }
};

/**
 * 檢查場次是否仍處於有效鎖定租約內
 */
export const isLockActive = (lockInfo, nowMs = Date.now()) => {
  if (!lockInfo || !lockInfo.deviceId) return false;
  if (!lockInfo.expiresAt) return true;
  return Number(lockInfo.expiresAt) > nowMs;
};

/**
 * 檢查場次是否被「其他設備」有效鎖定中
 */
export const isLockedByAnotherDevice = (match, myDeviceId, nowMs = Date.now()) => {
  if (!match || !isLockActive(match.lockInfo, nowMs)) return false;
  return match.lockInfo.deviceId !== myDeviceId;
};

/**
 * 建立新的鎖定資訊物件
 */
export const createLockInfo = (deviceId, deviceName, nowMs = Date.now()) => ({
  deviceId,
  deviceName: deviceName || '紀錄台平板',
  lockedAt: nowMs,
  expiresAt: nowMs + LOCK_LEASE_MS,
});
