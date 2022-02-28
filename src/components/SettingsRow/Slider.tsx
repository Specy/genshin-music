import { ChangeEvent } from "react"
import { SettingsSlider } from "types/SettingsPropriety"
interface SliderProps{
    data: SettingsSlider,
    objectKey: string,
    value: number, 
    onChange: (data: {
        key: string, 
        data: any
    }) => void,
}

export function Slider({data, value, onChange, objectKey}:SliderProps) {
    function handleChange(e: ChangeEvent<HTMLInputElement>){
        onChange({
            key: objectKey,
            data: { ...data, value: Number(e.target.value)}
        })
    }
    return <input
        type="range"
        min={data.threshold[0]}
        max={data.threshold[1]}
        value={value}
        onChange={handleChange}
    />
}