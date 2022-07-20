import { Stage } from "@inlet/react-pixi"
import { subscribeTheme } from "lib/Hooks/useTheme"
import { VsrgSong } from "lib/Songs/VsrgSong"
import { Application } from "pixi.js"
import React, { Component, createRef } from "react"
import { ThemeProvider, ThemeStoreClass } from "stores/ThemeStore"
import { VsrgComposerEvents, vsrgComposerStore } from "stores/VsrgComposerStore"
import { VsrgCanvasCache } from "./VsrgComposerCache"
import { VsrgKeysRenderer } from "./VsrgKeysRenderer"
import { VsrgScrollableTrackRenderer } from "./VsrgScrollableTrackRenderer"


export type VsrgCanvasSizes = {
    width: number
    height: number
    snapPointWidth: number
    keyHeight: number
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
    onSnapPointSelect: (timestamp: number,key: number, type?: 0 | 2) => void
}
interface VsrgCanvasState {
    canvasColors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    timestamp: number
    cache: VsrgCanvasCache | null
    isPressing: boolean
    previousPosition: number
    preventClick: boolean
    totalMovement: number
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
                height: 0,
                snapPointWidth: 0,
                keyHeight: 0,
            },
            isPressing: false,
            totalMovement: 0,
            previousPosition: 0,
            preventClick: false,
            cache: null
        }
        this.wrapperRef = createRef()
        this.stageRef = createRef()
    }
    componentDidMount() {
        this.toDispose.push(subscribeTheme(this.handleThemeChange))
        window.addEventListener("resize", this.calculateSizes)
        this.toDispose.push(() => window.removeEventListener("resize", this.calculateSizes))
        vsrgComposerStore.addEventListener("ALL", {
            callback: this.handleEvent,
            id: "vsrg-canvas-color-change"
        })
        this.toDispose.push(() => vsrgComposerStore.removeEventListener("ALL",{id: "vsrg-canvas-color-change"}))
        this.calculateSizes()
        this.handleThemeChange(ThemeProvider)
    }
    componentWillUnmount() {
        this.toDispose.forEach(d => d())
        this.state.cache?.destroy()
    }
    handleEvent = (event: VsrgComposerEvents) => {
        if(event === 'colorChange') this.generateCache()
        if(event === 'updateKeys') this.calculateSizes()
    }
    calculateSizes = () => {
        const { wrapperRef } = this
        if (!wrapperRef.current) return console.log("no wrapper")
        const wrapperSizes = wrapperRef.current.getBoundingClientRect()
        
        const sizes = {
            width: wrapperSizes.width,
            height: wrapperSizes.height,
            keyHeight: wrapperSizes.height / VsrgKeysMap[this.props.vsrg.keys].length,
            snapPointWidth: (60000 / this.props.vsrg.bpm) * this.props.snapPoint,
        }
        this.setState({ sizes }, this.generateCache)
    }
    handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        this.setState({
            timestamp: Math.min(0, this.state.timestamp - e.deltaY / 1.5 )
        })
    }
    setIsDragging = (e: React.PointerEvent<HTMLCanvasElement>) => {
        this.setState({ 
            isPressing: true,
            previousPosition: e.clientX
        })
    }
    setIsNotDragging = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if(!this.state.isPressing) return
        this.setState({ isPressing: false,  totalMovement: 0 }, () => {
            //dumbass idk how to make otherwise
            setTimeout(() => this.setState({ preventClick: false }), 200)
        })
    }
    handleDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if(!this.state.isPressing) return
        const { previousPosition } = this.state
        const delta = e.clientX - previousPosition
        const newTotalMovement = this.state.totalMovement + Math.abs(delta)
        this.setState({ 
            previousPosition: e.clientX,
            preventClick: newTotalMovement > 50,
            totalMovement: newTotalMovement,
            timestamp:  Math.min(0, this.state.timestamp + delta )
        })
    }
    generateCache = () => {
        const { sizes, canvasColors, cache } = this.state
        const trackColors = this.props.vsrg.tracks.map(t => t.color)
        if (!this.stageRef.current) return
        const newCache = new VsrgCanvasCache({
            app: this.stageRef.current.app as Application,
            sizes,
            colors: canvasColors,
            trackColors
        })
        this.setState({ cache: newCache }, () => {
            cache?.destroy()  
        })
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
        }, this.generateCache)
    }

    render() {
        const { canvasColors, sizes, cache } = this.state
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
                    onWheel={this.handleWheel}
                    onPointerDown={this.setIsDragging}
                    onPointerUp={this.setIsNotDragging}
                    onPointerLeave={this.setIsNotDragging}
                    onPointerMoveCapture={this.handleDrag}
                    onContextMenu={(e) => e.preventDefault()}
                    options={{
                        backgroundColor: canvasColors.background[1],
                        autoDensity: false,
                        resolution: window.devicePixelRatio || 1,
                    }}
                >
                    {cache &&
                        <VsrgScrollableTrackRenderer
                            bpm={vsrg.bpm}
                            tracks={vsrg.tracks}
                            cache={cache}
                            snapPoint={this.props.snapPoint}
                            snapPoints={this.props.snapPoints}
                            timestamp={this.state.timestamp}
                            preventClick={this.state.preventClick}
                            sizes={sizes}
                            colors={canvasColors}
                            keys={vsrg.keys}
                            onSnapPointSelect={this.props.onSnapPointSelect}
                        />
                    }

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