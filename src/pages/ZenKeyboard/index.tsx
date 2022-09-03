import { IconButton } from "$/components/Inputs/IconButton"
import { ZenKeypad } from "$/components/ZenKeyboard/ZenKeypad"
import { ZenKeyboardMenu } from "$/components/ZenKeyboard/ZenKeyboardMenu"
import { ZenKeyboardSettings, ZenKeyboardSettingsDataType } from "$/lib/BaseSettings"
import Instrument, { NoteData } from "$/lib/Instrument"
import { metronome } from "$/lib/Metronome"
import { AudioProvider } from "$/lib/Providers/AudioProvider"
import { settingsService } from "$/lib/Services/SettingsService"
import { logger } from "$/stores/LoggerStore"
import { zenKeyboardStore } from "$/stores/ZenKeyboardStore"
import { InstrumentName } from "$/types/GeneralTypes"
import { SettingUpdate, SettingVolumeUpdate } from "$/types/SettingsPropriety"
import { useEffect, useState, useCallback } from "react"
import { GiMetronome } from "react-icons/gi"
import "./ZenKeyboard.css"


export function ZenKeyboard() {
    const [settings, setSettings] = useState(ZenKeyboardSettings.data)
    const [instrument, setInstrument] = useState(new Instrument())
    const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
    useEffect(() => {
        const settings = settingsService.getZenKeyboardSettings()
        metronome.bpm = settings.metronomeBpm.value
        setInstrument(new Instrument(settings.instrument.value))
        setSettings(settings)
        AudioProvider.setReverb(settings.caveMode.value)
        return () => logger.hidePill()
    }, [])
    const updateSettings = useCallback((settings: ZenKeyboardSettingsDataType) => {
        settingsService.updateZenKeyboardSettings(settings)
    }, [])
    useEffect(() => {
        zenKeyboardStore.setKeyboardLayout(instrument.notes)
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
        zenKeyboardStore.setNoteState(note.index, {
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
        <ZenKeyboardMenu
            settings={settings}
            onVolumeChange={onVolumeChange}
            handleSettingChange={handleSettingChange}
        />
        <ZenKeypad
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