import {InstrumentSelect} from "$cmp/shared/Inputs/InstrumentSelect"
import {AppButton} from "$cmp/shared/Inputs/AppButton"
import {VsrgTrack} from "$lib/Songs/VsrgSong"
import {FaTrash} from "react-icons/fa"
import {PitchSelect} from "$cmp/shared/Inputs/PitchSelect"
import {HelpTooltip} from "$cmp/shared/Utility/HelpTooltip"
import {ColorPicker} from "$cmp/shared/Inputs/ColorPicker"
import {useState, useTransition} from "react"
import Color from "color"
import {vsrgComposerStore} from "$stores/VsrgComposerStore"
import {Pitch} from "$config"
import {Row} from "$cmp/shared/layout/Row";
import {Column} from "$cmp/shared/layout/Column";
import {useTranslation} from "react-i18next";

interface TrackSelectorProps {
    track: VsrgTrack
    onSave: () => void
    onDelete: () => void
    onChange: (track: VsrgTrack) => void
}

export function VsrgTrackSettings({track, onSave, onDelete, onChange}: TrackSelectorProps) {
    const { t} = useTranslation(['vsrg_composer', 'common', 'instrument_settings'])
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false)
    if (!track) return null
    return <>
        <div className="vsrg-floating-settings box-shadow">
            <Row justify={'between'} align={'center'}>
                {t('track_name')}
                <input
                    type="text"
                    maxLength={50}
                    className="input"
                    style={{width: '7.4rem'}}
                    value={track.instrument.alias}
                    onChange={e => {
                        track.instrument.set({alias: e.target.value})
                        onChange(track)
                    }}
                    placeholder={track.instrument.name}
                />
            </Row>
            <Row justify={'between'} align={'center'} style={{marginTop: '0.4rem'}}>
                {t('common:instrument')}
                <InstrumentSelect
                    style={{width: '8rem'}}
                    selected={track.instrument.name}
                    onChange={(name) => {
                        track.instrument.set({name})
                        onChange(track)
                    }}
                />
            </Row>
            <Row justify={'between'} align={'center'} style={{marginTop: '0.4rem'}}>
                {t('common:pitch')}
                <PitchSelect
                    style={{width: '8rem'}}
                    selected={track.instrument.pitch as Pitch}
                    onChange={(pitch) => {
                        track.instrument.set({pitch})
                        onChange(track)
                    }}
                >
                    <option value="">
                        {t('instrument_settings:use_song_pitch')}
                    </option>
                </PitchSelect>
            </Row>
            <Row align={'center'} style={{marginTop: '1rem'}}>
                {t('instrument_settings:volume')}
                <span style={{
                    marginLeft: "0.4rem",
                    width: '3rem',
                    ...(track.instrument.volume > 100
                        && {color: `hsl(0, ${-40 + track.instrument.volume}%, 61%)`, marginLeft: "0.4rem"})
                }}
                >
                    {track.instrument.volume}%
                </span>
                <HelpTooltip
                    buttonStyle={{width: '1.2rem', height: '1.2rem'}}
                    width={10}
                >
                    {t('instrument_settings:volume_high_warning')}
                </HelpTooltip>
            </Row>
            <Row align={'center'}>
                <input
                    type="range"
                    style={{flex: '1'}}
                    min={0}
                    max={125}
                    value={track.instrument.volume}
                    onChange={e => {
                        track.instrument.set({volume: parseInt(e.target.value)})
                        onChange(track)
                    }}
                />
            </Row>
            <Column>
                <Row justify={'between'} align={'center'}>
                    {t('common:color')}
                    <AppButton
                        onClick={() => setIsColorPickerOpen(true)}
                        ariaLabel='Change color'
                        style={{
                            backgroundColor: track.color,
                            color: Color(track.color).isDark() ? '#fff' : '#000',
                        }}
                    >
                        {t('common:change')}
                    </AppButton>
                </Row>
            </Column>
            <Row justify={'between'} style={{marginTop: '0.4rem'}}>
                <AppButton
                    className="row-centered"
                    style={{padding: '0.4rem', width: 'fit-content'}}
                    onClick={onDelete}
                >
                    <FaTrash color="var(--red)" style={{marginRight: '0.3rem'}}/>
                    {t('common:delete')}
                </AppButton>
                <AppButton
                    onClick={onSave}
                    style={{padding: '0.4rem', width: 'fit-content'}}
                >
                    {t('common:ok')}
                </AppButton>
            </Row>
        </div>
        {isColorPickerOpen &&
            <ColorPicker
                style={{
                    right: '0.8rem',
                    top: '0.5rem',
                }}
                value={track.color}
                onChange={color => {
                    onChange(track.set({color}))
                    setIsColorPickerOpen(false)
                    vsrgComposerStore.emitEvent("colorChange")
                }}
            />
        }
    </>
}