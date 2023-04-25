import { Stage } from "@pixi/react"
import { DEFAULT_DOM_RECT, DEFAULT_VSRG_KEYS_MAP } from "$config"
import isMobile from "is-mobile"
import { subscribeTheme } from "$lib/Hooks/useTheme"
import { RecordedSong } from "$lib/Songs/RecordedSong"
import { RecordedNote } from "$lib/Songs/SongClasses"
import { VsrgHitObject, VsrgSong } from "$lib/Songs/VsrgSong"
import { ThrottledEventLoop } from "$lib/ThrottledEventLoop"
import { Application } from "pixi.js"
import React, { Component, createRef } from "react"
import { ThemeProvider, Theme } from "$stores/ThemeStore/ThemeProvider"
import { VsrgComposerEvents, vsrgComposerStore } from "$stores/VsrgComposerStore"
import { ClickType } from "$types/GeneralTypes"
import { VsrgCanvasCache } from "./VsrgComposerCache"
import { VsrgKeysRenderer } from "./VsrgKeysRenderer"
import { VsrgScrollableTrackRenderer } from "./VsrgScrollableTrackRenderer"
import { VsrgTimelineRenderer } from "./VsrgTimelineRenderer"
import { getNearestTo } from "$lib/Utilities"
import { globalConfigStore } from "$stores/GlobalConfig"


export type VsrgCanvasSizes = {
    el: DOMRect
    rawWidth: number
    rawHeight: number
    width: number
    height: number
    snapPointWidth: number
    keyHeight: number
    keyWidth: number
    scaling: number
    timelineSize: number
}
export type VsrgCanvasColors = {
    background_plain: [string, number]
    background: [string, number]
    background_10: [string, number]
    secondary: [string, number]
    lineColor: [string, number]
    lineColor_10: [string, number]
    accent: [string, number]
}
interface VsrgCanvasProps {
    isHorizontal: boolean
    vsrg: VsrgSong
    isPlaying: boolean
    snapPoint: number
    scrollSnap: boolean
    snapPoints: number[]
    selectedHitObject: VsrgHitObject | null
    audioSong: RecordedSong | null
    scaling: number
    maxFps: number
    renderableNotes: RecordedNote[]
    tempoChanger: number
    onKeyDown: (key: number) => void
    onKeyUp: (key: number) => void
    onAddTime: () => void
    onRemoveTime: () => void
    onTimestampChange: (timestamp: number) => void
    onSnapPointSelect: (timestamp: number, key: number, clickType?: ClickType) => void
    dragHitObject: (timestamp: number, key?: number) => void
    releaseHitObject: () => void
    selectHitObject: (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => void
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
    draggedHitObject: VsrgHitObject | null
}

export class VsrgComposerCanvas extends Component<VsrgCanvasProps, VsrgCanvasState>{
    wrapperRef = createRef<HTMLDivElement>()
    stageRef = createRef<any>()
    toDispose: (() => void)[] = []
    throttledEventLoop: ThrottledEventLoop = new ThrottledEventLoop(() => { }, 48)
    cumulativeScroll = 0
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
                accent: ['#ffffff', 0xffffff],
            },
            timestamp: 0,
            sizes: {
                el: { ...DEFAULT_DOM_RECT },
                rawWidth: 0,
                rawHeight: 0,
                width: 0,
                height: 0,
                snapPointWidth: 0,
                keyHeight: 0,
                keyWidth: 0,
                timelineSize: 0,
                scaling: 0,
            },
            draggedHitObject: null,
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
        this.toDispose.push(() => vsrgComposerStore.removeEventListener("ALL", { id: "vsrg-canvas-color-change" }))
        this.calculateSizes()
        this.throttledEventLoop.setCallback(this.handleTick)
        this.throttledEventLoop.changeMaxFps(this.props.maxFps)
        this.throttledEventLoop.start()
        window.addEventListener('blur', this.handleBlur)
        this.state.cache?.destroy()
        this.toDispose.push(() => window.removeEventListener('blur', this.handleBlur))        
        this.handleThemeChange(ThemeProvider)
    }
    componentWillUnmount() {
        this.toDispose.forEach(d => d())
        this.state.cache?.destroy()
        this.throttledEventLoop.stop()
    }
    handleEvent = (event: VsrgComposerEvents, data?: any) => {
        if (event === 'colorChange') this.generateCache()
        if (event === 'updateKeys') this.calculateSizes()
        if (event === 'updateOrientation') this.calculateSizes()
        if (event === 'snapPointChange') this.calculateSizes()
        if (event === 'tracksChange') this.generateCache()
        if (event === 'songLoad') this.calculateSizes()
        if (event === 'scaleChange') this.calculateSizes()
        if (event === 'maxFpsChange') this.throttledEventLoop.changeMaxFps(this.props.maxFps)
        if (event === 'timestampChange') this.setTimestamp(data as number)
    }
    handleTick = (elapsed: number, sinceLast: number) => {
        if (this.props.isPlaying) {
            const timestamp = this.state.timestamp + sinceLast * this.props.tempoChanger
            this.setTimestamp(timestamp)
        }
    }
    handleBlur = () => {
        this.setState({ isPressing: false })
    }
    calculateSizes = () => {
        const { wrapperRef } = this
        if (!wrapperRef.current) return console.warn("no wrapper")
        const wrapperSizes = wrapperRef.current.getBoundingClientRect()
        const { scaling } = this.props
        const timelineSize = isMobile() ? 20 : 40
        const height = wrapperSizes.height - timelineSize
        const sizes: VsrgCanvasSizes = {
            el: wrapperSizes,
            rawWidth: wrapperSizes.width,
            rawHeight: wrapperSizes.height,
            width: wrapperSizes.width,
            height: height,
            keyHeight: height / DEFAULT_VSRG_KEYS_MAP[this.props.vsrg.keys].length,
            keyWidth: wrapperSizes.width / DEFAULT_VSRG_KEYS_MAP[this.props.vsrg.keys].length,
            snapPointWidth: (60000 / this.props.vsrg.bpm) / this.props.snapPoint * scaling / 100,
            scaling: scaling / 100,
            timelineSize
        }
        const canvas = wrapperRef.current.querySelector('canvas')
        if (canvas) {
            canvas.style.width = `${sizes.width}px`
            canvas.style.height = `${sizes.height + timelineSize}px`
        }
        this.setState({ sizes }, this.generateCache)
    }
    handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        if (this.props.scrollSnap) {
            this.cumulativeScroll += e.deltaY
            if (Math.abs(this.cumulativeScroll) < 100) return
            const { snapPoints } = this.props
            const nearestSnapPoint = snapPoints.findIndex(s => s > this.state.timestamp)
            const index = (nearestSnapPoint < 0 ? snapPoints.length : nearestSnapPoint) - 1 + (this.cumulativeScroll < 0 ? -1 : 1)
            this.cumulativeScroll = 0
            if (index < 0 || index >= snapPoints.length) return
            const nextTimestamp = snapPoints[index]
            return this.setTimestamp(nextTimestamp)
        }
        const max = Math.max(0, this.state.timestamp + e.deltaY / 1.2)
        const min = Math.min(max, this.props.vsrg.duration)
        this.setState({
            timestamp: min
        }, () => {
            const { draggedHitObject, timestamp } = this.state
            this.props.onTimestampChange(this.state.timestamp)
            if (!draggedHitObject || timestamp <= 0) return
            this.props.dragHitObject(draggedHitObject.timestamp + e.deltaY / 1.2)
        })
    }
    setIsDragging = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const { sizes } = this.state
        if ((e.clientY - sizes.el.top) > sizes.timelineSize) {
            this.setState({
                isPressing: true,
                previousPosition: this.props.isHorizontal ? e.clientX : -e.clientY
            })
        }
    }
    setIsNotDragging = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!this.state.isPressing) return
        const draggedHitObject = this.state.draggedHitObject
        this.setState({ isPressing: false, totalMovement: 0, draggedHitObject: null }, () => {
            //dumbass idk how to make otherwise
            if (draggedHitObject) this.props.releaseHitObject()
            setTimeout(() => this.setState({ preventClick: false }), 200)
            if (this.props.scrollSnap) {
                const { snapPoints } = this.props
                const index = snapPoints.findIndex(s => s > this.state.timestamp)
                if (!index || index < 0) return
                const next = snapPoints[index]
                const previous = snapPoints[index - 1]
                if (next === undefined || previous === undefined) return
                const timestamp = getNearestTo(this.state.timestamp, previous, next)
                this.setTimestamp(timestamp)
            }
        })
    }
    handleDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!this.state.isPressing) return
        const { previousPosition, draggedHitObject, sizes, timestamp } = this.state
        const { isHorizontal, vsrg } = this.props
        const deltaOrientation = isHorizontal ? e.clientX : -e.clientY
        const keyPosition = isHorizontal ? e.clientY - sizes.el.top - sizes.timelineSize : e.clientX - sizes.el.left
        const hoveredPosition = Math.floor(keyPosition / (isHorizontal ? sizes.keyHeight : sizes.keyWidth))
        const delta = (previousPosition - deltaOrientation) / sizes.scaling
        const newTotalMovement = this.state.totalMovement + Math.abs(delta)
        if (draggedHitObject !== null) {
            const position = draggedHitObject.timestamp - delta
            return this.setState({ previousPosition: deltaOrientation },
                () => this.props.dragHitObject(Math.max(0, position), hoveredPosition)
            )
        }
        const max = Math.max(0, timestamp + delta)
        const min = Math.min(max, vsrg.duration)
        this.setState({
            previousPosition: deltaOrientation,
            preventClick: newTotalMovement > 50,
            totalMovement: newTotalMovement,
            timestamp: min
        }, () => this.props.onTimestampChange(this.state.timestamp))
    }
    generateCache = () => {
        const { sizes, canvasColors, cache } = this.state
        const trackColors = this.props.vsrg.tracks.map(t => t.color)
        if (!this.stageRef.current) return
        this.stageRef.current.app.renderer.background.color = canvasColors.background[0]
        const newCache = new VsrgCanvasCache({
            app: this.stageRef.current.app as Application,
            sizes,
            colors: canvasColors,
            trackColors,
            isHorizontal: this.props.isHorizontal,
            playbarOffset: globalConfigStore.get().PLAY_BAR_OFFSET
        })
        this.setState({ cache: newCache }, () => {
            //TODO not sure why pixi is still using old textures
            setTimeout(() => {
                cache?.destroy()
            }, 500)
        })
    }
    selectHitObject = (hitObject: VsrgHitObject, trackIndex: number, clickType: number) => {
        if (clickType !== 2) this.setState({ draggedHitObject: hitObject })
        this.props.selectHitObject(hitObject, trackIndex, clickType)
    }
    setTimestamp = (timestamp: number) => {
        this.setState({ timestamp })
        this.props.onTimestampChange(timestamp)
    }
    handleThemeChange = (theme: Theme) => {
        const bg_plain = theme.get('primary')
        const bg_line = theme.getText('primary')
        const bg_line_10 = bg_line.darken(0.5).desaturate(1)
        const bg = bg_plain.darken(0.15)
        const bg_10 = bg.darken(0.1)
        const secondary = theme.get('secondary')
        const accent = theme.get('accent')
        this.setState({
            canvasColors: {
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

    render() {
        const { canvasColors, sizes, cache, timestamp, preventClick } = this.state
        const { vsrg, isHorizontal, audioSong, snapPoint, snapPoints, selectedHitObject } = this.props
        return <div
            className="vsrg-top-canvas-wrapper"
            ref={this.wrapperRef}
        >
            {this.wrapperRef.current &&
                <Stage
                    onMount={this.calculateSizes}
                    ref={this.stageRef}
                    raf={false}
                    width={sizes.rawWidth}
                    height={sizes.rawHeight}
                    onWheel={this.handleWheel}
                    onPointerDown={this.setIsDragging}
                    onPointerUp={this.setIsNotDragging}
                    onPointerLeave={this.setIsNotDragging}
                    onPointerMove={this.handleDrag}
                    onContextMenu={(e) => e.preventDefault()}
                    options={{
                        backgroundColor: canvasColors.background_plain[1],
                        autoDensity: false,
                        resolution: window?.devicePixelRatio || 1,
                    }}
                >
                    {cache &&
                        <VsrgScrollableTrackRenderer
                            vsrg={vsrg}
                            cache={cache}
                            selectedHitObject={selectedHitObject}
                            snapPoint={snapPoint}
                            snapPoints={snapPoints}
                            timestamp={timestamp}
                            preventClick={preventClick}
                            sizes={sizes}
                            colors={canvasColors}
                            isHorizontal={isHorizontal}
                            onAddTime={this.props.onAddTime}
                            onRemoveTime={this.props.onRemoveTime}
                            selectHitObject={this.selectHitObject}
                            onSnapPointSelect={this.props.onSnapPointSelect}
                        />
                    }

                    <VsrgKeysRenderer
                        isHorizontal={isHorizontal}
                        keys={DEFAULT_VSRG_KEYS_MAP[vsrg.keys]}
                        sizes={sizes}
                        colors={canvasColors}
                        onKeyDown={this.props.onKeyDown}
                        onKeyUp={this.props.onKeyUp}
                    />
                    {cache &&
                        <VsrgTimelineRenderer
                            hidden={false}
                            notes={this.props.renderableNotes}
                            cache={cache}
                            timestamp={timestamp}
                            onTimelineClick={this.setTimestamp}
                            isHorizontal={isHorizontal}
                            song={vsrg}
                            audioSong={audioSong}
                            sizes={sizes}
                            colors={canvasColors}
                        />
                    }

                </Stage>
            }
        </div>
    }
}