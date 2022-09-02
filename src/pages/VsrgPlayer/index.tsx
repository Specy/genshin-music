import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import './VsrgPlayer.css'
import VsrgPlayerMenu from "$cmp/VsrgPlayer/VsrgPlayerMenu";
import { VsrgHitObject, VsrgSong } from "$lib/Songs/VsrgSong";
import { settingsService } from "$lib/Services/SettingsService";
import { VsrgPlayerSettingsDataType } from "$lib/BaseSettings";
import { AudioPlayer } from "$lib/AudioPlayer";
import { VsrgPlayerKeyboard } from "$cmp/VsrgPlayer/VsrgPlayerKeyboard";
import { vsrgPlayerStore } from "$stores/VsrgPlayerStore";
import { defaultVsrgPlayerSizes, VsrgPlayerCanvas, VsrgPlayerCanvasSizes } from "$cmp/VsrgPlayer/VsrgPlayerCanvas";
import { RecordedSong } from "$lib/Songs/RecordedSong";
import { songService } from "$lib/Services/SongService";
import { songsStore } from "$stores/SongsStore";
import { ComposedSong } from "$lib/Songs/ComposedSong";
import { VsrgPlayerRight } from "$cmp/VsrgPlayer/VsrgPlayerRight";
import { VsrgPlayerLatestScore } from "$cmp/VsrgPlayer/VsrgLatestScore";
import { SettingUpdate } from "$types/SettingsPropriety";
import { keyBinds } from "$stores/Keybinds";
import { logger } from "$/stores/LoggerStore";

type VsrgPlayerProps = RouteComponentProps & {

}
interface VsrgPlayerState {
    song: VsrgSong | null
    audioSong: RecordedSong | null
    settings: VsrgPlayerSettingsDataType
    canvasSizes: VsrgPlayerCanvasSizes
    songAudioPlayer: AudioPlayer
    keyboardAudioPlayer: AudioPlayer
    currentLayout: string[]
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
            currentLayout: keyBinds.getVsrgKeybinds(4),
            isPlaying: false
        }
        this.lastTimestamp = 0
    }
    componentDidMount() {
        vsrgPlayerStore.setLayout(this.state.currentLayout)
    }
    componentWillUnmount() {
        const { songAudioPlayer, keyboardAudioPlayer } = this.state
        songAudioPlayer.destroy()
        keyboardAudioPlayer.destroy()
        vsrgPlayerStore.resetScore()
        logger.hidePill()
    }
    onSongSelect = async (song: VsrgSong, type: VsrgSongSelectType) => {
        const { songAudioPlayer, keyboardAudioPlayer } = this.state
        const serializedAudioSong = await songsStore.getSongById(song.audioSongId)
        logger.showPill("Loading instruments...")
        if (serializedAudioSong) {
            const parsed = songService.parseSong(serializedAudioSong)
            songAudioPlayer.basePitch = parsed.pitch
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
        logger.hidePill()
        this.setState({
            song,
            isPlaying: true
        }, () => {
            if (type === 'play') {
                vsrgPlayerStore.setLayout(keyBinds.getVsrgKeybinds(song.keys))
                vsrgPlayerStore.playSong(song)
            }
        })
    }
    handleSettingChange = (setting: SettingUpdate) => {
        const { settings } = this.state
        const { data } = setting
        //@ts-ignore
        settings[setting.key] = { ...settings[setting.key], value: data.value }

        this.setState({
            settings: { ...settings }
        }, () => {
            this.updateSettings()
        })
    }
    updateSettings = (override?: VsrgPlayerSettingsDataType) => {
        settingsService.updateVsrgPlayerSettings(override !== undefined ? override : this.state.settings)
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
        if(this.lastTimestamp >= song.duration + 2000){
            this.setState({ isPlaying: false })
            vsrgPlayerStore.showScore()
        }
        if (this.lastTimestamp >= song.duration  || timestamp < 0) return
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
        const { canvasSizes, settings } = this.state
        return <>
            <div className="vsrg-player-page">
                <VsrgPlayerMenu
                    settings={settings}
                    onSettingsUpdate={this.handleSettingChange}
                    onSongSelect={this.onSongSelect}
                />
                <div
                    className="vsrg-player-grid"
                >
                    <VsrgPlayerCanvas
                        keyboardLayout={settings.keyboardLayout.value}
                        onTick={this.handleTick}
                        scrollSpeed={settings.approachTime.value}
                        onSizeChange={this.onSizeChange}
                        playHitObject={this.playHitObject}
                        isPlaying={this.state.isPlaying}
                    />
                    <VsrgPlayerKeyboard
                        keyboardLayout={settings.keyboardLayout.value}
                        offset={canvasSizes.verticalOffset}
                        hitObjectSize={canvasSizes.hitObjectSize}
                        verticalOffset={settings.verticalOffset.value}
                        horizontalOffset={settings.horizontalOffset.value}
                    />
                </div>
                <VsrgPlayerRight
                    song={this.state.song}
                    onStopSong={this.onStopSong}
                    onRetrySong={this.onRetrySong}
                />
                <VsrgPlayerLatestScore />
            </div>
        </>
    }
}

export default withRouter<VsrgPlayerProps, any>(VsrgPlayer)