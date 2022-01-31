export default function Shortcut({status, onClick, type, selected, midi}){
    return <div className={`genshin-button midi-shortcut ${status} ${selected ? 'selected' : ''}`} onClick={() => onClick(type)}>
        {prepareText(type) + ` (${midi === -1 ? 'NA': midi})`}
    </div>
}

function prepareText(text){
    return (text[0]?.toUpperCase() + text.substring(1)).split('_').join(' ')
}