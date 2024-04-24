import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";


interface GridProps extends Stylable {
    gap?: string;
    columns?: string;
    rows?: string;

}


export function Grid({gap, rows, columns, style, className, children}: MaybeChildren<GridProps>) {
    return <div
        style={{
            display: "grid",
            gap,
            gridTemplateColumns: columns,
            gridTemplateRows: rows,
            ...style
        }}
        className={className}
    >
        {children}
    </div>
}