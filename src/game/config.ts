// 運営が変えられる設定 (public/config.json)。ファイルを書き換えて公開すると、次の起動から反映される
export interface EventConfig {
  id: string;
  name: string; // タイトルとコース選択に出る名前
  start: string; // 開始日 (YYYY-MM-DD)
  end: string; // 終了日 (YYYY-MM-DD、この日まで)
  startTime?: string; // 開始の時刻 (HH:MM、省略は 00:00)
  endTime?: string; // 終了の時刻 (HH:MM、この時刻まで。省略は 23:59)
  courses: string[]; // 対象のコース id (空なら全部)
  prizeMult: number; // 賞金の倍率
  enabled: boolean; // オフにすると、期間内でも開催しない
}

// コースの飾り付け: 空と霧の色 (例: '#ff9966')。指定したところだけ変わる
export interface CourseDecor {
  sky?: string;
  fog?: string;
}

// 飾り物の種類 (ハロウィンなど、イベントに合わせて置ける)
export const DECOR_KINDS: { id: string; name: string }[] = [
  { id: 'pumpkin', name: 'かぼちゃ' },
  { id: 'ghost', name: 'おばけ' },
  { id: 'bat', name: 'コウモリ' },
  { id: 'balloon', name: '風船' },
  { id: 'lantern', name: 'ちょうちん' },
  { id: 'flag', name: '旗' },
  { id: 'snowman', name: '雪だるま' },
  { id: 'star', name: '星' },
  { id: 'tree', name: 'ツリー' },
  { id: 'present', name: 'プレゼント' },
  { id: 'candy', name: 'キャンディ' },
  { id: 'mushroom', name: 'きのこ' },
  { id: 'cactus', name: 'サボテン' },
  { id: 'palm', name: 'ヤシの木' },
  { id: 'cone', name: 'カラーコーン' },
  { id: 'cherry', name: '桜の木' },
  { id: 'torii', name: '鳥居' },
  { id: 'toro', name: '灯籠' },
  { id: 'daruma', name: 'だるま' },
  { id: 'firework', name: '花火' },
  { id: 'rainbow', name: '虹' },
  { id: 'cloud', name: '雲' },
  { id: 'rock', name: '岩' },
  { id: 'penguin', name: 'ペンギン' },
  { id: 'crystal', name: 'クリスタル' },
  { id: 'bunting', name: 'ガーランド' },
  { id: 'tire', name: 'タイヤ' },
];

// 置く飾り物の設定。density は 0〜100 (多いほど、道の周りにたくさん置く)
export interface DecorationConfig {
  id: string;
  kind: string; // 種類 (DECOR_KINDS の id)、または 'custom:<id>' (カスタム飾り)
  enabled: boolean;
  density: number;
  courses: string[]; // 対象のコース (空なら全部)
}

// カスタム飾り: 運営が管理ソフトでコードを書いて作る形。code は関数の中身で、THREE と mat を受け取り、Group か Object3D を return する
export interface CustomDecor {
  id: string; // 'c' で始まる数字
  name: string;
  code: string;
}

// 期間限定アイテム: ボディの色 (paint)、ホイールの色 (rim)、ハンドルの握りの色 (grip)
export interface LimitedItem {
  id: string; // 'lim-' で始める
  kind: 'paint' | 'rim' | 'grip';
  name: string;
  price: number;
  start: string; // 買える期間 (YYYY-MM-DD)
  end: string;
  hue?: number; // ボディの色: 色相 (0〜360)
  dark?: number; // ボディの色: 明るさ (0.3〜1.8)
  color?: string; // ホイール・握り: 色 (#RRGGBB)
  icon?: string; // ショップに出す絵 (public/items/ の中の画像)
}

export interface GameConfig {
  limited: LimitedItem[];
  globalDecor: CourseDecor; // 全コースの空・霧の色 (コースごとの指定が優先)
  decorations: DecorationConfig[];
  customDecor: CustomDecor[];
  title: { tagline: string; banner: string }; // タイトルのキャッチコピー、上に出す告知 (空なら出さない)
  events: EventConfig[];
  courseTags: Record<string, string>; // コースに付けるラベル (例: 'NEW')
  courseDecor: Record<string, CourseDecor>; // コースごとの飾り付け
}

export const DEFAULT_CONFIG: GameConfig = {
  title: { tagline: '走って、稼いで、車を育てる', banner: '' },
  events: [],
  courseTags: {},
  courseDecor: {},
  globalDecor: {},
  decorations: [],
  customDecor: [],
  limited: [],
};

// 設定を読む。読めなければ、既定の設定を使う (ゲームは止めない)
export async function loadConfig(): Promise<GameConfig> {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) return DEFAULT_CONFIG;
    const raw = (await res.json()) as Partial<GameConfig>;
    return {
      title: { ...DEFAULT_CONFIG.title, ...raw.title },
      events: Array.isArray(raw.events) ? raw.events : [],
      courseTags: raw.courseTags ?? {},
      courseDecor: raw.courseDecor ?? {},
      globalDecor: raw.globalDecor ?? {},
      decorations: Array.isArray(raw.decorations) ? raw.decorations : [],
      customDecor: Array.isArray(raw.customDecor) ? raw.customDecor : [],
      limited: Array.isArray(raw.limited) ? raw.limited : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// 今開催中のイベント。now は 'YYYY-MM-DDTHH:MM' (ローカル時刻)。文字列のまま比べられる形
export function activeEvents(config: GameConfig, now: string): EventConfig[] {
  return config.events.filter(
    (e) => e.enabled && `${e.start}T${e.startTime ?? '00:00'}` <= now && now <= `${e.end}T${e.endTime ?? '23:59'}`,
  );
}

// これから始まる (まだ開催前の) 直近のイベントと、開始までの日数。予定がなければ null
export function upcomingEvent(config: GameConfig, today: string): { event: EventConfig; days: number } | null {
  const next = config.events
    .filter((e) => e.enabled && e.start > today)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))[0];
  if (!next) return null;
  const days = Math.round((Date.parse(next.start) - Date.parse(today)) / 86400000);
  return { event: next, days };
}

// コースの賞金の倍率 (開催中のイベントがあれば掛ける)
export function eventPrizeMult(config: GameConfig, courseId: string, now: string): number {
  return activeEvents(config, now)
    .filter((e) => e.courses.length === 0 || e.courses.includes(courseId))
    .reduce((m, e) => m * e.prizeMult, 1);
}

// コースの空・霧の色: 全コースの色に、そのコースの指定を重ねる
export function decorFor(config: GameConfig, courseId: string): CourseDecor {
  return { ...config.globalDecor, ...(config.courseDecor[courseId] ?? {}) };
}

// そのコースに置く飾り物
export function decorationsFor(config: GameConfig, courseId: string): DecorationConfig[] {
  return config.decorations.filter((d) => d.enabled && (d.courses.length === 0 || d.courses.includes(courseId)));
}

// 期間の中にいるか (期間が決まっていないものは、いつでも)
export function inWindow(w: { start: string; end: string } | undefined, today: string): boolean {
  return !w || (w.start <= today && today <= w.end);
}
