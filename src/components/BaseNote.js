import { cssClasses, appName } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
export default function BaseNote( { data, noteText = 'A', handleClick, noteImage }){
    const className = parseClass(data.status)
    return <button
        onPointerDown={(e) => {
            e.preventDefault()
            handleClick(data)
        }}
        className="button-hitbox-bigger"
    >
        <div
            className={className}
            style={{borderColor: parseBorderColor(data.status)}}
        >
            <img
                draggable="false"
                alt=''
                src={noteImage}
            />
            {appName === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderColor(data.status)}
            />}
            <div className={cssClasses.noteName}>
                {noteText}
            </div>
        </div>
    </button>
}

function parseClass(status) {
    let className = cssClasses.note
    switch (status) {
        case 'clicked': className += " click-event"; break;
        default: break;
    }
    return className
}

function parseBorderColor(status) {
    let fill = '#eae5ce'
    if (status === "clicked") fill = "transparent"
    else if (status === 'wrong') fill = "#d66969"
    else if (status === 'right') fill = "#358a55"

    return fill
}