import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const composer = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8');
const midiParser = readFileSync(
  'src/lib/components/pages/Composer/MidiParser/MidiParser.svelte',
  'utf8'
);
const instanceScript = composer.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1];
if (!instanceScript) throw new Error('Composer.svelte has no TypeScript instance script');
const source = ts.createSourceFile(
  'Composer.svelte.ts',
  instanceScript,
  ts.ScriptTarget.Latest,
  true
);

function functionCode(functionName: string): string {
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName
  );
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

describe('the MIDI import session owns one handler-enforced song lock', () => {
  it('derives the lock from the open panel and its pending open question', () => {
    expect(instanceScript).toContain(
      'const songLocked = $derived(isMidiVisible || midiOpening);'
    );
  });

  it.each([
    'addInstrument',
    'removeInstrument',
    'mergeLayer',
    'editInstrument',
    'addColumns',
    'removeColumns',
    'toggleBreakpoint',
    'handleTempoChanger',
    //the undo/redo pair's one body - the wrappers are two lines each
    'walkHistory',
    'pasteColumns',
    'eraseColumns',
    'moveNotesBy',
    'switchLayerPosition',
    'deleteColumns',
    'toggleNoteInColumn',
    'handleProCellTap',
    'handleProCellLongPress',
    'openDurationPopover',
    'dragPopoverSpan',
    'setPopoverSpan',
  ])('%s refuses its write in the handler', (name) => {
    expect(functionCode(name)).toContain('songLocked');
  });

  it('refuses only settings serialized into the song', () => {
    expect(functionCode('handleSettingChange')).toContain('songLocked && data.songSetting');
  });

  it('degrades a keyboard, pointer, or MIDI sustain press to an audition', () => {
    const code = functionCode('startSustainRecording');
    expect(code.indexOf('if (songLocked)')).toBeLessThan(code.indexOf('if (!isPlaying)'));
    expect(code).toContain('playAuditionSound(layer, id)');
    expect(code).toContain('return true');
  });

  it('re-checks the lock after asynchronous questions, and asks none it need not', () => {
    //the layer merge and the layer delete lost their confirms with ADR-0013 (undo is the answer to
    //"this cannot be undone"), so there is no await between their guard and their write any more
    for (const name of ['removeInstrument', 'mergeLayer']) {
      expect(functionCode(name).match(/songLocked/g)).toHaveLength(1);
      expect(functionCode(name)).not.toContain('asyncConfirm');
    }
    //renameSong still asks, so it still re-checks on the other side of the await
    expect(functionCode('renameSong').match(/songLocked/g)).toHaveLength(2);
  });
});

describe('the MIDI import lifecycle has one save boundary', () => {
  it('settles in-flight writes before locking and opening', () => {
    const code = functionCode('changeMidiVisibility');
    const lock = code.indexOf('midiOpening = true');
    for (const settlement of [
      'dismissDurationPopover()',
      'abandonNoteHolds()',
      'abandonNotePresses()',
      'endAllSustainRecordings()',
    ]) {
      expect(code.indexOf(settlement)).toBeGreaterThanOrEqual(0);
      expect(code.indexOf(settlement)).toBeLessThan(lock);
    }
    expect(lock).toBeLessThan(code.indexOf('await askForSongUpdate()'));
    expect(code.indexOf('await askForSongUpdate()')).toBeLessThan(
      code.indexOf('isMidiVisible = true')
    );
  });

  it('bypasses the load prompt for previews and leaves an installed preview dirty on close', () => {
    expect(functionCode('loadSong')).toContain('if (!preview && songIsDirty)');
    //the flag SURVIVES the close (ADR-0013): the preview's own history is a fresh, clean one, so
    //`midiPreviewLoaded` is the whole of what keeps the promoted preview dirty until it is saved
    expect(instanceScript).toContain(
      'const songIsDirty = $derived(history.isDirty || midiPreviewLoaded);'
    );
    //cleared on OPENING a session and nowhere else in here: the close path leaving it set is what
    //stops a promoted preview from reading clean the moment the panel goes away
    expect(functionCode('changeMidiVisibility').match(/midiPreviewLoaded = false/g)).toHaveLength(
      1
    );
  });

  it('keeps the working song when saving it is cancelled during a load', () => {
    const code = functionCode('loadSong');
    const cancelledSave = code.indexOf('if (confirm && !(await updateSong(song))) return;');
    expect(cancelledSave).toBeGreaterThanOrEqual(0);
    expect(cancelledSave).toBeLessThan(code.indexOf('song = parsed'));
  });

  it('lets a newer working song supersede the delayed mount-time route load', () => {
    const code = functionCode('init');
    const ownership = code.indexOf('const initialSong = song;');
    const firstAwait = code.indexOf('await syncInstruments()');
    const routeLoad = code.indexOf('await songService.getSongById(songId)');
    const ownershipCheck = code.indexOf('if (!loadedSong || song !== initialSong) return;');
    const install = code.indexOf('loadSong(loadedSong)');

    expect(ownership).toBeGreaterThanOrEqual(0);
    expect(ownership).toBeLessThan(firstAwait);
    expect(routeLoad).toBeLessThan(ownershipCheck);
    expect(ownershipCheck).toBeLessThan(install);
  });

  it('treats an installed preview as unsaved when navigation bypasses the close path', () => {
    //`songIsDirty` is what carries the preview flag - see the row above
    expect(functionCode('prepareToLeave')).toContain('if (!songIsDirty) return true');
  });

  it('closes at explicit menu/new-song call sites, never from the general loader', () => {
    expect(functionCode('loadSongFromMenu')).toContain('changeMidiVisibility(false)');
    expect(functionCode('createNewSong')).toContain('changeMidiVisibility(false)');
    expect(functionCode('loadSong')).not.toContain('isMidiVisible = false');
  });

  it('keeps the importer Basepoint local and marks conversions as previews', () => {
    expect(midiParser).not.toContain('functions.changePitch');
    expect(midiParser).toContain('pitch = value');
    expect(midiParser).toContain('functions.loadSong(song, { preview: true })');
  });

  it('waits for a recursive first save and abandons parsers whose importer closed', () => {
    expect(functionCode('updateSong')).toContain('return updateSong(songToSave)');
    expect(midiParser).toContain('onDestroy(() => {');
    expect(midiParser).toContain('componentAlive = false');
    expect(midiParser.indexOf('if (!componentAlive) return;')).toBeLessThan(
      midiParser.indexOf('functions.loadSong(song, { preview: true })')
    );
    expect(midiParser).toContain('return await parseAudioToMidi(audio, name, generation)');
  });
});

describe('locked controls cannot mutate before the parent guard', () => {
  it('clones quick roster toggles before handing them to Composer', () => {
    const controls = readFileSync(
      'src/lib/components/pages/Composer/InstrumentControls.svelte',
      'utf8'
    );
    expect(controls).toContain('ins.clone().set({ visible: !ins.visible })');
    expect(controls).toContain('ins.clone().set({ solo: !ins.solo })');
  });

  it('guards the canvas drag callback as well as tap and long-press', () => {
    const canvas = readFileSync(
      'src/lib/components/pages/Composer/ComposerCanvas.svelte',
      'utf8'
    );
    expect(canvas).toContain('onProCellLongPressDrag: (deltaX) => {');
    expect(canvas).toContain('if (songLocked) return;');
  });

  it('disables rename on the locked current-song row', () => {
    const menu = readFileSync(
      'src/lib/components/pages/Composer/ComposerMenu.svelte',
      'utf8'
    );
    const row = readFileSync(
      'src/lib/components/pages/Composer/ComposerSongRow.svelte',
      'utf8'
    );
    expect(menu).toContain('songLocked: data.songLocked');
    expect(row).toContain('const renameLocked = $derived(songLocked && isCurrent)');
    expect(row).toContain('disabled={renameLocked}');
  });
});
