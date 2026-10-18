import { PARTS, type Slot } from './parts';

export interface SaveData {
  coin: number;
  racesRun: number;
  owned: string[];
  equipped: Partial<Record<Slot, string>>;
  bestTime: Record<string, number>;
}

export type Quality = 'low' | 'medium' | 'high';

// 開発者モード (管理者) は開発サーバー (npm run dev) でだけ有効。公開版 (npm run build) には含まれない
export const ADMIN_ENABLED = import.meta.env.DEV;
export interface AdminSettings {
  weather: 'auto' | 'sunny' | 'cloudy' | 'rain' | 'storm' | 'fog';
  cpuCount: number;
  cpuStrength: number;
  infiniteCoin: boolean;
  noEntryFee: boolean;
}
const ADMIN_KEY = 'lapone.admin.v1';

export function defaultAdmin(): AdminSettings {
  return { weather: 'auto', cpuCount: 3, cpuStrength: 1, infiniteCoin: false, noEntryFee: false };
}

export function loadAdmin(): AdminSettings {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (raw) return { ...defaultAdmin(), ...(JSON.parse(raw) as Partial<AdminSettings>) };
  } catch {
    // 既定値を使う
  }
  return defaultAdmin();
}

export function storeAdmin(admin: AdminSettings): void {
  try {
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  } catch {
    // 保存失敗は無視
  }
}
export interface Settings {
  quality: Quality;
  sound: boolean;
  gyro: boolean; // スマホを傾けてハンドル操作
}

const SAVE_KEY = 'lapone.save.v1';
const SETTINGS_KEY = 'lapone.settings.v1';
const START_COIN = 1000;

export function newSave(): SaveData {
  const base = PARTS.filter((p) => p.tier === 1);
  return {
    coin: START_COIN,
    racesRun: 0,
    owned: base.map((p) => p.id),
    equipped: Object.fromEntries(base.map((p) => [p.slot, p.id])) as Partial<Record<Slot, string>>,
    bestTime: {},
  };
}

// localStorage が使えない環境でもゲームは動くようにする
export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...newSave(), ...(JSON.parse(raw) as Partial<SaveData>) };
  } catch {
    // 破損・非対応は新規扱い
  }
  return newSave();
}

export function storeSave(save: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 保存できなくてもプレイは継続
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { quality: 'medium', sound: true, gyro: false, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // 既定値を使う
  }
  return { quality: 'medium', sound: true, gyro: false };
}

export function storeSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存失敗は無視
  }
}
