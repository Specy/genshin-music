import { Container, Stage } from "@inlet/react-pixi"
import { subscribeTheme } from "lib/Hooks/useTheme"
import { VsrgSong } from "lib/Songs/VsrgSong"
import { Component, createRef } from "react"
import { ThemeStoreClass } from "stores/ThemeStore"
import { VsrgKeysRenderer } from "./VsrgKeysRenderer"
import { VsrgScrollableTrackRenderer } from "./VsrgScrollableTrackRenderer"


export type VsrgCanvasSizes = {
    width: number
    height: number
}
export type VsrgCanvasColors = {
    background_plain: [string, number]
    background: [string, number]
    background_10: [string, number]
    secondary: [string, number]
    lineColor: [string, number]
    lineColor_10: [string, number]
}
interface VsrgCanvasProps {
    vsrg: VsrgSong
    isPlaying: boolean
    snapPoint: number
    snapPoints: number[]
    onHitObjectAdded: (timestamp: number) => void
}
interface VsrgCanvasState {
    canvasColors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    timestamp: 0
}

const VsrgKeysMap = {
    4: ["A", "S", "G", "H"],
    6: ["A", "S", "D", "G", "H", "J"],
    8: ["A", "S", "D", "F", "G", "H", "J", "K"],
}


export class VsrgCanvas extends Component<VsrgCanvasProps, VsrgCanvasState>{
    wrapperRef = createRef<HTMLDivElement>()
    stageRef = createRef<any>()
    toDispose: (() => void)[] = []
    constructor(props: VsrgCanvasProps) {
        super(props)
        this.state = {
            canvasColors: {
                background_plain: ["#000000", 0],
                background: ['#000000', 0],
                background_10: ['#000000', 0],
                secondary: ['#ffffff', 0xffffff],
                lineColor: ['#ffffff', 0xffffff],
                lineColor_10: ['#ffffff', 0xffffff],
            },
            timestamp: 0,
            sizes: {
                width: 0,
                height: 0
            }
        }
        this.wrapperRef = createRef()
        this.stageRef = createRef()
    }
    componentDidMount(){
        this.toDispose.push(subscribeTheme(this.handleThemeChange))
        window.addEventListener("resize", this.calculateSizes)
        this.toDispose.push(() => window.removeEventListener("resize", this.calculateSizes))
        this.calculateSizes()
    }
    componentWillUnmount(){
        this.toDispose.forEach(d => d())
    }
    calculateSizes = () => {
        const { wrapperRef } = this
        if(!wrapperRef.current) return console.log("no wrapper")
        const wrapperSizes = wrapperRef.current.getBoundingClientRect()
        const sizes = {
            width: wrapperSizes.width,
            height: wrapperSizes.height
        }
        this.setState({sizes})
    }
    handleThemeChange = (theme: ThemeStoreClass) => {
        const bg_plain = theme.get('primary')
        const bg_line = theme.getText('primary')
        const bg_line_10 = bg_line.darken(0.5).desaturate(1)
        const bg = bg_plain.darken(0.15)
        const bg_10 = bg.darken(0.1)
        const secondary = theme.get('secondary')
        this.setState({
            canvasColors: {
                background_plain: [bg_plain.hex(), bg_plain.rgbNumber()],
                background: [bg.hex(), bg.rgbNumber()],
                background_10: [bg_10.hex(), bg_10.rgbNumber()],
                secondary: [secondary.hex(), secondary.rgbNumber()],
                lineColor: [bg_line.hex(), bg_line.rgbNumber()],
                lineColor_10: [bg_line_10.hex(), bg_line_10.rgbNumber()],
            }
        })
    }

    render() {
        const { canvasColors, sizes} = this.state 
        const { vsrg } = this.props
        return <div
            className="vsrg-top-canvas-wrapper"
            ref={this.wrapperRef}
        >
            {this.wrapperRef.current &&
                <Stage
                    ref={this.stageRef}
                    width={sizes.width}
                    height={sizes.height}
                    options={{
                        backgroundColor: canvasColors.background[1],
                        autoDensity: false,
                        resolution: window.devicePixelRatio || 1,
                    }}
                >
                    <VsrgScrollableTrackRenderer
                        bpm={vsrg.bpm}
                        tracks={vsrg.tracks}
                        snapPoint={this.props.snapPoint}
                        snapPoints={this.props.snapPoints}
                        timestamp={this.state.timestamp}
                        sizes={sizes}
                        colors={canvasColors}
                        keys={vsrg.keys}
                        onHitObjectAdded={this.props.onHitObjectAdded}
                    />
                    <VsrgKeysRenderer 
                        keys={VsrgKeysMap[vsrg.keys]}
                        sizes={sizes}
                        colors={canvasColors}
                    />
                </Stage>
            }
        </div>
    }
}