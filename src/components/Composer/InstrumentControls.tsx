import { INSTRUMENTS } from "appConfig";
import { AppButton } from "components/AppButton";
import { useTheme } from "lib/Hooks/useTheme";
import { ComposedSongInstrument } from "lib/Songs/ComposedSong";
import { memo, useEffect, useState } from "react";
import { FaCog, FaPlus, FaTrash } from "react-icons/fa";
import { ThemeStoreClass } from "stores/ThemeStore";
import { InstrumentName } from "types/GeneralTypes";



interface InstrumentControlsProps {
    instruments: ComposedSongInstrument[]
    selected: number
    onLayerSelect: (index: number) => void
    onInstrumentChange: (instrument: ComposedSongInstrument, index: number) => void
    onInstrumentDelete: (index: number) => void
    onInstrumentAdd: () => void
}

function _InstrumentControls({ instruments, onInstrumentAdd, onInstrumentChange, onInstrumentDelete, selected, onLayerSelect }: InstrumentControlsProps) {
    const [theme] = useTheme()
    return <div className="column instruments-button-wrapper">
        {instruments.map((ins, i) =>
            <InstrumentButton
                theme={theme}
                instrument={ins}
                isSelected={i === selected}
                onInstrumentChange={name => onInstrumentChange({ ...ins, name }, i)}
                onVolumeChange={volume => onInstrumentChange({ ...ins, volume }, i)}
                onInstrumentDelete={() => onInstrumentDelete(i)}
                onClick={() => onLayerSelect(i)}
                key={ins.name + i}
            />
        )}
        <div style={{ height: '1rem' }}>

        </div>
        <AppButton style={{ marginTop: 'auto', padding: '0rem', paddingBottom: '0.1rem' }} onClick={onInstrumentAdd}>
            <FaPlus size={16} color='var(--icon-color)' />
        </AppButton>
    </div>
}
export const InstrumentControls = memo(_InstrumentControls, (p, n) => {
    return p.instruments === n.instruments && p.selected === n.selected
})

interface InstrumentButtonProps {
    instrument: ComposedSongInstrument
    theme: ThemeStoreClass
    isSelected: boolean,
    onClick: () => void
    onInstrumentChange: (instrument: InstrumentName) => void
    onVolumeChange: (volume: number) => void
    onInstrumentDelete: () => void
}
function InstrumentButton({ instrument, onClick, isSelected, theme, onInstrumentChange, onVolumeChange, onInstrumentDelete }: InstrumentButtonProps) {
    const [isEditing, setIsEditing] = useState(false)
    useEffect(() => {
        setIsEditing(false)
    }, [isSelected])
    return <div
        className="instrument-button flex-centered"
        style={isSelected
            ? {
                backgroundColor: theme.get("primary").mix(theme.get("accent")).toString(),
            } : {}}
    >
        {!isEditing &&
            <AppButton
                onClick={onClick}
                style={{ backgroundColor: "transparent" }}
                className='flex-grow flex-centered instrument-name-button text-ellipsis'
            >
                {instrument.name}
            </AppButton>

        }

        {isSelected &&
            <div className="instrument-settings">
                <AppButton
                    onClick={() => setIsEditing(!isEditing)}
                    style={{ backgroundColor: "transparent", padding: '0' }}
                >
                    <FaCog size={16} />
                </AppButton>
                {isEditing && <>
                    <div style={{ textAlign: "center" }}>
                        Instrument
                    </div>
                    <InstrumentSelector
                        selected={instrument}
                        onChange={onInstrumentChange}
                    />
                    <div style={{ marginTop: "0.4rem", textAlign: "center" }}>
                        Volume
                    </div>
                    <input
                        type="range"
                        style={{ width: '100%' }}
                        min={1}
                        max={100}
                        value={instrument.volume}
                        onChange={e => onVolumeChange(Number(e.target.value))}
                    />
                    <AppButton
                        className="row"
                        style={{ padding: '0.4rem', marginTop: "0.4rem", marginBottom: "0.2rem" }}
                        onClick={onInstrumentDelete}
                    >
                        <FaTrash color="var(--red)" style={{ marginRight: '0.3rem' }} />
                        Delete
                    </AppButton>
                </>
                }
            </div>
        }
    </div>
}

interface InstrumentSelectorProps {
    selected: ComposedSongInstrument
    onChange: (instrument: InstrumentName) => void
}
function InstrumentSelector({ selected, onChange }: InstrumentSelectorProps) {
    return <select
        className="select"
        style={{ width: '100%', padding: '0.3rem' }}
        onChange={(e) => onChange(e.target.value as InstrumentName)}
        value={selected.name}
    >
        {INSTRUMENTS.map(ins => <option key={ins}>{ins}</option>)}
    </select>
}