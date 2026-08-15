import { describe, expect, it, vi } from 'vitest';
import { AudioProviderClass } from '../src/lib/providers/AudioProvider';

describe('AudioProvider.ensureRunning', () => {
  it('resumes a suspended shared context before resolving', async () => {
    let finishResume!: () => void;
    const resume = vi.fn(
      () => new Promise<void>((resolve) => (finishResume = resolve))
    );
    const context = { state: 'suspended', resume } as unknown as AudioContext;
    const provider = new AudioProviderClass();
    provider.audioContext = context;

    let settled = false;
    const running = provider.ensureRunning().then((value) => {
      settled = true;
      return value;
    });

    expect(resume).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    finishResume();
    await expect(running).resolves.toBe(context);
  });

  it('does not resume an already-running context', async () => {
    const resume = vi.fn();
    const context = { state: 'running', resume } as unknown as AudioContext;
    const provider = new AudioProviderClass();
    provider.audioContext = context;

    await expect(provider.ensureRunning()).resolves.toBe(context);
    expect(resume).not.toHaveBeenCalled();
  });

  it('propagates a resume rejection so the caller can abort its pending start', async () => {
    const failure = new Error('resume denied');
    const context = {
      state: 'suspended',
      resume: vi.fn().mockRejectedValue(failure),
    } as unknown as AudioContext;
    const provider = new AudioProviderClass();
    provider.audioContext = context;

    await expect(provider.ensureRunning()).rejects.toBe(failure);
  });
});
