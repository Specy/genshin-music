import { on } from 'svelte/events';
import type { Attachment } from 'svelte/attachments';

/**
 * Opts a pressable performance key (note buttons, VSRG keys) out of the browser's
 * native touch processing. These buttons handle input purely through pointer events,
 * so native touch handling only contributes unwanted defaults — above all Android's
 * long-press haptic + selection/copy UI, which fires when the gesture is recognized,
 * BEFORE any cancellable `contextmenu` event is dispatched; the `oncontextmenu`
 * preventDefault the buttons already have stops the menu but not the vibration.
 * Cancelling `touchstart` disables that whole default-action pipeline (long-press
 * menu, selection, tap highlight, double-tap zoom) while pointer events — a separate
 * stream — keep firing normally, holds and multi-touch included.
 *
 * An attachment rather than an `ontouchstart` attribute because Svelte attaches
 * touchstart attributes passively for scroll performance — preventDefault would be
 * ignored there (see "Events" in the Svelte basic-markup docs).
 */
export const suppressNativeTouch: Attachment<HTMLElement> = (element) =>
  on(element, 'touchstart', (event) => event.preventDefault(), { passive: false });
