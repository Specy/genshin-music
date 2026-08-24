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
    'undo',
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

  it('re-checks the lock after destructive confirmation dialogs', () => {
    expect(functionCode('removeInstrument').match(/songLocked/g)).toHaveLength(2);
    expect(functionCode('mergeLayer').match(/songLocked/g)).toHaveLength(2);
    expect(functionCode('renameSong').match(/songLocked/g)).toHaveLength(2);
  });
});

describe('the MIDI import lifecycle has one save boundary', () => {
  it('settles in-flight writes before locking and opening', () => {
    const code = functionCode('changeMidiVisibility');
    const lock = code.indexOf('midiOpening = true');
    for (const settlement of [
      'durationPopover = null',
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

  it('bypasses the load prompt for previews and dirties an installed preview on close', () => {
    expect(functionCode('loadSong')).toContain('if (!preview && changes !== 0)');
    const visibility = functionCode('changeMidiVisibility');
    expect(visibility).toContain('if (isMidiVisible && midiPreviewLoaded)');
    expect(visibility).toContain('changes = Math.max(changes, 1)');
  });

  it('treats an installed preview as unsaved when navigation bypasses the close path', () => {
    expect(functionCode('prepareToLeave')).toContain(
      'if (changes === 0 && !midiPreviewLoaded) return true'
    );
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
    expect(midiParser).toContain('return await parseAudioToMidi(audio, name)');
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
