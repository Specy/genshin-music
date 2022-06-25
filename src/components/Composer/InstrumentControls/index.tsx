import { AppButton } from "components/AppButton";
import { useTheme } from "lib/Hooks/useTheme";
import { InstrumentData } from "lib/Songs/SongClasses";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FaCircle, FaCog, FaEye, FaEyeSlash, FaLine, FaMinus, FaPlus } from "react-icons/fa";
import { BiSquareRounded } from "react-icons/bi";

import { ThemeStoreClass } from "stores/ThemeStore";
import { InstrumentSettingsPopup } from "./InstrumentSettingsPopup";


interface InstrumentControlsProps {
    instruments: InstrumentData[]
    selected: number
    onLayerSelect: (index: number) => void
    onInstrumentChange: (instrument: InstrumentData, index: number) => void
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
                onVisibleToggle={(visible) => onInstrumentChange(ins.set({ visible }), i)}
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
        <div style={{ minHeight: '1rem' }}>

        </div>
        <AppButton
            onClick={onInstrumentAdd}
            ariaLabel='Add new instrument'
            className="new-instrument-button flex-centered"
        >
            <FaPlus size={16} color='var(--icon-color)' />
        </AppButton>
    </div>
}
export const InstrumentControls = memo(_InstrumentControls, (p, n) => {
    return p.instruments === n.instruments && p.selected === n.selected
})


interface InstrumentButtonProps {
    instrument: InstrumentData
    theme: ThemeStoreClass
    isSelected: boolean,
    onClick: () => void
    onEditClick: () => void
    onVisibleToggle: (newState: boolean) => void
}
function InstrumentButton({ instrument, onClick, isSelected, theme, onEditClick, onVisibleToggle }: InstrumentButtonProps) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!isSelected || !ref.current) return
        ref.current.scrollIntoView({behavior: "auto", block: "nearest"})
    },[isSelected, ref])
    let passiveIcon = theme.getText('primary')
    passiveIcon = (passiveIcon.isDark() ? passiveIcon.lighten(0.2) : passiveIcon.darken(0.15))
    return <div
        ref={ref}
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
                    top: '0.2rem',
                    left: '0.3rem',
                    color: passiveIcon.hex()
                }}
                size={14}
            />
        }
        {!isSelected &&
            <div
                style={{
                    position: 'absolute',
                    top: '0.4rem',
                    right: '0.4rem',
                    height: 'fit-content'
                }}
            >
                {instrument.icon === 'circle' && 
                    <FaCircle size={8} style={{display: 'block'}} color={passiveIcon.hex()}/>
                }
                {instrument.icon === 'border' && 
                    <BiSquareRounded 
                        size={12} 
                        style={{display: 'block', marginRight: '-2px', marginTop: '-2px', strokeWidth: '2px'}}
                        color={passiveIcon.hex()}
                    />
                }
                {instrument.icon === 'line' && 
                    <FaMinus size={8} style={{display: 'block'}} color={passiveIcon.hex()}/>
                }
            </div>
        }

        <AppButton
            onClick={onClick}
            style={{ backgroundColor: "transparent", width: '100%' }}
            className='flex-grow flex-centered instrument-name-button'
        >
            <span className="text-ellipsis" style={{ width: '6rem' }}>
                {instrument.alias || instrument.name}
            </span>
        </AppButton>

        {isSelected &&
            <div className="instrument-settings">
                <AppButton
                    onClick={() => onEditClick()}
                    ariaLabel='Settings'
                    className="flex-centered"
                >
                    <FaCog size={15} />
                </AppButton>
                <AppButton
                    onClick={() => onVisibleToggle(!instrument.visible)}
                    ariaLabel={instrument.visible ? 'Hide' : 'Show'}
                    className="flex-centered"
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



