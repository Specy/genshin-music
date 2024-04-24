import {Shortcut} from '$stores/KeybindsStore'
import sh from '$cmp/pages/Index/HelpTab/HelpTab.module.css'
import {Stylable} from "$lib/utils/UtilTypes";

interface KeyProps {
    children: React.ReactNode
}

export function Key({children}: KeyProps) {
    return <div className='keyboard-key'>
        {children}
    </div>
}

export function ShortcutsTable({shortcuts, className, style}: { shortcuts: Map<string, Shortcut<string>> } & Stylable) {
    return <table className={`${sh['keys-table']} ${className}`} style={style}>
        <tbody>
        {Array.from(shortcuts.entries()).map(([key, {name, description, holdable}]) =>
            <tr key={name}>
                <td>
                    <Key>{key}</Key>
                </td>
                <td>
                    {description ?? name}
                    {holdable && <span style={{fontSize: '0.8rem'}}> (Holdable)</span>}
                </td>
            </tr>
        )}
        </tbody>
    </table>
}