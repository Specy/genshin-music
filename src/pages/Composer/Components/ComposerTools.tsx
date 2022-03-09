import { AppButton } from "components/AppButton"
import { useTheme } from "lib/hooks/useTheme"
import { Column } from "lib/Utils/SongClasses"
import { LayerType } from "types/GeneralTypes"
interface ComposerToolsProps{
    data: {
        visible: boolean
        copiedColumns: Column[]
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

export default function ComposerTools({ data, functions }: ComposerToolsProps) {
    const [theme] = useTheme()
    const { toggleTools, copyColumns, eraseColumns, pasteColumns, deleteColumns, resetSelection } = functions
    const { visible, copiedColumns, layer } = data
    const hasCopiedColumns = copiedColumns.length > 0
    const themeStyle = {
        backgroundColor: theme.layer('primary',0.2).toString()
    }
    return <div className={visible ? "floating-tools tools-visible" : "floating-tools"}>
        <div className="tools-row">
            <div>
                Scroll to select the columns
            </div>
            <div className='row'>
                <AppButton 
                    visible={hasCopiedColumns} 
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
                >
                    Copy
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => copyColumns(layer)}
                    active={hasCopiedColumns}
                    style={themeStyle}
                >
                   {`Copy layer ${layer}`}
                </ToolButton>
            </div>
            <div className='tools-half'>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(false)}
                    style={themeStyle}
                >
                    Paste
                </ToolButton>
                <ToolButton
                    disabled={!hasCopiedColumns}
                    onClick={() => pasteColumns(true)}
                    style={themeStyle}
                >
                    Insert
                </ToolButton>
            </div>
            <div className='tools-half'>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => eraseColumns('all')}
                    style={themeStyle}
                >
                    Erase
                </ToolButton>
                <ToolButton
                    disabled={hasCopiedColumns}
                    onClick={() => eraseColumns(layer)}
                    style={themeStyle}
                >
                    {`Erase layer ${layer}`}
                </ToolButton>
            </div>

            <ToolButton
                disabled={hasCopiedColumns}
                onClick={deleteColumns}
                style={themeStyle}
            >
                Delete
            </ToolButton>
        </div>
    </div>
}

interface ToolButtonprops{
    disabled: boolean
    onClick: () => void
    active?: boolean
    style: any
    children: React.ReactNode
}
function ToolButton({ disabled, onClick, active, style, children }: ToolButtonprops) {
    return <button
        disabled={disabled}
        onClick={(e) => {
            e.currentTarget.blur()
            onClick()
        }}
        className={active ? "tools-button-highlighted" : ""}
        style={style || {}}
    >
        {children}
    </button>
}