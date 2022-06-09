import { Folder } from "lib/Folder"
import { useEffect, useState } from "react"
import { BsChevronRight } from "react-icons/bs"
import { FaDownload, FaEllipsisH, FaPen, FaTrash } from "react-icons/fa"
import { FloatingDropdown, FloatingDropdownRow, FloatingDropdownText } from "./FloatingDropdown"



interface FolderProps {
    children: React.ReactNode,
    backgroundColor: string,
    color: string,
    data: Folder
    renameFolder: (name: string, folder: Folder) => void,
}

export function SongFolder({ children, backgroundColor, color, renameFolder, data }: FolderProps) {
    const [expanded, setExpanded] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    const style = { backgroundColor, color }
    return <div className={`folder ${expanded ? "folder-expanded" : ""}`} style={style}>
        <div className='folder-header' >
            <div onClick={() => setExpanded(!expanded)} className='folder-header-button'>
                <BsChevronRight
                    strokeWidth={2}
                    style={{ transform: `rotate(${expanded ? 90 : 0}deg)`, transition: 'all 0.3s', marginRight: '0.2rem' }}
                    size={18}
                />
                <div className='folder-name' >
                    {data.name}
                </div>
            </div>
            <FloatingDropdown
                offset={2.3}
                Icon={FaEllipsisH}
            >
                <FloatingDropdownRow
                    onClick={() => {
                        if (isRenaming) {
                            renameFolder(songName, data)
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
                <FloatingDropdownRow>
                    <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Delete' />
                </FloatingDropdownRow>
            </FloatingDropdown>

        </div>
        <div className="folder-content">
            {children}
        </div>
    </div>
}