import { memo } from "react"
export default memo(function MultiSwitch(props){
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
},(p,n)=>{
    return p.options?.length === n.options?.length 
        && p.selected === n.selected
        && p.onSelect === n.onSelect
})