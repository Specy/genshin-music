import type { RendererPreference } from 'pixi.js';

/**
 * Pixi 8's `Application.init()` delegates renderer creation to `autoDetectRenderer()`. An ordered
 * array both prefers WebGPU and limits fallback to WebGL, instead of allowing the default Canvas
 * fallback after it.
 */
export const PIXI_RENDERER_PREFERENCE = [
  'webgl',
  'webgpu',
  'canvas',
] satisfies RendererPreference[];
