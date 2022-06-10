import { Folder } from "lib/Folder"
import { useEffect, useState } from "react"
import { BsChevronRight } from "react-icons/bs"
import { FaDownload, FaEllipsisH, FaPen, FaTrash } from "react-icons/fa"
import { folderStore } from "stores/FoldersStore"
import { asyncConfirm } from "./AsyncPrompts"
import { FloatingDropdown, FloatingDropdownRow, FloatingDropdownText } from "./FloatingDropdown"



interface FolderProps {
    children: React.ReactNode,
    backgroundColor: string,
    color: string,
    data: Folder,
    isDefault?: boolean,
    defaultOpen?: boolean
}
interface SongFolderContentProps{
    children: React.ReactNode
    title?: string,
}
export function SongFolderContent({ children, title}: SongFolderContentProps) {
    return <div className="folder-content">
        {title && <h2 className="folder-title">{title}</h2>}
        <div className="folder-songs-wrapper">
            {children}
        </div>
    </div>
}


export function SongFolder({ children, backgroundColor, color, data, isDefault, defaultOpen = false }: FolderProps) {
    const [expanded, setExpanded] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)
    const [folderName, setFolderName] = useState(data.name)

    useEffect(() => {
        setFolderName(data.name)
    }, [data.name])
    useEffect(() => {
        setExpanded(defaultOpen)
    },[defaultOpen])
    const style = { backgroundColor, color }
    async function deleteFolder() {
        const confirm = await asyncConfirm(
            `Are you sure you want to delete "${data.name}"?  
            The songs will be automatically removed from it`
        )
        if (!confirm) return
        folderStore.removeFolder(data)
    }

    return <div className={`folder ${expanded? "folder-expanded" : ""}`} style={style}>
        <div className='folder-header' >
            <div onClick={() => setExpanded(!expanded)} className='folder-header-button'>
                    <BsChevronRight
                        strokeWidth={2}
                        style={{ transform: `rotate(${expanded ? 90 : 0}deg)`, transition: 'all 0.2s', marginRight: '0.3rem' }}
                        size={18}
                    />
                <div className='folder-name' >
                    {data.name}
                </div>
            </div>
            {!isDefault &&
                        <FloatingDropdown
                        offset={2.3}
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
                            <FaPen style={{ marginRight: "0.4rem" }} size={14} />
                            <FloatingDropdownText text={isRenaming ? "Save" : "Rename"} />
                        </FloatingDropdownRow>
                        <FloatingDropdownRow>
                            <FaDownload style={{ marginRight: "0.4rem" }} size={14} />
                            <FloatingDropdownText text='Download' />
                        </FloatingDropdownRow>
                        <FloatingDropdownRow onClick={deleteFolder}>
                            <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} size={14} />
                            <FloatingDropdownText text='Delete' />
                        </FloatingDropdownRow>
                    </FloatingDropdown>
            }
        </div>
        {children}
    </div>
}