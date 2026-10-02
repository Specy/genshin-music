// The ONE place a song becomes a downloaded file (ADR-0007 addendum, 2026-10-02).
//
// A download is always the current format, whole. When the running game's config enables
// `features.legacySheetExport`, the legacy sheet fields (`songNotes`, `pitchLevel`, `isComposed`,
// `bitsPerPage`, `isEncrypted`) are ADDED beside it - the same hybrid the pre-v4 app downloaded,
// for the third-party sheet tools that read nothing else. They are a lossy VIEW: a note with no
// button on the frozen default instrument has no `songNotes` key, and no duration survives.
//
// Nothing ever reads them back. This app and the pre-v4 one both look at `songNotes` only when a
// file has no `data` (getSongType), and every v5 file has one, so re-importing a download always
// takes the lossless path. Keep it that way: never add `columns` or flat `notes` here, or the pre-v4
// composer opens the file as an empty song and can save that over the user's own.
import {LEGACY_SHEET_EXPORT} from "$core/legacyConfig"
import type {OldFormat} from "$core/types"
import {ComposedSong} from "./ComposedSong.svelte"
import {RecordedSong} from "./RecordedSong"
import type {SerializedSong} from "./Song.svelte"
import type {VsrgSong} from "./VsrgSong.svelte"

export type DownloadableSong = {
    file: SerializedSong & Partial<OldFormat>
    /** Notes the legacy sheet fields could not name. The `file` itself still has every one. */
    droppedNotes: number
}

export function serializeForDownload(
    song: ComposedSong | RecordedSong | VsrgSong,
    legacySheetExport: boolean = LEGACY_SHEET_EXPORT
): DownloadableSong {
    const file = song.serialize()
    if (!legacySheetExport) return {file, droppedNotes: 0}
    if (!(song instanceof ComposedSong) && !(song instanceof RecordedSong)) return {file, droppedNotes: 0}
    try {
        return {
            file: {...file, ...song.legacySheetFields()},
            droppedNotes: song.countLegacySheetDroppedNotes()
        }
    } catch (e) {
        //the extra fields are a courtesy to other tools: never let them cost the user the download
        console.error('Could not build the legacy sheet fields, downloading the current format only', e)
        return {file, droppedNotes: 0}
    }
}
