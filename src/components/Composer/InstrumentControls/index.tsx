import { AppButton } from "components/AppButton";
import { useTheme } from "lib/Hooks/useTheme";
import { ComposedSongInstrument } from "lib/Songs/ComposedSong";
import { blurEvent } from "lib/Tools";
import { memo, useCallback, useState } from "react";
import { FaCog, FaEye, FaEyeSlash, FaPlus } from "react-icons/fa";
import { ThemeStoreClass } from "stores/ThemeStore";
import { InstrumentSettingsPopup } from "./InstrumentSettingsPopup";



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
    const [isEditing, setIsEditing] = useState(false)
    const setNotEditing = useCallback(() => {
        setIsEditing(false)
    }, [])
    return <div className="column instruments-button-wrapper">
        {instruments.map((ins, i) =>
            <InstrumentButton
                theme={theme}
                instrument={ins}
                isSelected={i === selected}
                onEditClick={() => setIsEditing(!isEditing)}
                onClick={() => onLayerSelect(i)}
                onVisibleToggle={(visible) => onInstrumentChange({ ...ins, visible }, i)}
                key={ins.name + i}
            />
        )}
        {isEditing &&
            <InstrumentSettingsPopup
                instrument={instruments[selected]}
                onChange={ins => onInstrumentChange(ins, selected)}
                onDelete={() => {
                    onInstrumentDelete(selected)
                    setNotEditing()
                }}
                onClose={setNotEditing}
            />
        }
        <div style={{ height: '1rem' }}>

        </div>
        <AppButton style={{ marginTop: 'auto', padding: '0rem', paddingBottom: '0.1rem', backgroundColor: "var(--primary-darken-10)" }} onClick={onInstrumentAdd}>
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
    onEditClick: () => void
    onVisibleToggle: (newState: boolean) => void
}
function InstrumentButton({ instrument, onClick, isSelected, theme, onEditClick, onVisibleToggle }: InstrumentButtonProps) {
    const passiveIcon = theme.getText('primary')
    return <div
        className="instrument-button flex-centered"
        style={isSelected
            ? {
                backgroundColor: theme.get("primary").mix(theme.get("accent")).toString(),
            } : {}}
    >
        {!isSelected && !instrument.visible &&
            <FaEyeSlash 
                style={{
                    position: 'absolute', 
                    top: '0.3rem', 
                    left: '0.3rem', 
                    color: (passiveIcon.isDark() ? passiveIcon.lighten(0.2) : passiveIcon.darken(0.2)).hex()
                }}
                size={14}
            />
        }
        <AppButton
            onClick={(e) => {
                blurEvent(e)
                onClick()
            }}
            style={{ backgroundColor: "transparent" }}
            className='flex-grow flex-centered instrument-name-button text-ellipsis'
        >
            {instrument.name}
        </AppButton>

        {isSelected &&
            <div className="instrument-settings">
                <AppButton
                    onClick={() => onEditClick()}
                >
                    <FaCog size={15} />
                </AppButton>
                <AppButton
                    onClick={() => onVisibleToggle(!instrument.visible)}
                >
                    {instrument.visible
                        ? <FaEye size={16} />
                        : <FaEyeSlash size={16} />
                    }
                </AppButton>

            </div>
        }

    </div>
}



