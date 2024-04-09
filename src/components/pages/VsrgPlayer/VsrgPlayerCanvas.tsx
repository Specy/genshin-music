import {Stage} from "@pixi/react";
import {subscribeTheme} from "$lib/Hooks/useTheme";
import {VsrgAccuracyBounds, VsrgHitObject, VsrgSong} from "$lib/Songs/VsrgSong";
import {ThrottledEventLoop} from "$lib/ThrottledEventLoop";
import {isNumberCloseTo} from "$lib/Utilities";
import {Application} from "pixi.js";
import {Component, createRef} from "react";
import {keyBinds} from "$stores/KeybindsStore";
import {Theme} from "$stores/ThemeStore/ThemeProvider";
import {
    KeyboardKey,
    subscribeCurrentVsrgSong,
    VsrgKeyboardPressType,
    VsrgPlayerEvent,
    VsrgPlayerHitType,
    VsrgPlayerSong,
    vsrgPlayerStore
} from "$stores/VsrgPlayerStore";
import {VsrgPlayerCache} from "./VsgPlayerCache";
import {VsrgHitObjectsRenderer} from "./VsrgHitObjectsRenderer";
import {VsrgPlayerCountDown} from "./VsrgPlayerCountDown";
import {VsrgKeyboardLayout} from "./VsrgPlayerKeyboard";
import {DEFAULT_DOM_RECT} from "$config";
import s from "./VsrgPlayerCanvas.module.css";


export type VsrgPlayerCanvasColors = {
    background_plain: [string, number]
    background_layer_10: [string, number]
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
    verticalOffset: number
}


interface VsrgPlayerCanvasProps {
    isPlaying: boolean
    scrollSpeed: number
    keyboardLayout: VsrgKeyboardLayout
    maxFps: number
    onSizeChange: (sizes: VsrgPlayerCanvasSizes) => void
    onTick: (timestamp: number) => void
    playHitObject: (hitObject: VsrgHitObject, instrumentIndex: number) => void
}

export enum HitObjectStatus {
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
    devicePixelRatio: number
    timestamp: number
    accuracy: number
    sizes: VsrgPlayerCanvasSizes
    colors: VsrgPlayerCanvasColors
    cache: VsrgPlayerCache | null
    renderableHitObjects: RenderableHitObject[],
    accuracyBounds: VsrgAccuracyBounds
}

export const defaultVsrgPlayerSizes: VsrgPlayerCanvasSizes = {
    el: {...DEFAULT_DOM_RECT},
    rawWidth: 0,
    rawHeight: 0,
    width: 0,
    height: 0,
    keyWidth: 0,
    hitObjectSize: 0,
    scaling: 0,
    verticalOffset: 0,
}

export class VsrgPlayerCanvas extends Component<VsrgPlayerCanvasProps, VsrgPlayerCanvasState> {
    throttledEventLoop: ThrottledEventLoop
    wrapperRef: React.RefObject<HTMLDivElement>
    stageRef: React.RefObject<any>
    toDispose: (() => void)[] = []

    constructor(props: VsrgPlayerCanvasProps) {
        super(props)
        this.state = {
            song: new VsrgSong(''),
            timestamp: 0,
            devicePixelRatio: 1.4,
            accuracy: 150,
            sizes: defaultVsrgPlayerSizes,
            colors: {
                background_plain: ['#000000', 1],
                background_layer_10: ['#000000', 1],
                background: ['#000000', 1],
                background_10: ['#000000', 1],
                secondary: ['#000000', 1],
                lineColor: ['#000000', 1],
                lineColor_10: ['#000000', 1],
                accent: ['#000000', 1]
            },
            accuracyBounds: [0, 0, 0, 0, 0],
            cache: null,
            renderableHitObjects: []
        }
        this.throttledEventLoop = new ThrottledEventLoop(() => {
        }, this.props.maxFps)
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
        this.setState({devicePixelRatio: window.devicePixelRatio ?? 1.4})
        this.toDispose.push(() => vsrgPlayerStore.removeKeyboardListener({id: 'vsrg-player-canvas'}))
        this.toDispose.push(subscribeCurrentVsrgSong(this.onSongPick))
        this.toDispose.push(subscribeTheme(this.handleThemeChange))
        vsrgPlayerStore.addEventListener(this.handleVsrgEvent, "vsrg-player-canvas")
        this.toDispose.push(() => vsrgPlayerStore.removeEventListener("vsrg-player-canvas"))
        window.addEventListener('resize', this.calculateSizes)
        this.toDispose.push(() => window.removeEventListener('resize', this.calculateSizes))
        this.calculateSizes()
    }

    onSongPick = ({type, song}: VsrgPlayerSong) => {
        vsrgPlayerStore.resetScore()
        const {scrollSpeed} = this.props
        if (type === 'play' && song) {
            const countDown = 3000 / 2
            this.setState({song, timestamp: -countDown - scrollSpeed, renderableHitObjects: []}, () => {
                song.startPlayback(0)
                this.calculateSizes()
                this.generateAccuracyBounds()
            })
        }
        if (type === 'stop') this.setState({song: new VsrgSong(''), timestamp: 0, renderableHitObjects: []})
    }

    componentWillUnmount() {
        this.throttledEventLoop.stop()
        vsrgPlayerStore.setLayout(keyBinds.getVsrgKeybinds(4))
        this.toDispose.forEach(d => d())
    }

    handleVsrgEvent = (data: VsrgPlayerEvent) => {
        if (data === 'fpsChange') this.throttledEventLoop.changeMaxFps(this.props.maxFps)
    }
    handleKeyboard = (key: KeyboardKey, type: VsrgKeyboardPressType) => {
        const {renderableHitObjects, timestamp, accuracy} = this.state
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
                vsrgPlayerStore.incrementScore(this.getHitRating(rho.hitObject, timestamp))
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
        const el = this.wrapperRef.current
        if (!el) return
        const width = el.clientWidth
        const keyWidth = width / this.state.song.keys
        const hitObjectSize = keyWidth * 0.6
        const sizes: VsrgPlayerCanvasSizes = {
            width,
            height: el.clientHeight,
            rawWidth: width,
            rawHeight: el.clientHeight,
            el: el.getBoundingClientRect(),
            keyWidth,
            hitObjectSize,
            scaling: (el.clientHeight) / this.props.scrollSpeed,
            verticalOffset: 15
        }
        const canvas = el.querySelector('canvas')
        if (canvas) {
            canvas.style.width = `${sizes.width}px`
            canvas.style.height = `${sizes.height}px`
        }
        this.props.onSizeChange(sizes)
        this.setState({sizes}, this.generateCache)
    }
    generateCache = () => {
        const {colors, sizes, cache} = this.state
        const app = this.stageRef.current.app as Application
        const newCache = new VsrgPlayerCache({
            app,
            colors,
            sizes,
            trackColors: this.state.song.tracks.map(track => track.color),
        })
        this.setState({cache: newCache}, () => {
            setTimeout(() => {
                //TODO not sure why pixi reuses textures from the old cache
                cache?.destroy()
            }, 500)
        })
    }
    generateAccuracyBounds = () => {
        const {song} = this.state
        this.setState({accuracyBounds: song.getAccuracyBounds()})
    }
    getHitRating = (hitObject: VsrgHitObject, timestamp: number): VsrgPlayerHitType => {
        const {accuracyBounds} = this.state
        const diff = Math.abs(timestamp - hitObject.timestamp)
        if (diff < accuracyBounds[0]) return 'amazing'
        if (diff < accuracyBounds[1]) return 'perfect'
        if (diff < accuracyBounds[2]) return 'great'
        if (diff < accuracyBounds[3]) return 'good'
        if (diff < accuracyBounds[4]) return 'bad'
        return 'miss'
    }
    handleThemeChange = (theme: Theme) => {
        const bg_plain = theme.get('primary')
        const bg_line = theme.getText('primary')
        const bg_line_10 = bg_line.darken(0.5).desaturate(1)
        const bg_layer_10 = theme.layer('background', 0.18, 0.06)
        const bg = bg_plain.darken(0.15)
        const bg_10 = bg.darken(0.1)
        const secondary = theme.get('secondary')
        const accent = theme.get('accent')
        this.setState({
            colors: {
                background_plain: [bg_plain.hex(), bg_plain.rgbNumber()],
                background_layer_10: [bg_layer_10.hex(), bg_layer_10.rgbNumber()],
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
        const {isPlaying, scrollSpeed} = this.props
        const {song, renderableHitObjects, sizes} = this.state
        if (!isPlaying) return
        const timestamp = this.state.timestamp + sinceLast
        const tracks = song.tickPlayback(timestamp + scrollSpeed + sizes.height)
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
        const {accuracy} = this.state
        const keyboard = vsrgPlayerStore.keyboard
        for (let i = 0; i < renderableHitObjects.length; i++) {
            const ro = renderableHitObjects[i]
            const key = keyboard[ro.hitObject.index]
            if (!key) continue
            const isIdle = ro.status === HitObjectStatus.Idle
            if (!key.isPressed && isIdle && ro.hitObject.timestamp < timestamp - accuracy) {
                ro.status = HitObjectStatus.Missed
                vsrgPlayerStore.incrementScore('miss')
                continue
            }
            if (key.isPressed && ro.status === HitObjectStatus.Pressed) {
                const pressedTooLong = ro.hitObject.timestamp + ro.hitObject.holdDuration < timestamp - accuracy
                ro.heldScoreTimeout -= timestamp - previousTimestamp
                if (pressedTooLong) {
                    ro.status = HitObjectStatus.Missed
                    vsrgPlayerStore.incrementScore('miss')
                } else {
                    if (ro.heldScoreTimeout <= 0) {
                        ro.heldScoreTimeout = 300
                        vsrgPlayerStore.incrementScore('perfect')
                    }
                }
                continue
            }
        }
        const filtered = renderableHitObjects.filter(r => r.hitObject.timestamp + r.hitObject.holdDuration > timestamp - accuracy)
        this.setState({timestamp, renderableHitObjects: filtered})
    }


    render() {
        const {sizes, cache, renderableHitObjects, timestamp, colors, devicePixelRatio} = this.state
        const {scrollSpeed} = this.props
        return <>
            <div
                className={`${s['vsrg-player-canvas']} box-shadow`}
                style={{
                    backgroundColor: colors.background_layer_10[0]
                }}
                ref={this.wrapperRef}
            >
                {(timestamp + scrollSpeed) < 0 &&
                    <VsrgPlayerCountDown
                        time={Math.abs(Math.ceil((timestamp + scrollSpeed) / 1000 * 2)) + 1}
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
                        resolution: devicePixelRatio,
                    }}
                    onMount={this.calculateSizes}
                >
                    {cache && <>
                        <VsrgHitObjectsRenderer
                            sizes={sizes}
                            offset={sizes.verticalOffset}
                            cache={cache}
                            renderableHitObjects={renderableHitObjects}
                            timestamp={timestamp}
                        />

                    </>
                    }
                </Stage>
            </div>
        </>
    }
}