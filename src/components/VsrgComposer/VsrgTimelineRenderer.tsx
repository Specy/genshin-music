import { Container, Sprite } from "@pixi/react";
import { PIXI_VERTICAL_ALIGN } from "$/Config";
import { RecordedSong } from "$lib/Songs/RecordedSong";
import { RecordedNote } from "$lib/Songs/SongClasses";
import { VsrgSong } from "$lib/Songs/VsrgSong";
import { clamp } from "$lib/Utilities";
import { Rectangle } from "pixi.js";
import { useCallback, useEffect, useState } from "react";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgComposerCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";
import { VsrgTimelineBreakpointsRenderer } from "./VsrgTimelineBreakpointsRenderer";
import { useDefaultConfig } from "$/lib/Hooks/useConfig";



interface VsrgTimelineRendererProps {
    cache: VsrgCanvasCache
    audioSong: RecordedSong | null
    timestamp: number
    isHorizontal: boolean
    song: VsrgSong
    sizes: VsrgCanvasSizes
    colors: VsrgCanvasColors
    hidden: boolean
    notes: RecordedNote[]
    onTimelineClick: (timestamp: number) => void
}
const defaultHitbox = new Rectangle(0, 0, 0, 0)
export function VsrgTimelineRenderer({ sizes, timestamp, song, cache, hidden, notes, onTimelineClick }: VsrgTimelineRendererProps) {
    const { PLAY_BAR_OFFSET }= useDefaultConfig()
    
    const [hitbox, setHitbox] = useState(defaultHitbox)
    const [isClicking, setIsClicking] = useState(false)
    const lowerBound = timestamp - (PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling
    const upperBound = timestamp + (sizes.width - PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling  
    const setNotClicking = useCallback(() => setIsClicking(false), [])
    useEffect(() => {
        setHitbox(new Rectangle(0, 0, sizes.width, sizes.timelineSize))
    }, [sizes])
    useEffect(() => {
        function handleBlur() {
            setIsClicking(false)
        }
        window.addEventListener('blur', handleBlur)
        return () => window.removeEventListener('blur', handleBlur)
    }, [])

    const handleEvent = useCallback((event: any, override?: boolean) => { //TODO migrate to pixi 7
        if (!isClicking && override !== true) return
        const x = event.data.global.x
        const time = x / sizes.width * song.duration
        onTimelineClick(clamp(time, 0, song.duration))
    }, [sizes, song.duration, onTimelineClick, isClicking])
    const setClicking = useCallback((e: any) => { //TODO migrate to pixi 7
        setIsClicking(true)
        handleEvent(e, true)
    }, [handleEvent])
    if (hidden) return null
    const relativeTimestampPosition = timestamp / song.duration
    return <>
        <Container
            x={0}
            y={0}
            interactive={true}
            pointermove={handleEvent}
            pointerdown={setClicking}
            pointerup={setNotClicking}
            pointerupoutside={setNotClicking}
            hitArea={hitbox}
        >
            <Sprite
                x={0}
                y={0}
                width={sizes.width}
                texture={cache.textures.timeline.square!}
            />
            <Container
                x={-timestamp * sizes.scaling + PLAY_BAR_OFFSET}
                y={0}
            >
                {notes.map((note, i) => {
                    if (note.time < lowerBound || note.time > upperBound) return null
                    return <Sprite
                        key={i}
                        x={note.time * sizes.scaling}
                        anchor={PIXI_VERTICAL_ALIGN}
                        texture={cache.textures.timeline.note!}
                    />
                })}
            </Container>
            <VsrgTimelineBreakpointsRenderer 
                breakpoints={song.breakpoints}
                cache={cache}
                sizes={sizes}
                duration={song.duration}
            />
            <Sprite 
                x={PLAY_BAR_OFFSET - 2}
                y={0}
                texture={cache.textures.timeline.currentTime!}
            />
            <Sprite
                y={0}
                x={relativeTimestampPosition * sizes.width}
                texture={cache.textures.timeline.thumb!}
            />

        </Container>
    </>
}