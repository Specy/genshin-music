import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {useTheme} from "$lib/Hooks/useTheme";
import {InstrumentData} from "$lib/Songs/SongClasses";
import {memo, useCallback, useEffect, useRef, useState} from "react";
import {FaCircle, FaCog, FaEye, FaEyeSlash, FaMinus, FaPlus, FaVolumeMute} from "react-icons/fa";
import {BiSquareRounded} from "react-icons/bi";

import {Theme} from "$stores/ThemeStore/ThemeProvider";
import {InstrumentSettingsPopup} from "./InstrumentSettingsPopup";
import {useTranslation} from "react-i18next";


interface InstrumentControlsProps {
    instruments: InstrumentData[]
    selected: number
    onLayerSelect: (index: number) => void
    onInstrumentChange: (instrument: InstrumentData, index: number) => void
    onInstrumentDelete: (index: number) => void
    onInstrumentAdd: () => void
    onChangePosition: (direction: 1 | -1) => void
}

function _InstrumentControls({
                                 instruments,
                                 onInstrumentAdd,
                                 onInstrumentChange,
                                 onInstrumentDelete,
                                 selected,
                                 onLayerSelect,
                                 onChangePosition
                             }: InstrumentControlsProps) {
    const {t} = useTranslation()
    const [theme] = useTheme()
    const [isEditing, setIsEditing] = useState(false)
    const setNotEditing = useCallback(() => {
        setIsEditing(false)
    }, [])
    return <>
        {isEditing &&
            <InstrumentSettingsPopup
                instrument={instruments[selected]}
                currentLayer={selected}
                instruments={instruments}
                onChange={ins => onInstrumentChange(ins, selected)}
                onDelete={() => {
                    onInstrumentDelete(selected)
                    setNotEditing()
                }}
                onChangePosition={onChangePosition}
                onClose={setNotEditing}
            />
        }
        <div className="column instruments-button-wrapper">
            {instruments.map((ins, i) =>
                <InstrumentButton
                    theme={theme}
                    instrument={ins}
                    isSelected={i === selected}
                    onEditClick={() => setIsEditing(!isEditing)}
                    onClick={() => onLayerSelect(i)}
                    onVisibleToggle={(visible) => onInstrumentChange(ins.set({visible}), i)}
                    key={ins.name + i}
                />
            )}
            <div style={{minHeight: '1rem'}}/>
            <AppButton
                onClick={(e) => {
                    onInstrumentAdd()
                    setTimeout(() => {
                        // @ts-ignore
                        e.target?.scrollIntoView()
                    }, 50)
                }}
                ariaLabel={t('common:add_new_instrument')}
                className="new-instrument-button flex-centered"
            >
                <FaPlus size={16} color='var(--icon-color)'/>
            </AppButton>
        </div>
    </>

}

export const InstrumentControls = memo(_InstrumentControls, (p, n) => {
    return p.instruments === n.instruments && p.selected === n.selected
})


interface InstrumentButtonProps {
    instrument: InstrumentData
    theme: Theme
    isSelected: boolean,
    onClick: () => void
    onEditClick: () => void
    onVisibleToggle: (newState: boolean) => void
}

function InstrumentButton({
                              instrument,
                              onClick,
                              isSelected,
                              theme,
                              onEditClick,
                              onVisibleToggle
                          }: InstrumentButtonProps) {
    const {t} = useTranslation('instruments')
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!isSelected || !ref.current) return
        ref.current.scrollIntoView({behavior: "auto", block: "nearest"})
    }, [isSelected, ref])
    let passiveIcon = theme.getText('primary')
    passiveIcon = (passiveIcon.isDark() ? passiveIcon.lighten(0.2) : passiveIcon.darken(0.15))
    return <div
        ref={ref}
        className={`instrument-button flex-centered ${isSelected ? 'instrument-button-selected' : ''}`}
        style={isSelected
            ? {
                backgroundColor: theme.get("primary").mix(theme.get("accent")).toString(),
            } : {}}
    >
        {!isSelected &&
            <div className="row"
                 style={{
                     position: 'absolute',
                     gap: '0.2rem',
                     top: '0.2rem',
                     left: '0.3rem',
                 }}
            >
                {!instrument.visible &&
                    <FaEyeSlash
                        color={passiveIcon.hex()}
                        size={14}
                    />
                }
                {instrument.muted &&
                    <FaVolumeMute
                        color={passiveIcon.hex()}
                        size={14}
                    />
                }
            </div>

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
            style={{backgroundColor: "transparent", width: '100%'}}
            className='flex-grow flex-centered instrument-name-button'
        >
            <span className="text-ellipsis" style={{width: '6rem'}}>
                {instrument.alias || t(instrument.name)}
            </span>
        </AppButton>

        {isSelected &&
            <div className="instrument-settings">
                <AppButton
                    onClick={() => onEditClick()}
                    ariaLabel='Settings'
                    className="flex-centered"
                >
                    <FaCog size={15}/>
                </AppButton>
                <AppButton
                    onClick={() => onVisibleToggle(!instrument.visible)}
                    ariaLabel={instrument.visible ? 'Hide' : 'Show'}
                    className="flex-centered"
                >
                    {instrument.visible
                        ? <FaEye size={16}/>
                        : <FaEyeSlash size={16}/>
                    }
                </AppButton>

            </div>
        }
    </div>
}

