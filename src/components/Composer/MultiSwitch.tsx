import { ReactNode, memo } from "react"

interface MultiSwitchProps<T extends ReactNode> {
    options: readonly T[]
    selected: T
    buttonsClass?: string
    onSelect: (selected: T) => void
}

const MultiSwitch = <T extends ReactNode,>({ options, selected, buttonsClass, onSelect }: MultiSwitchProps<T>) => {
    return <>
        {options.map((value, i) => {
            return <button
                style={selected === value ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' } : {}}
                className={buttonsClass}
                onClick={() => onSelect(value)}
                key={i}
            >
                {value}
            </button>
        })}
    </>
}
export default memo(MultiSwitch, (p, n) => {
    return p.options?.length === n.options?.length
        && p.selected === n.selected
        && p.onSelect === n.onSelect
}) as typeof MultiSwitch