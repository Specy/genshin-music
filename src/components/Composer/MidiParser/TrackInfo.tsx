import { InstrumentData } from '$lib/Songs/SongClasses'
import { FaArrowDown, FaArrowUp, FaEllipsisH } from 'react-icons/fa'
import { CustomTrack } from '.'
import { useState, useEffect, useCallback } from 'react'
import useDebounce from '$lib/Hooks/useDebounce'
import { Select } from '$cmp/Inputs/Select'
import { Theme } from '$stores/ThemeStore/ThemeProvider'
import { hasTooltip, Tooltip } from '$cmp/Utility/Tooltip'
import { NumericalInput } from './Numericalinput'
interface TrackProps {
    data: CustomTrack
    index: number
    instruments: InstrumentData[]
    onChange: (index: number, data: Partial<CustomTrack>) => void
    theme: Theme
}

export function TrackInfo({ data, index, onChange, theme, instruments }: TrackProps) {
    const [dataShown, setDataShown] = useState(false)
    const background = { backgroundColor: theme.layer('menu_background', 0.15).toString() }
    const [offset, setOffset] = useState(`${data.localOffset ?? ""}`)
    const debouncedOffset = useDebounce<string>(offset, 600)
    useEffect(() => {
        const parsedOffset = parseInt(debouncedOffset)
        const localOffset = Number.isFinite(parsedOffset) ? parsedOffset : null
        setOffset(`${localOffset ?? ""}`)
        onChange(index, { localOffset })
    }, [debouncedOffset, onChange, index]);
    useEffect(() => {
        setOffset(`${data.localOffset ?? ""}`)
    }, [data.localOffset])
    const onMaxScaleChange = useCallback((maxScaling: number) => {
        onChange(index, { maxScaling: Math.max(0, maxScaling) })
    }, [onChange, index])
    return <div className='midi-track-column' style={background}>
        <div className='midi-track-wrapper'>
            <div className='midi-track-center'>
                <input type='checkbox' onChange={() => onChange(index, { selected: !data.selected })} checked={data.selected} />
                {`${data.name} `}
                (
                {data.track.notes.length},
                {` ${data.track.instrument.family}`}
                )
            </div>
            <div className='midi-track-center'>
                <Select
                    onChange={(event) => onChange(index, { layer: Number(event.target.value) })}
                    value={data.layer}
                    className='midi-select'
                    style={{
                        marginLeft: '0.2rem',
                    }}
                >
                    {instruments.map((ins, i) =>
                        <option value={i} key={i}>
                            {ins.alias || ins.name} - {`Layer ${i + 1}`}
                        </option>
                    )}
                </Select>
                <FaEllipsisH
                    size={22}
                    color={"var(--primary)"}
                    onClick={() => setDataShown(!dataShown)}
                    cursor='pointer'
                />
            </div>
        </div>
        <div
            className='midi-track-data'
            style={{
                display: dataShown ? "flex" : "none"
            }}
        >
            <div className={'midi-track-data-row'}>
                <div className={hasTooltip(true)}>
                    <Tooltip>
                        Changes the index of each note by this amount.
                    </Tooltip>
                    Track offset:
                </div>
                <input
                    type='text'
                    value={offset}
                    placeholder='No offset'
                    className='midi-input'
                    style={{ width: '6.3rem' }}
                    onChange={(e) => setOffset(e.target.value)}
                />
            </div>
            <div className={'midi-track-data-row'}>
                <div className={hasTooltip(true)}>
                    <Tooltip>
                        Scale down/up the notes which are out of scale by theose octaves.
                    </Tooltip>
                    Max notes octave scaling:
                </div>
                <NumericalInput
                    value={data.maxScaling}
                    placeholder='No scaling'
                    onChange={onMaxScaleChange}
                />
            </div>
            <div className='midi-track-data-row'>
                <div>Instrument:</div>
                <div>{data.track.instrument.name}</div>
            </div>
            <div className='midi-track-data-row'>
                <div>Number of notes:</div>
                <div>{data.track.notes.length}</div>
            </div>
            <div className='midi-track-data-row'>
                <div>Accidentals:</div>
                <div>{data.numberOfAccidentals}</div>
            </div>
            <div className='midi-track-data-row'>
                <div>Out of range: ({data.outOfRangeBounds.upper + data.outOfRangeBounds.lower})</div>
                <div className='row' style={{ width: 'fit-content' }}>
                    <div className='row' style={{ marginRight: '0.4rem' }}>
                        <FaArrowUp style={{ marginRight: '0.2rem' }} />
                        {data.outOfRangeBounds.upper}
                    </div>
                    <div className='row'>
                        <FaArrowDown style={{ marginRight: '0.2rem' }} />
                        {data.outOfRangeBounds.lower}
                    </div>
                </div>
            </div>
        </div>
    </div>
}