// 遊び続けてもらうための仕組み: 毎日のボーナスと、実績 (達成するとコインがもらえる)
export const DAILY_BONUS = 500;

// 今の日時 (ローカル時間で、YYYY-MM-DDTHH:MM)。イベントの開始・終了の判定に使う
export function nowKey(now = new Date()): string {
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${todayKey(now)}T${hm}`;
}

// 今日の日付 (ローカル時間で、YYYY-MM-DD)
export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  reward: number;
  done: (s: { racesRun: number; wins: number; finishes: number }) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-race', name: 'はじめての出走', desc: 'レースに1回出る', reward: 300, done: (s) => s.racesRun >= 1 },
  { id: 'first-finish', name: 'はじめての完走', desc: 'レースを1回完走する', reward: 500, done: (s) => s.finishes >= 1 },
  { id: 'first-win', name: 'はじめての優勝', desc: 'レースで1回優勝する', reward: 1000, done: (s) => s.wins >= 1 },
  { id: 'wins-5', name: '5勝', desc: '優勝を5回する', reward: 2000, done: (s) => s.wins >= 5 },
  { id: 'finishes-10', name: '完走10回', desc: '完走を10回する', reward: 1500, done: (s) => s.finishes >= 10 },
  { id: 'races-20', name: '出走20回', desc: 'レースに20回出る', reward: 2500, done: (s) => s.racesRun >= 20 },
];
