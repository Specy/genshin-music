import {type CSSProperties, type ReactNode, useEffect, useState} from "react";
import s from "./expandableContainer.module.scss"
import {FaChevronRight} from "react-icons/fa";
import {ThemeKeys} from "$stores/ThemeStore/ThemeProvider";
import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import {Card} from "$cmp/shared/layout/Card";
import {Column} from "$cmp/shared/layout/Column";

interface ExpandableContainerProps extends Stylable {
    defaultExpanded?: boolean
    onExpanded?: (expanded: boolean) => void
    expanded?: boolean
    borderColor?: ThemeKeys
    headerBackground?: ThemeKeys
    contentBackground?: string
    contentColor?: string
    headerContent: ReactNode
    headerStyle?: CSSProperties
    contentStyle?: CSSProperties
}


export function ExpandableContainer({
                                        headerContent,
                                        children,
                                        defaultExpanded,
                                        expanded: _expanded,
                                        onExpanded,
                                        contentStyle,
                                        headerStyle,
                                        className,
                                        style,
                                        headerBackground = 'primary',
                                        contentBackground = 'var(--background-layer-10)',
                                        contentColor = 'var(--background-text)',
                                        borderColor = 'secondary'
                                    }: MaybeChildren<ExpandableContainerProps>) {
    const [expanded, setExpanded] = useState(_expanded ?? defaultExpanded ?? false)
    useEffect(() => {
        if (typeof _expanded !== 'undefined') setExpanded(_expanded)
    }, [_expanded]);
    return <Card
        radius={'0.4rem'}
        className={`${s['expandable-container']} ${className}`}
        background={`var(--${headerBackground})`}
        style={{
            border: `solid 0.1rem var(--${borderColor}-layer-10)`,
            ...style
        }}
    >

        <button
            className={`${s['expandable-container-header']}`}
            style={headerStyle}

            onClick={() => {
                const e = !expanded
                setExpanded(e)
                onExpanded?.(e)
            }}
        >
            <div className={`${s['expandable-container-arrow']}`}>
                <FaChevronRight
                    style={{
                        transition: "0.3s"
                    }}
                    className={`${expanded ? 'transform rotate-90' : ''}`}
                />
            </div>
            {headerContent}
        </button>
        {expanded &&
            <Column
                className={`${s['expandable-container-content']}`}
                style={{
                    borderTop: `0.1rem solid var(--${borderColor}-layer-10)`,
                    backgroundColor: contentBackground,
                    color: contentColor,
                    ...contentStyle
                }}
            >
                {children}
            </Column>
        }
    </Card>
}