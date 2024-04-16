import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import {Justify, justifyMap} from "$cmp/shared/layout/layoutConstants";


interface ColumnProps extends Stylable {
    gap?: string
    flex1?: boolean
    justify?: Justify
    align?: Justify
    padding?: string
}


export function Column({children, className, style, gap, flex1, justify, align, padding}: MaybeChildren<ColumnProps>) {
    return <div
        className={`column ${className ?? ""}`}
        style={{
            gap,
            flex: flex1 ? 1 : undefined,
            justifyContent: justify ? justifyMap[justify] : undefined,
            alignItems: align ? justifyMap[align] : undefined,
            padding: padding,
            ...style
        }}
    >
        {children}
    </div>
}