
export interface VsrgKeyboardElement {
    index: number
    selected: boolean
}

interface VsrgKeyboardProps{
    elements: VsrgKeyboardElement[]
    perRow: number
    onClick: (index: number) => void
}

export function VsrgKeyboard({ elements, perRow, onClick }: VsrgKeyboardProps) {
    return <>
        <div 
            className="vsrg-keyboard"
            style={{
                gridTemplateColumns: `repeat(${perRow}, 1fr)`,
                gridTemplateRows: `repeat(${Math.ceil(elements.length / perRow)}, 1fr)`,
            }}
        >
            {elements.map(el =>
                <button 
                    onClick={() => onClick(el.index)} 
                    key={el.index}
                    style={
                        (el.selected
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