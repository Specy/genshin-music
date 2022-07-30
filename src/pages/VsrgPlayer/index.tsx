import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import './VsrgPlayer.css'
import VsrgPlayerMenu from "components/VsrgPlayer/VsrgPlayerMenu";
import { VsrgSong } from "lib/Songs/VsrgSong";
import { settingsService } from "lib/Services/SettingsService";
import { VsrgPlayerSettingsDataType } from "lib/BaseSettings";
import { AudioPlayer } from "lib/AudioPlayer";
import { KeyboardLetter } from "lib/Providers/KeyboardProvider/KeyboardTypes";
import { VsrgPlayerKeyboard } from "components/VsrgPlayer/VsrgPlayerKeyboard";
import { DEFAULT_VSRG_KEYS_MAP } from "appConfig";
import { vsrgPlayerStore } from "stores/VsrgPlayerStore";
import { VsrgPlayerCanvas } from "components/VsrgPlayer/VsrgPlayerCanvas";
import { RecordedSong } from "lib/Songs/RecordedSong";
import { songService } from "lib/Services/SongService";
import { songsStore } from "stores/SongsStore";
import { ComposedSong } from "lib/Songs/ComposedSong";
import { VsrgPlayerRight } from "components/VsrgPlayer/VsrgPlayerRight";

type VsrgPlayerProps = RouteComponentProps & {

}
interface VsrgPlayerState {
    song: VsrgSong | null
    audioSong: RecordedSong | null
    settings: VsrgPlayerSettingsDataType
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
            if (type === 'play') vsrgPlayerStore.playSong(song)
        })
    }
    onStopSong = () => {
        this.setState({ isPlaying: false, song: null }, () => {
            vsrgPlayerStore.stopSong()
        })
    }
    handleTick = (timestamp: number) => {
        const { audioSong, songAudioPlayer, song } = this.state
        this.lastTimestamp = timestamp
        if(!song) return
        if (this.lastTimestamp >= song.duration) return 
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
    render() {
        const { isLoadingInstruments } = this.state
        return <>
            <div className="vsrg-player-page">
                <VsrgPlayerMenu
                    onSongSelect={this.onSongSelect}
                />
                <div className="vsrg-player-grid">
                    <VsrgPlayerCanvas
                        onTick={this.handleTick}
                        isPlaying={this.state.isPlaying}
                    />
                    <VsrgPlayerKeyboard />
                </div>
                <VsrgPlayerRight 
                    song={this.state.song}
                    onStopSong={this.onStopSong}
                />
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