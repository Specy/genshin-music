import { AppButton } from "components/AppButton"
import { HelpTooltip } from "components/HelpTooltip"
import { hasTooltip, Tooltip } from "components/Tooltip"
import { useTheme } from "lib/Hooks/useTheme"
import { blurEvent } from "lib/Tools"
import { memo } from "react"
import { FaCopy, FaEraser, FaPaste, FaTrash } from "react-icons/fa"
interface ComposerToolsProps{
    data: {
        isToolsVisible: boolean
        hasCopiedColumns: boolean
        layer: number,
    }
    functions: {
        toggleTools: () => void
        copyColumns: (layer: number | 'all') => void
        eraseColumns: (layer: number | 'all') => void
        pasteColumns: (insert: boolean) => void
        deleteColumns: () => void
        resetSelection: () => void
    }
}
//MEMOISED
function ComposerTools({ data, functions }: ComposerToolsProps) {
    const [theme] = useTheme()
    const { toggleTools, copyColumns, eraseColumns, pasteColumns, deleteColumns, resetSelection } = functions
    const { isToolsVisible, hasCopiedColumns, layer } = data
    const themeStyle = {} 
    return <div 
        className={`floating-tools ${isToolsVisible ? "floating-tools tools-visible" : ""}`}
        style={{backgroundColor: theme.get('menu_background').fade(0.1).toString()}}
    >
        <div className="tools-row">
            <HelpTooltip>
                Scroll left/right to select the columns, then choose the action.
            </HelpTooltip>
            <div className='row'>
                <AppButton 
                    toggled={hasCopiedColumns} 
                    onClick={resetSelection}
                    style={{...themeStyle, marginRight: '0.2rem'}}
                >
                    Reset selection
                </AppButton>
                <AppButton onClick={toggleTools} style={themeStyle}>
                    Close
                </AppButton>
            </div>
        </div>
        <div className="tools-buttons-wrapper">
            <div className='tools-half'>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => copyColumns('all')}
                    active={hasCopiedColumns}
                    style={themeStyle}
                    tooltip='Copy all notes'
                >
                    <FaCopy  className='tools-icon' />
                    Copy
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => copyColumns(layer)}
                    active={hasCopiedColumns}
                    style={themeStyle}
                    tooltip={`Copy layer ${layer + 1} notes`}
                >
                    <FaCopy  className='tools-icon' />
                   {`Copy layer ${layer + 1}`}
                </ToolButton>
            </div>
            <div className='tools-half'>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(false)}
                    style={themeStyle}
                    tooltip='Paste copied notes'
                >
                    <FaPaste  className='tools-icon' />
                    Paste
                </ToolButton>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(true)}
                    style={themeStyle}
                    tooltip='Insert copied notes'
                >
                    <FaPaste  className='tools-icon' />
                    Insert
                </ToolButton>
            </div>
            <div className='tools-half'>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => eraseColumns('all')}
                    style={themeStyle}
                    tooltip='Erase all selected notes'
                >
                    <FaEraser  className='tools-icon' />
                    Erase
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => eraseColumns(layer)}
                    style={themeStyle}
                    tooltip={`Erase selected layer ${layer + 1} notes`}
                >
                    <FaEraser className='tools-icon'/>
                    {`Erase layer ${layer + 1}`}
                </ToolButton>
            </div>

            <ToolButton
                disabled={hasCopiedColumns}
                onClick={deleteColumns}
                style={themeStyle}
                tooltip='Delete selected columns'
            >
                <FaTrash  className='tools-icon'/>
                Delete
            </ToolButton>
        </div>
    </div>
}

export default memo(ComposerTools,(p,n) => {
    return p.data.isToolsVisible === n.data.isToolsVisible && p.data.hasCopiedColumns === n.data.hasCopiedColumns && p.data.layer === n.data.layer
})

interface ToolButtonprops{
    disabled: boolean
    onClick: () => void
    active?: boolean
    style: React.CSSProperties
    children: React.ReactNode
    tooltip?: string
}
function ToolButton({ disabled, onClick, active, style, children,tooltip }: ToolButtonprops) {
    return <button
        disabled={disabled}
        onClick={(e) => {
            blurEvent(e)
            onClick()
        }}
        className={`flex-centered tools-button ${active ? "tools-button-highlighted" : ""} ${hasTooltip(tooltip)}`}
        style={style || {}}
    >
        {children}
        {tooltip && 
            <Tooltip position="top">
                {tooltip}
            </Tooltip>
        }   
    </button>
}