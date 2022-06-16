import { Pitch, PITCHES } from "appConfig"
import { AppButton } from "components/AppButton"
import useClickOutside from "lib/Hooks/useClickOutside"
import { ComposedSongInstrument } from "lib/Songs/ComposedSong"
import { FaTrash } from "react-icons/fa"
import { InstrumentSelector } from "./InstrumentSelector"

interface InstrumentSettingsPopupProps {
    instrument: ComposedSongInstrument
    onChange: (instrument: ComposedSongInstrument) => void
    onDelete: () => void
    onClose: () => void
}

export function InstrumentSettingsPopup({ instrument, onChange, onDelete, onClose }: InstrumentSettingsPopupProps) {
    const ref = useClickOutside<HTMLDivElement>(onClose, { active: true, ignoreFocusable: true })
    if (!instrument) return <div className="floating-instrument-settings  box-shadow">
        No instrument selected
    </div>
    return <div className="floating-instrument-settings box-shadow" ref={ref}>
        <div className="row">
            Instrument

        </div>
        <InstrumentSelector
            selected={instrument}
            onChange={(name) => onChange({ ...instrument, name })}
        />
        <div className="row" style={{ marginTop: '0.5rem' }}>
            Volume

        </div>
        <input
            type="range"
            min={1}
            max={100}
            value={instrument.volume}
            onChange={e => onChange({ ...instrument, volume: Number(e.target.value) })}
        />
        <div className="row" style={{ marginTop: '0.3rem' }}>
            Pitch
        </div>
        <select
            className="select"
            style={{ padding: '0.3rem' }}
            value={instrument.pitch}
            onChange={e => onChange({ ...instrument, pitch: e.target.value as Pitch })}
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
        <div className='row space-between' style={{marginTop: '2rem'}}>
            <AppButton
                className="row"
                style={{ padding: '0.4rem',width: 'fit-content' }}
                onClick={onDelete}
            >
                <FaTrash color="var(--red)" style={{ marginRight: '0.3rem' }} />
                Delete
            </AppButton>
            <AppButton 
                onClick={onClose}
                style={{ padding: '0.4rem',width: 'fit-content' }}
            >
                Save
            </AppButton>
        </div>
    </div>
}