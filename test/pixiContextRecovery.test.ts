import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  observeWebGLContext,
  pixiResolution,
  WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS,
} from '$cmp/pixiContextRecovery';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Pixi context recovery', () => {
  it('caps the quadratic high-DPI backing-buffer cost', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
    expect(pixiResolution()).toBe(2);
  });

  it('prevents loss, rebuilds after restoration, and cancels the fallback', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const onRecoveryTimeout = vi.fn();
    const dispose = observeWebGLContext(canvas, { onLost, onRestored, onRecoveryTimeout });

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledOnce();

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS);
    expect(onRecoveryTimeout).not.toHaveBeenCalled();

    dispose();
  });

  it('falls back only after an unrestored context has been visible for the full timeout', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onRecoveryTimeout = vi.fn();
    const dispose = observeWebGLContext(canvas, {
      onLost: () => {},
      onRestored: () => {},
      onRecoveryTimeout,
    });

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    vi.advanceTimersByTime(WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS - 1);
    expect(onRecoveryTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRecoveryTimeout).toHaveBeenCalledOnce();

    dispose();
  });
});
