import { createRawSnippet, flushSync, mount, unmount, type ComponentProps } from 'svelte';
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

// An option that wears an ICON wears its label somewhere else - as the tooltip and as the
// accessible name - because a glyph names nothing on its own. That trade is the whole of what an
// icon option is, so both halves are asserted together here.
describe('MultipleOptionSlider icon options', () => {
  let target: HTMLDivElement;
  let component: Mounted | null = null;

  const glyph = (name: string) =>
    createRawSnippet(() => ({ render: () => `<svg data-icon="${name}"></svg>` }));

  beforeEach(() => {
    target = document.createElement('div');
    document.body.append(target);
    component = null;
  });

  afterEach(() => {
    if (component) unmount(component);
    target.remove();
  });

  function option(value: string) {
    return target.querySelector<HTMLButtonElement>(`button[data-value="${value}"]`)!;
  }

  /** What the button PRINTS - its own children less the tooltip, which is text it only reveals on hover. */
  function face(value: string) {
    return [...option(value).childNodes]
      .filter((node) => !(node instanceof HTMLElement && node.classList.contains('tooltip')))
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
  }

  it('gives an icon option its glyph, its label as name and tooltip, and the asked-for side', () => {
    component = mount(MultipleOptionSlider, {
      target,
      props: {
        options: [
          { value: 'play', text: 'Play song', color: 'red', icon: glyph('music') },
          {
            value: 'approaching',
            text: 'Approach mode',
            color: 'red',
            icon: glyph('circle'),
            tooltipPosition: 'left',
          },
        ],
        selected: 'play',
        onChange: vi.fn(),
      } satisfies ComponentProps<typeof MultipleOptionSlider<'play' | 'approaching'>>,
    });
    flushSync();

    // the glyph is the face, and the label is not ALSO printed beside it
    expect(option('play').querySelector('svg')?.dataset.icon).toBe('music');
    expect(face('play')).toBe('');
    // ...but it is what names the button, and what the tooltip says
    expect(option('play').getAttribute('aria-label')).toBe('Play song');
    expect(option('play').querySelector('.tooltip')?.textContent?.trim()).toBe('Play song');
    // an icon option is a tooltip host - the class the tooltip's own CSS keys its hover off
    expect(option('play').classList.contains('has-tooltip')).toBe(true);

    // the default side is `bottom`; the rightmost option of a slider at the window's edge asks
    // for its tooltip to open inward instead, which is a per-option choice
    expect(option('play').querySelector('.tooltip')?.classList.contains('tooltip-bottom')).toBe(
      true
    );
    expect(
      option('approaching').querySelector('.tooltip')?.classList.contains('tooltip-left')
    ).toBe(true);
  });

  it('leaves a label option exactly as it was - capitalized, unnamed and without a tooltip', () => {
    component = mount(MultipleOptionSlider, {
      target,
      props: {
        options: [
          { value: 'normal', text: 'normal view', color: 'red' },
          { value: 'pro', text: 'pro view', color: 'red' },
        ],
        selected: 'normal',
        onChange: vi.fn(),
      } satisfies ComponentProps<typeof MultipleOptionSlider<'normal' | 'pro'>>,
    });
    flushSync();

    expect(face('normal')).toBe('Normal view');
    expect(option('normal').querySelector('.tooltip')).toBeNull();
    expect(option('normal').getAttribute('aria-label')).toBeNull();
    expect(option('normal').classList.contains('has-tooltip')).toBe(false);
  });
});
