export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export function hasTooltip(text?: string | boolean): string {
  return text ? 'has-tooltip' : '';
}
