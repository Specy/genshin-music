import {APP_NAME} from "$core/legacyConfig"
import {ComposedSong} from "../Songs/ComposedSong.svelte"
import {RecordedSong} from "../Songs/RecordedSong"
import {extractStorable, type SerializedSong, Song, type SongStorable} from "../Songs/Song.svelte"
import {VsrgSong} from "../Songs/VsrgSong.svelte"
import {getSongType} from "../utils/Utilities"
import {AppError} from "../Errors"
import {isLegacyAppName, type LegacyAppName} from "../Songs/legacyNoteTables"
//tier-1 registry: JSON metadata for EVERY game, eagerly globbed and DOM-free (see its header),
//so it is importable here and in the service worker alike
import {gamesMeta} from "$lib/games/registry"
import {DbInstance} from "./Database/Database"
import {settingsService} from "./SettingsService"


/**
 * ADR-0011's ONE import rule: a payload whose game is not the running game converts, in every
 * direction and with no per-game branches — adding a game means giving it a similarity column
 * (and legacy tables, if it has a legacy), not a line of dispatch.
 *
 * An ABSENT or unrecognised `appName` is deliberately NOT foreign. `data.appName` comes off an
 * untrusted file, and a bare `!== APP_NAME` would convert a same-game song with an incomplete
 * header: new-format, findSimilarInstrument answers null for an unknown source and collapses
 * every track onto INSTRUMENTS[0]; legacy, the roster resets and the indices are remapped. Such
 * files have always been read as the running game's, and they still are.
 *
 * Exported because the import surfaces need the same answer parseSong used — only a CONVERTED
 * song can have gained Stranded Notes, and the warning is theirs to raise rather than
 * parseSong's, which also runs on every load of every stored song.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted payload, same as parseSong's
export function isForeignSong(song: any): boolean {
    const appName = song?.data?.appName
    return KNOWN_STORAGE_IDS.has(appName) && appName !== APP_NAME
}

/**
 * Every game the app knows, by the id its files carry in `data.appName`. Derived from the
 * registry rather than from `isLegacyAppName`, which answers a DIFFERENT question — "does this
 * game have frozen legacy tables" — and would leave a future game that has no legacy invisible to
 * the rule above: its new-format songs would be read as the running game's and keep instrument
 * names no roster here has. Foreignness is a property of the game list; having a legacy is a
 * property of one game, and only the legacy remap below may ask about it.
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- build-time constant, never UI-observed
const KNOWN_STORAGE_IDS: ReadonlySet<unknown> = new Set(
    Object.values(gamesMeta).map(meta => meta.gameJson.storageId)
)

/**
 * Whether a CONVERTED import came out with fewer audible notes than the file held. Two disjoint
 * losses, and an import surface may never check only one of them:
 * - Stranded Notes, the new-format path: the number survived, the matched instrument cannot voice
 *   it (countStrandedNotes);
 * - notes the LEGACY remap discarded, either because the source button index has no slot in the
 *   target game's keyboard (Genshin's top octave into Sky) or because the remapped index has no
 *   button on the decoding instrument (a Genshin index against Sky's 8-button DunDun). Those
 *   notes are GONE, not stranded, so countStrandedNotes is 0 for them and only
 *   `legacyDroppedNotes` records them.
 */
export function convertedSongLostNotes(song: ComposedSong | RecordedSong | VsrgSong): boolean {
    return song.countStrandedNotes() > 0 || song.legacyDroppedNotes > 0
}

/**
 * The running game as a legacy-remap target. A legacy file names its notes by BUTTON INDEX in
 * some game's keyboard, so only a game with frozen tables of its own can receive one; a future
 * game without a legacy must reject such a file rather than read the indices as if they were its
 * own keyboard's.
 */
function legacyImportTarget(): LegacyAppName {
    if (!isLegacyAppName(APP_NAME)) throw new AppError("Error Invalid song, this game cannot import legacy songs")
    return APP_NAME
}

//TODO instead of using SerializedSong, switch to SerializedSongKind
class SongService {
    songCollection = DbInstance.collections.songs

    async getStorableSongs(): Promise<SongStorable[]> {
        const songs = await this.getSongs()
        return songs.map(extractStorable)
    }

    async getSongs(): Promise<SerializedSong[]> {
        const songs = await this.songCollection.find({})
        const migrationEnsured = await this.ensureMigration(songs)
        return migrationEnsured.map(this.stripDbId)
    }

    private async ensureMigration(songs: SerializedSong[]) {
        const migratedId = songs.map(song => {
            return new Promise(async resolve => {
                let hasChanges = false
                if (song.id === undefined || song.id === null) {
                    song.id = DbInstance.generateId()
                    song.type = Song.getSongType(song)!
                    song.folderId = null
                    await this.songCollection.update({name: song.name}, song)
                    hasChanges = true
                }
                if (song.folderId === undefined) song.folderId = null
                if (!song.type) song.type = Song.getSongType(song)!
                resolve(hasChanges)
            })
        })
        const changes = await Promise.all(migratedId)
        //if every song was already migrated
        if (!changes.some(change => change)) return songs
        //if some songs were not migrated
        return this.songCollection.find({})
    }


    private stripDbId(song: SerializedSong) {
        //@ts-ignore
        delete song._id
        return song
    }

    async getOneSerializedFromStorable(storable: SongStorable): Promise<SerializedSong | null> {
        if (storable.id === null) {
            console.error("ERROR: Storable id is null, this should not happen")
            return null
        }
        const song = await this.getSongById(storable.id)
        if (!song) console.error("ERROR: Storable song not found, this should not happen")
        return song
    }

    getManySerializedFromStorable(storables: SongStorable[]): Promise<(SerializedSong | null)[]> {
        const promises = storables.map(storable => this.getOneSerializedFromStorable(storable))
        return Promise.all(promises)
    }

    async songExists(id: string): Promise<boolean> {
        return (await this.getSongById(id)) !== null
    }

    async getSongById(id: string): Promise<SerializedSong | null> {
        const song = await this.songCollection.findOneById(id)
        if (song) return this.stripDbId(song)
        return null
    }

    updateSong(id: string, data: SerializedSong) {
        settingsService.setLastStateEdit(Date.now())
        return this.songCollection.updateById(id, data)
    }

    async renameSong(id: string, newName: string) {
        const song = await this.getSongById(id)
        if (song === null) return
        song.name = newName
        return this.updateSong(id, song)
    }

    async addSong(song: SerializedSong) {
        const id = DbInstance.generateId()
        song.id = id
        await this.songCollection.insert(song)
        settingsService.setLastStateEdit(Date.now())
        return id
    }

    _clearAll() {
        return this.songCollection.remove({})
    }

    async fromStorableSong(s: SongStorable): Promise<ComposedSong | RecordedSong | VsrgSong> {
        const song = await this.getOneSerializedFromStorable(s)
        if (song === null) throw new Error("Error: Song not found")
        return this.parseSong(song)
    }

    //TODO not sure this is the best place for this
    parseSong(song: any): ComposedSong | RecordedSong | VsrgSong {
        song = Array.isArray(song) ? song[0] : song
        const type = getSongType(song)
        if (type === "none") {
            throw new Error("Error Invalid song")
        }
        if (type === "oldSky") {
            //the old format has no `data` at all, so it never reaches the mismatch rule below:
            //it is Sky-index-space by definition and fromOldFormat receives it into the RUNNING
            //game through the frozen tables, which is already the same conversion in both builds
            const parsed = RecordedSong.fromOldFormat(song)
            if (parsed === null) {
                throw new Error("Error parsing old format song")
            }
            return parsed
        }
        //ADR-0011: ONE rule, applied symmetrically — the song's game is not the running game →
        //convert. `type` already carries the three-way split (its 'newComposed'/'newRecorded'
        //cover BOTH the legacy and the current wire shapes, misleading names notwithstanding),
        //so re-deriving the split from `song.type`/`isComposedVersion` here would be a second
        //copy of getSongType to keep in step.
        if (!isForeignSong(song)) {
            if (type === 'vsrg') return VsrgSong.deserialize(song)
            if (type === 'newComposed') return ComposedSong.deserialize(song)
            if (type === 'newRecorded') return RecordedSong.deserialize(song)
            throw new AppError("Error Invalid song")
        }
        //two cross-game paths: new-format files carry absolute Note Numbers, which mean the same
        //thing in every game, so they convert via toOtherGame (similar-instrument roster swap and
        //nothing else — ADR-0011 removed the octave fold). Legacy files name their notes by a
        //game's BUTTON INDICES and cannot pass through as-is, so they reproduce the historic
        //index remap inside deserialize(importInto).
        //WHICH versions are new-format is the song class's own knowledge (isNewFormat), not a
        //list restated here: two copies of it would drift on the next version bump, and the cost
        //of missing one is a new-format file routed into the legacy frozen-table remap.
        //A version NEWER than the class knows is rejected by its deserializer either way.
        //legacyImportTarget() is demanded INSIDE the legacy branches, never before them: it throws
        //where the running game has no frozen tables, and a new-format foreign file needs none —
        //only the similarity swap — so asking up front would reject a convertible song with a
        //message about legacy songs.
        if (type === 'vsrg') {
            if (VsrgSong.isNewFormat(song)) return VsrgSong.deserialize(song).toOtherGame(APP_NAME)
            return VsrgSong.deserialize(song, legacyImportTarget())
        }
        if (type === 'newComposed') {
            if (ComposedSong.isNewFormat(song)) return ComposedSong.deserialize(song).toOtherGame(APP_NAME)
            return ComposedSong.deserialize(song, legacyImportTarget())
        }
        if (type === 'newRecorded') {
            if (RecordedSong.isNewFormat(song)) return RecordedSong.deserialize(song).toOtherGame(APP_NAME)
            return RecordedSong.deserialize(song, legacyImportTarget())
        }
        throw new AppError("Error Invalid song")
    }

    removeSong(id: string) {
        return this.songCollection.removeById(id)
    }
}

const _songService = new SongService()

export {
    _songService as songService
}