import { useTheme } from "lib/hooks/useTheme"
import { Column } from "lib/Utils/SongClasses"
interface ComposerToolsProps{
    data: {
        visible: boolean
        copiedColumns: Column[]
        layer: any,
    }
    functions: {
        toggleTools: () => void
        copyColumns: (layer: any) => void
        eraseColumns: (layer: any) => void
        pasteColumns: (insert: boolean) => void
        deleteColumns: () => void
    }
}

export default function ComposerTools({ data, functions }: ComposerToolsProps) {
    const [theme] = useTheme()
    const { toggleTools, copyColumns, eraseColumns, pasteColumns, deleteColumns } = functions
    const { visible, copiedColumns } = data
    const hasCopiedColumns = copiedColumns.length > 0
    const themeStyle = {
        backgroundColor: theme.layer('primary',0.2).toString()
    }
    return <div className={visible ? "floating-tools tools-visible" : "floating-tools"}>
        <div className="tools-row">
            <div>
                Scroll to the left / right to select the columns
            </div>
            <button onClick={toggleTools}>
                Close
            </button>
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
                    onClick={() => copyColumns(data.layer)}
                    active={hasCopiedColumns}
                    style={themeStyle}
                >
                   {`Copy layer ${data.layer}`}
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
                    onClick={() => eraseColumns(data.layer)}
                    style={themeStyle}
                >
                    {`Erase layer ${data.layer}`}
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