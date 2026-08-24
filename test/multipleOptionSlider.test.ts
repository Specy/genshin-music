import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MultipleOptionSlider from '../src/lib/components/MultipleOptionSlider.svelte';
import { reactiveProps } from './signals.svelte';

type Mounted = ReturnType<typeof mount>;

describe('MultipleOptionSlider underlay positioning', () => {
  let target: HTMLDivElement;
  let component: Mounted | null;
  let visible: boolean;
  let resize: ResizeObserverCallback | undefined;
  let offsetWidth: PropertyDescriptor | undefined;
  let offsetLeft: PropertyDescriptor | undefined;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.append(target);
    component = null;
    visible = false;
    resize = undefined;

    offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    offsetLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        if (!(this instanceof HTMLButtonElement) || !this.closest('.multiple-option-slider')) {
          return 0;
        }
        if (!visible) return 0;
        return this.textContent?.trim() === 'Normal' ? 100 : 80;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get() {
        if (!(this instanceof HTMLButtonElement) || !this.closest('.multiple-option-slider')) {
          return 0;
        }
        return this.textContent?.trim() === 'Normal' ? 0 : 100;
      },
    });

    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    if (component) unmount(component);
    target.remove();
    vi.unstubAllGlobals();
    if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
    if (offsetLeft) Object.defineProperty(HTMLElement.prototype, 'offsetLeft', offsetLeft);
  });

  it('waits for a hidden slider to become visible, then uses button-relative dimensions', () => {
    const props = reactiveProps<ComponentProps<typeof MultipleOptionSlider<'normal' | 'pro'>>>({
      options: [
        { value: 'normal', text: 'normal', color: 'red' },
        { value: 'pro', text: 'pro', color: 'red' },
      ],
      selected: 'pro',
      onChange: vi.fn(),
    });
    component = mount(MultipleOptionSlider, { target, props });
    flushSync();

    expect(target.querySelector('.multiple-option-slider-overlay')).toBeNull();

    visible = true;
    resize?.([], {} as ResizeObserver);
    flushSync();

    const overlay = target.querySelector<HTMLElement>('.multiple-option-slider-overlay');
    expect(overlay?.style.width).toBe('calc(80px - 0.2rem)');
    expect(overlay?.style.left).toBe('calc(100px + 0.1rem)');

    props.selected = 'normal';
    flushSync();
    expect(overlay?.style.width).toBe('calc(100px - 0.2rem)');
    expect(overlay?.style.left).toBe('calc(0px + 0.1rem)');
  });
});
