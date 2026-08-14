import { describe, expect, it } from 'vitest';
import { PIXI_RENDERER_PREFERENCE } from '$cmp/pixiRendererPreference';

describe('Pixi renderer selection', () => {
  it('prefers WebGPU and falls back only to WebGL', () => {
    expect(PIXI_RENDERER_PREFERENCE).toEqual(['webgpu', 'webgl']);
  });
});
