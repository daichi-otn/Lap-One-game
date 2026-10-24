import { PARTS, type Slot } from './parts';

export interface SaveData {
  coin: number;
  racesRun: number;
  owned: string[];
  equipped: Partial<Record<Slot, string>>;
  bestTime: Record<string, number>;
  ownedCars: string[]; // 持っている車種
  equippedCar: string; // 乗っている車種
  ownedPaints: string[]; // 持っているボディの色
  equippedPaint: string; // 塗ってある色
  insurance: boolean; // ピットの修理代が半分になる保険
  lastBonus: string; // 毎日のボーナスを受け取った日 (YYYY-MM-DD)
  wins: number; // 優勝の回数
  finishes: number; // 完走の回数
  achievements: string[]; // 達成した実績
  ownedRims: string[]; // 持っているホイールの色
  equippedRim: string;
  ownedGrips: string[]; // 持っているハンドルの握りの色
  equippedGrip: string;
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
// 一人称の目の位置: 高さ (m)、見上げ・見下げ (度、正が上)、前後の位置 (m、正が前)、左右の位置 (m、正が右)
export interface FirstPersonView {
  height: number;
  pitch: number;
  depth: number;
  side: number;
}
export const DEFAULT_VIEW: FirstPersonView = { height: 1.2, pitch: 0, depth: -0.2, side: 0.6 };

// ハンドルの位置のずれ (m)。x は右が正、y は上が正、z は前が正
export interface WheelOffset {
  x: number;
  y: number;
  z: number;
}
export const DEFAULT_WHEEL: WheelOffset = { x: 0, y: 0, z: 0 };

export interface Settings {
  quality: Quality;
  sound: boolean;
  gyro: boolean; // スマホを傾けてハンドル操作
  gyroSens: number; // ジャイロの感度 (1 が標準。大きいほど、少しの傾きで大きく切れる)
  view: FirstPersonView;
  wheel: WheelOffset;
  autoDrive: boolean; // ハンドルだけ操作し、アクセルとブレーキは自動
  cpuCount: number; // レースに出る CPU の台数
  cpuStrength: number; // CPU の強さ (1 が標準)
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
    ownedCars: ['standard'],
    equippedCar: 'standard',
    ownedPaints: ['blue'],
    equippedPaint: 'blue',
    insurance: false,
    lastBonus: '',
    wins: 0,
    finishes: 0,
    achievements: [],
    ownedRims: ['rim-0'],
    equippedRim: 'rim-0',
    ownedGrips: ['grip-0'],
    equippedGrip: 'grip-0',
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
  const base: Settings = { quality: 'medium', sound: true, gyro: false, gyroSens: 1, view: { ...DEFAULT_VIEW }, wheel: { ...DEFAULT_WHEEL }, autoDrive: false, cpuCount: 7, cpuStrength: 1 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      return { ...base, ...saved, view: { ...DEFAULT_VIEW, ...saved.view }, wheel: { ...DEFAULT_WHEEL, ...saved.wheel } };
    }
  } catch {
    // 既定値を使う
  }
  return base;
}

export function storeSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存失敗は無視
  }
}
