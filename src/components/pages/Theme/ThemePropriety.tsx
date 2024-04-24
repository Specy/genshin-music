import {useEffect, useState} from "react";
import {ThemeKeys, ThemeProvider} from "$stores/ThemeStore/ThemeProvider";
import {capitalize} from "$lib/utils/Utilities";
import Color from "color";
import {HexAlphaColorPicker, HexColorInput} from "react-colorful";
import {BASE_THEME_CONFIG} from "$config";
import {FaCheck, FaTimes} from 'react-icons/fa'
import {AppButton} from "$cmp/shared/Inputs/AppButton";

export interface ThemeProprietyProps {
    name: ThemeKeys,
    value: string,
    isSelected: boolean,
    isModified: boolean,
    canReset: boolean,
    setSelectedProp: (name: ThemeKeys | '') => void,
    onChange: (name: ThemeKeys, value: string) => void,
    handlePropReset: (name: ThemeKeys) => void
}

export function ThemePropriety({
                                   name,
                                   value,
                                   onChange,
                                   isModified,
                                   setSelectedProp,
                                   isSelected,
                                   handlePropReset,
                                   canReset
                               }: ThemeProprietyProps) {
    const [color, setColor] = useState(Color(value))
    useEffect(() => {
        setColor(Color(value))
    }, [value])

    function handleChange(e: any) {
        setColor(Color(e))
    }

    function sendEvent() {
        const parsed = color.alpha() === 1 ? color.hex() : color.hexa()
        onChange(name, parsed)
        setSelectedProp('')
    }

    return <div
        className={`theme-row ${isSelected ? 'selected' : ''}`}
        style={isSelected ? {
            backgroundColor: color.toString(),
            color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        } : {}}
    >
        <div>
            {capitalize(name.split('_').join(' '))}
        </div>
        <div className="color-input-wrapper">
            {(canReset && isModified) &&
                <AppButton onClick={() => handlePropReset(name)} toggled={isModified} className='theme-reset'>
                    RESET
                </AppButton>
            }
            {isSelected
                ? <div className="color-picker">
                    <HexAlphaColorPicker onChange={handleChange} color={color.hexa()}/>
                    <div className="color-picker-row">
                        <div
                            className="color-picker-input"
                            style={{
                                backgroundColor: color.toString(),
                                color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark,
                            }}
                        >
                            <HexColorInput
                                prefixed={true}
                                alpha={true}
                                onChange={handleChange}
                                color={color.alpha() === 1 ? color.hex() : color.hexa()}
                                style={{
                                    color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark,
                                }}
                            />
                        </div>

                        <button
                            className="color-picker-check"
                            onClick={() => {
                                setColor(Color(value))
                                setSelectedProp('')
                            }}
                            style={{
                                backgroundColor: color.toString(),
                                color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
                            }}
                        >
                            <FaTimes size={16}/>
                        </button>
                        <button
                            className="color-picker-check"
                            onClick={sendEvent}
                            style={{
                                backgroundColor: color.toString(),
                                color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
                            }}
                        >
                            <FaCheck size={16}/>
                        </button>
                    </div>
                </div>
                : <div
                    onClick={() => setSelectedProp(name)}
                    className='color-preview'
                    style={{
                        backgroundColor: ThemeProvider.get(name).toString(),
                        color: ThemeProvider.getText(name).toString()
                    }}
                >
                    Text
                </div>
            }

        </div>
    </div>
}