// THE HOME PAGE'S SCALE OPTION: a percentage written onto `html { font-size }`, so every rem in the
// app follows it. HomeContent.svelte is where the user changes it; AppInit.svelte applies the stored
// value on every load, because HomeContent is only mounted at '/' - without that, opening (or
// reloading) any other route directly ignored the option until the home page was visited.
import { APP_NAME } from '$core/legacyConfig';

const APP_SCALE_KEY = APP_NAME + '-font-size';
export const APP_SCALE_MIN = 75;
export const APP_SCALE_MAX = 125;

/** The stored scale in percent, or 100 when none is stored or it is out of range. */
export function readStoredAppScale(): number {
  try {
    const stored = Number(JSON.parse(localStorage.getItem(APP_SCALE_KEY) || '100'));
    if (!Number.isFinite(stored) || stored < APP_SCALE_MIN || stored > APP_SCALE_MAX) return 100;
    return stored;
  } catch {
    return 100;
  }
}

export function storeAppScale(scale: number): void {
  localStorage.setItem(APP_SCALE_KEY, `${scale}`);
}

export function applyAppScale(scale: number): void {
  if (scale === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.fontSize = `${scale}%`;
  }
}
