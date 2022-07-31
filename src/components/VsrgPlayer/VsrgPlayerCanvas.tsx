import { Container, Sprite, Stage } from "@inlet/react-pixi";
import { subscribeTheme } from "lib/Hooks/useTheme";
import { VsrgHitObject, VsrgSong } from "lib/Songs/VsrgSong";
import { ThrottledEventLoop } from "lib/ThrottledEventLoop";
import { Application } from "pixi.js";
import { Component, createRef } from "react";
import { ThemeStore } from "stores/ThemeStore";
import { subscribeCurrentSong, VsrgPlayerSong } from "stores/VsrgPlayerStore";
import { VsrgPlayerCacheKinds, VsrgPlayerCache } from "./VsgPlayerCache";
import { VsrgHitObjectsRenderer } from "./VsrgHitObjectsRenderer";
import { VsrgPlayerCountDown } from "./VsrgPlayerCountDown";



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
    hitObjectSize: number
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
    verticalOffset: number
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
            verticalOffset: 0,
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
        this.toDispose.push(subscribeTheme(this.handleThemeChange))
        window.addEventListener('resize', this.calculateSizes)
        this.toDispose.push(() => window.removeEventListener('resize', this.calculateSizes))
        this.calculateSizes()
    }
    onSongPick = ({ type, song }: VsrgPlayerSong) => {
        if (type === 'play' && song) {
            this.setState({ song: song, timestamp: - 3000 - song.approachRate, renderableHitObjects: [] }, () => {
                song?.startPlayback(0)
                this.calculateSizes()
            })
        }
        if (type === 'stop') this.setState({ song: new VsrgSong(''), timestamp: 0, renderableHitObjects: [] })
    }
    componentWillUnmount() {
        this.throttledEventLoop.stop()
        this.toDispose.forEach(d => d())
    }
    calculateSizes = () => {
        const { song } = this.state
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
            hitObjectSize: this.props.hitObjectSize,
            scaling: (el.clientHeight) / song.approachRate
        }
        const canvas = el.querySelector('canvas')
        if (canvas) {
            canvas.style.width = `${sizes.width}px`
            canvas.style.height = `${sizes.height}px`
        }
        this.setState({ sizes , verticalOffset: sizes.hitObjectSize * 2}, this.generateCache)
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
    handleThemeChange = (theme: ThemeStore) => {
        const bg_plain = theme.get('primary')
        const bg_line = theme.getText('primary')
        const bg_line_10 = bg_line.darken(0.5).desaturate(1)
        const bg = bg_plain.darken(0.15)
        const bg_10 = bg.darken(0.1)
        const secondary = theme.get('secondary')
        const accent = theme.get('accent')
        this.setState({
            colors: {
                background_plain: [bg_plain.hex(), bg_plain.rgbNumber()],
                background: [bg.hex(), bg.rgbNumber()],
                background_10: [bg_10.hex(), bg_10.rgbNumber()],
                secondary: [secondary.hex(), secondary.rgbNumber()],
                lineColor: [bg_line.hex(), bg_line.rgbNumber()],
                lineColor_10: [bg_line_10.hex(), bg_line_10.rgbNumber()],
                accent: [accent.hex(), accent.rgbNumber()],
            }
        }, this.generateCache)
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
        const newRenderable = renderableHitObjects.concat(toAdd).filter(ho => ho.hitObject.timestamp < timestamp + song.approachRate)
        this.setState({ timestamp, renderableHitObjects: newRenderable })
        this.props.onTick(timestamp)
    }
    render() {
        const { sizes, cache, renderableHitObjects, timestamp, song, verticalOffset } = this.state
        return <>
            <div className="vsrg-player-canvas" ref={this.wrapperRef}>
                {(timestamp + song.approachRate) < 0 &&
                    <VsrgPlayerCountDown
                        time={Math.abs(Math.ceil((timestamp + song.approachRate) / 1000)) + 1}
                    />
                }
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
                            offset={verticalOffset}
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