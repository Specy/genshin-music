import { Container, Graphics, Text } from "@inlet/react-pixi";
import { TextStyle } from "pixi.js";
import { useEffect, useState } from "react";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";

interface VsrgKeysRendererProps {
    keys: string[]
    sizes: VsrgCanvasSizes
    colors: VsrgCanvasColors
}

const defaultTextStyle = new TextStyle({
    fontFamily: '"Source Sans Pro", Helvetica, sans-serif',
    fontSize: 30,
    fill: "#ffffff",
})




export function VsrgKeysRenderer({ keys, sizes, colors }: VsrgKeysRendererProps) {
    const [textStyle, setTextStyle] = useState(defaultTextStyle)
    useEffect(() => {
        setTextStyle(new TextStyle({
            fontFamily: '"Source Sans Pro", Helvetica, sans-serif',
            fontSize: 30,
            fill: colors.lineColor[1],
        }))
    }, [colors, sizes, keys])
    const elHeight = sizes.height / keys.length
    return <Container
        x={0}
        y={0}
        height={sizes.height}
        width={60}
    >
        <Graphics
            draw={(g) => {
                g.clear()
                g.beginFill(colors.background_plain[1])
                g.drawRect(0, 0, 60, sizes.height)
                g.lineStyle(2, colors.lineColor_10[1])
                for (let i = 0; i < keys.length - 1; i++) {
                    g.moveTo(0, elHeight * (i + 1))
                    g.lineTo(sizes.width, elHeight * (i + 1))
                }
                g.lineStyle(2, colors.secondary[1])
                g.moveTo(59, 0)
                g.lineTo(59, sizes.height)
            }}
        />
        {keys.map((key, index) =>
            <Text
                key={index}
                text={key}
                x={30}
                y={elHeight * index + elHeight / 2}
                anchor={0.5}
                style={textStyle}
            />
        )}

    </Container>
}