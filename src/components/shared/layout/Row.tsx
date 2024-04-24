import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import {Justify, justifyMap} from "$cmp/shared/layout/layoutConstants";


interface RowProps extends Stylable {
    gap?: string
    flex1?: boolean
    justify?: Justify
    align?: Justify
    padding?: string
}


export function Row({children, className, style, gap, flex1, justify, align, padding}: MaybeChildren<RowProps>) {
    return <div
        className={`row ${className ?? ""}`}
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