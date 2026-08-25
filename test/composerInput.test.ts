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
  PRO_ZOOM_WHEEL_RATE,
  pinchSpan,
  pinchZoomFactor,
  proCellAction,
  proTapTarget,
  stagePressArmsLongPress,
  stageReleaseIntent,
  wheelIsProVerticalScroll,
  wheelIsProZoom,
  wheelZoomFactor,
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
// would make a key and a cell feel like different surfaces holding the same popover. 400ms since
// the 2026-08-22 pass (it was 450): the same number for a key, a cell and a physical note key.
describe('the long-press threshold', () => {
  it('is the composer keyboard\'s 400ms', () => {
    expect(COMPOSER_LONG_PRESS_MS).toBe(400);
  });
});

/**
 * THE ZOOM GESTURES (spec §7, user revision 2026-08-22): which wheel is a zoom, how much one asks
 * for, and how a two-finger pinch is measured.
 *
 * All three are stated as pure arithmetic for the same reason every other rule in this file is: the
 * renderer that receives the events is behind a dynamic pixi import, so the only thing a test could
 * otherwise drive is a whole fake stage. What the renderer keeps is where the zoom IS (its own
 * ephemeral multiplier) and where the gesture is anchored; the RANGE it is held in belongs to
 * proViewGeometry.clampProZoom, which has its own coverage.
 */
describe('what a wheel with a modifier means', () => {
  it('is a zoom in the Pro View and nothing at all in the Compressed one', () => {
    expect(wheelIsProZoom({ proView: true, ctrlKey: true, metaKey: false })).toBe(true);
    //a trackpad pinch arrives as ctrl+wheel; the mac convention for the same intent is meta
    expect(wheelIsProZoom({ proView: true, ctrlKey: false, metaKey: true })).toBe(true);
    //THE COMPRESSED VIEW IS UNTOUCHED: there is no vertical axis to zoom there, so the same event
    //keeps the horizontal meaning it has always had
    expect(wheelIsProZoom({ proView: false, ctrlKey: true, metaKey: true })).toBe(false);
  });

  it('leaves a plain wheel horizontal in both views', () => {
    for (const proView of [false, true]) {
      expect(wheelIsProZoom({ proView, ctrlKey: false, metaKey: false })).toBe(false);
    }
  });

  it('reads shift+wheel as the Pro View vertical scroll, with zoom outranking it (user, 2026-08-22)', () => {
    expect(
      wheelIsProVerticalScroll({ proView: true, shiftKey: true, ctrlKey: false, metaKey: false })
    ).toBe(true);
    //ctrl/meta outrank shift: a ctrl+shift+wheel is still the zoom's, on either convention
    expect(
      wheelIsProVerticalScroll({ proView: true, shiftKey: true, ctrlKey: true, metaKey: false })
    ).toBe(false);
    expect(
      wheelIsProVerticalScroll({ proView: true, shiftKey: true, ctrlKey: false, metaKey: true })
    ).toBe(false);
    //no shift, no claim - the plain wheel keeps the horizontal axis
    expect(
      wheelIsProVerticalScroll({ proView: true, shiftKey: false, ctrlKey: false, metaKey: false })
    ).toBe(false);
    //the Compressed View has no vertical axis, the same reason the zoom refuses it
    expect(
      wheelIsProVerticalScroll({ proView: false, shiftKey: true, ctrlKey: false, metaKey: false })
    ).toBe(false);
  });

  it('asks for a multiplier that grows upward and shrinks downward, symmetrically', () => {
    //a wheel's delta is positive DOWNWARD, and down is out
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    //exponential, so a notch means the same ratio wherever the zoom is, and a notch back undoes it
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 12);
    expect(wheelZoomFactor(-50) ** 2).toBeCloseTo(wheelZoomFactor(-100), 12);
    //a mouse notch is ~100px of delta and lands near the documented ~1.28x
    expect(wheelZoomFactor(-100)).toBeCloseTo(Math.exp(100 * PRO_ZOOM_WHEEL_RATE), 12);
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1.2);
    expect(wheelZoomFactor(-100)).toBeLessThan(1.4);
    //...while a trackpad's own 1-10px deltas move it by a few percent, which is what makes a pinch
    //read as continuous rather than as steps
    expect(wheelZoomFactor(-5)).toBeLessThan(1.02);
    //hardware cannot poison the product the caller multiplies
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });
});

describe('a two-finger pinch, measured', () => {
  it('is the fingers\' full distance and the point between them', () => {
    const span = pinchSpan({ x: 0, y: 0 }, { x: 30, y: 40 });
    //2D, so a pinch held at any angle counts for what it is
    expect(span.distance).toBe(50);
    expect(span.centerX).toBe(15);
    expect(span.centerY).toBe(20);
    //order does not matter: two fingers have no first and second
    const swapped = pinchSpan({ x: 30, y: 40 }, { x: 0, y: 0 });
    expect(swapped).toEqual(span);
  });

  it('zooms by how much the fingers spread since they were last measured', () => {
    expect(pinchZoomFactor(100, 200)).toBe(2);
    expect(pinchZoomFactor(200, 100)).toBe(0.5);
    expect(pinchZoomFactor(120, 120)).toBe(1);
    //INCREMENTAL, so the product of a gesture's frames is the gesture: 100 -> 150 -> 300 is 3x
    expect(pinchZoomFactor(100, 150) * pinchZoomFactor(150, 300)).toBeCloseTo(3, 12);
  });

  it('answers 1 for a degenerate span rather than an infinity', () => {
    //two fingers landing on the same point, or a first frame with nothing to compare against
    expect(pinchZoomFactor(0, 50)).toBe(1);
    expect(pinchZoomFactor(50, 0)).toBe(1);
    expect(pinchZoomFactor(Number.NaN, 50)).toBe(1);
    expect(pinchSpan({ x: 5, y: 5 }, { x: 5, y: 5 }).distance).toBe(0);
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
// no runtime test in this repo can reach: it does not move the cursor, it goes through the model
// (which is what makes it undoable since ADR-0013), and it is the KEYBOARD'S path rather than a
// second copy of it. The behaviour behind each is covered live in the browser smoke pass.
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
  //...or the arrow-function CONST of the same name, which is how the two keyboard listeners are
  //written (they are typed as ShortcutListener rather than declared)
  const variable = source.statements.find(
    (statement): statement is ts.VariableStatement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (entry) => ts.isIdentifier(entry.name) && entry.name.text === functionName
      )
  );
  const node = declaration ?? variable;
  if (!node) throw new Error(`Composer.svelte has no ${functionName} function`);
  return node
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

  it('records nothing of its own - and an inert tap edits nothing to record', () => {
    const code = functionCode('handleProCellTap');
    //ADR-0013 moved recording to the model's own write sites, so this path takes no snapshot and
    //touches no history; an inert tap returns before the toggle, so it records nothing either
    expect(code).not.toContain('history');
    expect(code.indexOf("=== 'inert'")).toBeLessThan(code.indexOf('toggleNoteInColumn'));
  });

  it('the canvas long press applies the keyboard\'s own gates', () => {
    const code = functionCode('handleProCellLongPress');
    //while the song plays, holding MEANS recording a sustain; durations are only authorable on
    //instruments that can sustain; and the popover opens on a note of YOUR layer or not at all
    expect(code).toContain('if (isPlaying) return false');
    expect(code).toContain('supportsSustain');
    //...and the hold is ONE Undo Step however many spans it writes (CONTEXT.md: Duration Hold)
    expect(code).toContain('beginDurationHold()');
    expect(code).toContain('return true');
  });
});

/**
 * THE FOUR SURFACES RUN ONE PRESS MACHINE (user decisions 2026-08-22): a finger on a key, a Pro View
 * cell, a physical note key and an incoming MIDI note. Same policy assertions as the block above and
 * for the same reason - the machine is Composer.svelte's, stateful (two registries and a clock), and
 * this project has no component harness that could mount that file's audio/canvas/service graph.
 *
 * What is pinned here is the thing a second copy would silently break: the ORDER of the three
 * branches every down edge takes (record a sustain -> toggle immediately while playing -> otherwise
 * begin a press), and that the hold path is the shared one rather than a parallel clock.
 */
describe('every input surface runs the one note-press machine', () => {
  it('the physical key defers its removal to the key-up, and playing is untouched', () => {
    const down = functionCode('handleKeyboardShortcut');
    //the sustain recording is still asked FIRST, so a hold while playing is a performance
    expect(down.indexOf('startSustainRecording')).toBeLessThan(down.indexOf('toggleNoteImmediate'));
    //...then the playing song's immediate toggle, and only a STOPPED one reaches the press machine
    expect(down.indexOf('toggleNoteImmediate')).toBeLessThan(down.indexOf('beginNoteHold'));
    expect(down).toContain("beginNoteHold(holderToken('keyboard', code), note)");
    expect(functionCode('handleKeyboardRelease')).toContain("endNoteHold(holderToken('keyboard'");
  });

  it('MIDI is a third feeder of that machine and not a toggle of its own', () => {
    const code = functionCode('handleMidi');
    //THE UP EDGE, routed through isNoteRelease - which is what catches the velocity-0 note-ON every
    //controller is allowed to send instead of a note-off
    expect(code).toContain('isNoteRelease(eventType, velocity)');
    expect(code.indexOf('endNoteHold(holder)')).toBeLessThan(code.indexOf('isDown(eventType)'));
    //THE DOWN EDGE, in the same three-branch order the physical key takes
    expect(code.indexOf('startSustainRecording')).toBeLessThan(code.indexOf('toggleNoteImmediate'));
    expect(code).toContain('if (isPlaying) return toggleNoteImmediate(pressed)');
    expect(code.indexOf('toggleNoteImmediate')).toBeLessThan(code.indexOf('beginNoteHold'));
    //ONE HOLDER PER MIDI NOTE AND PRESET SLOT, which is what lets a device hold several notes at
    //once - and it is the same token on both edges, or a hold would never end
    expect(code).toContain('midiHolderToken(note, keyboardNote.index)');
  });

  it('a hold is the shared clock, the shared press and the shared popover', () => {
    const begin = functionCode('beginNoteHold');
    //a duplicate down edge (an OS auto-repeat, a controller re-sending a note-on) arms nothing
    expect(begin.indexOf('noteHolds.has(holder)')).toBeLessThan(begin.indexOf('beginNotePress'));
    expect(begin).toContain('beginNotePress(id)');
    expect(begin).toContain('COMPOSER_LONG_PRESS_MS');
    expect(begin).toContain('openDurationPopover(id,');
    const end = functionCode('endNoteHold');
    expect(end).toContain('clearTimeout(hold.longPress)');
    expect(end).toContain('endNotePress(hold.id)');
  });

  it('the keyless surfaces open the popover through the keyboard\'s own gates', () => {
    const code = functionCode('openDurationPopover');
    expect(code).toContain('if (isPlaying) return');
    expect(code).toContain('supportsSustain');
    //a hold over a span's TAIL edits the note that owns the tail, not the column under the key
    expect(code).toContain('press.coveringStart ?? song.selected');
    //the same group the canvas' hold opens, and the popover's dismissal is what closes it
    expect(code).toContain('beginDurationHold()');
    //...and it opens as a Duration Hold: the press is still down by definition (CONTEXT.md)
    expect(code).toContain('holdActive: true');
  });

  it('an interrupted hold abandons rather than releases', () => {
    const code = functionCode('abandonNoteHolds');
    //a blur or a vanished MIDI device is not a short press, so it must not delete the note the
    //down edge added - what it ends is the clock and the Duration Hold
    expect(code).not.toContain('endNotePress');
    expect(code).toContain('clearTimeout(hold.longPress)');
    expect(code).toContain('holdActive = false');
  });

  it('a held note key steps aside from the composer shortcut combos', () => {
    //the wiring only - the mechanism itself is KeybindsStore's and is driven for real in
    //test/keyboardProvider.test.ts
    expect(instanceScript).toContain('transparentCodes: heldNoteKeyCodes');
    const code = functionCode('heldNoteKeyCodes');
    //BOTH registries, because a key holds a note in two ways: stopped it is a press, playing it is
    //a sustain being recorded
    expect(code).toContain('noteHolds.keys()');
    expect(code).toContain("entriesOfSource('keyboard')");
  });
});

/**
 * THE CLICK THAT PUTS AN OVERLAY AWAY WRITES NO NOTE ON THE PRO VIEW CANVAS (maintainer rule,
 * 2026-08-22, scope revised the same day: the CANVAS only; extended to the layer settings popup
 * 2026-08-23). With one of them open a tap on the canvas is aimed at dismissing it, and it used to
 * add or remove a note under itself on the way past. The composer KEYBOARD deliberately stays live
 * - its presses edit and sound as ever, overlay or no overlay.
 *
 * TWO SOURCES, ONE GUARD: the side menu publishes its own clickOutside predicate and the layer
 * settings popup publishes `isEditing` (its clickOutside is `active: true` while mounted, so being
 * open IS its predicate). Composer.svelte ORs them, and the canvas is told only the answer.
 *
 * Policy again, and for a second reason on top of this block's own: the guard is made of a DOM event
 * ordering (a pointerdown precedes the document `click` those clickOutsides close on)
 * across four components, and a jsdom test that mounted all four would be asserting jsdom's
 * dispatch order rather than the browser's. What is pinned here is what such a test could not see
 * either way - that the halves are wired to ONE predicate and that the guard is taken at the
 * PRESS.
 */
const composerCanvas = readFileSync(
  'src/lib/components/pages/Composer/ComposerCanvas.svelte',
  'utf8'
);
const composerMenu = readFileSync('src/lib/components/pages/Composer/ComposerMenu.svelte', 'utf8');
const instrumentControls = readFileSync(
  'src/lib/components/pages/Composer/InstrumentControls.svelte',
  'utf8'
);
const instrumentSettingsPopup = readFileSync(
  'src/lib/components/pages/Composer/InstrumentSettingsPopup.svelte',
  'utf8'
);

describe('a press made to dismiss a composer overlay is not an edit', () => {
  it('the menu reports the very condition its own clickOutside runs on', () => {
    //ONE expression, read twice - the guard and the menu cannot disagree about which clicks are
    //dismissals, which is the whole reason the predicate is published instead of `isOpen`
    expect(composerMenu).toContain('const dismissesOutsideClicks = $derived(isOpen && isVisible);');
    expect(composerMenu).toContain('active: dismissesOutsideClicks,');
    expect(composerMenu).toContain('onPanelOpenChange?.(dismissesOutsideClicks);');
  });

  it('the keyboard press stays live - the guard is the canvas gestures alone', () => {
    //THE SCOPE REVISION, pinned in the negative: the guard shipped covering the keyboard press too
    //and the maintainer narrowed it to the Pro View canvas the same day, so a keyboard press must
    //not consult the flag - with the menu open, keys still edit and sound
    expect(functionCode('handleClick')).not.toContain('menuDismissesClicks');
    expect(functionCode('handleClick')).not.toContain('layerSettingsDismissesClicks');
    expect(functionCode('handleClick')).not.toContain('overlayDismissesClicks');
    //...and the flag is the menu's own report rather than a second reading of the menu's state
    //(the wiring is in the TEMPLATE, so this reads the whole file rather than the instance script)
    expect(composer).toContain('onPanelOpenChange={(open) => (menuDismissesClicks = open)}');
  });

  it('the layer settings popup answers the same guard as the side menu', () => {
    //THE POPUP'S PREDICATE IS ITS OWN MOUNTED-NESS: its clickOutside is unconditionally active, so
    //`isEditing` is the whole condition and there is no second expression that could disagree
    expect(instrumentSettingsPopup).toContain(
      'use:clickOutside={{ active: true, ignoreFocusable: true, onOutside: onClose }}'
    );
    //...and it is mounted only while editing, so `isEditing` and "dismisses outside clicks" are
    //the same fact rather than two that could drift
    expect(instrumentControls).toContain('{#if isEditing}');
    //...reported from the state itself, not from the four call sites that close it
    expect(instrumentControls).toContain('onSettingsOpenChange?.(isEditing);');
    expect(composer).toContain(
      'onSettingsOpenChange={(open) => (layerSettingsDismissesClicks = open)}'
    );
  });

  it('the canvas is told the answer, not which overlay is open', () => {
    //ONE derived value feeds the one prop: the canvas never learns there are two sources, which is
    //what keeps a third overlay a change to this line alone
    expect(composer).toContain(
      'const overlayDismissesClicks = $derived(menuDismissesClicks || layerSettingsDismissesClicks);'
    );
    expect(composer).toContain('{overlayDismissesClicks}');
    //and the canvas takes exactly one such prop - no per-overlay flags leaked through
    expect(composerCanvas).not.toContain('menuDismissesClicks');
    expect(composerCanvas).not.toContain('layerSettingsDismissesClicks');
  });

  it('the canvas latches the flag at the press, not when the edit fires', () => {
    //the press edge, in the CAPTURE phase on the element the pixi canvas is appended into
    expect(composerCanvas).toContain(
      'onpointerdowncapture={() => (pressDismissedOverlay = overlayDismissesClicks || songLocked)}'
    );
    //...and both cell gestures answer that latch. A settled tap fires at the RELEASE and a Duration
    //Hold 400ms into the press, so reading the live flag at either would be asking about a menu the
    //gesture may already have closed.
    expect(composerCanvas).toContain('if (pressDismissedOverlay || songLocked) return;');
    expect(composerCanvas).toContain(
      'pressDismissedOverlay || songLocked ? false : onProCellLongPress('
    );
  });

  it('gates those two gestures and nothing else the canvas does', () => {
    //everything handed to the renderer at construction, up to its geometry report
    const handedToTheRenderer = composerCanvas.slice(
      composerCanvas.indexOf('new ComposerRendererClass('),
      composerCanvas.indexOf('onGeometryChange:')
    );
    //TWO READS, one per cell gesture. `selectColumn`, `toggleBreakpoint`, `onKeyboardDismiss` and
    //the hold's drag/end go over unwrapped, which is what keeps a dismissing tap that lands on
    //column selection, seeking or a scroll harmless-but-functional (the maintainer's scope)
    expect(handedToTheRenderer.match(/pressDismissedOverlay/g)).toHaveLength(2);
    //...and the pixi side is told nothing about the menu at all: the flag never crosses into it
    const composerRenderer = readFileSync(
      'src/lib/components/pages/Composer/ComposerRenderer.ts',
      'utf8'
    );
    expect(composerRenderer).not.toContain('overlayDismissesClicks');
    expect(composerRenderer).not.toContain('pressDismissedOverlay');
  });
});
