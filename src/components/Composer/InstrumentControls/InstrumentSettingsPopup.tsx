import { Pitch, PITCHES } from "appConfig"
import { AppButton } from "components/AppButton"
import { HelpTooltip } from "components/HelpTooltip"
import useClickOutside from "lib/Hooks/useClickOutside"
import { InstrumentNoteIcon } from "lib/Songs/ComposedSong"
import { InstrumentData } from "lib/Songs/SongClasses"
import { capitalize } from "lodash"
import { FaTrash } from "react-icons/fa"
import { InstrumentSelector } from "./InstrumentSelector"

interface InstrumentSettingsPopupProps {
    instrument: InstrumentData
    onChange: (instrument: InstrumentData) => void
    onDelete: () => void
    onClose: () => void
}
const noteIcons: InstrumentNoteIcon[] = ['circle', 'border', 'line']
export function InstrumentSettingsPopup({ instrument, onChange, onDelete, onClose }: InstrumentSettingsPopupProps) {
    const ref = useClickOutside<HTMLDivElement>(onClose, { active: true, ignoreFocusable: true })
    if (!instrument) return <div className="floating-instrument-settings  box-shadow">
        No instrument selected
    </div>
    return <div className="floating-instrument-settings box-shadow" ref={ref}>
        <div className="row">
            Layer name
        </div>
        <input
            type="text"
            className="input"
            value={instrument.alias}
            onChange={e => onChange(instrument.set({ alias: e.target.value }))}
            placeholder={instrument.name}
        />
        <div className="row">
            Instrument
        </div>
        <InstrumentSelector
            selected={instrument}
            onChange={(name) => onChange(instrument.set({ name }))}
        />
        <div className="row" style={{ marginTop: '0.5rem', alignItems: "center" }}>
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
        <input
            type="range"
            min={1}
            max={125}
            value={instrument.volume}
            onChange={e => onChange(instrument.set({ volume: Number(e.target.value) }))}
        />
        <div className="row" style={{ marginTop: '0.1rem' }}>
            Pitch
        </div>
        <select
            className="select"
            style={{ padding: '0.3rem' }}
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
        <div className="row" style={{ marginTop: '0.1rem' }}>
            Unselected note icon
        </div>
        <select
            className="select"
            style={{ padding: '0.3rem' }}
            value={instrument.icon}
            onChange={e => onChange(instrument.set({ icon: e.target.value as InstrumentNoteIcon }))}
        >
            {noteIcons.map(icon =>
                <option key={icon} value={icon}>
                    {capitalize(icon)}
                </option>
            )}
        </select>
        <div className='row space-between' style={{ marginTop: '2rem' }}>
            <AppButton
                className="row"
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
                Save
            </AppButton>
        </div>
    </div>
}