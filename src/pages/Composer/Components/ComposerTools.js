import { useTheme } from "lib/hooks/useTheme"

export default function ComposerTools(props) {
    const [theme] = useTheme()
    const { data, functions } = props
    const { toggleTools, copyColumns, eraseColumns, pasteColumns, deleteColumns } = functions
    const { visible, copiedColumns } = data
    const hasCopiedColumns = copiedColumns.length > 0
    const themeStyle = {
        backgroundColor: theme.layer('primary',0.2).hex()
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
                    Copy layer {data.layer}
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
                    Erase layer {data.layer}
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

function ToolButton({ disabled, onClick, active, style, children }) {
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