import { readFileSync } from 'node:fs';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ComposerViewSelector from '../src/lib/components/pages/Composer/ComposerViewSelector.svelte';
import SettingsPane from '../src/lib/components/settings/SettingsPane.svelte';
import { ComposerSettings } from './imports';
import { reactiveProps } from './signals.svelte';

type Mounted = ReturnType<typeof mount>;

describe('the Composer view selector', () => {
  let target: HTMLDivElement;
  let component: Mounted | null;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.append(target);
    component = null;
  });

  afterEach(() => {
    if (component) unmount(component);
    target.remove();
  });

  it('starts on Normal view and maps both options to the persisted boolean setting', () => {
    const onUpdate = vi.fn();
    const props = reactiveProps<ComponentProps<typeof ComposerViewSelector>>({
      setting: { ...ComposerSettings.data.proView },
      onUpdate,
    });
    component = mount(ComposerViewSelector, { target, props });
    flushSync();

    const buttons = [...target.querySelectorAll<HTMLButtonElement>('.multiple-option-slider button')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Normal composer',
      'PRO composer',
    ]);
    expect(target.querySelector('.multiple-options-selected')?.textContent?.trim()).toBe(
      'Normal composer'
    );

    buttons[1].click();
    expect(onUpdate).toHaveBeenLastCalledWith({
      key: 'proView',
      data: { ...ComposerSettings.data.proView, value: true },
    });

    props.setting = { ...props.setting, value: true };
    flushSync();
    expect(target.querySelector('.multiple-options-selected')?.textContent?.trim()).toBe(
      'PRO composer'
    );

    buttons[0].click();
    expect(onUpdate).toHaveBeenLastCalledWith({
      key: 'proView',
      data: { ...ComposerSettings.data.proView, value: false },
    });
  });

  it('lets the shared settings pane hide the old generic row', () => {
    component = mount(SettingsPane, {
      target,
      props: {
        settings: ComposerSettings.data,
        hiddenSettings: ['proView', 'syncTabs'],
        onUpdate: vi.fn(),
      },
    });
    flushSync();

    //the generic row's own label, which is settings.props.composer_pro_view - not the selector's
    //button text, which reads the same words out of composer.pro_view and IS expected on screen
    expect(target.textContent).not.toContain('PRO composer');
    expect(target.textContent).not.toContain('Autoplay in all tabs');
    expect(target.textContent).toContain('Smooth scrolling');
  });

  it('sits below the regular settings in the Composer menu', () => {
    const menu = readFileSync(
      'src/lib/components/pages/Composer/ComposerMenu.svelte',
      'utf8'
    );
    const settingsPanel = menu.slice(menu.indexOf('<MenuPanel id="Settings">'));

    expect(settingsPanel.indexOf('<SettingsPane')).toBeLessThan(
      settingsPanel.indexOf('<ComposerViewSelector')
    );
    expect(settingsPanel).toContain("hiddenSettings={['proView', 'syncTabs']}");
  });
});
