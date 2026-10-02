/**
 * A high-DPI WebGL buffer grows with the SQUARE of the device-pixel ratio. iPhones commonly
 * report 3, which makes each Pixi surface nine physical pixels per CSS pixel and makes Safari
 * considerably more likely to reclaim its context while the page is backgrounded. Two keeps the
 * canvas sharp while putting a hard ceiling on that GPU-memory multiplier.
 */
export function pixiResolution(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

/**
 * Give Pixi/WebKit a chance to restore the existing context before replacing the renderer. The
 * clock only runs while the page is visible: iOS deliberately suspends background pages, so a
 * timeout spent there says nothing about whether restoration is stuck.
 */
export const WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS = 4_000;

export interface WebGLContextRecoveryCallbacks {
  onLost: () => void;
  onRestored: () => void;
  onRecoveryTimeout: () => void;
}

/**
 * Observe the browser-level context lifecycle that sits below Pixi.
 *
 * Pixi installs its own listeners during Application.init(), before this is called. Its restored
 * listener therefore rebuilds Pixi's renderer systems first; onRestored can then safely recreate
 * application-owned RenderTextures, whose pixels the WebGL specification says are invalid after a
 * restoration.
 */
export function observeWebGLContext(
  canvas: HTMLCanvasElement,
  callbacks: WebGLContextRecoveryCallbacks
): () => void {
  let lost = false;
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const clearRecoveryTimeout = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
  };

  const scheduleRecoveryTimeout = () => {
    clearRecoveryTimeout();
    if (disposed || !lost || document.visibilityState !== 'visible') return;
    timeout = setTimeout(() => {
      timeout = null;
      if (!disposed && lost && document.visibilityState === 'visible') {
        callbacks.onRecoveryTimeout();
      }
    }, WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS);
  };

  const handleContextLost = (event: Event) => {
    // Required by WebGL for the user agent to attempt restoration. Pixi also does this, but doing
    // it here makes the recovery contract explicit and keeps it true if Pixi's internals change.
    event.preventDefault();
    if (lost) return;
    lost = true;
    callbacks.onLost();
    scheduleRecoveryTimeout();
  };

  const handleContextRestored = () => {
    if (!lost) return;
    lost = false;
    clearRecoveryTimeout();
    callbacks.onRestored();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') scheduleRecoveryTimeout();
    else clearRecoveryTimeout();
  };

  const handlePageShow = () => scheduleRecoveryTimeout();

  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pageshow', handlePageShow);

  return () => {
    disposed = true;
    clearRecoveryTimeout();
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pageshow', handlePageShow);
  };
}
