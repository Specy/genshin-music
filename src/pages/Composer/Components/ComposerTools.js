
export default function ComposerTools(props) {
    const { data, functions } = props
    const { toggleTools, copyColumns, eraseColumns, pasteColumns, deleteColumns } = functions
    const { visible, copiedColumns } = data

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
                <button
                    disabled={copiedColumns.length !== 0}
                    onClick={(e) => {
                        e.currentTarget.blur()
                        copyColumns('all')
                    }}
                    className={copiedColumns.length !== 0 ? "tools-button-highlighted" : ""}
                >
                    Copy
                </button>
                <button
                    disabled={copiedColumns.length !== 0}
                    onClick={(e) => {
                        e.currentTarget.blur()
                        copyColumns(data.layer)
                    }}
                    className={copiedColumns.length !== 0 ? "tools-button-highlighted" : ""}
                >
                    Copy layer {data.layer}
                </button>
            </div>
            <div className='tools-half'>
                <button
                    disabled={copiedColumns.length === 0}
                    onClick={(e) => {
                        e.currentTarget.blur()
                        pasteColumns(false)
                    }}
                >
                    Paste
                </button>
                <button
                    disabled={copiedColumns.length === 0}
                    onClick={(e) => {
                        e.currentTarget.blur()
                        pasteColumns(true)
                    }}
                >
                    Insert
                </button>
            </div>
            <div className='tools-half'>
                <button
                    disabled={copiedColumns.length !== 0}
                    onClick={(e) => {
                        e.currentTarget.blur()
                        eraseColumns('all')
                    }}
                >
                    Erase
                </button>
                <button
                    disabled={copiedColumns.length !== 0}
                    onClick={(e) => {
                        e.currentTarget.blur()
                        eraseColumns(data.layer)
                    }}
                >
                    Erase layer {data.layer}
                </button>
            </div>

            <button
                disabled={copiedColumns.length !== 0}
                onClick={deleteColumns}
            >
                Delete
            </button>
        </div>
    </div>
}