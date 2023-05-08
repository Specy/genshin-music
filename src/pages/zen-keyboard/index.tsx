import { IconButton } from "$cmp/Inputs/IconButton"
import { ZenKeypad } from "$cmp/ZenKeyboard/ZenKeypad"
import { ZenKeyboardMenu } from "$cmp/ZenKeyboard/ZenKeyboardMenu"
import { ZenKeyboardSettings, ZenKeyboardSettingsDataType } from "$lib/BaseSettings"
import Instrument, { ObservableNote } from "$lib/Instrument"
import { metronome } from "$lib/Metronome"
import { AudioProvider } from "$lib/Providers/AudioProvider"
import { settingsService } from "$lib/Services/SettingsService"
import { logger } from "$stores/LoggerStore"
import { zenKeyboardStore } from "$stores/ZenKeyboardStore"
import { InstrumentName } from "$/types/GeneralTypes"
import { SettingUpdate, SettingVolumeUpdate } from "$/types/SettingsPropriety"
import { useEffect, useState, useCallback, ReactElement } from "react"
import { GiMetronome } from "react-icons/gi"
import { Title } from "$cmp/Miscellaneous/Title"
import { AppBackground } from "$cmp/Layout/AppBackground"
export default function ZenKeyboard() {
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
        if (setting.key === 'metronomeBpm') metronome.bpm = data.value as number
        if (setting.key === 'metronomeBeats') metronome.beats = data.value as number
        if (setting.key === 'metronomeVolume') metronome.changeVolume(data.value as number)
        setSettings({ ...settings })
        updateSettings(settings)
    }
    useEffect(() => {
        async function load() {
            logger.showPill(`Loading instrument: ${instrument.name}...`)
            await instrument.load(AudioProvider.getAudioContext())
            logger.hidePill()
            AudioProvider.connect(instrument.endNode)
        }
        load()
        return () => { AudioProvider.disconnect(instrument.endNode) }
    }, [instrument])
    const onNoteClick = (note: ObservableNote) => {
        instrument.play(note.index, settings.pitch.value)
        zenKeyboardStore.animateNote(note.index)
    }
    useEffect(() => {
        if (isMetronomePlaying) metronome.start()
        else metronome.stop()
    }, [isMetronomePlaying])

    const onVolumeChange = useCallback((data: SettingVolumeUpdate) => {
        instrument.changeVolume(data.value)
    }, [instrument])
    return <>
        <Title text="Zen Keyboard" description="The simplest keyboard in the app, focus only on playing manually with all the features of the player, instrument and pitch selection, animations and metronome" />
        <ZenKeyboardMenu
            settings={settings}
            onVolumeChange={onVolumeChange}
            handleSettingChange={handleSettingChange}
        />
        <div className="flex-centered">
            <ZenKeypad
                instrument={instrument}
                onNoteClick={onNoteClick}
                noteNameType={settings.noteNameType.value}
                pitch={settings.pitch.value}
                scale={settings.keyboardSize.value}
                verticalOffset={settings.keyboardYPosition.value}
            />
        </div>

        <IconButton
            toggled={isMetronomePlaying}
            onClick={() => setIsMetronomePlaying(!isMetronomePlaying)}
            className='metronome-button'
            style={{
                position: 'absolute',
                bottom: "0.8rem",
                right: "0.8rem",
            }}
            ariaLabel='Toggle metronome'
        >
            <GiMetronome size={22} />
        </IconButton>
    </>
}

ZenKeyboard.getLayout = function getLayout(page: ReactElement) {
    return <AppBackground page="Main">{page}</AppBackground>
}