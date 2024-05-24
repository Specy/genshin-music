import {InstrumentData} from '$lib/Songs/SongClasses'
import {FaArrowDown, FaArrowUp, FaCog} from 'react-icons/fa'
import {CustomTrack} from './index'
import {useCallback, useEffect, useState} from 'react'
import useDebounce from '$lib/Hooks/useDebounce'
import {Select} from '$cmp/shared/Inputs/Select'
import {Theme} from '$stores/ThemeStore/ThemeProvider'
import {hasTooltip, Tooltip} from '$cmp/shared/Utility/Tooltip'
import {NumericalInput} from './Numericalinput'
import {prettyPrintInstrumentName} from '$lib/utils/Utilities'
import {Column} from "$cmp/shared/layout/Column";
import {Row} from "$cmp/shared/layout/Row";
import {useTranslation} from "react-i18next";

interface TrackProps {
    data: CustomTrack
    index: number
    instruments: InstrumentData[]
    onChange: (index: number, data: Partial<CustomTrack>) => void
    theme: Theme
}

export function TrackInfo({data, index, onChange, theme, instruments}: TrackProps) {
    const {t} = useTranslation(['composer', 'common'])
    const [dataShown, setDataShown] = useState(false)
    const background = {backgroundColor: theme.layer('menu_background', 0.15).toString()}
    const [offset, setOffset] = useState(`${data.localOffset ?? ""}`)
    const debouncedOffset = useDebounce<string>(offset, 600)

    useEffect(() => {
        const parsedOffset = parseInt(debouncedOffset)
        const localOffset = Number.isFinite(parsedOffset) ? parsedOffset : null
        setOffset(`${localOffset ?? ""}`)
        onChange(index, {localOffset})
    }, [debouncedOffset, onChange, index]);

    useEffect(() => {
        setOffset(`${data.localOffset ?? ""}`)
    }, [data.localOffset])

    const onMaxScaleChange = useCallback((maxScaling: number) => {
        onChange(index, {maxScaling: Math.max(0, maxScaling)})
    }, [onChange, index])
    return <Column gap={'0.5rem'} className='midi-track-column' style={background}>
        <div className='midi-track-wrapper'>
            <div className='midi-track-center'>
                <input type='checkbox' onChange={() => onChange(index, {selected: !data.selected})}
                       checked={data.selected}/>
                {`${data.name} `}
                (
                {data.track.notes.length},
                {` ${data.track.instrument.family}`}
                )
            </div>
            <div className='midi-track-center'>
                <Select
                    onChange={(event) => onChange(index, {layer: Number(event.target.value)})}
                    value={data.layer}
                    className='midi-select'
                    style={{
                        marginLeft: '0.2rem',
                        paddingRight: '1.5rem'
                    }}
                >
                    {instruments.map((ins, i) =>
                        <option value={i} key={i}>
                            {ins.alias || prettyPrintInstrumentName(ins.name)} - {`Layer ${i + 1}`}
                        </option>
                    )}
                </Select>
                <FaCog
                    size={22}
                    color={dataShown ? 'var(--secondary)': 'var(--primary)'}
                    onClick={() => setDataShown(!dataShown)}
                    cursor='pointer'
                />
            </div>
        </div>
        <Column
            padding={'0.4rem'}
            gap={'0.2rem'}
            style={{
                display: dataShown ? "flex" : "none",
                borderTop: 'solid 0.1rem var(--secondary)'
            }}
        >
            <Row align={'center'} justify={'between'}>
                <div className={hasTooltip(true)}>
                    <Tooltip>
                        {t('midi_parser.local_note_offset_description')}
                    </Tooltip>
                    {t('midi_parser.local_note_offset')}
                </div>
                <Row gap={'0.3rem'}>
                    <button
                        onClick={() => setOffset(`${Number(offset) - 1}`)}
                        className='midi-btn-small'
                    >-
                    </button>
                    <input
                        type='text'
                        value={offset}
                        placeholder='No offset'
                        className='midi-input'
                        style={{width: '4rem'}}
                        onChange={(e) => setOffset(e.target.value)}
                    />
                    <button
                        onClick={() => setOffset(`${Number(offset) + 1}`)}
                        className='midi-btn-small'
                    >+
                    </button>
                </Row>
            </Row>
            <Row align={'center'} justify={'between'}>
                <div className={hasTooltip(true)}>
                    <Tooltip>
                        {t('midi_parser.max_octave_scaling_description')}
                    </Tooltip>
                    {t('midi_parser.max_octave_scaling')}
                </div>
                <NumericalInput
                    value={data.maxScaling}
                    placeholder='No scaling'
                    onChange={onMaxScaleChange}
                />
            </Row>
            <Row align={'center'} justify={'between'}>
                <div>{t('common:instrument')}</div>
                <div>{data.track.instrument.name}</div>
            </Row>
            <Row align={'center'} justify={'between'}>
                <div>{t('midi_parser.number_of_notes')}</div>
                <div>{data.track.notes.length}</div>
            </Row>
            <Row align={'center'} justify={'between'}>
                <div>{t('midi_parser.accidentals')}</div>
                <div>{data.numberOfAccidentals}</div>
            </Row>
            <Row align={'center'} justify={'between'}>
                <div>{t('midi_parser.out_of_range')}({data.outOfRangeBounds.upper + data.outOfRangeBounds.lower})</div>
                <Row style={{width: 'fit-content'}}>
                    <Row style={{marginRight: '0.4rem'}}>
                        <FaArrowUp style={{marginRight: '0.2rem'}}/>
                        {data.outOfRangeBounds.upper}
                    </Row>
                    <Row>
                        <FaArrowDown style={{marginRight: '0.2rem'}}/>
                        {data.outOfRangeBounds.lower}
                    </Row>
                </Row>
            </Row>
        </Column>
    </Column>
}