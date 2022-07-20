import { Container, Graphics, Sprite, Text } from "@inlet/react-pixi";
import { TextStyle } from "pixi.js";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";

interface VsrgKeysRendererProps {
    keys: string[]
    sizes: VsrgCanvasSizes
    colors: VsrgCanvasColors
}

const textStyle = new TextStyle({
    fontFamily: '"Source Sans Pro", Helvetica, sans-serif',
    fontSize: 30,
    fill: "#ffffff",
})




export function VsrgKeysRenderer({ keys, sizes, colors }: VsrgKeysRendererProps) {
    const elHeight = sizes.height / keys.length
    return <Container
        x={0}
        y={0}
        width={60}
    >
        <Graphics
            draw={(g) => {
                g.clear()
                g.beginFill(colors.background_plain[1])
                g.drawRect(0, 0, 60, sizes.height)
                g.lineStyle(2,colors.lineColor_10[1])
                for(let i = 0; i < keys.length - 1; i++){
                    g.moveTo(0, elHeight * (i + 1))
                    g.lineTo(sizes.width, elHeight * (i + 1))
                }
                g.lineStyle(2,colors.secondary[1])
                g.moveTo(59, 0)
                g.lineTo(59, sizes.height)
            }}
        />
        {keys.map((key, index) =>
            <Container
                key={key}
                height={elHeight}
                width={60}
                x={0}
                y={elHeight* index}
            >
                <Text
                    text={key}
                    x={30}
                    y={elHeight / 2}
                    anchor={0.5}
                    style={textStyle}
                />
            </Container>
        )}

    </Container>
}