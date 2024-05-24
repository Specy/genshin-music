import {Shortcut} from '$stores/KeybindsStore'
import sh from '$cmp/pages/Index/HelpTab/HelpTab.module.css'
import {Stylable} from "$lib/utils/UtilTypes";
import {useTranslation} from "react-i18next";

interface KeyProps {
    children: React.ReactNode
}

export function Key({children}: KeyProps) {
    return <div className='keyboard-key'>
        {children}
    </div>
}

export function ShortcutsTable({shortcuts, className, style}: { shortcuts: Map<string, Shortcut<string>> } & Stylable) {
    const {t} = useTranslation('shortcuts')
    return <table className={`${sh['keys-table']} ${className}`} style={style}>
        <tbody>
        {Array.from(shortcuts.entries()).map(([key, {name, description, holdable}]) => {
                //@ts-ignore TODO type this
                const text:string = description ? t(`props.${description}`) : name
                return <tr key={name}>
                    < td>
                        <Key> {key}
                        </Key>
                    </td>
                    <td>
                        {text}
                        {holdable && <span style={{fontSize: '0.8rem'}}> ({t('holdable')})</span>}
                    </td>
                </tr>
            }
        )}
        </tbody>
    </table>
}