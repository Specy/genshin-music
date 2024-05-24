import {AppButton} from "$cmp/shared/Inputs/AppButton"
import s from './MidiSetup.module.css'
import {useTranslation} from "react-i18next";
import {MIDIShortcutName} from "$lib/BaseSettings";

interface ShortcutProps {
    status: string
    onClick: (data: string) => void
    type: MIDIShortcutName
    selected: boolean
    midi: number
}

export default function MidiShortcut({status, onClick, type, selected, midi}: ShortcutProps) {
    const {t} = useTranslation('keybinds')
    return <AppButton className={`${s['midi-shortcut']} ${s[status]}`} toggled={selected} onClick={() => onClick(type)}>
        {t(`shortcuts.${type}`) + ` (${midi === -1 ? 'N/A' : midi})`}
    </AppButton>
}
