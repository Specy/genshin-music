import type {CSSProperties} from "react";
import s from './separator.module.scss'
import {MaybeChildren} from "$lib/utils/UtilTypes";

interface SeparatorProps {
    background?: string
    color?: string
    height?: string
    verticalMargin?: string
    style?: CSSProperties
    className?: string
    pillBackground?: string
    shadow?: boolean | string
}

export function Separator({
                              background = 'var(--primary)',
                              color = 'var(--primary-text)',
                              height = '0.3rem',
                              style,
                              className,
                              children,
                              pillBackground,
                              verticalMargin = "0.2rem",
                              shadow = false
                          }: MaybeChildren<SeparatorProps>) {
    const shadowColor = typeof shadow === 'string' ? shadow : "shadow"
    return <div
        className={`${s['separator']} ${className}`}
        style={{
            color: color,
            margin: `${verticalMargin} 0`,
            ...style,
        }}
    >
        <div
            className={s['separator-part']}
            style={{
                backgroundColor: background,
                height,
                boxShadow: shadow ? `0 0rem 0.6rem ${shadowColor}` : undefined,
                borderTopLeftRadius: '0.6rem',
                borderBottomLeftRadius: '0.6rem',
            }}
        >

        </div>
        {children && <>
            <div
                className={`${s['separator-content']}`}
                style={{
                    backgroundColor: pillBackground,
                    boxShadow: shadow ? `0 0rem 0.6rem ${shadowColor}` : undefined,
                    color,
                    border: `solid 0.2rem ${color}`
                }}
            >
                {children}
            </div>
            <div
                className={s['separator-part']}
                style={{
                    height,
                    backgroundColor: `var(--${color})`,
                    boxShadow: shadow ? `0 0rem 0.6rem ${shadowColor}` : undefined,

                    borderTopRightRadius: '0.6rem',
                    borderBottomRightRadius: '0.6rem',
                }}
            >

            </div>
        </>}

    </div>
}