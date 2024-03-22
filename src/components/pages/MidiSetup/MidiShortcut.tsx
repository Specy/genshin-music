import { AppButton } from "$cmp/shared/Inputs/AppButton"
import s from './MidiSetup.module.css'
interface ShortcutProps {
    status: string
    onClick: (data: string) => void
    type: string
    selected: boolean
    midi: number
}

export default function MidiShortcut({ status, onClick, type, selected, midi }: ShortcutProps) {
    return <AppButton className={`${s['midi-shortcut']} ${s[status]}`} toggled={selected} onClick={() => onClick(type)}>
        {prepareText(type) + ` (${midi === -1 ? 'N/A' : midi})`}
    </AppButton>
}

function prepareText(text: string) {
    return (text[0]?.toUpperCase() + text.substring(1)).split('_').join(' ')
}