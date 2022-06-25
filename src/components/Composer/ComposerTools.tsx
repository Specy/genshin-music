import { AppButton } from "components/AppButton"
import { hasTooltip, Tooltip } from "components/Tooltip"
import { useTheme } from "lib/Hooks/useTheme"
import { Column } from "lib/Songs/SongClasses"
import { memo, useState } from "react"
import { FaAngleDown, FaAngleUp, FaCopy, FaEraser, FaPaste, FaTrash } from "react-icons/fa"
import { MdPhotoSizeSelectSmall, MdSelectAll } from "react-icons/md"
import { TbArrowBarToRight } from "react-icons/tb"
    interface ComposerToolsProps {
    data: {
        isToolsVisible: boolean
        hasCopiedColumns: boolean
        selectedColumns: number[]
        layer: number
        undoHistory: Column[][]
    }
    functions: {
        toggleTools: () => void
        copyColumns: (layer: number | 'all') => void
        eraseColumns: (layer: number | 'all') => void
        moveNotesBy: (amount: number, layer: number | 'all') => void
        pasteColumns: (insert: boolean) => void
        deleteColumns: () => void
        resetSelection: () => void
        undo: () => void
    }
}
type SelectionType = 'layer' | 'all'

//MEMOISED
function ComposerTools({ data, functions }: ComposerToolsProps) {
    const [theme] = useTheme()
    const [selectionType, setSelectionType] = useState<SelectionType>('all')
    const { toggleTools, copyColumns, eraseColumns, pasteColumns, deleteColumns, resetSelection, undo, moveNotesBy } = functions
    const { isToolsVisible, hasCopiedColumns, layer, selectedColumns, undoHistory } = data
    return <div
        className={`floating-tools ${isToolsVisible ? "floating-tools tools-visible" : ""}`}
        style={{ backgroundColor: theme.get('menu_background').fade(0.1).toString() }}
    >
        <div className="tools-buttons-grid">
            <ToolButton
                area="a"
                disabled={hasCopiedColumns}
                onClick={() => copyColumns(selectionType === 'all' ? 'all' : layer)}
                active={hasCopiedColumns}
                tooltip='Copy all notes'
                style={{ flexDirection: 'column', justifyContent: 'center' }}
                tooltipPosition='bottom'
            >
                <FaCopy className='tools-icon' size={24} />
                Copy
            </ToolButton>
            <ToolButton
                disabled={!hasCopiedColumns}
                onClick={() => pasteColumns(false)}
                tooltip='Paste copied notes'
                area="b"
                tooltipPosition="bottom"
            >
                <FaPaste className='tools-icon' />
                Paste
            </ToolButton>
            <ToolButton
                disabled={!hasCopiedColumns}
                onClick={() => pasteColumns(true)}
                tooltip='Insert copied notes'
                area="c"
            >
                <TbArrowBarToRight className='tools-icon' style={{ strokeWidth: '3px' }} />
                Insert
            </ToolButton>
            <ToolButton
                disabled={hasCopiedColumns}
                onClick={() => eraseColumns(selectionType === 'all' ? 'all' : layer)}
                tooltip='Erase all selected notes'
                area="d"
            >
                <FaEraser className='tools-icon' />
                Erase
            </ToolButton>

            <ToolButton
                disabled={hasCopiedColumns}
                onClick={deleteColumns}
                tooltip='Delete selected columns'
                area="f"
            >
                <FaTrash className='tools-icon' color="var(--red)" />
                Delete
            </ToolButton>
            <ToolButton
                disabled={false}
                tooltip="Push notes up by 1 position"
                area="e"
                onClick={() => moveNotesBy(1, selectionType === 'all' ? 'all' : layer)}
            >
                <FaAngleUp className='tools-icon'/>
                Move notes up
            </ToolButton>
            <ToolButton
                disabled={false}
                tooltip="Push notes down by 1 position"
                onClick={() => moveNotesBy(-1, selectionType === 'all' ? 'all' : layer)}
                area="g"
            >
                <FaAngleDown className='tools-icon'/>
                Move notes down
            </ToolButton>
        </div>
        <div className="tools-right column">
            <AppButton
                style={{ marginBottom: '0.2rem' }}
                className={hasTooltip(true)}
                toggled={selectionType === 'all'}
                onClick={() => setSelectionType('all')}
            >
                <MdSelectAll style={{ marginRight: '0.2rem' }} size={16} />
                All layers
                <Tooltip style={{ left: 0 }}>
                    Select all the layers in the highlighted columns
                </Tooltip>
            </AppButton>
            <AppButton
                style={{ marginBottom: '0.2rem' }}
                className={hasTooltip(true)}
                toggled={selectionType === 'layer'}
                onClick={() => setSelectionType('layer')}
            >
                <MdPhotoSizeSelectSmall style={{ marginRight: '0.2rem' }} size={16} />
                Only Layer
                <span style={{minWidth: '0.6rem', marginLeft: '0.2rem'}}>
                    {layer + 1}
                </span>
                <Tooltip style={{ left: 0 }}>
                    Select all the notes in the highlighted columns of the current layer
                </Tooltip>
            </AppButton>
            <AppButton
                style={{ marginBottom: '0.2rem', justifyContent: 'center' }}
                onClick={resetSelection}
                disabled={selectedColumns.length <= 1 && !hasCopiedColumns}
                toggled={hasCopiedColumns}
            >
                Clear selection
            </AppButton>
            <div className="row" style={{ flex: '1', alignItems: 'flex-end' }}>
                <AppButton
                    style={{ flex: '1', justifyContent: 'center' }}
                    disabled={undoHistory.length === 0}
                    onClick={undo}
                >
                    Undo
                </AppButton>
                <AppButton onClick={toggleTools} style={{ marginLeft: '0.2rem', flex: '1', justifyContent: 'center' }}>
                    Ok
                </AppButton>
            </div>
        </div>

    </div>
}

export default memo(ComposerTools, (p, n) => {
    return p.data.isToolsVisible === n.data.isToolsVisible && p.data.hasCopiedColumns === n.data.hasCopiedColumns && p.data.layer === n.data.layer
        && p.data.selectedColumns === n.data.selectedColumns && p.data.undoHistory === n.data.undoHistory
})

interface ToolButtonprops {
    disabled: boolean
    onClick: () => void
    active?: boolean
    style?: React.CSSProperties
    children: React.ReactNode
    tooltip?: string
    tooltipPosition?: "top" | "bottom"
    area?: string
}
function ToolButton({ disabled, onClick, active, style, children, tooltip, area, tooltipPosition }: ToolButtonprops) {
    return <button
        disabled={disabled}
        onClick={onClick}
        className={`flex-centered tools-button ${active ? "tools-button-highlighted" : ""} ${hasTooltip(tooltip)}`}
        style={{ gridArea: area, ...style }}
    >
        {children}
        {tooltip &&
            <Tooltip position={tooltipPosition || "top"}>
                {tooltip}
            </Tooltip>
        }
    </button>
}

