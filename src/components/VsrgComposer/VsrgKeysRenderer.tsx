import { Container, Graphics, Text } from "@inlet/react-pixi";
import { PLAY_BAR_OFFSET } from "appConfig";
import { TextStyle } from "pixi.js";
import { memo, useEffect, useState } from "react";
import useFontFaceObserver from "use-font-face-observer";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";

interface VsrgKeysRendererProps {
    keys: string[]
    sizes: VsrgCanvasSizes
    colors: VsrgCanvasColors
    isHorizontal: boolean
}

const defaultTextStyle = new TextStyle({
    fontFamily: '"Source Sans Pro", Helvetica, sans-serif',
    fontSize: 30,
    fill: "#ffffff",
})


const fontFace= [{
    family: 'Bonobo'
}]
function _VsrgKeysRenderer({ keys, sizes, colors, isHorizontal }: VsrgKeysRendererProps) {
    const [textStyle, setTextStyle] = useState(defaultTextStyle)
    const isFontLoaded = useFontFaceObserver(fontFace)

    useEffect(() => {
        setTextStyle(new TextStyle({
            fontFamily: isFontLoaded ?  '"Bonobo"' : '"Source Sans Pro", Helvetica, sans-serif',
            fontSize: isFontLoaded ? 25 : 30,
            fill: colors.lineColor[1],
        }))
    }, [colors, sizes, keys, isFontLoaded])
    const keyHeight = sizes.height / keys.length
    const keyWidth = sizes.width / keys.length
    return <Container
        x={0}
        y={0}
        anchor={[0, 0]}
        height={sizes.height}
        width={sizes.width}
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
                g.lineStyle(6,colors.accent[1])
                if(isHorizontal){
                    g.moveTo(PLAY_BAR_OFFSET, 0)
                    g.lineTo(PLAY_BAR_OFFSET, sizes.height)
                    for(let i = 0; i < keys.length; i++){
                        g.drawCircle(PLAY_BAR_OFFSET, keyHeight * (i + 0.5) + 2, 4)
                    }
                }else{
                    g.moveTo(0, sizes.height - PLAY_BAR_OFFSET)
                    g.lineTo(sizes.width, sizes.height - PLAY_BAR_OFFSET)
                    for(let i = 0; i < keys.length; i++){
                        g.drawCircle(keyWidth * (i + 0.5) + 2, sizes.height - PLAY_BAR_OFFSET, 4)
                    }
                }
            }}
        />
        {keys.map((key, index) =>
            <Text
                key={index}
                text={key}
                x={isHorizontal ? 30 : keyWidth * index + keyWidth / 2}
                y={isHorizontal ? keyHeight * index + keyHeight / 2 : sizes.height - 30}
                anchor={0.5}
                style={textStyle}
            />
        )}

    </Container>
}

export const VsrgKeysRenderer = memo<VsrgKeysRendererProps>(_VsrgKeysRenderer,
    (p, n) => {
        return p.keys === n.keys && p.sizes === n.sizes && p.colors === n.colors && p.isHorizontal === n.isHorizontal
    }
)