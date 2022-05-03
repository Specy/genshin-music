import { AppButton } from "components/AppButton"
import { hasTooltip, Tooltip } from "components/Tooltip"
import { useTheme } from "lib/hooks/useTheme"
import { memo } from "react"
import { LayerType } from "types/GeneralTypes"
interface ComposerToolsProps{
    data: {
        isToolsVisible: boolean
        hasCopiedColumns: boolean
        layer: LayerType,
    }
    functions: {
        toggleTools: () => void
        copyColumns: (layer: LayerType | 'all') => void
        eraseColumns: (layer: LayerType | 'all') => void
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
    const themeStyle = {
        backgroundColor: theme.layer('primary',0.2).toString()
    } 
    return <div className={isToolsVisible ? "floating-tools tools-visible" : "floating-tools"}>
        <div className="tools-row">
            <div>
                Scroll to select the columns
            </div>
            <div className='row'>
                <AppButton 
                    toggled={hasCopiedColumns} 
                    onClick={resetSelection}
                    style={{...themeStyle, marginRight: '0.2rem'}}
                >
                    Reset
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
                    Copy
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => copyColumns(layer)}
                    active={hasCopiedColumns}
                    style={themeStyle}
                    tooltip={`Copy layer ${layer} notes`}
                >
                   {`Copy layer ${layer}`}
                </ToolButton>
            </div>
            <div className='tools-half'>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(false)}
                    style={themeStyle}
                    tooltip='Paste copied notes'
                >
                    Paste
                </ToolButton>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(true)}
                    style={themeStyle}
                    tooltip='Insert copied notes'
                >
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
                    Erase
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => eraseColumns(layer)}
                    style={themeStyle}
                    tooltip={`Erase selected layer ${layer} notes`}
                >
                    {`Erase layer ${layer}`}
                </ToolButton>
            </div>

            <ToolButton
                disabled={hasCopiedColumns}
                onClick={deleteColumns}
                style={themeStyle}
                tooltip='Delete selected columns'
            >
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
    style: any
    children: React.ReactNode
    tooltip?: string
}
function ToolButton({ disabled, onClick, active, style, children,tooltip }: ToolButtonprops) {
    console.log(tooltip)
    return <button
        disabled={disabled}
        onClick={(e) => {
            e.currentTarget.blur()
            onClick()
        }}
        className={`${active ? "tools-button-highlighted" : ""} ${hasTooltip(tooltip)}`}
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