import { describe, expect, it } from 'vitest';
import { noteLabelForDisplay } from '$lib/games/jianpu';
import { STANDARD_15_LABELS, STANDARD_21_LABELS } from '$lib/games/shapes/labels';

describe('x-Vacle numbered notation', () => {
  it('maps octave dots at display time and preserves shared Unicode labels', () => {
    expect(STANDARD_21_LABELS.number[0]).toBe('1\u0307');
    expect(STANDARD_21_LABELS.number[14]).toBe('1\u0323');
    expect(STANDARD_15_LABELS.number[14]).toBe('1\u0307\u0307');

    expect(noteLabelForDisplay('1\u0307', '1 2 3')).toBe('1z');
    expect(noteLabelForDisplay('2\u0323', '1 2 3')).toBe('2x');
    expect(noteLabelForDisplay('1\u0307\u0307', '1 2 3')).toBe('1a');
    expect(noteLabelForDisplay('3', '1 2 3')).toBe('3');
  });

  it('leaves other note-name modes unchanged', () => {
    expect(noteLabelForDisplay('1\u0307', 'Note name')).toBe('1\u0307');
    expect(noteLabelForDisplay('C4', 'Keyboard layout')).toBe('C4');
  });
});
