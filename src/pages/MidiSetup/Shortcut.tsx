import { AppButton } from "components/AppButton"

interface ShortcutProps {
    status: string
    onClick: (data: string) => void
    type: string
    selected: boolean
    midi: number
}

export default function Shortcut({ status, onClick, type, selected, midi }: ShortcutProps) {
    return <AppButton className={`midi-shortcut ${status}`} toggled={selected} onClick={() => onClick(type)}>
        {prepareText(type) + ` (${midi === -1 ? 'NA' : midi})`}

    </AppButton>
}

function prepareText(text: string) {
    return (text[0]?.toUpperCase() + text.substring(1)).split('_').join(' ')
}