import {Folder, FolderFilterType} from "$lib/Folder"
import {fileService} from "$lib/Services/FileService"
import cloneDeep from "lodash.clonedeep"
import {useEffect, useRef, useState} from "react"
import {BsChevronRight} from "react-icons/bs"
import {FaDownload, FaEllipsisH, FaFilter, FaPen, FaTrash} from "react-icons/fa"
import {folderStore} from "$stores/FoldersStore"
import {asyncConfirm} from "$cmp/shared/Utility/AsyncPrompts"
import {FloatingDropdown, FloatingDropdownRow, FloatingDropdownText} from "$cmp/shared/Utility/FloatingDropdown"
import {SerializedSongKind} from "$types/SongTypes"
import {APP_NAME, FOLDER_FILTER_TYPES} from "$config"
import {capitalize} from "$lib/utils/Utilities"
import {songService} from "$lib/Services/SongService"
import {Column} from "$cmp/shared/layout/Column";
import {useTranslation} from "react-i18next";


interface FolderProps {
    children: React.ReactNode,
    backgroundColor: string,
    headerColor: string,
    color: string,
    data: Folder,
    isDefault?: boolean,
    defaultOpen?: boolean
}

interface SongFolderContentProps {
    children: React.ReactNode
    title?: string,
}

export function SongFolderContent({children, title}: SongFolderContentProps) {
    return <div className="folder-content">
        {title && <h2 className="folder-title">{title}</h2>}
        <div className="folder-songs-wrapper">
            {children}
        </div>
    </div>
}


export function SongFolder({
                               children,
                               backgroundColor,
                               color,
                               headerColor,
                               data,
                               isDefault,
                               defaultOpen = false
                           }: FolderProps) {
    const {t} = useTranslation(['common', 'logs', 'question', 'menu'])
    const [expanded, setExpanded] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)
    const [folderName, setFolderName] = useState(data.name)
    const ref = useRef<HTMLDivElement>(null)
    const [height, setHeight] = useState(0)

    useEffect(() => {
        setFolderName(data.name)
    }, [data.name])

    useEffect(() => {
        setExpanded(defaultOpen)
    }, [defaultOpen])

    useEffect(() => {
        const current = ref.current
        if (!current) return
        const bounds = ref.current.getBoundingClientRect()
        setHeight(bounds.height + 100)
        //TODO this looks pretty hacky, might have to consider improving it
        const timeout = setTimeout(() => {
            const current = ref.current
            if (!current) return
            const reflowBounds = current.getBoundingClientRect()
            setHeight(reflowBounds.height + 100)
        }, 200)
        return () => clearTimeout(timeout)
    }, [data.songs, expanded, children])


    const style = {backgroundColor, color}

    async function deleteFolder() {
        const confirm = await asyncConfirm(t('menu:confirm_delete_folder', {folder_name: data.name}))
        if (!confirm) return
        folderStore.removeFolder(data)
    }

    return <div className={`folder ${expanded ? "folder-expanded" : ""}`} style={style}>
        <div className='folder-header'>
            <div onClick={() => {
                if (isRenaming) return
                setExpanded(!expanded)
            }}
                 className='folder-header-button'
                 style={{color: headerColor}}
            >
                <BsChevronRight
                    strokeWidth={2}
                    style={{transform: `rotate(${expanded ? 90 : 0}deg)`, transition: 'all 0.2s',}}
                    size={18}
                />
                {isRenaming
                    ? <input
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        className='folder-name'
                    />
                    : <div className='folder-name text-ellipsis'>
                        {data.name}
                    </div>
                }

            </div>
            {!isDefault &&
                <FloatingDropdown
                    offset={2.3}
                    ignoreClickOutside={isRenaming}
                    onClose={() => setIsRenaming(false)}
                    Icon={FaEllipsisH}
                >
                    <FloatingDropdownRow
                        onClick={() => {
                            if (isRenaming) {
                                folderStore.renameFolder(data, folderName)
                                setIsRenaming(false)
                            }
                            setIsRenaming(!isRenaming)
                        }}
                    >
                        <FaPen style={{marginRight: "0.4rem"}} size={14}/>
                        <FloatingDropdownText text={isRenaming ? t('common:save') : t('common:rename')}/>
                    </FloatingDropdownRow>
                    <FloatingDropdownRow style={{padding: '0 0.4rem'}}>
                        <FaFilter style={{marginRight: "0.4rem"}}/>
                        <select className='dropdown-select'
                                value={data.filterType}
                                onChange={(e) => {
                                    const filterType = e.target.value as FolderFilterType
                                    data.set({filterType})
                                    folderStore.updateFolder(data)
                                }}
                        >
                            {FOLDER_FILTER_TYPES.map(folderType =>
                                <option
                                    key={folderType}
                                    value={folderType}
                                >
                                    {t(`menu:filter_${folderType}`)}
                                </option>
                            )}
                        </select>
                    </FloatingDropdownRow>
                    <FloatingDropdownRow
                        onClick={async () => {
                            const songs = await songService.getManySerializedFromStorable(cloneDeep(data.songs))
                            const promises = songs.map(s => fileService.prepareSongDownload(s as SerializedSongKind))
                            const relatedSongs = (await Promise.all(promises)).flat()
                            const filtered = relatedSongs.filter((item, pos, self) => {
                                return self.findIndex(e => e.id === item.id) === pos;
                            })
                            const files = [...filtered, data.serialize()]
                            fileService.downloadFiles(files, `${data.name}-folder.${APP_NAME.toLowerCase()}sheet`)
                        }}
                    >
                        <FaDownload style={{marginRight: "0.4rem"}} size={14}/>
                        <FloatingDropdownText text={t('common:download')}/>
                    </FloatingDropdownRow>
                    <FloatingDropdownRow onClick={deleteFolder}>
                        <FaTrash color="#ed4557" style={{marginRight: "0.4rem"}} size={14}/>
                        <FloatingDropdownText text={t('common:delete')}/>
                    </FloatingDropdownRow>
                </FloatingDropdown>
            }
        </div>

        <Column className="folder-overflow" style={{maxHeight: expanded ? `${height}px` : 0}}>
            <div className="column folder-overflow-expandible" ref={ref}>
                {children}
            </div>
        </Column>
    </div>
}