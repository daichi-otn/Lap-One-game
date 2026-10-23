// 運営が変えられる設定 (public/config.json)。ファイルを書き換えて公開すると、次の起動から反映される
export interface EventConfig {
  id: string;
  name: string; // タイトルとコース選択に出る名前
  start: string; // 開始日 (YYYY-MM-DD)
  end: string; // 終了日 (YYYY-MM-DD、この日まで)
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
];

// 置く飾り物の設定。density は 0〜100 (多いほど、道の周りにたくさん置く)
export interface DecorationConfig {
  id: string;
  kind: string;
  enabled: boolean;
  density: number;
  courses: string[]; // 対象のコース (空なら全部)
}

export interface GameConfig {
  globalDecor: CourseDecor; // 全コースの空・霧の色 (コースごとの指定が優先)
  decorations: DecorationConfig[];
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
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// 今日開催中のイベント (日付は YYYY-MM-DD の文字列で比べる)
export function activeEvents(config: GameConfig, today: string): EventConfig[] {
  return config.events.filter((e) => e.enabled && e.start <= today && today <= e.end);
}

// コースの賞金の倍率 (開催中のイベントがあれば掛ける)
export function eventPrizeMult(config: GameConfig, courseId: string, today: string): number {
  return activeEvents(config, today)
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
