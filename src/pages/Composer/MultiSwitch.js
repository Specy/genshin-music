
export default function MultiSwitch(props){
    const { options, selected, selectedColor, buttonsClass, onSelect } = props
    return <>
        {options.map(e => {
            return <button
                style={{ backgroundColor: e === selected ? selectedColor : "" }}
                className={buttonsClass}
                onClick={() => onSelect(e)}
                key={e}
            >
                {e}
            </button>
        })}
    </>
}