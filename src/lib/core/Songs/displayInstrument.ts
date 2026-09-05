// WHICH INSTRUMENT THE PLAYER'S ON-SCREEN KEYBOARD IS SHAPED LIKE.
//
// The player keyboard takes its Shape (ADR-0003: the row/column grid and the labels) and its BUTTON
// COUNT from one instrument, and both have to come from the SAME one or the grid and the notes in
// it disagree - 15 piano buttons laid out in a drum's 4 columns, say. This module is that single
// choice, pulled out of Player.svelte so it can be stated and tested without mounting a component;
// the component's own half is the $state field this feeds and the $effect that assigns it.
//
// IT FOLLOWS TRACK 0, which is the instrument whose sound the live keyboard plays (Player.svelte's
// `instruments[0]`) and whose notes fill playerStore.keyboard. That is the whole point: the audio
// already switched to the song's instrument while the keyboard kept the shape of whatever came
// before, so the shape has to follow the same track the sound does.
//
// The alternative considered was the WIDEST instrument across the song's tracks, which would keep
// every track's notes on the grid. Rejected: a drum song with one piano track would go on showing a
// 15-button piano keyboard while playing drums, which is the complaint this exists to answer. The
// cost of following track 0 is that a wider track's notes can fall outside the grid - they are
// stranded notes, they still SOUND (playSong falls back to playing the note directly), and
// PlayerKeyboard's approaching and practice filters drop them rather than scoring them as misses.

import {INSTRUMENTS} from '$core/legacyConfig'
import type {InstrumentName} from '$core/types'

/**
 * @param songInstrumentNames the loaded song's per-track instruments, in track order; empty when no
 *  song is playing (the stop-time restore passes nothing).
 * @param settingsInstrumentName the user's own instrument, which is what the keyboard shows outside
 *  a song.
 */
export function displayInstrumentNameFor(
    songInstrumentNames: readonly InstrumentName[],
    settingsInstrumentName: InstrumentName
): InstrumentName {
    const first = songInstrumentNames[0]
    // A song carrying no instruments, or one naming an instrument this game build does not have, is
    // not a shape to follow. (Instrument's own constructor also falls back to INSTRUMENTS[0], but
    // that would silently show the DEFAULT instrument's keyboard rather than the user's own.)
    if (first === undefined || !INSTRUMENTS.includes(first)) return settingsInstrumentName
    return first
}
