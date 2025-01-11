import {useCallback, useEffect, useRef, useState} from 'react'
import {APP_NAME, NOTE_NAME_TYPES, NoteNameType} from '$config'
import {isComposedOrRecorded} from '$lib/utils/Utilities'
import Switch from '$cmp/shared/Inputs/Switch'
import Analytics from '$lib/Analytics'
import {AppButton} from '$cmp/shared/Inputs/AppButton'
import {logger} from '$stores/LoggerStore'
import {SerializedSong} from '$lib/Songs/Song'
import {SheetVisualiserMenu} from '$cmp/pages/SheetVisualizer/SheetVisualizerMenu'
import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata'
import {DefaultPage} from '$cmp/shared/pagesLayout/DefaultPage'
import {songService} from '$lib/Services/SongService'
import {useTheme} from '$lib/Hooks/useTheme'
import {Select} from '$cmp/shared/Inputs/Select'
import s from "./SheetVisualizer.module.css"
import {SheetFrame2} from '$cmp/pages/SheetVisualizer/SheetFrame2'
import {VisualSong} from '$lib/Songs/VisualSong'
import {ComposedSong} from '$lib/Songs/ComposedSong'
import {RecordedSong} from '$lib/Songs/RecordedSong'
import {Row} from "$cmp/shared/layout/Row";
import {Column} from "$cmp/shared/layout/Column";
import {useTranslation} from "react-i18next";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";


export default function SheetVisualizer() {
    useSetPageVisited('sheetVisualizer')
    const {t} = useTranslation(['sheet_visualizer', "home"])
    const [theme] = useTheme()
    const [sheet, setSheet] = useState<VisualSong | null>(null)
    const [framesPerRow, setFramesPerRow] = useState(7)
    const [currentSong, setCurrentSong] = useState<SerializedSong | null>(null)
    const [hasText, setHasText] = useState(false)
    const [songAsText, setSongAstext] = useState('')
    const [flattenSpaces, setFlattenSpaces] = useState(false)
    const [multiColor, setMultiColor] = useState(false)
    const [keyboardLayout, setKeyboardLayout] = useState<NoteNameType>(APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC')
    const ref = useRef<HTMLDivElement>(null)

    function setFrames(amount: number) {
        if (!ref.current) return
        const newAmount = framesPerRow + amount
        const frame = ref.current.children[0]?.children[0] as HTMLDivElement | undefined
        if (!frame || newAmount < 1) return
        const width = frame.getBoundingClientRect().width
        if (width < 50 && amount === 1) return
        setFramesPerRow(newAmount)
    }

    const loadSong = useCallback((song: SerializedSong, layout: NoteNameType) => {
        try {
            const temp = songService.parseSong(song)
            const isValid = isComposedOrRecorded(temp)
            if (!isValid) return logger.error(t('invalid_song_to_visualize'))
            try {
                const vs = VisualSong.from(temp, flattenSpaces)
                setSheet(vs)
                setSongAstext(vs.toText(layout))
            } catch (e) {
                console.error(e)
                logger.error(t('error_converting_to_visual_song_try_convert_in_recorded'))
                try {
                    const vs = VisualSong.from((temp as RecordedSong | ComposedSong).toRecordedSong(), flattenSpaces)
                    setSheet(vs)
                    setSongAstext(vs.toText(layout))
                } catch (e) {
                    console.error(e)
                    logger.error(t('error_converting_to_visual_song'))
                    setSheet(null)
                    setSongAstext("")
                }
            }

        } catch (e) {
            console.error(e)
            logger.error(t('error_converting_to_visual_song'))
        }
        Analytics.songEvent({type: 'visualize'})
    }, [flattenSpaces, t])
    useEffect(() => {
        if (currentSong) loadSong(currentSong, keyboardLayout)
    }, [currentSong, hasText, keyboardLayout, loadSong, flattenSpaces])
    return <DefaultPage
        excludeMenu={true}
        className={s['page-no-print']}
        menu={
            <SheetVisualiserMenu
                className={s['no-print']}
                onSongLoaded={setCurrentSong}
                currentSong={currentSong}
            />
        }
    >
        <PageMetadata text={`${t('home:sheet_visualizer_name')}${currentSong ? ` - ${currentSong.name}` : ""}`}
                      description='Learn a sheet in a visual way, convert the song into text format or print it as pdf'/>
        <div style={{display: 'flex', alignItems: 'center', flexDirection: 'column'}}>
            <div className={`${s['visualizer-buttons-wrapper']} noprint`} style={{borderBottom: 'solid 1px var(--secondary)', paddingBottom: '1rem'}}>
                <Column gap={'0.5rem'}>
                    <Row align={'center'} gap={'0.5rem'}>
                        <div>{t('note_names')}</div>
                        <Switch checked={hasText} onChange={setHasText}/>
                        {hasText &&
                            <Select
                                value={keyboardLayout}
                                onChange={e => setKeyboardLayout(e.target.value as NoteNameType)}
                            >
                                {NOTE_NAME_TYPES.map(t => <option value={t} key={t}>{t}</option>)}
                            </Select>
                        }
                    </Row>
                    <Row align={'center'} gap={'0.5rem'}>
                        <div>{t('merge_empty_spaces')}</div>
                        <Switch checked={flattenSpaces} onChange={setFlattenSpaces}/>
                    </Row>
                    <Row align={'center'} gap={'0.5rem'}>
                        <div>{t('different_color_rows')}</div>
                        <Switch checked={multiColor} onChange={setMultiColor}/>
                    </Row>
                </Column>

                <div style={{display: 'flex', alignItems: 'center'}}>
                    {t('per_row')}: {framesPerRow}
                    <button className={s['visualizer-plus-minus']}
                            onClick={() => setFrames(-1)}>
                        -
                    </button>
                    <button className={s['visualizer-plus-minus']}
                            onClick={() => setFrames(1)}>
                        +
                    </button>
                </div>
            </div>
            <h1 className='onprint' style={{color: "black"}}>
                {APP_NAME} Music Nightly
            </h1>
            <h1 className='onprint' style={{color: "black"}}>
                {currentSong ? currentSong?.name : ''}
            </h1>
            <div style={{width: '100%'}} className='noprint'>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <h2 className='text-ellipsis' style={{marginTop: '0.8rem'}}>
                        {currentSong ? currentSong.name : t('no_song_selected')}
                    </h2>
                    {currentSong &&
                        <AppButton onClick={() => window.print()}
                                   style={{minWidth: 'fit-content', marginLeft: "0.4rem"}}>
                            {t('print_as_pdf')}
                        </AppButton>
                    }

                </div>
                <div style={{color: 'var(--background-text)'}}>
                    {t('sheet_visualizer_instructions')}
                </div>
            </div>
            <div
                className={s['visualizer-frame-wrapper']}
                style={{gridTemplateColumns: `repeat(${framesPerRow},1fr)`}}
                ref={ref}
            >
                {sheet && sheet.chunks.map((chunk, i) =>
                    <SheetFrame2
                        key={i}
                        chunk={chunk}
                        rows={3}
                        theme={theme}
                        multiColorRows={multiColor}
                        hasText={hasText}
                        keyboardLayout={keyboardLayout}
                    />
                )}
            </div>
            {songAsText.trim().length > 0 &&
                <pre className={s['text-notation-wrapper']}>
                    {songAsText}
                </pre>
            }
        </div>
    </DefaultPage>
}





