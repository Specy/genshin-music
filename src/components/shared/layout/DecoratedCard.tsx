import {forwardRef} from 'react';
import {Stylable} from "$lib/utils/UtilTypes";

interface RawDecoratedBoxProps {
    decorationColor?: string
    size?: string
    offset?: string
}

export function RawDecoratedBox({decorationColor, size, offset = "0"}: RawDecoratedBoxProps) {
    const defaultStyle: React.CSSProperties = {
        position: "absolute",
        width: size ?? '0.8rem',
        height: size ?? '0.8rem',
        color: decorationColor ?? "var(--secondary)",
    }

    return <>
        <StarBorderSvg
            style={{
                ...defaultStyle,
                top: offset,
                right: offset,
                transform: 'translate(50%, -50%) rotate(-135deg)',
            }}
        />
        <StarBorderSvg
            style={{
                ...defaultStyle,
                top: offset,
                left: offset,
                transform: 'translate(-50%, -50%) rotate(135deg)',
            }}
        />
        <StarBorderSvg
            style={{
                ...defaultStyle,
                bottom: offset,
                right: offset,
                transform: 'translate(50%, 50%) rotate(-45deg)',
            }}
        />
        <StarBorderSvg
            style={{
                ...defaultStyle,
                bottom: offset,
                left: offset,
                transform: 'translate(-50%, 50%) rotate(45deg)',
            }}
        />
    </>
}

interface DecoratedCardProps extends Stylable{
    children: React.ReactNode;
    size?: string;
    decorationColor?: string;
    isRelative?: boolean;
    onClick?: () => void;
    offset?: string
}

export const DecoratedCard = forwardRef<HTMLDivElement, DecoratedCardProps>(function DecorationBorderedBox(props: DecoratedCardProps, ref) {
    const isRelative = props.isRelative ?? true;
    const position = isRelative ? 'relative' : undefined;
    return <div
        ref={ref}
        style={{
            position,
            ...props.style
        }}
        className={props.className}
        onClick={props.onClick}
    >
        {props.children}
        <RawDecoratedBox
            decorationColor={props.decorationColor}
            size={props.size}
            offset={props.offset}
        />
    </div>
})

interface StarBorderSvgProps {
    style?: React.CSSProperties
}

function StarBorderSvg({style}: StarBorderSvgProps) {
    return <svg style={style} viewBox="0 0 121 121" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M115.674 57.8647C117.754 58.9629 117.77 61.9275 115.739 63.113C89.4847 78.4378 76.7901 90.8857 63.8487 114.065C62.3174 116.808 58.346 116.913 56.6888 114.244C41.4088 89.6383 28.3853 77.334 3.39872 62.2065C2.08229 61.4095 2.11774 59.4753 3.467 58.7352C46.8754 34.9254 72.7237 35.1787 115.674 57.8647Z"/>

    </svg>
}