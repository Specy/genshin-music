import type { NoteNameType } from './types';

/** x-Vacle uses printable keys for octave dots; keep the shared labels as Unicode notation. */
export function noteLabelForDisplay(text: string, type: NoteNameType): string {
  if (type !== '1 2 3') return text;
  return text
    .replaceAll('\u0307\u0307', 'a')
    .replaceAll('\u0323\u0323', 'n')
    .replaceAll('\u0307', 'z')
    .replaceAll('\u0323', 'x');
}
