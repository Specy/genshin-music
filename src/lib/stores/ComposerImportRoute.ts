/**
 * Where a file the library cannot take goes: a MIDI that is not one of our own exports, an audio
 * or a video file. Only the composer's MIDI importer can make a song of those, so wherever the
 * file was handed over - an Import button, or dropped anywhere on the window - it ends up there.
 *
 * HOW it gets there depends on the page, which is why this is a route and not a function:
 *  - anywhere but the composer, the user is asked first (opening the composer leaves the page they
 *    are on), and a yes carries the file across the navigation in the pending-import slot
 *    (PendingMidiImportStore) - the flow the player's Import button always had;
 *  - on the composer, which CLAIMS the route while mounted, the importer simply opens with the file
 *    in it, as its own Import button always did. Its own save question still guards unsaved work,
 *    and while the importer is open every MIDI is sent to it (see FileService.importFiles).
 *
 * Module scope, like the pending slot beside it: the window-wide drop handler lives in the root
 * layout, which no page can hand a callback to, and a claim has to outlive nothing but the page.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { i18n } from '$i18n/i18n';
import type { ComposerImporter } from '$core/Services/FileService';
import { asyncConfirm } from '$stores/AsyncPromptStore.svelte';
import { isStillPendingMidiImport, setPendingMidiImport } from '$stores/PendingMidiImportStore';

/** What a page that has the importer itself provides. */
export type ClaimedComposerImporter = {
  /** Open the importer with `file`; resolves to whether it took the file. */
  open: (file: File) => Promise<boolean>;
  isOpen: () => boolean;
};

let claimed: ClaimedComposerImporter | null = null;

/**
 * Make `importer` the way files reach the importer while the caller is mounted. Returns the
 * release, which only releases THIS claim: a page mounting before the previous one has unmounted
 * must not have its claim dropped by the old page's teardown.
 */
export function claimComposerImports(importer: ClaimedComposerImporter): () => void {
  claimed = importer;
  return () => {
    if (claimed === importer) claimed = null;
  };
}

/** Send `file` to the composer's MIDI importer; resolves to whether the importer has it now. */
export async function openInComposerImporter(file: File): Promise<boolean> {
  if (claimed) return claimed.open(file);
  const confirmed = await asyncConfirm(i18n.t('player:midi_or_audio_import_redirect_warning'));
  if (!confirmed) return false;
  // A hard reload of /composer?showMidi=true loses the slot, and only means the importer opens empty.
  setPendingMidiImport(file);
  await goto(resolve('/composer?showMidi=true'));
  // The composer takes the slot as it mounts. Still there means the navigation did not happen - a
  // leave the page's guard is still asking about, or was refused. Left in the slot it is harmless:
  // the composer only reads the slot at a hand-off's mount, and empties it whenever its importer
  // is opened any other way.
  return !isStillPendingMidiImport(file);
}

/** The route as FileService.importFiles takes it. */
export const composerImporter: ComposerImporter = {
  open: openInComposerImporter,
  isOpen: () => claimed?.isOpen() ?? false,
};
