/**
 * THE COMPOSER'S HALF OF ADR-0013 - the four wirings that live in the component rather than in the
 * song model or the history container, each of which was a real defect before it was written:
 * a walk that leaves the active layer addressing a track the Step removed, a Duration Hold group
 * left open when the popover's note is deleted under it, a rename that is already on disk being
 * recorded as an undoable Step, and the layer popup's per-tick inputs landing one Step each.
 *
 * ASSERTED AGAINST THE SOURCE, like test/composerMidiLock.test.ts and the other composer rows:
 * Composer.svelte is a 3000-line component behind a dynamic pixi import, so these rules can only be
 * exercised whole through a mounted surface. What is pinned here is the shape of each fix - the
 * behaviour it produces is what the round-trip and lifecycle suites cover.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const composer = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8');
const popup = readFileSync(
  'src/lib/components/pages/Composer/InstrumentSettingsPopup.svelte',
  'utf8'
);
const controls = readFileSync('src/lib/components/pages/Composer/InstrumentControls.svelte', 'utf8');

const instanceScript = composer.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1];
if (!instanceScript) throw new Error('Composer.svelte has no TypeScript instance script');
const source = ts.createSourceFile(
  'Composer.svelte.ts',
  instanceScript,
  ts.ScriptTarget.Latest,
  true
);

/** One named function's body with its comments stripped - comments must never satisfy a row. */
function functionCode(functionName: string): string {
  const node = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName
  );
  if (!node) throw new Error(`Composer.svelte has no ${functionName} function`);
  return node
    .getText()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('a history walk leaves no cursor pointing past the roster', () => {
  it('clamps the active layer, which a Step can shrink out from under', () => {
    //an undone addInstrument or a redone removal shrinks `instruments`; `layer` is cursor state the
    //Step deliberately does not carry, so `currentInstrument` would be undefined - a TypeError on
    //the next note key, and notes entered meanwhile land on a trackIndex serialize() drops
    expect(functionCode('walkHistory')).toContain(
      'layer = Math.min(layer, song.instruments.length - 1)'
    );
  });
});

describe('the Duration Hold group cannot outlive its note', () => {
  it('dismisses the popover when the note it edits is gone', () => {
    //the {#if} only unmounts the box: `durationPopover` staying set keeps the group open, and a
    //group nobody closes never lands its Step - every later edit folds into it
    expect(instanceScript).toMatch(
      /\$effect\(\(\) => \{\s*if \(durationPopover && popoverSpan === null\) dismissDurationPopover\(\);\s*\}\);/
    );
  });

  it('still routes every dismissal through the one path that ends the group', () => {
    expect(functionCode('dismissDurationPopover')).toContain(
      'if (history.groupDepth > 0) history.endGroup();'
    );
  });
});

describe('the song menu rename is not an Undo Step', () => {
  it('mirrors the name the storage write already committed, recording nothing', () => {
    //songService.renameSong writes the new name straight to storage: a Step here would report a
    //song that matches the file as dirty, and one Ctrl+Z would put the old name back in the
    //composer while the library kept the new one
    const code = functionCode('renameSong');
    expect(code).toContain('song.name = newName;');
    expect(code).not.toContain('song.rename(');
  });
});

describe('the layer settings popup collapses a gesture into one Step', () => {
  it('brackets both continuous inputs from every end they can have', () => {
    //ungrouped, one volume drag lands ~125 Steps: past UNDO_HISTORY_CAP, so the session's real
    //edits are evicted and the Savepoint stranded
    expect(popup).toContain('onpointerdown={startVolumeGroup}');
    expect(popup).toContain('onpointerup={endVolumeGroup}');
    expect(popup).toContain('onpointercancel={endVolumeGroup}');
    expect(popup).toContain('onlostpointercapture={endVolumeGroup}');
    expect(popup).toContain('onfocus={startAliasGroup}');
    expect(popup).toContain('onblur={endAliasGroup}');
    //...including the popup being taken away mid-gesture (delete/merge close it)
    expect(popup).toMatch(/\$effect\(\(\) => \(\) => \{\s*endVolumeGroup\(\);\s*endAliasGroup\(\);/);
  });

  it('reaches the history through the panel, which only forwards', () => {
    expect(controls).toContain('{onEditGroupStart}');
    expect(controls).toContain('{onEditGroupEnd}');
    expect(composer).toContain('onEditGroupStart={beginInstrumentEditGroup}');
    expect(composer).toContain('onEditGroupEnd={endInstrumentEditGroup}');
    expect(functionCode('beginInstrumentEditGroup')).toContain('history.beginGroup();');
    expect(functionCode('endInstrumentEditGroup')).toContain(
      'if (history.groupDepth > 0) history.endGroup();'
    );
  });
});
