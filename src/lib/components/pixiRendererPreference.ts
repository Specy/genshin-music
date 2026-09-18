import type { RendererPreference } from 'pixi.js';

/**
 * Pixi 8's `Application.init()` delegates renderer creation to `autoDetectRenderer()`. An ordered
 * array makes WebGL the normal path while retaining WebGPU and Canvas as initialization fallbacks.
 */
export const PIXI_RENDERER_PREFERENCE = [
  'webgl',
  'webgpu',
  'canvas',
] satisfies RendererPreference[];
