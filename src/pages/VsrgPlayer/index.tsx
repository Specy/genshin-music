import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import './VsrgPlayer.css'
import VsrgPlayerMenu from "components/VsrgPlayer/VsrgPlayerMenu";
import { VsrgHitObject, VsrgSong } from "lib/Songs/VsrgSong";
import { settingsService } from "lib/Services/SettingsService";
import { VsrgPlayerSettingsDataType } from "lib/BaseSettings";
import { AudioPlayer } from "lib/AudioPlayer";
import { KeyboardLetter } from "lib/Providers/KeyboardProvider/KeyboardTypes";
import { VsrgPlayerKeyboard } from "components/VsrgPlayer/VsrgPlayerKeyboard";
import { DEFAULT_VSRG_KEYS_MAP } from "appConfig";
import { vsrgPlayerStore } from "stores/VsrgPlayerStore";
import { defaultVsrgPlayerSizes, VsrgPlayerCanvas, VsrgPlayerCanvasSizes } from "components/VsrgPlayer/VsrgPlayerCanvas";
import { RecordedSong } from "lib/Songs/RecordedSong";
import { songService } from "lib/Services/SongService";
import { songsStore } from "stores/SongsStore";
import { ComposedSong } from "lib/Songs/ComposedSong";
import { VsrgPlayerRight } from "components/VsrgPlayer/VsrgPlayerRight";
import { VsrgPlayerLatestScore } from "components/VsrgPlayer/VsrgLatestScore";
import { ThemeProvider } from "stores/ThemeStore";

type VsrgPlayerProps = RouteComponentProps & {

}
interface VsrgPlayerState {
    song: VsrgSong | null
    audioSong: RecordedSong | null
    settings: VsrgPlayerSettingsDataType
    canvasSizes: VsrgPlayerCanvasSizes
    songAudioPlayer: AudioPlayer
    keyboardAudioPlayer: AudioPlayer
    currentLayout: KeyboardLetter[]
    isLoadingInstruments: boolean
    isPlaying: boolean
}

export type VsrgSongSelectType = 'play'
class VsrgPlayer extends Component<VsrgPlayerProps, VsrgPlayerState> {
    lastTimestamp = 0
    constructor(props: VsrgPlayerProps) {
        super(props)
        this.state = {
            song: null,
            audioSong: null,
            settings: settingsService.getVsrgPlayerSettings(),
            canvasSizes: defaultVsrgPlayerSizes,
            songAudioPlayer: new AudioPlayer("C"),
            keyboardAudioPlayer: new AudioPlayer("C"),
            currentLayout: DEFAULT_VSRG_KEYS_MAP[4] as KeyboardLetter[],
            isLoadingInstruments: false,
            isPlaying: false
        }
        this.lastTimestamp = 0
    }
    componentDidMount() {
        vsrgPlayerStore.setLayout(this.state.currentLayout)
    }
    onSongSelect = async (song: VsrgSong, type: VsrgSongSelectType) => {
        const { songAudioPlayer, keyboardAudioPlayer } = this.state
        const serializedAudioSong = await songsStore.getSongById(song.audioSongId)
        this.setState({ isLoadingInstruments: true })
        if (serializedAudioSong) {
            const parsed = songService.parseSong(serializedAudioSong)
            if (parsed instanceof RecordedSong) {
                this.setState({ audioSong: parsed })
                await songAudioPlayer.syncInstruments(parsed.instruments)
            }
            if (parsed instanceof ComposedSong) {
                const recorded = parsed.toRecordedSong(0)
                this.setState({ audioSong: recorded })
                await songAudioPlayer.syncInstruments(recorded.instruments)
            }
        }
        await keyboardAudioPlayer.syncInstruments(song.tracks.map(track => track.instrument))
        this.setState({
            song,
            isLoadingInstruments: false,
            isPlaying: true
        }, () => {
            if (type === 'play') {
                vsrgPlayerStore.setLayout(DEFAULT_VSRG_KEYS_MAP[song.keys] as KeyboardLetter[])
                vsrgPlayerStore.playSong(song)
            }
        })
    }
    onSizeChange = (sizes: VsrgPlayerCanvasSizes) => {
        this.setState({ canvasSizes: sizes })
    }

    onStopSong = () => {
        this.setState({ isPlaying: false, song: null }, () => {
            vsrgPlayerStore.stopSong()
        })
    }
    onRetrySong = () => {
        const { song } = this.state
        if (!song) return
        this.onSongSelect(song, 'play')
    }
    handleTick = (timestamp: number) => {
        const { audioSong, songAudioPlayer, song } = this.state
        this.lastTimestamp = timestamp
        if (!song) return
        if (this.lastTimestamp >= song.duration || timestamp < 0) return
        if (audioSong) {
            const notes = audioSong.tickPlayback(timestamp)
            notes.forEach(n => {
                const layers = n.layer.toArray()
                layers.forEach((l, i) => {
                    if (l === 0 || song.trackModifiers[i].muted) return
                    songAudioPlayer.playNoteOfInstrument(i, n.index)
                })
            })
        }
    }
    playHitObject = (hitObject: VsrgHitObject, instrumentIndex: number) => {
        const { keyboardAudioPlayer } = this.state
        if (keyboardAudioPlayer) {
            hitObject.notes.forEach(n => {
                keyboardAudioPlayer.playNoteOfInstrument(instrumentIndex, n)
            })
        }
    }
    render() {
        const { isLoadingInstruments, canvasSizes } = this.state
        return <>
            <div className="vsrg-player-page">
                <VsrgPlayerMenu
                    onSongSelect={this.onSongSelect}
                />
                <div
                    className="vsrg-player-grid box-shadow"
                    style={{
                        backgroundColor: ThemeProvider.layer('background', 0.18, 0.06).hex()
                    }}
                >
                    <VsrgPlayerCanvas
                        onTick={this.handleTick}
                        onSizeChange={this.onSizeChange}
                        playHitObject={this.playHitObject}
                        isPlaying={this.state.isPlaying}
                    />
                    <VsrgPlayerKeyboard
                        hitObjectSize={canvasSizes.hitObjectSize}
                    />
                </div>
                <VsrgPlayerRight
                    song={this.state.song}
                    onStopSong={this.onStopSong}
                    onRetrySong={this.onRetrySong}
                />
                <VsrgPlayerLatestScore />
                {isLoadingInstruments &&
                    <div className="vsrg-player-loading-instruments">
                        Loading instruments...
                    </div>
                }
            </div>
        </>
    }
}

export default withRouter<VsrgPlayerProps, any>(VsrgPlayer)