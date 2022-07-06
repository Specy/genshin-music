import { Pitch, PITCHES } from "appConfig"
import { AppButton } from "components/Inputs/AppButton"
import { HelpTooltip } from "components/Utility/HelpTooltip"
import useClickOutside from "lib/Hooks/useClickOutside"
import { InstrumentNoteIcon } from "lib/Songs/ComposedSong"
import { InstrumentData } from "lib/Songs/SongClasses"
import { capitalize } from "lodash"
import { FaArrowDown, FaArrowUp, FaTrash, FaVolumeMute, FaVolumeOff, FaVolumeUp } from "react-icons/fa"
import { InstrumentSelector } from "./InstrumentSelector"

interface InstrumentSettingsPopupProps {
    currentLayer: number
    instruments: InstrumentData[]
    instrument: InstrumentData
    onChange: (instrument: InstrumentData) => void
    onChangePosition: (direction: 1 | -1) => void
    onDelete: () => void
    onClose: () => void
}
const noteIcons: InstrumentNoteIcon[] = ['circle', 'border', 'line']
export function InstrumentSettingsPopup({ instrument, onChange, onDelete, onClose, onChangePosition, currentLayer, instruments }: InstrumentSettingsPopupProps) {
    const ref = useClickOutside<HTMLDivElement>(onClose, { active: true, ignoreFocusable: true })
    if (!instrument) return <div className="floating-instrument-settings  box-shadow">
        No instrument selected
    </div>
    return <div className="floating-instrument-settings box-shadow" ref={ref}>
        <div className="row space-between">
            Layer name
            <input
                type="text"
                className="input"
                style={{ width: '7.4rem' }}
                value={instrument.alias}
                onChange={e => onChange(instrument.set({ alias: e.target.value }))}
                placeholder={instrument.name}
            />
        </div>

        <div className="row space-between" style={{ marginTop: '0.4rem' }}>
            Instrument
            <InstrumentSelector
                style={{ width: '8rem' }}
                selected={instrument}
                onChange={(name) => onChange(instrument.set({ name }))}
            />
        </div>
        <div className="row space-between" style={{ marginTop: '0.4rem' }}>
            Pitch
            <select
                className="select"
                style={{ padding: '0.3rem', width: '8rem' }}
                value={instrument.pitch}
                onChange={e => onChange(instrument.set({ pitch: e.target.value as Pitch }))}
            >
                <option value="">
                    Use song pitch
                </option>
                {PITCHES.map(pitch =>
                    <option key={pitch} value={pitch}>
                        {pitch}
                    </option>
                )}
            </select>
        </div>

        <div className="row space-between" style={{ marginTop: '0.4rem' }}>
            Note icon
            <select
                className="select"
                style={{ padding: '0.3rem', width: '8rem' }}
                value={instrument.icon}
                onChange={e => onChange(instrument.set({ icon: e.target.value as InstrumentNoteIcon }))}
            >
                {noteIcons.map(icon =>
                    <option key={icon} value={icon}>
                        {capitalize(icon)}
                    </option>
                )}
            </select>
        </div>

        <div className="row" style={{ marginTop: '1rem', alignItems: "center" }}>
            Volume
            <span style={{
                marginLeft: "0.4rem",
                width: '3rem',
                ...(instrument.volume > 100
                    && { color: `hsl(0, ${-40 + instrument.volume}%, 61%)`, marginLeft: "0.4rem" })
            }}
            >
                {instrument.volume}%
            </span>
            <HelpTooltip
                buttonStyle={{ width: '1.2rem', height: '1.2rem' }}
                width={10}
            >
                If you hear distortion, reduce the volume
            </HelpTooltip>
        </div>
        <div className="row">
            <input
                type="range"
                style={{flex: '1', opacity: instrument.muted ? "0.6": '1'}}
                min={0}
                max={125}
                value={instrument.volume}
                onChange={e => onChange(instrument.set({ volume: Number(e.target.value) }))}
            />
            <AppButton
                className="flex-centered"
                toggled={instrument.muted}
                style={{ padding: 0, minWidth: 'unset', width: '1.6rem', height: '1.6rem', borderRadius: '2rem' }}
                onClick={() => {
                    if(instrument.volume === 0 && !instrument.muted) return
                    onChange(instrument.set({ muted: !instrument.muted }))
                }}
            >
                {(instrument.muted || instrument.volume === 0) ? <FaVolumeMute /> : <FaVolumeUp />}
            </AppButton>
        </div>
        <div className="row space-between" style={{ marginTop: '1rem' }}>
            <AppButton
                onClick={() => onChangePosition(-1)}
                disabled={currentLayer === 0}
                className='flex-centered'
                style={{ padding: '0.5rem', flex: '1', marginRight: '0.4rem' }}
            >
                <FaArrowUp style={{ marginRight: '0.2rem' }} /> Move up
            </AppButton>
            <AppButton
                onClick={() => onChangePosition(1)}
                disabled={currentLayer === instruments.length - 1}
                className='flex-centered'
                style={{ padding: '0.5rem', flex: '1' }}
            >
                <FaArrowDown style={{ marginRight: '0.2rem' }} /> Move down
            </AppButton>
        </div>
        <div className='row space-between' style={{ marginTop: '0.4rem' }}>
            <AppButton
                className="row-centered"
                style={{ padding: '0.4rem', width: 'fit-content' }}
                onClick={onDelete}
            >
                <FaTrash color="var(--red)" style={{ marginRight: '0.3rem' }} />
                Delete
            </AppButton>
            <AppButton
                onClick={onClose}
                style={{ padding: '0.4rem', width: 'fit-content' }}
            >
                Ok
            </AppButton>
        </div>
    </div>
}