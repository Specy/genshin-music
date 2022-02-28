import { memo } from "react"

interface MultiSwitchProps{
    options: number[] | string[]
    selected: number | string
    buttonsClass: string
    onSelect: (index: number | string) => void
}


export default memo(function MultiSwitch({ options, selected, buttonsClass, onSelect }: MultiSwitchProps){
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