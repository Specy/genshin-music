import {ComposedSong, type OldFormatComposed, type UnknownSerializedComposedSong} from "../Songs/ComposedSong.svelte"
import {type OldFormatRecorded, RecordedSong, type UnknownSerializedRecordedSong} from "../Songs/RecordedSong"
import {FileDownloader, isAudioFormat, isMidiFormat, isVideoFormat} from "../utils/Utilities"
import {audioBufferToMp3Blob, audioBufferToWavBlob} from "$lib/audio/audioBufferEncoders"
import {songsStore} from "$stores/SongsStore.svelte"
import {type SerializedSong, Song} from "../Songs/Song.svelte"
// type-only: @tonejs/midi's CJS build (`main` field) is a minified webpack bundle whose named
// exports are assigned dynamically (Object.defineProperty), not via statically analyzable
// `exports.X = ...` - Node's native ESM loader (used verbatim during adapter-static prerendering)
// can't synthesize a *value* import of `Midi` from that shape ("Named export 'Midi' not found"),
// and the `module` field it would otherwise prefer is itself mislabeled CommonJS (breaks Vite's
// dev-mode SSR module runner with "exports is not defined" if forced via ssr.noExternal - tried
// and reverted). `import type` sidesteps the whole problem: it's fully erased at compile time, so
// there's no runtime import statement to fail either way - correct here since `Midi` is only a
// type annotation below (downloadMidi's parameter). The one MIDI this file DOES construct
// (importFiles) takes its constructor from midiConstructor, which is where that problem is solved.
import type {Midi} from "@tonejs/midi"
import {Midi as MidiConstructor} from "../Songs/midiConstructor"
import {songFromOwnMidi} from "../Songs/ownMidiImport"
import {type SerializedTheme, Theme, ThemeProvider} from "../theme/ThemeProvider.svelte"
import {convertedSongLostNotes, isForeignSong, songService} from "./SongService"
import {Folder, type SerializedFolder} from "../Folder"
import {folderStore} from "$stores/FoldersStore.svelte"
import {type SerializedVsrgSong, VsrgSong} from "../Songs/VsrgSong.svelte"
import {themeStore} from "$stores/ThemeStore.svelte"
import {AppError} from "../Errors"
import type {SerializedSongKind} from "../types"
import {logger} from "$stores/LoggerStore.svelte"
import {APP_NAME} from "../legacyConfig"
import {i18n} from "$i18n/i18n";

export type UnknownSong =
    UnknownSerializedComposedSong
    | UnknownSerializedRecordedSong
    | SerializedSong
    | SerializedVsrgSong
export type UnknownFileTypes = UnknownSong | OldFormatComposed | OldFormatRecorded | SerializedFolder | SerializedTheme
export type UnknownFile = UnknownFileTypes | UnknownFileTypes[]
export type UnknownSongImport = UnknownSong | UnknownSong[]

/** Where FileService.importFiles sends what only the composer's MIDI importer can read. */
export type ComposerImporter = {
    /** Hand `file` to the importer; resolves to whether the importer actually took it. */
    open: (file: File) => Promise<boolean> | boolean
    /** Whether the importer is open right now. Absent means it never is (no composer on the page). */
    isOpen?: () => boolean
}

type SplitImports = {
    songs: UnknownSong[]
    folders: SerializedFolder[]
    themes: SerializedTheme[]
    unknown: unknown[]
}

export enum FileKind {
    Song = 'song',
    OldRecorded = 'oldRecorded',
    OldComposed = 'oldComposed',
    Folder = 'folder',
    Theme = 'theme'
}

type ImportError<T> = {
    file: Partial<T>
    error: string
}

class UnknownFileResult {
    successful: UnknownFileTypes[]
    errors: ImportError<UnknownFileTypes>[]
    /**
     * Imported songs that were CONVERTED from another game and came out with fewer audible notes
     * than the file held — stranded on the matched instrument (new format), or discarded by the
     * legacy button remap (see convertedSongLostNotes). Conversion never folds any more
     * (ADR-0011), so a track landing on a shorter instrument strands instead of being transposed —
     * counted per song here, toasted once per import operation by importAndLog.
     */
    convertedWithStrandedNotes = 0

    constructor(successful?: UnknownFileTypes[], errors?: ImportError<UnknownFileTypes>[]) {
        this.successful = successful || []
        this.errors = errors || []
    }

    hasErrors(): boolean {
        return this.errors.length > 0
    }

    private getKinds<T>(file: UnknownFileTypes[], kind: FileKind): T {
        return file.filter(f => FileService.getSerializedObjectType(f) === kind) as unknown as T
    }

    getSuccessfulSongs(): UnknownSong[] {
        return this.getKinds(this.successful, FileKind.Song)
    }

    getSuccessfulFolders(): SerializedFolder[] {
        return this.getKinds(this.successful, FileKind.Folder)
    }

    getSuccessfulThemes(): SerializedTheme[] {
        return this.getKinds(this.successful, FileKind.Theme)
    }

    appendSuccessful(file: UnknownFileTypes) {
        this.successful.push(file)
    }

    getSongErrors(): ImportError<UnknownSong>[] {
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === FileKind.Song) as ImportError<UnknownSong>[]
    }

    getFolderErrors(): ImportError<SerializedFolder>[] {
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === FileKind.Folder) as ImportError<SerializedFolder>[]
    }

    getThemeErrors(): ImportError<SerializedTheme>[] {
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === FileKind.Theme) as ImportError<SerializedTheme>[]
    }

    // ImportError<UnknownFileTypes>'s `file` field can't be narrowed further here: these are
    // exactly the entries getSerializedObjectType() could NOT match to a known FileKind, so their
    // real shape is genuinely unknown - and UnknownFileTypes itself isn't uniformly `.name`-shaped
    // (SerializedTheme only has `.other.name`), so `Partial<UnknownFileTypes>` can't safely stand
    // in either. `any` is the same narrowly-scoped escape hatch already used in
    // src/lib/i18n/binding.svelte.ts/AppLink.svelte for an analogous "genuinely can't be typed
    // more precisely than this" situation - importAndLog's `e.file?.name ?? ''` read below is the
    // only consumer, and it's optional-chained/defaulted regardless of what shape shows up.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    getUnknownErrors(): ImportError<any>[] {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === null) as ImportError<any>[]
    }

    appendError(file: unknown, error: string) {
        this.errors.push({
            file: file as Partial<UnknownFileTypes>,
            error
        })
    }
}
// A one-level summary of an imported value, e.g. {name: "string(12)", songNotes: "array(340)"}.
function describeTypeOf(value: unknown): string {
    if (value === null) return 'null'
    if (Array.isArray(value)) return `array(${value.length})`
    if (typeof value === 'string') return `string(${value.length})`
    return typeof value
}

function describeShape(value: unknown): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return describeTypeOf(value)
    const entries = Object.entries(value)
    const shape: Record<string, string> = Object.fromEntries(
        entries.slice(0, 40).map(([key, v]) => [key, describeTypeOf(v)])
    )
    if (entries.length > 40) shape['…'] = `${entries.length - 40} more keys`
    return shape
}

export class FileService {
    async importAndLog(files: UnknownFile) {
        logger.showPill(i18n.t("logs:importing_files"), {spinner: true})
        const result = await fileService.importUnknownFile(files).catch(e => {
            logger.hidePill()
            logger.error(i18n.t("logs:error_importing_files"))
            console.error(e)
            throw e
        })
        logger.hidePill()
        if (result.hasErrors()) {
            logger.error(i18n.t("logs:n_things_failed_to_import", {n: result.errors.length}))
            // The shape, not the file: it's what tells an unsupported format apart, and a whole
            // song would fill the error log (which truncates each entry) with notes.
            console.error("failed to import: ", result.errors.map(e => ({
                error: e.error,
                file: describeShape(e.file)
            })))
        }
        const songs = result.getSuccessfulSongs()
        const songErrors = result.getSongErrors()
        if (songs.length > 5) {
            logger.success(i18n.t("logs:imported_n_songs", {n: songs.length}))
        } else {
            songs.forEach(s => logger.success(i18n.t("logs:imported_song", {
                song_name: s.name,
                song_type: i18n.t(`menu:${s.type}`)
            })))
        }
        songErrors.forEach(e => logger.error(`${i18n.t('logs:error_importing_song', {song_name: e.file?.name ?? ''})} | ${e.error}`))
        const unknown = result.getUnknownErrors()
        unknown.forEach(e => logger.error(`${i18n.t('logs:error_importing_unknown_file', {file_name: e.file?.name ?? ''})} | ${e.error}`))
        //ONCE per import operation, never per song (ADR-0011): restoring a foreign backup is one
        //file holding N converted songs and must not toast N times. A gesture handing over
        //SEVERAL files calls importAndLog once per file, which is the granularity every other
        //message in this method already has.
        if (result.convertedWithStrandedNotes > 0) logger.warn(i18n.t('logs:converted_song_stranded_notes'), 8000)

        const folders = result.getSuccessfulFolders()
        if (folders.length > 5) {
            logger.success(i18n.t("logs:imported_n_folders", {n: folders.length}))
        } else {
            folders.forEach(f => logger.success(i18n.t("logs:imported_folder", {folder_name: f?.name ?? ''})))
        }
        const folderErrors = result.getFolderErrors()
        folderErrors.forEach(e => logger.error(`${i18n.t('logs:error_importing_folder', {folder_name: e.file?.name ?? ''})} | ${e.error}`))

        const themes = result.getSuccessfulThemes()
        if (themes.length > 5) {
            logger.success(i18n.t("logs:imported_n_themes", {n: themes.length}))
        } else {
            themes.forEach(t => logger.success(i18n.t("logs:imported_theme", {theme_name: t?.other?.name ?? ''})))
        }
        const themeErrors = result.getThemeErrors()
        themeErrors.forEach(e => logger.error(`${i18n.t('logs:error_importing_theme', {theme_name: e.file?.other?.name ?? ''})} | ${e.error}`))
        return result
    }

    /**
     * Every file the user hands over in one gesture - picked with an Import button or dropped on
     * the window - sorted by what it is, by name first and then by content:
     *  - one of our own MIDI exports goes straight into the library (ownMidiImport.ts);
     *  - any other MIDI, and any audio or video file, is for the composer's MIDI importer, which
     *    takes ONE file: the first is handed to `importer.open` once everything else is imported,
     *    and once the importer has really taken it, the rest are named in a warning;
     *  - while that importer is already OPEN, every MIDI goes to it, our own exports included: the
     *    user is in the middle of importing, and a file sent there is meant for the screen in front
     *    of them, not for the library behind it;
     *  - everything else is read as a song sheet, backup, folder or theme, exactly as before.
     * One file failing never stops the others: each is reported on its own.
     */
    async importFiles(files: readonly File[], importer: ComposerImporter): Promise<void> {
        const forImporter: File[] = []
        for (const file of files) {
            const name = file.name || ''
            if (isAudioFormat(name) || isVideoFormat(name)) {
                forImporter.push(file)
                continue
            }
            if (isMidiFormat(name)) {
                if (importer.isOpen?.()) {
                    forImporter.push(file)
                    continue
                }
                let own: ReturnType<typeof songFromOwnMidi>
                try {
                    own = songFromOwnMidi(new MidiConstructor(await file.arrayBuffer()), file.name)
                } catch (e) {
                    console.error(e)
                    logger.error(i18n.t('composer:midi_parser.error_is_file_midi'), 8000)
                    continue
                }
                if (!own) {
                    forImporter.push(file)
                    continue
                }
                try {
                    await this.importAndLog(own.song.serialize() as UnknownSong)
                } catch {
                    //importAndLog has already said what failed
                }
                continue
            }
            let data: UnknownFile
            try {
                data = JSON.parse(await file.text())
            } catch (e) {
                console.error(e)
                logger.error(i18n.t('logs:error_importing_invalid_format'), 8000)
                continue
            }
            try {
                await this.importAndLog(data)
            } catch {
                //importAndLog has already said what failed
            }
        }
        if (forImporter.length === 0) return
        //only once the importer has the file: a declined "open it in the composer?" or a cancelled
        //save question opened nothing, and a warning saying otherwise would be false
        const opened = await importer.open(forImporter[0])
        if (opened && forImporter.length > 1) {
            logger.warn(i18n.t('logs:only_first_file_opened_in_composer', {
                file_name: forImporter[0].name,
            }), 8000)
        }
    }

    async importUnknownFile(unknownFile: UnknownFile): Promise<UnknownFileResult> {
        const result = new UnknownFileResult()
        const fileArray = Array.isArray(unknownFile) ? unknownFile : [unknownFile]
        const split = this.splitIntoTypes(fileArray)
        const folderIds = new Map<string, string>()
        for (const folder of split.folders) {
            try {
                const oldId = folder.id
                const id = await folderStore.addFolder(Folder.deserialize(folder))
                folderIds.set(oldId!, id)
                result.appendSuccessful(folder)
            } catch (e) {
                console.error(e)
                result.appendError(folder, AppError.getMessageFromAny(e))
            }
        }
        const vsrg = split.songs.filter(s => s.type === 'vsrg') as SerializedVsrgSong[]
        const other = split.songs.filter(s => s.type !== 'vsrg')
        const songIds = new Map<string, string>()
        for (const song of other) {
            try {
                const oldId = song.id ?? null
                song.id = null //remove the id so it can be generated
                song.folderId = folderIds.get(song.folderId!) ?? null
                //asked BEFORE parsing: the conversion is what rewrites `data.appName`, so after
                //it the parsed song no longer says which game it came from
                const converted = isForeignSong(song)
                const parsed = songService.parseSong(song)
                const id = await songsStore.addSong(parsed)
                songIds.set(oldId!, id)
                if (converted && convertedSongLostNotes(parsed)) result.convertedWithStrandedNotes++
                result.appendSuccessful(parsed)
            } catch (e) {
                console.error(e)
                result.appendError(song, AppError.getMessageFromAny(e))
            }
        }
        for (const vsrgSong of vsrg) {
            try {
                vsrgSong.id = null //remove the id so it can be generated
                vsrgSong.audioSongId = songIds.get(vsrgSong.audioSongId!) ?? null //related ID of the song
                vsrgSong.folderId = folderIds.get(vsrgSong.folderId!) ?? null
                const converted = isForeignSong(vsrgSong)
                const parsed = songService.parseSong(vsrgSong)
                await songsStore.addSong(parsed)
                if (converted && convertedSongLostNotes(parsed)) result.convertedWithStrandedNotes++
                result.appendSuccessful(parsed)
            } catch (e) {
                console.error(e)
                result.appendError(vsrgSong, AppError.getMessageFromAny(e))
            }
        }
        for (const theme of split.themes) {
            try {
                theme.id = null
                const sanitised = ThemeProvider.sanitize(theme)
                await themeStore.addTheme(sanitised)
                result.appendSuccessful(theme)
            } catch (e) {
                console.error(e)
                result.appendError(theme, AppError.getMessageFromAny(e))
            }
        }
        for (const unknown of split.unknown) {
            result.appendError(unknown, FileService.isEncryptedSheet(unknown)
                ? i18n.t('logs:encrypted_sheet_not_supported')
                : i18n.t('logs:unknown_file_type'))
        }
        return result
    }

    splitIntoTypes(files: UnknownFileTypes[]): SplitImports {
        const songs = files.filter(file => FileService.getSerializedObjectType(file) === FileKind.Song) as UnknownSong[]
        const folders = files.filter(file => FileService.getSerializedObjectType(file) === FileKind.Folder) as SerializedFolder[]
        const themes = files.filter(file => FileService.getSerializedObjectType(file) === FileKind.Theme) as SerializedTheme[]
        const unknown = files.filter(file => FileService.getSerializedObjectType(file) === null) as unknown[]
        return {
            songs,
            folders,
            themes,
            unknown
        }
    }

    // Only an explicit flag counts: we don't know the encrypted format itself, just that the
    // legacy sheet format (which we write with `isEncrypted: false`) has the field.
    static isEncryptedSheet(file: unknown): boolean {
        return typeof file === 'object' && file !== null
            && 'isEncrypted' in file && file.isEncrypted === true
    }

    static getSerializedObjectType(file: unknown): FileKind | null {
        try {
            if (
                RecordedSong.isSerializedType(file) ||
                ComposedSong.isSerializedType(file) ||
                VsrgSong.isSerializedType(file) ||
                RecordedSong.isOldFormatSerializedType(file) ||
                ComposedSong.isOldFormatSerializedType(file)
            ) return FileKind.Song
            if (Folder.isSerializedType(file)) return FileKind.Folder
            if (Theme.isSerializedType(file)) return FileKind.Theme
        } catch (e) {
            console.error(e)
        }
        return null
    }

    async downloadSong(songs: UnknownSong | UnknownSong[], fileName: string) {
        fileName = fileName.replace(".json", "")
        const files = Array.isArray(songs) ? songs.map(Song.stripMetadata) : [Song.stripMetadata(songs)]
        const promises = files.map(s => this.prepareSongDownload(s as SerializedSongKind))
        const relatedSongs = (await Promise.all(promises)).flat() as SerializedSongKind[]
        const filtered = relatedSongs.filter((item, pos, self) => {
            return self.findIndex(e => e.id === item.id) === pos;
        })
        this.downloadFiles(filtered, fileName)
    }

    async prepareSongDownload(song: SerializedSongKind) {
        const files = [song]
        const vsrgSongs = files.filter(s => s.type === 'vsrg') as SerializedVsrgSong[]
        //get the related ids of the audio songs
        const audioSongsId = new Set(vsrgSongs.map(s => s.audioSongId))
        for (const audioSongId of audioSongsId) {
            //if the song is already to be downloaded, don't download it again
            if (files.some(s => s.id === audioSongId)) continue
            //if the song isn't already downloaded, find it in the database
            const song = await songService.getSongById(audioSongId!) as SerializedSongKind
            //if there is a song, then download it
            if (song) files.push(song)
        }
        return files
    }

    downloadFiles(files: UnknownFileTypes[], fileName: string) {
        FileDownloader.download(JSON.stringify(files), fileName)
    }

    downloadObject(file: object, fileName: string) {
        FileDownloader.download(JSON.stringify(file), `${fileName}.json`)
    }

    // The decode stays: this entry point is fed by the player's live MediaRecorder capture, whose
    // container is whatever the browser chose to record in, so there is no AudioBuffer to encode
    // from until it has been decoded. Callers that already hold one use the two below instead.
    async downloadBlobAsWav(urlBlob: Blob, fileName: string) {
        return this.downloadAudioBufferAsWav(await blobToAudio(urlBlob), fileName)
    }

    async downloadAudioBufferAsWav(buffer: AudioBuffer, fileName: string) {
        fileName = fileName.replace(".wav", "")
        FileDownloader.download(await audioBufferToWavBlob(buffer), fileName + ".wav")
    }

    async downloadAudioBufferAsMp3(buffer: AudioBuffer, fileName: string) {
        fileName = fileName.replace(".mp3", "")
        FileDownloader.download(await audioBufferToMp3Blob(buffer), fileName + ".mp3")
    }

    downloadBlob(urlBlob: Blob, fileName: string) {
        FileDownloader.download(urlBlob, fileName)
    }

    downloadMidi(midi: Midi, fileName?: string) {
        fileName = (fileName || midi.name).replace(".mid", "")
        return FileDownloader.download(
            new Blob([new Uint8Array(midi.toArray())], {type: "audio/midi"}),
            fileName + ".mid"
        )
    }

    downloadTheme(theme: SerializedTheme, fileName?: string) {
        fileName = (fileName || `${theme.other.name}.${APP_NAME.toLowerCase()}theme`)
        this.downloadFiles([theme], fileName)
    }

    getUnknownFileExtensionAndName(file: UnknownFileTypes) {
        const type = file.type
        switch (type) {
            case "vsrg":
            case "composed":
            case "recorded":
                return {
                    extension: `${APP_NAME.toLowerCase()}sheet`,
                    name: file.name
                }
            case "folder":
                return {
                    extension: `${APP_NAME.toLowerCase()}folder`,
                    name: file.name
                }
            case "theme":
                return {
                    extension: `${APP_NAME.toLowerCase()}theme`,
                    name: file.other.name
                }
            case "midi":
                return {
                    extension: "mid",
                    name: file.name
                }
            default:
                return null
        }
    }
}


export function blobToAudio(blob: Blob): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
        // @ts-expect-error webkitAudioContext (Safari prefix) not in Window type definitions
        const audioContext = (new (window.AudioContext || window.webkitAudioContext)())
        const fileReader = new FileReader();

        function handleLoad() {
            audioContext.decodeAudioData(fileReader.result as ArrayBuffer, (audioBuffer) => {
                resolve(audioBuffer)
            }, reject)
        }

        fileReader.addEventListener('loadend', handleLoad, {once: true})
        fileReader.readAsArrayBuffer(blob);
    })
}

export const fileService = new FileService()
