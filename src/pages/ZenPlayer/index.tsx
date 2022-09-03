import { IconButton } from "$/components/Inputs/IconButton"
import { ZenKeyboard } from "$/components/ZenPlayer/ZenKeyboard"
import { ZenPlayerMenu } from "$/components/ZenPlayer/ZenPlayerMenu"
import { ZenPlayerSettings, ZenPlayerSettingsDataType } from "$/lib/BaseSettings"
import Instrument, { NoteData } from "$/lib/Instrument"
import { metronome } from "$/lib/Metronome"
import { AudioProvider } from "$/lib/Providers/AudioProvider"
import { settingsService } from "$/lib/Services/SettingsService"
import { logger } from "$/stores/LoggerStore"
import { zenPlayerStore } from "$/stores/ZenPlayerStore"
import { InstrumentName } from "$/types/GeneralTypes"
import { SettingUpdate, SettingVolumeUpdate } from "$/types/SettingsPropriety"
import { useEffect, useState, useCallback } from "react"
import { GiMetronome } from "react-icons/gi"
import "./ZenPlayer.css"


export function ZenPlayer() {
    const [settings, setSettings] = useState(ZenPlayerSettings.data)
    const [instrument, setInstrument] = useState(new Instrument())
    const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
    useEffect(() => {
        const settings = settingsService.getZenPlayerSettings()
        metronome.bpm = settings.metronomeBpm.value
        setSettings(settings)
        return () => logger.hidePill()
    }, [])
    const updateSettings = useCallback((settings: ZenPlayerSettingsDataType) => {
        settingsService.updateZenPlayerSettings(settings)
    }, [])
    useEffect(() => {
        zenPlayerStore.setKeyboardLayout(instrument.notes)
    }, [instrument])
    const handleSettingChange = async (setting: SettingUpdate) => {
        //@ts-ignore
        const { data } = setting
        //@ts-ignore
        settings[setting.key] = { ...settings[setting.key], value: data.value }
        if (setting.key === "instrument") {
            setInstrument(new Instrument(data.value as InstrumentName))
        }
        if (setting.key === 'caveMode') {
            AudioProvider.setReverb(data.value as boolean)
        }
        console.log(setting.key, data.value)
        if (setting.key === 'metronomeBpm') metronome.bpm = data.value as number
        if (setting.key === 'metronomeBeats') metronome.beats = data.value as number
        if (setting.key === 'metronomeVolume') metronome.changeVolume(data.value as number)
        setSettings({ ...settings })
        updateSettings(settings)
    }
    useEffect(() => {
        async function load() {
            logger.showPill(`Loading instrument: ${instrument.name}...`)
            await instrument.load()
            logger.hidePill()
            AudioProvider.connect(instrument.endNode)
        }
        load()
        return () => { AudioProvider.disconnect(instrument.endNode) }
    }, [instrument])
    const onNoteClick = (note: NoteData) => {
        instrument.play(note.index, settings.pitch.value)
        zenPlayerStore.setNoteState(note.index, {
            animationId: note.data.animationId + 1
        })
    }
    useEffect(() => {
        if (isMetronomePlaying) metronome.start()
        else metronome.stop()
    }, [isMetronomePlaying])
    const onVolumeChange = useCallback((data: SettingVolumeUpdate) => {
        instrument.changeVolume(data.value)
    }, [instrument])
    return <>
        <ZenPlayerMenu
            settings={settings}
            onVolumeChange={onVolumeChange}
            handleSettingChange={handleSettingChange}
        />
        <ZenKeyboard
            instrument={instrument}
            onNoteClick={onNoteClick}
            noteNameType={settings.noteNameType.value}
            pitch={settings.pitch.value}
            scale={settings.keyboardSize.value}
            verticalOffset={settings.keyboardYPosition.value}
        />
        <IconButton
            toggled={isMetronomePlaying}
            onClick={() => setIsMetronomePlaying(!isMetronomePlaying)}
            className='metronome-button'
            style={{
                position: 'absolute',
                bottom: "0.5rem",
                right: "0.5rem",
            }}
            ariaLabel='Toggle metronome'
        >
            <GiMetronome size={22} />
        </IconButton>
    </>
}