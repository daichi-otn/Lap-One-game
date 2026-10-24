// コイン経済。初回レースは参加費なし、2戦目以降は参加費 1000 coin
export const ENTRY_FEE = 1000;
export const WIN_PRIZE = 3000;
// 完走の参加賞は参加費と同じ額 (収支ゼロ)。参加費が無料のときは、この額を最低限もらえる
export const MIN_PARTICIPATION_PRIZE = 500;
// 借金: 上限まで借りられる。1 回に借りる額は LOAN_STEP
export const DEBT_LIMIT = 5000;
export const LOAN_STEP = 1000;

export type Outcome = 'win' | 'finish' | 'dnf' | 'retire';

export function entryFee(racesRun: number): number {
  return racesRun === 0 ? 0 : ENTRY_FEE;
}

// 優勝 → 賞金 (コース倍率を掛ける)
// 完走して未優勝 → 参加賞 (参加費と同じ額。参加費が無料なら最低額)
// 失格・リタイア → 0
export function payout(outcome: Outcome, prizeMult: number, fee = 0): number {
  if (outcome === 'win') return Math.round(WIN_PRIZE * prizeMult);
  if (outcome === 'finish') return Math.max(MIN_PARTICIPATION_PRIZE, fee);
  return 0;
}

// 失格・リタイアは、参加費の半分が戻る
export function refund(outcome: Outcome, fee: number): number {
  return outcome === 'dnf' || outcome === 'retire' ? Math.floor(fee / 2) : 0;
}

// 入ってきたコインは、まず借金の返済に回す。残った分が所持コインになる
export function credit(debt: number, amount: number): { debt: number; coin: number } {
  const repaid = Math.min(debt, Math.max(0, amount));
  return { debt: debt - repaid, coin: amount - repaid };
}

// 参加費を払えるか (足りない分は、上限までの借金で補える)
export function canEnter(coin: number, debt: number, fee: number): boolean {
  return coin + (DEBT_LIMIT - debt) >= fee;
}

// いま 1 回で借りられる額 (上限に届くまで、LOAN_STEP まで)
export function borrowable(debt: number): number {
  return Math.max(0, Math.min(LOAN_STEP, DEBT_LIMIT - debt));
}
