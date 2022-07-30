import { Container, Sprite, Stage } from "@inlet/react-pixi";
import { VsrgHitObject, VsrgSong } from "lib/Songs/VsrgSong";
import { ThrottledEventLoop } from "lib/ThrottledEventLoop";
import { Application } from "pixi.js";
import { Component, createRef } from "react";
import { subscribeCurrentSong, VsrgPlayerSong } from "stores/VsrgPlayerStore";
import { VsrgPlayerCacheKinds, VsrgPlayerCache } from "./VsgPlayerCache";
import { VsrgHitObjectsRenderer } from "./VsrgHitObectsRenderer";



export type VsrgPlayerCanvasColors = {
    background_plain: [string, number]
    background: [string, number]
    background_10: [string, number]
    secondary: [string, number]
    lineColor: [string, number]
    lineColor_10: [string, number]
    accent: [string, number]
}
export type VsrgPlayerCanvasSizes = {
    el: DOMRect
    rawWidth: number
    rawHeight: number
    width: number
    height: number
    keyWidth: number
    hitObjectSize: number
    scaling: number
}


interface VsrgPlayerCanvasProps {
    isPlaying: boolean
    onTick: (timestamp: number) => void
}
enum HitObjectStatus {
    Idle,
    Pressed,
}
export class RenderableHitObject {
    hitObject: VsrgHitObject
    color: string = '#FFFFFF'
    status = HitObjectStatus.Idle
    constructor(hitObject: VsrgHitObject) {
        this.hitObject = hitObject
    }
}
interface VsrgPlayerCanvasState {
    song: VsrgSong
    timestamp: number
    sizes: VsrgPlayerCanvasSizes
    colors: VsrgPlayerCanvasColors
    cache: VsrgPlayerCache | null
    renderableHitObjects: RenderableHitObject[]
}
export class VsrgPlayerCanvas extends Component<VsrgPlayerCanvasProps, VsrgPlayerCanvasState>{
    throttledEventLoop: ThrottledEventLoop = new ThrottledEventLoop(() => { }, 48)
    wrapperRef: React.RefObject<HTMLDivElement>
    stageRef: React.RefObject<any>
    toDispose: (() => void)[] = []
    constructor(props: VsrgPlayerCanvasProps) {
        super(props)
        this.state = {
            song: new VsrgSong(''),
            timestamp: 0,
            sizes: {
                el: new DOMRect(),
                rawWidth: 0,
                rawHeight: 0,
                width: 0,
                height: 0,
                keyWidth: 0,
                hitObjectSize: 0,
                scaling: 0
            },
            colors: {
                background_plain: ['#000000', 1],
                background: ['#000000', 1],
                background_10: ['#000000', 1],
                secondary: ['#000000', 1],
                lineColor: ['#000000', 1],
                lineColor_10: ['#000000', 1],
                accent: ['#000000', 1]
            },
            cache: null,
            renderableHitObjects: []
        }
        this.wrapperRef = createRef()
        this.stageRef = createRef()
    }
    componentDidMount() {
        this.throttledEventLoop.setCallback(this.handleTick)
        this.throttledEventLoop.start()
        this.toDispose.push(subscribeCurrentSong(this.onSongPick))
        this.calculateSizes()
    }
    onSongPick = ({ type, song }: VsrgPlayerSong) => {
        if (type === 'play') this.setState({ song: song!, timestamp: 0, renderableHitObjects: [] })
        if (type === 'stop') this.setState({ song: new VsrgSong(''), timestamp: 0, renderableHitObjects: [] })
    }
    componentWillUnmount() {
        this.throttledEventLoop.stop()
        this.toDispose.forEach(d => d())
    }
    calculateSizes = () => {
        const el = this.wrapperRef.current
        if (!el) return
        const width = el.clientWidth
        const keyWidth = width / this.state.song.keys
        const sizes: VsrgPlayerCanvasSizes = {
            width,
            height: el.clientHeight,
            rawWidth: width,
            rawHeight: el.clientHeight,
            el: el.getBoundingClientRect(),
            keyWidth,
            hitObjectSize: keyWidth * 0.8,
            scaling: 1
        }
        this.setState({ sizes }, this.generateCache)
    }
    generateCache = () => {
        const { colors, sizes, cache } = this.state
        const app = this.stageRef.current.app as Application
        const newCache = new VsrgPlayerCache({
            app,
            colors,
            sizes,
            trackColors: this.state.song.tracks.map(track => track.color),
        })
        this.setState({ cache: newCache }, () => {
            cache?.destroy()
        })
    }
    handleTick = (elapsed: number, sinceLast: number) => {
        const { isPlaying } = this.props
        const { song, renderableHitObjects } = this.state
        if (!isPlaying) return
        const timestamp = this.state.timestamp + sinceLast
        const notes = song.tickPlayback(timestamp + song.approachRate)
        const toAdd = notes.map((track, i) => {
            const hitObjects = track.map(hitObject => {
                const renderable = new RenderableHitObject(hitObject)
                renderable.color = song.tracks[i].color
                return renderable
            })
            return hitObjects
        }).flat()
        renderableHitObjects.push(...toAdd)
        this.setState({ timestamp, renderableHitObjects })
        this.props.onTick(timestamp)
    }
    render() {
        const { sizes, cache, renderableHitObjects, timestamp } = this.state
        return <>
            <div className="vsrg-player-canvas" ref={this.wrapperRef}>
                <Stage
                    ref={this.stageRef}
                    raf={false}
                    width={sizes.width}
                    height={sizes.height}
                    options={{
                        backgroundAlpha: 0,
                        autoDensity: false,
                        resolution: window?.devicePixelRatio || 1,
                    }}
                    onMount={this.calculateSizes}
                >
                    {cache &&
                        <VsrgHitObjectsRenderer
                            sizes={sizes}
                            cache={cache}
                            renderableHitObjects={renderableHitObjects}
                            timestamp={timestamp}
                        />
                    }
                </Stage>
            </div>
        </>
    }
}