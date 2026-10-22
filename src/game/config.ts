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

export interface GameConfig {
  title: { tagline: string; banner: string }; // タイトルのキャッチコピー、上に出す告知 (空なら出さない)
  events: EventConfig[];
  courseTags: Record<string, string>; // コースに付けるラベル (例: 'NEW')
}

export const DEFAULT_CONFIG: GameConfig = {
  title: { tagline: '走って、稼いで、車を育てる', banner: '' },
  events: [],
  courseTags: {},
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
