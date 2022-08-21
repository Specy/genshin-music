import { BASE_THEME_CONFIG } from "$/appConfig"
import Color from "color"
import { useEffect, useState } from "react"
import { HexColorInput, HexColorPicker } from "react-colorful"
import { FaCheck, FaTimes } from "react-icons/fa"

interface ColorPickerProps {
    value: string
    absolute?: boolean
    style?: React.CSSProperties
    onChange?: (color: string) => void
}



export function ColorPicker({ onChange, value, absolute = true, style}: ColorPickerProps) {
    const [color, setColor] = useState(Color(value))
    useEffect(() => {
        setColor(Color(value))
    }, [value])

    function handleChange(e: any) {
        setColor(Color(e))
    }
    function sendEvent() {
        onChange?.(color.toString())
    }

    return <>
        <div 
            className="color-picker"
            style={{ 
                position: absolute ? 'absolute' : 'unset',
                ...style
            }}
        >
            <HexColorPicker onChange={handleChange} color={color.hex()} />
            <div className="color-picker-row">
                <div
                    className="color-picker-input"
                    style={{
                        backgroundColor: color.toString(),
                        color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark,
                    }}
                >
                    <div style={{ fontFamily: 'Arial' }}>#</div>
                    <HexColorInput
                        onChange={handleChange}
                        color={color.hex()}
                        style={{
                            color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark,
                        }}
                    />
                </div>

                <button
                    className="color-picker-check"
                    onClick={() => {
                        setColor(Color(value))
                        onChange?.(value)
                    }}
                    style={{
                        backgroundColor: color.toString(),
                        color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
                    }}
                >
                    <FaTimes size={16} />
                </button>
                <button
                    className="color-picker-check"
                    onClick={sendEvent}
                    style={{
                        backgroundColor: color.toString(),
                        color: color.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
                    }}
                >
                    <FaCheck size={16} />
                </button>
            </div>
        </div>
    </>
}