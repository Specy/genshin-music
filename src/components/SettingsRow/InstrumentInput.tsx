import { ChangeEvent } from "react"

interface InstrumentInputProps{
    data: {
        value: string,
        options: string[]
    },
    volume: number, 
    instrument: string,
    objectKey: string,
    onVolumeChange: (event: any) => void,
    onVolumeComplete: (event: any) => void,
    onInstrumentPick: (event: any) => void
}

export function InstrumentInput({data,volume, onVolumeChange, onVolumeComplete, onInstrumentPick, objectKey, instrument}: InstrumentInputProps) {
    function handleVolumeChange(e: ChangeEvent<HTMLInputElement>){
        onVolumeChange(Number(e.target.value))
    }
    function handleVolumePick(){
        onVolumeComplete({
            key: objectKey,
            value: volume
        })
    }
    function handleInstrument(e: ChangeEvent<HTMLSelectElement>){
        onInstrumentPick({
            key: objectKey,
            data: { ...data, value: e.target.value }
        })
    }

    return <div className="instrument-picker">
        <select value={instrument}
            onChange={handleInstrument}
        >
            {data.options.map(e => {
                return <option value={e} key={e}>{e}</option>
            })}
        </select>
        <input
            type="range"
            min={1}
            max={100}
            value={volume}
            onChange={handleVolumeChange}
            onPointerUp={handleVolumePick}
        />
    </div>
}