import {Pitch} from "$config"
import {AppButton} from "$cmp/shared/Inputs/AppButton"
import {PitchSelect} from "$cmp/shared/Inputs/PitchSelect"
import {HelpTooltip} from "$cmp/shared/Utility/HelpTooltip"
import useClickOutside from "$lib/Hooks/useClickOutside"
import {InstrumentNoteIcon} from "$lib/Songs/ComposedSong"
import {InstrumentData} from "$lib/Songs/SongClasses"
import {capitalize, prettyPrintInstrumentName} from "$lib/utils/Utilities"
import {FaArrowDown, FaArrowUp, FaTrash, FaVolumeMute, FaVolumeUp} from "react-icons/fa"
import {InstrumentSelect} from "$cmp/shared/Inputs/InstrumentSelect"
import s from '$cmp/shared/Settings/Settings.module.css'
import {Select} from "$cmp/shared/Inputs/Select";
import {useTranslation} from "react-i18next";

interface InstrumentSettingsPopupProps {
    currentLayer: number
    instruments: InstrumentData[]
    instrument: InstrumentData
    onChange: (instrument: InstrumentData) => void
    onChangePosition: (direction: 1 | -1) => void
    onDelete: () => void
    onClose: () => void
}

function getReverbValue(reverb: boolean | null) {
    if (reverb === null) return 'Unset'
    return reverb ? 'On' : 'Off'
}

function toReverbValue(value: string): boolean | null {
    if (value === 'Unset') return null
    return value === 'On'
}

const noteIcons: InstrumentNoteIcon[] = ['circle', 'border', 'line']

export function InstrumentSettingsPopup({
                                            instrument,
                                            onChange,
                                            onDelete,
                                            onClose,
                                            onChangePosition,
                                            currentLayer,
                                            instruments
                                        }: InstrumentSettingsPopupProps) {
    const {t} = useTranslation(['instrument_settings', 'common'])
    const ref = useClickOutside<HTMLDivElement>(onClose, {active: true, ignoreFocusable: true})
    if (!instrument) return <div className="floating-instrument-settings  box-shadow">
        {t('no_instrument_selected')}
    </div>
    return <div className="floating-instrument-settings box-shadow" ref={ref}>
        <div className="row space-between">
            {t('layer_name')}
            <input
                type="text"
                maxLength={50}
                className="input"
                style={{width: '7.4rem'}}
                value={instrument.alias}
                onChange={e => onChange(instrument.set({alias: e.target.value}))}
                placeholder={prettyPrintInstrumentName(instrument.name)}
            />
        </div>

        <div className="row space-between" style={{marginTop: '0.4rem'}}>
            {t('common:instrument')}
            <InstrumentSelect
                style={{width: '8rem'}}
                selected={instrument.name}
                onChange={(name) => onChange(instrument.set({name}))}
            />
        </div>
        <div className="row space-between" style={{marginTop: '0.4rem'}}>
            {t('common:pitch')}
            <PitchSelect
                style={{padding: '0.3rem', width: '8rem'}}
                selected={instrument.pitch as Pitch}
                onChange={pitch => onChange(instrument.set({pitch}))}
            >
                <option value="">
                    {t('use_song_pitch')}
                </option>
            </PitchSelect>
        </div>
        <div className="row space-between" style={{marginTop: '0.4rem'}}>
            {t('common:reverb')}
            <Select
                style={{padding: '0.3rem', width: '8rem'}}
                onChange={(e) => {
                    onChange(instrument.set({reverbOverride: toReverbValue(e.target.value)}))
                }}
                value={getReverbValue(instrument.reverbOverride)}
            >
                <option value={'On'}>
                    {t('common:on')}
                </option>
                <option value={'Off'}>
                    {t('common:off')}
                </option>
                <option value={'Unset'}>
                    {t('use_song_reverb')}
                </option>

            </Select>
        </div>

        <div className="row space-between" style={{marginTop: '0.4rem'}}>
            {t('note_icon')}
            <select
                className={s.select}
                style={{padding: '0.3rem', width: '8rem'}}
                value={instrument.icon}
                onChange={e => {
                    onChange(instrument.set({icon: e.target.value as InstrumentNoteIcon}))
                    e.target.blur()
                }}
            >
                {noteIcons.map(iconKind =>
                    <option key={iconKind} value={iconKind}>
                        {t(`common:${iconKind}`)}
                    </option>
                )}
            </select>
        </div>

        <div className="row" style={{marginTop: '1rem', alignItems: "center"}}>
            {t('volume')}
            <span style={{
                marginLeft: "0.4rem",
                width: '3rem',
                ...(instrument.volume > 100
                    && {color: `hsl(0, ${-40 + instrument.volume}%, 61%)`, marginLeft: "0.4rem"})
            }}
            >
                {instrument.volume}%
            </span>
            <HelpTooltip
                buttonStyle={{width: '1.2rem', height: '1.2rem'}}
                width={10}
            >
                {t('volume_high_warning')}
            </HelpTooltip>
        </div>
        <div className="row">
            <input
                type="range"
                style={{flex: '1', opacity: instrument.muted ? "0.6" : '1'}}
                min={0}
                max={125}
                value={instrument.volume}
                onChange={e => onChange(instrument.set({volume: Number(e.target.value)}))}
            />
            <AppButton
                className="flex-centered"
                toggled={instrument.muted}
                style={{padding: 0, minWidth: 'unset', width: '1.6rem', height: '1.6rem', borderRadius: '2rem'}}
                onClick={() => {
                    if (instrument.volume === 0 && !instrument.muted) return
                    onChange(instrument.set({muted: !instrument.muted}))
                }}
            >
                {(instrument.muted || instrument.volume === 0) ? <FaVolumeMute/> : <FaVolumeUp/>}
            </AppButton>
        </div>
        <div className="row space-between" style={{marginTop: '1rem'}}>
            <AppButton
                onClick={() => onChangePosition(-1)}
                disabled={currentLayer === 0}
                className='flex-centered'
                style={{padding: '0.5rem', flex: '1', marginRight: '0.4rem'}}
            >
                <FaArrowUp style={{marginRight: '0.2rem'}}/> {t('move_up')}
            </AppButton>
            <AppButton
                onClick={() => onChangePosition(1)}
                disabled={currentLayer === instruments.length - 1}
                className='flex-centered'
                style={{padding: '0.5rem', flex: '1'}}
            >
                <FaArrowDown style={{marginRight: '0.2rem'}}/> {t('move_down')}
            </AppButton>
        </div>
        <div className='row space-between' style={{marginTop: '0.4rem'}}>
            <AppButton
                className="row-centered"
                style={{padding: '0.4rem', width: 'fit-content'}}
                onClick={onDelete}
            >
                <FaTrash color="var(--red)" style={{marginRight: '0.3rem'}}/>
                {t('common:delete')}
            </AppButton>
            <AppButton
                onClick={onClose}
                style={{padding: '0.4rem', width: 'fit-content'}}
            >
                {t('common:ok')}
            </AppButton>
        </div>
    </div>
}