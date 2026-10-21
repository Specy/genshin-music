/** Web Audio pan: -1 is fully left, 0 is centered, 1 is fully right. */
export function normalizePan(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}
