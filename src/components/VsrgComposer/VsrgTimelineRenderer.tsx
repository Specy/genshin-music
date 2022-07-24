import { Container, Graphics, Sprite } from "@inlet/react-pixi";
import { RecordedSong } from "lib/Songs/RecordedSong";
import { VsrgSong } from "lib/Songs/VsrgSong";
import { clamp } from "lib/Utilities";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";



interface VsrgTimelineRendererProps {
    cache: VsrgCanvasCache
    audioSong: RecordedSong | null
    timestamp: number
    isHorizontal: boolean
    song: VsrgSong
    sizes: VsrgCanvasSizes
    colors: VsrgCanvasColors
    hidden: boolean
}

export function VsrgTimelineRenderer({ sizes, colors, timestamp, song, cache , hidden}: VsrgTimelineRendererProps) {
    if(hidden) return null
    const thumbSize = clamp(sizes.width / song.duration * 100, 0, sizes.width)
    const relativeTimestampPosition = timestamp / song.duration
    return <>
        <Container
            x={0}
            y={0}
        >
            <Sprite
                x={0}
                y={0}
                texture={cache.textures.timeline.square!}
            />
            <Graphics
                x={relativeTimestampPosition * sizes.width}
                width={thumbSize}
                height={sizes.timelineSize}
                anchor={0.5}
                draw={g => {
                    g.clear()
                    g.lineStyle(2, colors.accent[1])
                    g.drawRoundedRect(0, 0, thumbSize, sizes.timelineSize, 4)
                }}
            />

        </Container>
    </>
}