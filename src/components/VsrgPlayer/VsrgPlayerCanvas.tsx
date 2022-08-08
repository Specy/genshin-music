import { Container, Sprite, Stage } from "@inlet/react-pixi";
import { subscribeTheme } from "lib/Hooks/useTheme";
import { VsrgHitObject, VsrgSong } from "lib/Songs/VsrgSong";
import { ThrottledEventLoop } from "lib/ThrottledEventLoop";
import { isNumberCloseTo } from "lib/Utilities";
import { Application } from "pixi.js";
import { Component, createRef } from "react";
import { ThemeStore } from "stores/ThemeStore";
import { KeyboardKey, subscribeCurrentSong, VsrgKeyboardPressType, VsrgPlayerSong, vsrgPlayerStore } from "stores/VsrgPlayerStore";
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
    playHitObject: (hitObject: VsrgHitObject, instrumentIndex: number) => void
}
enum HitObjectStatus {
    Idle,
    Pressed,
    Missed,
    Hit
}
export class RenderableHitObject {
    hitObject: VsrgHitObject
    color: string = '#FFFFFF'
    status = HitObjectStatus.Idle
    instrumentIndex: number = 0
    //will be used to give score only every N ms
    heldScoreTimeout = 0
    constructor(hitObject: VsrgHitObject) {
        this.hitObject = hitObject
    }
}
interface VsrgPlayerCanvasState {
    song: VsrgSong
    verticalOffset: number
    timestamp: number
    accuracy: number
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
            accuracy: 150,
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
        vsrgPlayerStore.addKeyboardListener({
            callback: this.handleKeyboard,
            id: 'vsrg-player-canvas'
        })
        this.toDispose.push(() => vsrgPlayerStore.removeKeyboardListener({ id: 'vsrg-player-canvas' }))
        this.toDispose.push(subscribeCurrentSong(this.onSongPick))
        this.toDispose.push(subscribeTheme(this.handleThemeChange))

        window.addEventListener('resize', this.calculateSizes)
        this.toDispose.push(() => window.removeEventListener('resize', this.calculateSizes))
        this.calculateSizes()
    }
    onSongPick = ({ type, song }: VsrgPlayerSong) => {
        vsrgPlayerStore.resetScore()
        if (type === 'play' && song) {
            const countDown = 1000
            this.setState({ song: song, timestamp: - countDown - song.approachRate, renderableHitObjects: [] }, () => {
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
    handleKeyboard = (key: KeyboardKey, type: VsrgKeyboardPressType) => {
        const { renderableHitObjects, timestamp, accuracy } = this.state
        //rho = renderable hit object
        const rho = renderableHitObjects.find(r => r.hitObject.index === key.index)
        if (!rho) return
        if (type === 'down') {
            const isInRange = isNumberCloseTo(rho.hitObject.timestamp, timestamp, accuracy)
            const isIdle = rho.status === HitObjectStatus.Idle
            if (isInRange && isIdle) {
                if (!rho.hitObject.isHeld) {
                    rho.status = HitObjectStatus.Hit
                } else {
                    rho.status = HitObjectStatus.Pressed
                }
                this.props.playHitObject(rho.hitObject, rho.instrumentIndex)
                //TODO add score detection
                vsrgPlayerStore.incrementScore('perfect')
            }
        }
        if (type === 'up') {
            if (rho.hitObject.isHeld) {
                if (isNumberCloseTo(rho.hitObject.timestamp + rho.hitObject.holdDuration, timestamp, accuracy)) {
                    rho.status = HitObjectStatus.Hit
                } else {
                    rho.status = HitObjectStatus.Missed
                    vsrgPlayerStore.incrementScore('miss')
                }
            }
        }

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
        this.setState({ sizes, verticalOffset: sizes.hitObjectSize / 2 }, this.generateCache)
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
        const { song, renderableHitObjects, sizes } = this.state
        if (!isPlaying) return
        const timestamp = this.state.timestamp + sinceLast
        const tracks = song.tickPlayback(timestamp + song.approachRate + sizes.height)
        const toAdd = tracks.map((track, i) => {
            const hitObjects = track.map(hitObject => {
                const renderable = new RenderableHitObject(hitObject)
                renderable.instrumentIndex = i
                renderable.color = song.tracks[i].color
                return renderable
            })
            return hitObjects
        }).flat()

        this.validateHitObjects(timestamp, renderableHitObjects.concat(toAdd), this.state.timestamp)
        this.props.onTick(timestamp)
    }
    validateHitObjects = (timestamp: number, renderableHitObjects: RenderableHitObject[], previousTimestamp: number) => {
        const { accuracy } = this.state
        const keyboard = vsrgPlayerStore.keyboard
        for (let i = 0; i < renderableHitObjects.length; i++) {
            const hitObject = renderableHitObjects[i]
            const key = keyboard[hitObject.hitObject.index]
            if (!key) continue
            const isIdle = hitObject.status === HitObjectStatus.Idle
            if (!key.isPressed && isIdle && hitObject.hitObject.timestamp < timestamp - accuracy) {
                hitObject.status = HitObjectStatus.Missed
                vsrgPlayerStore.incrementScore('miss')
                continue
            }
            if (key.isPressed && hitObject.status === HitObjectStatus.Pressed) {
                const pressedTooLong = hitObject.hitObject.timestamp + hitObject.hitObject.holdDuration < timestamp - accuracy
                hitObject.heldScoreTimeout -= timestamp - previousTimestamp
                if (pressedTooLong) {
                    hitObject.status = HitObjectStatus.Missed
                    vsrgPlayerStore.incrementScore('miss')
                } else {
                    if (hitObject.heldScoreTimeout <= 0) {
                        hitObject.heldScoreTimeout = 300
                        vsrgPlayerStore.incrementScore('perfect')
                    }
                }
                continue
            }
        }
        const filtered = renderableHitObjects.filter(r => r.hitObject.timestamp + r.hitObject.holdDuration > timestamp - accuracy)
        this.setState({ timestamp, renderableHitObjects: filtered })
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