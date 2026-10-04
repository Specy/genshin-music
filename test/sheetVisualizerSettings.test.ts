import { beforeEach, describe, expect, it } from 'vitest';
import { APP_NAME, SheetVisualizerSettings } from './imports';
import { settingsService } from '../src/lib/core/Services/SettingsService';

const key = `${APP_NAME}_SheetVisualizer_Settings`;

describe('sheet visualizer note labels', () => {
  beforeEach(() => localStorage.removeItem(key));

  it('starts with no note labels', () => {
    expect(settingsService.getDefaultSheetVisualizerSettings().noteNameType.value).toBe('No Text');
    expect(settingsService.getSheetVisualizerSettings().noteNameType.value).toBe('No Text');
  });

  // ADR-0019: a version change no longer wipes the blob. The labels choice the user made survives
  // it (it is still one of today's options), and only what the code dropped goes - here the
  // `noteNames` switch that `noteNameType: 'No Text'` replaced.
  it('keeps old sheet settings that still fit when the version changes', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        other: { ...SheetVisualizerSettings.other, settingVersion: `${APP_NAME}1` },
        data: {
          ...SheetVisualizerSettings.data,
          noteNameType: { ...SheetVisualizerSettings.data.noteNameType, value: '1 2 3' },
          noteNames: { value: true },
        },
      })
    );

    const settings = settingsService.getSheetVisualizerSettings();
    expect(settings.noteNameType.value).toBe('1 2 3');
    expect(settings).not.toHaveProperty('noteNames');
    const stored = JSON.parse(localStorage.getItem(key)!);
    expect(stored.other.settingVersion).toBe(SheetVisualizerSettings.other.settingVersion);
    expect(stored.data.noteNameType.value).toBe('1 2 3');
    expect(stored.data).not.toHaveProperty('noteNames');
  });

  it('resets a stored label type that is no longer an option', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        other: SheetVisualizerSettings.other,
        data: {
          ...SheetVisualizerSettings.data,
          noteNameType: { ...SheetVisualizerSettings.data.noteNameType, value: 'No Such Labels' },
        },
      })
    );

    expect(settingsService.getSheetVisualizerSettings().noteNameType.value).toBe('No Text');
  });
});
