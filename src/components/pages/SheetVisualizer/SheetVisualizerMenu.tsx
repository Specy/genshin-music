import {useState} from 'react'
import {SongMenu} from '$cmp/shared/pagesLayout/SongMenu'
import {useSongs} from '$lib/Hooks/useSongs'
import {browserHistoryStore} from '$stores/BrowserHistoryStore'
import {MenuButton, MenuItem} from '$cmp/shared/Menu/MenuItem'
import {FaArrowLeft, FaHome, FaMusic, FaTimes} from 'react-icons/fa'
import {homeStore} from '$stores/HomeStore'
import {MenuPanel, MenuPanelWrapper} from '$cmp/shared/Menu/MenuPanel'
import {SerializedSong, SongStorable} from '$lib/Songs/Song'
import useClickOutside from '$lib/Hooks/useClickOutside'
import {songService} from '$lib/Services/SongService'
import {logger} from '$stores/LoggerStore'
import {useRouter} from 'next/router'
import {MenuContextProvider, MenuSidebar} from "$cmp/shared/Menu/MenuContent";
import {Stylable} from "$lib/utils/UtilTypes";
import {useTranslation} from "react-i18next";
interface SheetVisualiserMenuProps extends Stylable{
    currentSong: SerializedSong | null,
    onSongLoaded: (song: SerializedSong) => void,
}

export function SheetVisualiserMenu({currentSong, onSongLoaded, className, style}: SheetVisualiserMenuProps) {
    const { t} = useTranslation('menu')
    const [songs] = useSongs()
    const history = useRouter()
    const [selectedPage, setSelectedPage] = useState("")
    const [open, setOpen] = useState(false)
    const menuRef = useClickOutside<HTMLDivElement>(() => {
        setOpen(false)
    }, {ignoreFocusable: true, active: selectedPage !== ""})
    return <MenuContextProvider
        ref={menuRef}
        open={open}
        setOpen={setOpen}
        className={className}
        style={style}
        current={selectedPage}
        setCurrent={setSelectedPage}
    >
        <MenuSidebar style={{justifyContent: 'flex-end'}}>
            {(browserHistoryStore.hasNavigated && !open) &&
                <MenuButton
                    ariaLabel={t('go_back')}
                    style={{marginBottom: 'auto'}}
                    onClick={() => {
                        history.back()
                    }}
                >
                    <FaArrowLeft className='icon'/>
                </MenuButton>
            }
            {open &&
                <MenuButton
                    ariaLabel={t('close_menu')}
                    style={{marginBottom: 'auto'}}
                    onClick={() => setOpen(false)}
                >
                    <FaTimes className="icon"/>
                </MenuButton>
            }
            <MenuItem id={'Songs'} ariaLabel={t('song_menu')}>
                <FaMusic className="icon"/>
            </MenuItem>
            <MenuButton onClick={homeStore.open} ariaLabel={t('open_home_menu')}
                        style={{border: "solid 0.1rem var(--secondary)"}}>
                <FaHome className="icon"/>
            </MenuButton>
        </MenuSidebar>
        <MenuPanelWrapper>
            <MenuPanel id={'Songs'}>
                <SongMenu<SongRowProps>
                    songs={songs}
                    className='noprint'
                    exclude={['vsrg']}
                    SongComponent={SongRow}
                    componentProps={{
                        current: currentSong,
                        onClick: onSongLoaded
                    }}
                />
            </MenuPanel>
        </MenuPanelWrapper>
    </MenuContextProvider>

}

interface SongRowProps {
    data: SongStorable
    current: SerializedSong | null
    onClick: (song: SerializedSong) => void
}

function SongRow({data, current, onClick}: SongRowProps) {
    const selectedStyle = current?.id === data.id ? {backgroundColor: 'rgb(124, 116, 106)'} : {}
    return <div
        className="song-row"
        style={{...selectedStyle, padding: '0.5rem 0.8rem'}}
        onClick={async () => {
            logger.showPill('Loading song...')
            const song = await songService.getOneSerializedFromStorable(data)
            if (!song) return logger.error("Could not load song")
            onClick(song)
            setTimeout(() => logger.hidePill(), 300)
        }}>
        <div className="song-name">
            {data.name}
        </div>
    </div>
}