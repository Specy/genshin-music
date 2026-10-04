// A SONG PLAYED ON THE USER'S OWN KEYBOARD (src/lib/core/Songs/songRetarget.ts): the player's "don't
// sync the song's instrument and pitch" setting moves every track onto the user's instrument and
// Basepoint BY BUTTON, for one run, without dropping or reordering a single note.
//
// Same config-derived, never-branch-on-the-game rule as noteNumberTransforms.test.ts: instrument
// roles are found by capability, so the file runs under both PUBLIC_GAME builds and follows the
// config wherever it moves.
import {describe, expect, it} from 'vitest'
import {INSTRUMENTS, InstrumentData, RecordedNote, RecordedSong, isTrackAudible} from './imports'
import {retargetInstruments, retargetSong} from '../src/lib/core/Songs/songRetarget'
import {
    buttonToNumber, getNoteIdTable, numberToButton, resolvePlayerNoteButtons,
} from '../src/lib/core/Songs/noteIds'
import {planSongRender} from '$lib/audio/OfflineSongRenderer'
import {instrumentIdentityKey, variantSettingOf} from '$lib/games/instrumentSettings'
import type {Pitch} from '../src/lib/core/legacyConfig'
import type {SongRetarget} from '../src/lib/core/Songs/songRetarget'

const DEFAULT = INSTRUMENTS[0]
const sameTable = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((value, index) => value === b[index])
/** Another instrument laid out exactly like the default one: every button has its twin. */
const TWIN = INSTRUMENTS.find((name: string) =>
    name !== DEFAULT && sameTable(getNoteIdTable(name), getNoteIdTable(DEFAULT)))
/** An instrument missing some of the default's keys, so some notes have nowhere to go. */
const NARROW = INSTRUMENTS.find((name: string) =>
    getNoteIdTable(DEFAULT).some(nominal => !getNoteIdTable(name).includes(nominal)))!
const VARIANT = INSTRUMENTS.find((name: string) => variantSettingOf(name) !== undefined)

const target = (overrides: Partial<SongRetarget> = {}): SongRetarget =>
    ({name: DEFAULT, settings: {}, pitch: 'C', reverb: false, ...overrides})

/** A song on the default instrument pressing every one of its buttons in order, at `pitch`. */
function everyButtonSong(pitch: Pitch, instrument = DEFAULT): RecordedSong {
    const song = new RecordedSong('every button', [], [instrument])
    song.pitch = pitch
    song.notes = getNoteIdTable(instrument).map((_, button) =>
        new RecordedNote(buttonToNumber(instrument, pitch, button)!, button * 100, button % 3 === 0 ? 250 : 0, 0))
    return song
}

describe('retargetInstruments', () => {
    it('puts every track on the target instrument and Basepoint, keeping the track itself', () => {
        const tracks = [
            new InstrumentData({
                name: NARROW, volume: 40, pitch: 'D', reverbOverride: true, muted: true, alias: 'lead',
                icon: 'border', visible: false,
            }),
            new InstrumentData({name: DEFAULT, solo: true, reverbOverride: false}),
        ]
        const retargeted = retargetInstruments(tracks, target({name: DEFAULT, pitch: 'E', reverb: true}))
        expect(retargeted.map(track => track.name)).toEqual([DEFAULT, DEFAULT])
        //the song's Basepoint and reverb are the target's, and no track overrides them
        expect(retargeted.map(track => track.pitch)).toEqual(['', ''])
        expect(retargeted.map(track => track.reverbOverride)).toEqual([null, null])
        //what says which parts are heard and how loud stays the song's
        expect(retargeted[0]).toMatchObject({volume: 40, muted: true, alias: 'lead', icon: 'border', visible: false})
        expect(retargeted[1].solo).toBe(true)
        //and the originals are untouched
        expect(tracks[0]).toMatchObject({name: NARROW, pitch: 'D', reverbOverride: true})
    })

    it.runIf(VARIANT !== undefined)('gives every track the target\'s Instrument Settings, so it sounds like the user\'s engine', () => {
        const {id, definition} = variantSettingOf(VARIANT!)!
        const settings = {[id]: definition.options[definition.options.length - 1].id}
        const retargeted = retargetInstruments([new InstrumentData({name: DEFAULT})], target({name: VARIANT!, settings}))
        expect(retargeted[0].settings).toEqual(settings)
        //the identity the player loads engines by is the user's own keyboard's
        expect(instrumentIdentityKey(retargeted[0].name, retargeted[0].settings))
            .toBe(instrumentIdentityKey(VARIANT!, settings))
        //each track owns its map: an edit to one must not write through to the next
        settings[id] = 'changed'
        expect(retargeted[0].settings[id]).not.toBe('changed')
    })
})

describe('retargetSong', () => {
    it('on the same instrument at another Basepoint: every note keeps its button', () => {
        const song = everyButtonSong('C')
        const retargeted = retargetSong(song, target({pitch: 'E'}))
        retargeted.notes.forEach((note, index) => {
            expect(numberToButton(DEFAULT, 'E', note.id)).toBe(numberToButton(DEFAULT, 'C', song.notes[index].id))
        })
        //...which on this instrument means four semitones up, every one of them
        retargeted.notes.forEach((note, index) => expect(note.id).toBe(song.notes[index].id + 4))
        expect(retargeted.pitch).toBe('E')
    })

    it('downward too: a Basepoint lower in the list moves the notes down, never an octave up', () => {
        const song = everyButtonSong('B')
        const retargeted = retargetSong(song, target({pitch: 'C'}))
        retargeted.notes.forEach((note, index) => expect(note.id).toBe(song.notes[index].id - 11))
    })

    it.runIf(TWIN !== undefined)('onto an instrument with the same layout: the same buttons, the other instrument', () => {
        const song = everyButtonSong('D')
        const retargeted = retargetSong(song, target({name: TWIN!, pitch: 'D'}))
        retargeted.notes.forEach((note, index) => expect(numberToButton(TWIN!, 'D', note.id)).toBe(index))
        expect(retargeted.instruments[0].name).toBe(TWIN)
    })

    it('onto a narrower instrument: same key where it has one, passed through (and moved) where not', () => {
        const song = everyButtonSong('C')
        const retargeted = retargetSong(song, target({name: NARROW, pitch: 'D'}))
        const sourceNominals = getNoteIdTable(DEFAULT)
        const targetNominals = getNoteIdTable(NARROW)
        let mapped = 0
        let passed = 0
        retargeted.notes.forEach((note, index) => {
            const nominal = sourceNominals[index]
            if (targetNominals.includes(nominal)) {
                //the target's key for the same Nominal Id - the same key of the game's layout
                expect(targetNominals[numberToButton(NARROW, 'D', note.id)]).toBe(nominal)
                mapped++
            } else {
                //no key to go to: the number carries on as it was, moved by the Basepoint change
                //like every other note (a composer swap leaves it exactly this way)
                expect(note.id).toBe(song.notes[index].id + 2)
                passed++
            }
        })
        //NARROW was chosen for missing some keys; if it ever has all of them this proves nothing
        expect(passed).toBeGreaterThan(0)
        expect(mapped + passed).toBe(song.notes.length)
    })

    it('reads each track at its own Basepoint, override included', () => {
        const song = new RecordedSong('override', [], [DEFAULT, DEFAULT])
        song.pitch = 'C'
        song.instruments[1].set({pitch: 'F'})
        song.notes = [
            new RecordedNote(buttonToNumber(DEFAULT, 'C', 2)!, 0, 0, 0),
            new RecordedNote(buttonToNumber(DEFAULT, 'F', 2)!, 0, 0, 1),
        ]
        const retargeted = retargetSong(song, target({pitch: 'G'}))
        //both were button 2 on their own track, so both are button 2 at the target's Basepoint
        expect(retargeted.notes.map(note => numberToButton(DEFAULT, 'G', note.id))).toEqual([2, 2])
        expect(retargeted.notes[0].id).toBe(retargeted.notes[1].id)
    })

    it('keeps every note in place: same count, order, times, durations and tracks', () => {
        const song = everyButtonSong('C')
        song.instruments = [...song.instruments, new InstrumentData({name: NARROW})]
        song.notes.forEach((note, index) => (note.trackIndex = index % 2))
        const retargeted = retargetSong(song, target({name: NARROW, pitch: 'A'}))
        expect(retargeted.notes.length).toBe(song.notes.length)
        retargeted.notes.forEach((note, index) => {
            expect(note.time).toBe(song.notes[index].time)
            expect(note.duration).toBe(song.notes[index].duration)
            expect(note.trackIndex).toBe(song.notes[index].trackIndex)
        })
    })

    it('leaves the song it was handed alone', () => {
        const song = everyButtonSong('C')
        song.reverb = true
        const before = JSON.stringify(song.serialize())
        retargetSong(song, target({name: NARROW, pitch: 'E', reverb: false}))
        expect(JSON.stringify(song.serialize())).toBe(before)
    })

    it('takes the target\'s Basepoint and reverb, and the retargeted roster', () => {
        const song = everyButtonSong('C')
        song.reverb = true
        const goal = target({name: NARROW, pitch: 'Bb', reverb: false})
        const retargeted = retargetSong(song, goal)
        expect(retargeted.pitch).toBe('Bb')
        expect(retargeted.reverb).toBe(false)
        expect(retargeted.instruments).toEqual(retargetInstruments(song.instruments, goal))
    })

    it('leaves a note with no roster entry exactly as it was', () => {
        const song = everyButtonSong('C')
        const stray = new RecordedNote(buttonToNumber(DEFAULT, 'C', 1)!, 50, 0, 3)
        song.notes = [...song.notes, stray]
        const retargeted = retargetSong(song, target({pitch: 'E'}))
        expect(retargeted.notes[retargeted.notes.length - 1].id).toBe(stray.id)
    })

    it('keeps Mute and Solo, so the same tracks are heard', () => {
        const song = new RecordedSong('mix', [], [DEFAULT, NARROW, DEFAULT])
        song.instruments[0].set({muted: true})
        song.instruments[2].set({solo: true})
        song.notes = [0, 1, 2].map(track => new RecordedNote(buttonToNumber(DEFAULT, 'C', 0)!, track, 0, track))
        const retargeted = retargetSong(song, target({name: NARROW}))
        expect([0, 1, 2].map(index => isTrackAudible(retargeted.instruments, index)))
            .toEqual([0, 1, 2].map(index => isTrackAudible(song.instruments, index)))
        expect(planSongRender(retargeted).tracks.map(track => track.audible))
            .toEqual(planSongRender(song).tracks.map(track => track.audible))
    })
})

describe('what the player keyboard makes of a retargeted run', () => {
    // The run PlayerKeyboard builds: the retargeted clone, resolved against the keyboard on screen -
    // the user's instrument at the user's Basepoint, which is also the song's after retargeting.
    it('a song recorded on the user\'s instrument lights the same keys at the user\'s Basepoint', () => {
        const song = everyButtonSong('C')
        const goal = target({pitch: 'Ab'})
        const run = retargetSong(song, goal)
        resolvePlayerNoteButtons(run.notes, run.instruments, goal.name, run.pitch, goal.pitch)
        expect(run.notes.map(note => note.keyboardButton)).toEqual(song.notes.map((_, button) => button))
        //and the sheet, which reads the note's own track, agrees with the keyboard
        expect(run.notes.map(note => note.displayButton)).toEqual(song.notes.map((_, button) => button))
    })

    it('a note the user\'s instrument has no key for is skipped by the keyboard, not misplaced', () => {
        const song = everyButtonSong('C')
        const goal = target({name: NARROW, pitch: 'C'})
        const run = retargetSong(song, goal)
        resolvePlayerNoteButtons(run.notes, run.instruments, goal.name, run.pitch, goal.pitch)
        const targetNominals = getNoteIdTable(NARROW)
        run.notes.forEach((note, index) => {
            const nominal = getNoteIdTable(DEFAULT)[index]
            if (targetNominals.includes(nominal)) {
                expect(targetNominals[note.keyboardButton]).toBe(nominal)
            } else if (note.keyboardButton !== -1) {
                //a passed-through number that happens to be one of the target's own pitches lands
                //on the key that plays it - never on some other key
                expect(buttonToNumber(NARROW, 'C', note.keyboardButton)).toBe(note.id)
            }
        })
    })
})
