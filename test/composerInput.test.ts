/**
 * WHAT A POINTER GESTURE ON THE COMPOSER MEANS (spec §7 / §10, phase D): the release's own intent,
 * which cell a Pro View pointer is on, and what a tap on that cell does to the song.
 *
 * THESE ARE THE DECISIONS THEMSELVES, taken out of ComposerRenderer and out of Composer.svelte on
 * purpose: one is behind a dynamic pixi import and the other is a 2000-line component, so a rule
 * left inside either can only be exercised through a whole mounted surface. What is left there is
 * mechanical - the renderer resolves a column and a row, the component looks a note up - and each of
 * those halves has its own coverage (test/composerRenderer.test.ts drives the pointer stream, and
 * test/proViewGeometry.test.ts pins the row resolution the target below is handed).
 *
 * GAME-AGNOSTIC BY CONSTRUCTION, like the two pro-view files beside it: nothing here reads an
 * instrument, a roster or APP_NAME at all - every input is a fact the caller has already established.
 * Both PUBLIC_GAMEs therefore run identical rows, which is the point: a gesture means the same thing
 * in both games.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  COMPOSER_LONG_PRESS_MS,
  proCellAction,
  proTapTarget,
  stagePressArmsLongPress,
  stageReleaseIntent,
} from '$cmp/pages/Composer/composerInput';

/** The Compressed View's press, in the state a settled tap leaves it: nothing moved, nothing held. */
const settledPress = {
  becameDrag: false,
  pressed: true,
  moved: false,
  longPressConsumed: false,
  //the keyboard sheet is DOWN in every row that does not say otherwise - it is the Pro View's
  //ordinary state, and the Compressed View has no sheet at all
  sheetRaised: false,
};

describe('what a release on the notes stage means', () => {
  it('picks a column in the Compressed View, exactly as it always has', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: false })).toBe('select-column');
  });

  it('edits the cell in the Pro View instead - the whole of "tap = edit only"', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: true })).toBe('cell-tap');
  });

  it('settles the drag in either view once the press became one', () => {
    for (const proView of [false, true]) {
      expect(stageReleaseIntent({ ...settledPress, proView, becameDrag: true })).toBe(
        'settle-drag'
      );
    }
  });

  // A CATCH is a press during a Coast, and ComposerRenderer enters the drag AT that press - so it
  // arrives here as `becameDrag` with nothing moved. It must never edit and never click, in the Pro
  // View for the same reason it never clicks in the Compressed one (CONTEXT.md: Catch).
  it('a Catch never edits: its motionless release still settles', () => {
    const catchRelease = { ...settledPress, becameDrag: true, moved: false };
    expect(stageReleaseIntent({ ...catchRelease, proView: true })).toBe('settle-drag');
    expect(stageReleaseIntent({ ...catchRelease, proView: false })).toBe('settle-drag');
  });

  it('a Pro View press that travelled past the slop is a gesture that missed, not a tap', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: true, moved: true })).toBe('nothing');
  });

  // The same wander in the Compressed View still clicks: there a click merely picks a column, and
  // the horizontal test in handleStageSlide is the only thing that has ever decided the difference.
  it('...while the same movement in the Compressed View still picks a column', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: false, moved: true })).toBe(
      'select-column'
    );
  });

  it('a long press that was taken swallows its own release', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: true, longPressConsumed: true })).toBe(
      'nothing'
    );
  });

  // pixi hit-tests a page-wide pointerup against the canvas, so a release over the canvas whose
  // press landed on a DOM element above it (the raised keyboard sheet, a side chevron) reaches the
  // same handler. In the Pro View that would be an EDIT, so it is refused; the Compressed View's
  // meaning is unchanged, because there it only ever picked a column.
  it('a release with no press of ours behind it edits nothing, and still selects', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: true, pressed: false })).toBe('nothing');
    expect(stageReleaseIntent({ ...settledPress, proView: false, pressed: false })).toBe(
      'select-column'
    );
  });

  // THE SHEET'S DISMISSAL, which used to need no rule at all: the backdrop covered the canvas, so
  // the press never reached pixi. The scrim covers the KEYBOARD'S band now (App.css), which is what
  // leaves the canvas above it live - so the swallow is stated here instead.
  it('a settled tap while the keyboard sheet is up dismisses it instead of editing', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: true, sheetRaised: true })).toBe(
      'dismiss-sheet'
    );
  });

  // The half the user asked for: with the sheet up the canvas scrolls EXACTLY as it does with the
  // sheet down. Only a settled tap dismisses, so a drag settles and the sheet stays where it is.
  it('...while a DRAG made with the sheet up still just settles the scroll', () => {
    expect(
      stageReleaseIntent({ ...settledPress, proView: true, sheetRaised: true, becameDrag: true })
    ).toBe('settle-drag');
    //...and a press that travelled without ever entering the drag is still a gesture that missed
    expect(
      stageReleaseIntent({ ...settledPress, proView: true, sheetRaised: true, moved: true })
    ).toBe('nothing');
  });

  it('the sheet means nothing in the Compressed View, which has none', () => {
    expect(stageReleaseIntent({ ...settledPress, proView: false, sheetRaised: true })).toBe(
      'select-column'
    );
  });
});

describe('whether a press starts the long-press clock', () => {
  const press = { proView: true, catching: false, sheetRaised: false };

  it('does in the Pro View, on an ordinary press', () => {
    expect(stagePressArmsLongPress(press)).toBe(true);
  });

  it('never in the Compressed View, where the canvas has no long press', () => {
    expect(stagePressArmsLongPress({ ...press, proView: false })).toBe(false);
  });

  // A Catch is the grab of a moving canvas: it neither edits nor opens anything (CONTEXT.md: Catch).
  it('never on a Catch', () => {
    expect(stagePressArmsLongPress({ ...press, catching: true })).toBe(false);
  });

  // With the sheet up the canvas means scroll-or-dismiss and nothing else; a popover opened from
  // under the sheet would also swallow the release that was supposed to put the sheet away.
  it('never while the keyboard sheet is up', () => {
    expect(stagePressArmsLongPress({ ...press, sheetRaised: true })).toBe(false);
  });
});

describe('which cell a Pro View pointer is on', () => {
  const target = { x: 100, stripWidth: 30, column: 4, number: 60, columnCount: 10 };

  it('is the column and the number it was handed', () => {
    expect(proTapTarget(target)).toEqual({ column: 4, number: 60 });
  });

  // The row-label strip is drawn over the leftmost column, sticky and screen-fixed: a tap there is
  // aimed at a label (spec §7 - inert), and the band is exactly the strip's own width.
  it('is nothing inside the row-label strip band', () => {
    expect(proTapTarget({ ...target, x: 29.9 })).toBeNull();
    expect(proTapTarget({ ...target, x: 30 })).toEqual({ column: 4, number: 60 });
  });

  it('is nothing off the axis, where no row answers', () => {
    expect(proTapTarget({ ...target, number: null })).toBeNull();
  });

  // NOT clamped to the song, unlike the Compressed View's click: clamping a miss to the nearest end
  // column is harmless when the outcome is a selection and writes a note into a column nobody
  // pointed at when the outcome is an edit.
  it('is nothing outside the song, in either direction', () => {
    expect(proTapTarget({ ...target, column: -1 })).toBeNull();
    expect(proTapTarget({ ...target, column: 10 })).toBeNull();
    expect(proTapTarget({ ...target, column: 9 })).toEqual({ column: 9, number: 60 });
  });

  it('answers a negative Note Number like any other - every integer is a legal row', () => {
    expect(proTapTarget({ ...target, number: -3 })).toEqual({ column: 4, number: -3 });
  });
});

describe('what a tap on a Pro View cell does', () => {
  const cell = { hasOwnNote: false, covered: false, button: -1 };

  it('adds where the current layer has a button and no note', () => {
    expect(proCellAction({ ...cell, button: 7 })).toBe('add');
  });

  it('removes its own note, button or no button', () => {
    expect(proCellAction({ ...cell, hasOwnNote: true, button: 7 })).toBe('remove');
    //a Stranded Note: no button of this instrument voices it, and the canvas is where it is deleted
    expect(proCellAction({ ...cell, hasOwnNote: true, button: -1 })).toBe('remove');
  });

  it('is inert on a row this instrument cannot voice - the striped rows and everything outside the zone', () => {
    expect(proCellAction(cell)).toBe('inert');
  });

  // The occupancy rule the composer keyboard already applies to a covered button: a cell inside
  // another note's span on this track holds no note of its own, and the tail is edited through its
  // own long press rather than by tapping the middle of it.
  it('is inert on a cell covered by an earlier span of the same layer', () => {
    expect(proCellAction({ ...cell, covered: true, button: 7 })).toBe('inert');
    expect(proCellAction({ ...cell, covered: true, hasOwnNote: true, button: 7 })).toBe('inert');
  });
});

// The keyboard's own threshold, and the canvas' - spec §12 forbids a second one, and a drift here
// would make a key and a cell feel like different surfaces holding the same popover.
describe('the long-press threshold', () => {
  it('is the composer keyboard\'s 450ms', () => {
    expect(COMPOSER_LONG_PRESS_MS).toBe(450);
  });
});

// ---------------------------------------------------------------------------------------------
// ...AND THE CALL SITE, parsed rather than driven.
//
// The rules above say what a gesture MEANS; what the composer then does with it lives in
// Composer.svelte, and this project deliberately has no component harness that could replace that
// file's audio/canvas/service graph (test/composerToolsClipboard.test.ts states the same constraint
// and takes the same route). What is asserted here is therefore policy - which function owns which
// call - and it is chosen to cover exactly the three claims spec §7 makes about the canvas edit that
// no runtime test in this repo can reach: it does not move the cursor, it is undoable, and it is the
// KEYBOARD'S path rather than a second copy of it. The behaviour behind each is covered live in the
// browser smoke pass.
const composer = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8');
const instanceScript = composer.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1];
if (!instanceScript) throw new Error('Composer.svelte has no TypeScript instance script');
const source = ts.createSourceFile(
  'Composer.svelte.ts',
  instanceScript,
  ts.ScriptTarget.Latest,
  true
);

/** One function's source text with its comments stripped - a comment naming a call must not satisfy an assertion about making it. */
function functionCode(functionName: string): string {
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName
  );
  if (!declaration) throw new Error(`Composer.svelte has no ${functionName} function`);
  return declaration
    .getText()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('the Pro View tap edits through the keyboard\'s own path', () => {
  it('the keyboard toggle IS the shared one, in the selected column', () => {
    const code = functionCode('toggleNoteImmediate');
    expect(code).toContain('toggleNoteInColumn(song.selected');
    //...and holds nothing of its own any more: a second copy of the add/remove branch here is
    //exactly the drift this extraction exists to prevent
    expect(code).not.toContain('addNoteAt');
    expect(code).not.toContain('removeNoteAt');
  });

  it('the canvas tap goes through the same function, in the column it landed on', () => {
    const code = functionCode('handleProCellTap');
    expect(code).toContain('toggleNoteInColumn(columnIndex');
  });

  it('the shared toggle previews, honours the occupancy rule and rides the autosave funnel', () => {
    const code = functionCode('toggleNoteInColumn');
    //the preview comes FIRST, so a covered button is still heard - and a removal previews too,
    //which is what the composer keyboard has always done
    expect(code.indexOf('playSound(layer, id)')).toBeLessThan(code.indexOf('getSpanCovering'));
    expect(code).toContain('handleAutoSave()');
  });

  it('a canvas tap moves the cursor nowhere', () => {
    for (const name of ['handleProCellTap', 'toggleNoteInColumn', 'handleProCellLongPress']) {
      const code = functionCode(name);
      expect(code).not.toContain('selectColumn');
      expect(code).not.toContain('song.selected =');
    }
  });

  it('a canvas edit is one undo entry, taken before the edit and only when it edits', () => {
    const code = functionCode('handleProCellTap');
    //the inert tap returns before the snapshot, so an undo stack cannot fill with no-ops
    expect(code.indexOf("=== 'inert'")).toBeLessThan(code.indexOf('addToHistory()'));
    //...and the snapshot precedes the mutation, or it records the state undo is meant to leave
    expect(code.indexOf('addToHistory()')).toBeLessThan(code.indexOf('toggleNoteInColumn'));
  });

  it('the canvas long press applies the keyboard\'s own gates', () => {
    const code = functionCode('handleProCellLongPress');
    //while the song plays, holding MEANS recording a sustain; durations are only authorable on
    //instruments that can sustain; and the popover opens on a note of YOUR layer or not at all
    expect(code).toContain('if (isPlaying) return false');
    expect(code).toContain('supportsSustain');
    expect(code).toContain('addToHistory()');
    expect(code).toContain('return true');
  });
});
