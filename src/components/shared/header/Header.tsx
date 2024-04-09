import type {CSSProperties} from "react";
import {MaybeChildren} from "$lib/UtilTypes";

export const HEADER_TYPES = ["h1", "h2", "h3", "h4", "h5", "h6"] as const
type HeaderType = typeof HEADER_TYPES[number]

interface HeaderProps {
    textSize?: string;
    style?: CSSProperties;
    className?: string;
    type?: HeaderType | string
    margin?: string
}

const defaultTextSize = new Map<HeaderType, string>([
    ["h1", "2rem"],
    ["h2", "1.5rem"],
    ["h3", "1.25rem"],
    ["h4", "1.1rem"],
    ["h5", "1rem"],
    ["h6", "1rem"],
])

export function Header({className, style, textSize, children, type = "h1", margin = '0'}: MaybeChildren<HeaderProps>) {
    const props = {
        className,
        style: {
            fontSize: textSize ? textSize : defaultTextSize.get(type as HeaderType) ?? "2rem",
            margin,
            ...style
        }
    }
    if (type === "h1") return <h1 {...props}>{children}</h1>
    if (type === "h2") return <h2 {...props}>{children}</h2>
    if (type === "h3") return <h3 {...props}>{children}</h3>
    if (type === "h4") return <h4 {...props}>{children}</h4>
    if (type === "h5") return <h5 {...props}>{children}</h5>
    return <h6 {...props}>{children}</h6>
}