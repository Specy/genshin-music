import { memo } from "react"
export default memo(function MultiSwitch(props){
    const { options, selected, buttonsClass, onSelect } = props
    return <>
        {options.map(index => {
            return <button
                style={selected === index ? {backgroundColor: 'var(--accent)', color: 'var(--accent-text)'}: {}}
                className={buttonsClass}
                onClick={() => onSelect(index)}
                key={index}
            >
                {index}
            </button>
        })}
    </>
},(p,n)=>{
    return p.options?.length === n.options?.length 
        && p.selected === n.selected
        && p.onSelect === n.onSelect
})