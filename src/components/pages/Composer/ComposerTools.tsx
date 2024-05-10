import {AppButton} from "$cmp/shared/Inputs/AppButton"
import {DecoratedCard} from "$cmp/shared/layout/DecoratedCard"
import {hasTooltip, Tooltip} from "$cmp/shared/Utility/Tooltip"
import {NoteColumn} from "$lib/Songs/SongClasses"
import {memo, useState} from "react"
import {FaAngleDown, FaAngleUp, FaCopy, FaEraser, FaPaste, FaTrash} from "react-icons/fa"
import {MdPhotoSizeSelectSmall, MdSelectAll} from "react-icons/md"
import {TbArrowBarToRight} from "react-icons/tb"
import {useTranslation} from "react-i18next";

interface ComposerToolsProps {
    data: {
        isToolsVisible: boolean
        hasCopiedColumns: boolean
        selectedColumns: number[]
        layer: number
        undoHistory: NoteColumn[][]
    }
    functions: {
        toggleTools: () => void
        copyColumns: (layer: number | 'all') => void
        eraseColumns: (layer: number | 'all') => void
        moveNotesBy: (amount: number, layer: number | 'all') => void
        pasteColumns: (insert: boolean, layer: number | 'all') => void
        deleteColumns: () => void
        resetSelection: () => void
        undo: () => void
    }
}

type SelectionType = 'layer' | 'all'

function ComposerTools({data, functions}: ComposerToolsProps) {
    const {t} = useTranslation(['composer', 'common'])
    const [selectionType, setSelectionType] = useState<SelectionType>('all')
    const {
        toggleTools,
        copyColumns,
        eraseColumns,
        pasteColumns,
        deleteColumns,
        resetSelection,
        undo,
        moveNotesBy
    } = functions
    const {isToolsVisible, hasCopiedColumns, layer, selectedColumns, undoHistory} = data
    const selectedTarget = selectionType === 'all' ? 'all' : layer
    return <DecoratedCard
        boxProps={{
            className: `floating-tools ${isToolsVisible ? "floating-tools tools-visible" : ""}`
        }}
        size='1.2rem'
        isRelative={false}
        offset="0.1rem"
    >
        <div className="floating-tools-content">

            <div className="tools-buttons-grid">
                <ToolButton
                    area="a"
                    disabled={hasCopiedColumns}
                    onClick={() => copyColumns(selectedTarget)}
                    active={hasCopiedColumns}
                    tooltip={t('tools.copy_notes')}
                    style={{flexDirection: 'column', justifyContent: 'center'}}
                    tooltipPosition='bottom'
                >
                    <FaCopy className='tools-icon' size={24}/>
                    {t('common:copy')}
                </ToolButton>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(false, selectedTarget)}
                    tooltip={t('tools.paste_copied_notes')}
                    area="b"
                    tooltipPosition="bottom"
                >
                    <FaPaste className='tools-icon'/>
                    {selectionType === 'all' ? t('tools.paste_all_layers') : t('tools.paste_in_layer_n', {layer_number: layer + 1})}

                </ToolButton>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(true, selectedTarget)}
                    tooltip={t('tools.insert_copied_notes')}
                    area="c"
                >
                    <TbArrowBarToRight className='tools-icon' style={{strokeWidth: '3px'}}/>
                    {selectionType === 'all' ? t('tools.insert_all_layers') : t('tools.insert_in_layer_n', {layer_number: layer + 1})}
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => eraseColumns(selectedTarget)}
                    tooltip={t('tools.erase_all_selected_notes')}
                    area="d"
                >
                    <FaEraser className='tools-icon'/>
                    {t('common:erase')}
                </ToolButton>

                <ToolButton
                    disabled={hasCopiedColumns || selectedTarget !== 'all'}
                    onClick={deleteColumns}
                    tooltip={t('tools.delete_selected_columns')}
                    area="f"
                >
                    <FaTrash className='tools-icon' color="var(--red)"/>
                    {t('common:delete')}
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    tooltip={t('tools.move_notes_up_description')}
                    area="e"
                    onClick={() => moveNotesBy(1, selectedTarget)}
                >
                    <FaAngleUp className='tools-icon'/>
                    {t('tools.move_notes_up')}

                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    tooltip={t('tools.move_notes_down_description')}
                    onClick={() => moveNotesBy(-1, selectedTarget)}
                    area="g"
                >
                    <FaAngleDown className='tools-icon'/>
                    {t('tools.move_notes_down')}

                </ToolButton>
            </div>
            <div className="tools-right column">
                <AppButton
                    style={{marginBottom: '0.2rem'}}
                    className={hasTooltip(true)}
                    toggled={selectionType === 'all'}
                    onClick={() => setSelectionType('all')}
                >
                    <MdSelectAll style={{marginRight: '0.2rem'}} size={16}/>
                    {t('tools.all_layers')}

                    <Tooltip style={{left: 0}}>
                        {t('tools.all_layers_description')}
                    </Tooltip>
                </AppButton>
                <AppButton
                    style={{marginBottom: '0.2rem'}}
                    className={hasTooltip(true)}
                    toggled={selectionType === 'layer'}
                    onClick={() => setSelectionType('layer')}
                >
                    <MdPhotoSizeSelectSmall style={{marginRight: '0.2rem'}} size={16}/>
                    {t('tools.only_layer')}
                    <span style={{minWidth: '0.6rem', marginLeft: '0.2rem'}}>
                        {layer + 1}
                    </span>
                    <Tooltip style={{left: 0}}>
                        {t('tools.select_layer_description')}
                    </Tooltip>
                </AppButton>
                <AppButton
                    style={{marginBottom: '0.2rem', justifyContent: 'center'}}
                    onClick={resetSelection}
                    disabled={selectedColumns.length <= 1 && !hasCopiedColumns}
                    toggled={hasCopiedColumns}
                >
                    {t('tools.clear_selection')}
                </AppButton>
                <div className="row" style={{flex: '1', alignItems: 'flex-end'}}>
                    <AppButton
                        style={{flex: '1', justifyContent: 'center'}}
                        disabled={undoHistory.length === 0}
                        onClick={undo}
                    >
                        {t('common:undo')}
                    </AppButton>
                    <AppButton onClick={toggleTools}
                               style={{marginLeft: '0.2rem', flex: '1', justifyContent: 'center'}}>
                        {t('common:ok')}
                    </AppButton>
                </div>
            </div>
        </div>

    </DecoratedCard>
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

function ToolButton({disabled, onClick, active, style, children, tooltip, area, tooltipPosition}: ToolButtonprops) {
    return <button
        disabled={disabled}
        onClick={onClick}
        className={`flex-centered tools-button ${active ? "tools-button-highlighted" : ""} ${hasTooltip(tooltip)}`}
        style={{gridArea: area, ...style}}
    >
        {children}
        {tooltip &&
            <Tooltip position={tooltipPosition || "top"}>
                {tooltip}
            </Tooltip>
        }
    </button>
}

