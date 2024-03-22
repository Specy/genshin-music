

interface VsrgComposerKeyboardProps{
    elements: number[]
    selected?: number[]
    perRow: number
    onClick: (index: number) => void
}

export function VsrgComposerKeyboard({ elements, perRow, onClick, selected }: VsrgComposerKeyboardProps) {

    return <>
        <div 
            className="vsrg-keyboard"
            style={{
                gridTemplateColumns: `repeat(${perRow}, 1fr)`,
                gridTemplateRows: `repeat(${Math.ceil(elements.length / perRow)}, 1fr)`,
                opacity: selected ? 1 : 0.5,
                pointerEvents: selected ? 'all' : 'none',
                cursor: selected ? 'pointer' : "not-allowed",
            }}
        >
            {elements.map(el =>
                <button 
                    onClick={() => onClick(el)} 
                    key={el}
                    style={
                        (selected?.includes(el)
                            ? {
                                backgroundColor: 'var(--accent)',
                            }
                            : {}
                        )
                    }
                >
                </button>
            )}
        </div>
    </>
}