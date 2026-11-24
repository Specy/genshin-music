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
 *    in it, as its own Import button always did. Its own save question still guards unsaved work.
 *
 * Module scope, like the pending slot beside it: the window-wide drop handler lives in the root
 * layout, which no page can hand a callback to, and a claim has to outlive nothing but the page.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { i18n } from '$i18n/i18n';
import { asyncConfirm } from '$stores/AsyncPromptStore.svelte';
import { setPendingMidiImport } from '$stores/PendingMidiImportStore';

type ComposerImportHandler = (file: File) => unknown;

let claimed: ComposerImportHandler | null = null;

/**
 * Make `handler` the way files reach the importer while the caller is mounted. Returns the release,
 * which only releases THIS claim: a page mounting before the previous one has unmounted must not
 * have its claim dropped by the old page's teardown.
 */
export function claimComposerImports(handler: ComposerImportHandler): () => void {
  claimed = handler;
  return () => {
    if (claimed === handler) claimed = null;
  };
}

/** Send `file` to the composer's MIDI importer, by whichever route the current page provides. */
export async function openInComposerImporter(file: File): Promise<void> {
  if (claimed) {
    await claimed(file);
    return;
  }
  const confirmed = await asyncConfirm(i18n.t('player:midi_or_audio_import_redirect_warning'));
  if (!confirmed) return;
  // A hard reload of /composer?showMidi=true loses the slot, and only means the importer opens empty.
  setPendingMidiImport(file);
  await goto(resolve('/composer?showMidi=true'));
}
