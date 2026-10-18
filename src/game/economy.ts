// コイン経済。初回レースは参加費なし、2戦目以降は参加費 1000 coin
export const ENTRY_FEE = 1000;
export const WIN_PRIZE = 3000;
export const PARTICIPATION_PRIZE = 500;

export type Outcome = 'win' | 'finish' | 'dnf';

export function entryFee(racesRun: number): number {
  return racesRun === 0 ? 0 : ENTRY_FEE;
}

// 優勝 → 賞金 (コース倍率を掛ける) / 完走して未優勝 → 参加賞 / 失格 → 0
export function payout(outcome: Outcome, prizeMult: number): number {
  if (outcome === 'win') return Math.round(WIN_PRIZE * prizeMult);
  if (outcome === 'finish') return PARTICIPATION_PRIZE;
  return 0;
}
