import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";


export interface CardProps extends Stylable {
    background?: string;
    color?: string;
    radius?: string;
    padding?: string;
    gap?: string;
    row?: boolean;
    border?: string;
    withShadow?: boolean;
}

export function Card({
                         background = 'var(--primary)',
                         color = 'var(--primary-text)',
                         gap,
                         radius = "0.4rem",
                         padding,
                         className,
                         style,
                         row = false,
                         border,
                         children,
                         withShadow,
                     }: MaybeChildren<CardProps>) {
    return <div
        className={`${className} ${row ? "row" : 'column'}`}
        style={{
            background,
            color,
            gap,
            borderRadius: radius,
            padding,
            border,
            boxShadow: withShadow ? '0 0 0.5rem 0.2rem rgba(var(--shadow-rgb), 0.25)' : undefined,
            ...style
        }}
    >
        {children}
    </div>
}