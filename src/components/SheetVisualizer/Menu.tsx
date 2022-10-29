import { useState } from 'react'
import { SongMenu } from '$cmp/Layout/SongMenu'
import { useSongs } from '$lib/Hooks/useSongs'
import { historyTracker } from '$stores/History'
import { MenuItem } from '$cmp/Miscellaneous/MenuItem'
import { FaArrowLeft, FaHome, FaMusic, FaTimes } from 'react-icons/fa'
import {homeStore} from '$stores/HomeStore'
import { useHistory } from 'react-router-dom'
import MenuPanel from '$cmp/Layout/MenuPanel'
import { SerializedSong, SongStorable } from '$lib/Songs/Song'
import useClickOutside from '$lib/Hooks/useClickOutside'
import { songService } from '$/lib/Services/SongService'
import { logger } from '$/stores/LoggerStore'

interface SheetVisualiserMenuProps {
    currentSong: SerializedSong | null,
    onSongLoaded: (song: SerializedSong) => void,
}

export function SheetVisualiserMenu({ currentSong, onSongLoaded }: SheetVisualiserMenuProps) {
    const [songs] = useSongs()
    const history = useHistory()
    const [selectedPage, setSelectedPage] = useState("")
    const sideClass = selectedPage === 'Songs' ? "side-menu menu-open" : "side-menu"
    const menuRef = useClickOutside<HTMLDivElement>(() => {
        setSelectedPage("")
    }, { ignoreFocusable: true, active: selectedPage !== "" })
    return <div className="menu-wrapper noprint" ref={menuRef}>
        <div className="menu menu-visible" style={{ justifyContent: 'flex-end' }}>
            {(historyTracker.hasNavigated && selectedPage === "") &&
                <MenuItem
                    ariaLabel='Go back'
                    style={{ marginBottom: 'auto' }}
                    onClick={() => {
                        history.goBack()
                    }}
                >
                    <FaArrowLeft className='icon' />
                </MenuItem>
            }
            {selectedPage !== "" &&
                <MenuItem
                    ariaLabel='Close menu'
                    style={{ marginBottom: 'auto' }}
                    onClick={() => setSelectedPage("")}
                >
                    <FaTimes className="icon" />
                </MenuItem>
            }
            <MenuItem onClick={() => {
                setSelectedPage(selectedPage === "Songs" ? "" : "Songs")
            }} ariaLabel='Open songs menu'>
                <FaMusic className="icon" />
            </MenuItem>


            <MenuItem onClick={homeStore.open} ariaLabel='Open home menu'>
                <FaHome className="icon" />
            </MenuItem>
        </div>
        <div className={sideClass}>
            <MenuPanel>
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
        </div>
    </div>
}

interface SongRowProps {
    data: SongStorable
    current: SerializedSong | null
    onClick: (song: SerializedSong) => void
}
function SongRow({ data, current, onClick }: SongRowProps) {
    const selectedStyle = current?.id === data.id ? { backgroundColor: 'rgb(124, 116, 106)' } : {}
    return <div
        className="song-row"
        style={selectedStyle}
        onClick={async () => {
            logger.showPill('Loading song...')
            const song = await songService.getOneSerializedFromStorable(data)
            if(!song) return logger.error("Could not load song")
            onClick(song)
        }}>
        <div className="song-name">
            {data.name}
        </div>
    </div>
}