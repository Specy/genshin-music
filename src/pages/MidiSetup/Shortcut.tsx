interface ShortcutProps{
    status: string
    onClick: (data: string) => void
    type: string
    selected: boolean
    midi: number
}

export default function Shortcut({status, onClick, type, selected, midi}:ShortcutProps){
    return <div className={`genshin-button midi-shortcut ${status} ${selected ? 'selected' : ''}`} onClick={() => onClick(type)}>
        {prepareText(type) + ` (${midi === -1 ? 'NA': midi})`}
    </div>
}

function prepareText(text: string){
    return (text[0]?.toUpperCase() + text.substring(1)).split('_').join(' ')
}