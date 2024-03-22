import { Container, Graphics, Text } from "@pixi/react";
import { Rectangle, TextStyle } from "pixi.js";
import { memo, useEffect, useState } from "react";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgComposerCanvas";
import { useConfig } from "$lib/Hooks/useConfig";
import {useFontFaceObserver} from "$lib/Hooks/useFontFaceObserver";

interface VsrgKeysRendererProps {
    keys: string[]
    sizes: VsrgCanvasSizes
    colors: VsrgCanvasColors
    isHorizontal: boolean
    onKeyDown: (key: number) => void
    onKeyUp: (key: number) => void
}

export const defaultVsrgTextStyle = new TextStyle({
    fontFamily: '"Source Sans Pro", Helvetica, sans-serif',
    fontSize: 30,
    fill: "#ffffff",
})

const fontFace = [{
    family: 'Bonobo'
}]

//TODO add cache as bitmap
function _VsrgKeysRenderer({ keys, sizes, colors, isHorizontal, onKeyDown, onKeyUp }: VsrgKeysRendererProps) {
    const { PLAY_BAR_OFFSET } = useConfig()
    const [textStyle, setTextStyle] = useState(defaultVsrgTextStyle)
    const isFontLoaded = useFontFaceObserver(fontFace)
    useEffect(() => {
        setTextStyle(new TextStyle({
            fontFamily: isFontLoaded ? '"Bonobo"' : '"Source Sans Pro", Helvetica, sans-serif',
            fontSize: isFontLoaded ? 25 : 30,
            fill: colors.lineColor[1],
        }))
    }, [colors, sizes, keys, isFontLoaded])
    const keyHeight = sizes.height / keys.length
    const keyWidth = sizes.width / keys.length
    return <Container
        x={0}
        y={sizes.timelineSize}
    >
        <Graphics
            draw={(g) => {
                g.clear()
                g.beginFill(colors.background_plain[1])
                if (isHorizontal) {
                    g.drawRect(0, 0, 60, sizes.height)
                    g.lineStyle(2, colors.lineColor_10[1])
                    for (let i = 0; i < keys.length - 1; i++) {
                        g.moveTo(0, keyHeight * (i + 1))
                        g.lineTo(sizes.width, keyHeight * (i + 1))
                    }
                    g.lineStyle(2, colors.secondary[1])
                    g.moveTo(59, 0)
                    g.lineTo(59, sizes.height)
                } else {
                    g.drawRect(0, sizes.height - 60, sizes.width, 60)
                    g.lineStyle(2, colors.lineColor_10[1])
                    for (let i = 0; i < keys.length - 1; i++) {
                        g.moveTo(keyWidth * (i + 1), 0)
                        g.lineTo(keyWidth * (i + 1), sizes.height)
                    }
                    g.lineStyle(2, colors.secondary[1])
                    g.moveTo(0, sizes.height - 60)
                    g.lineTo(sizes.width, sizes.height - 60)
                }
            }}
        />
        <Graphics
            draw={(g) => {
                g.clear()
                g.lineStyle(6, colors.accent[1])
                if (isHorizontal) {
                    g.moveTo(PLAY_BAR_OFFSET + 1, 0)
                    g.lineTo(PLAY_BAR_OFFSET + 1, sizes.height)
                    for (let i = 0; i < keys.length; i++) {
                        g.drawCircle(PLAY_BAR_OFFSET + 1, keyHeight * (i + 0.5), 4)
                    }
                } else {
                    const offset = sizes.height - PLAY_BAR_OFFSET - 1 - sizes.timelineSize
                    g.moveTo(0, offset)
                    g.lineTo(sizes.width, offset)
                    for (let i = 0; i < keys.length; i++) {
                        g.drawCircle(keyWidth * (i + 0.5) + 1, offset, 4)
                    }
                }
            }}
        />
        {keys.map((key, index) => {
            const hitArea = new Rectangle(
                isHorizontal ? 0 : keyWidth * index,
                isHorizontal ? keyHeight * index : sizes.height - 60,
                isHorizontal ? 60 : sizes.width,
                isHorizontal ? keyHeight : 60
            )
            return <Container
                key={key}
                hitArea={hitArea}
                eventMode="static"
                pointerdown={() => onKeyDown(index)}
                pointerup={() => onKeyUp(index)}
                pointerupoutside={() => onKeyUp(index)}
            >
                <Text
                    x={isHorizontal ? 30 : keyWidth * index + keyWidth / 2}
                    y={isHorizontal ? keyHeight * index + keyHeight / 2 : sizes.height - 30}
                    anchor={0.5}
                    text={`${index + 1}`}
                    style={textStyle}
                />
            </Container>

        })}

    </Container>
}

export const VsrgKeysRenderer = memo<VsrgKeysRendererProps>(_VsrgKeysRenderer,
    (p, n) => {
        return p.keys === n.keys && p.sizes === n.sizes && p.colors === n.colors && p.isHorizontal === n.isHorizontal
    }
)