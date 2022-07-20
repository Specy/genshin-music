import { Container, Sprite } from "@inlet/react-pixi";
import { VsrgTrack } from "lib/Songs/VsrgSong";
import { InteractionEvent } from "pixi.js";
import { useCallback } from "react";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";
import { VsrgTrackRenderer } from "./VsrgTrackRenderer";


interface VsrgScrollableTrackRendererProps {
    tracks: VsrgTrack[]
    cache: VsrgCanvasCache
    sizes: VsrgCanvasSizes
    keys: number
    bpm: number
    colors: VsrgCanvasColors
    snapPoint: number
    snapPoints: number[]
    timestamp: number
    preventClick: boolean
    onSnapPointSelect: (timestamp: number, key: number, type?: 0 | 2) => void
}
export function VsrgScrollableTrackRenderer({ tracks, keys, sizes, bpm, snapPoint, timestamp, snapPoints, colors, cache, onSnapPointSelect, preventClick }: VsrgScrollableTrackRendererProps) {
    const handleSnapPointClick = useCallback((event: InteractionEvent) => {
        if (preventClick) return
        const y = event.data.global.y
        const x = event.target.x
        onSnapPointSelect(x, Math.floor(y / sizes.keyHeight), event.data.button as 0 | 2)
    }, [sizes.keyHeight, onSnapPointSelect, preventClick])
    return <Container
        height={sizes.height}
        x={timestamp}
        y={0}
        interactive={true}
        interactiveChildren={true}
    >

        {snapPoints.map((sp, i) =>
            <Sprite
                interactive={true}
                pointertap={handleSnapPointClick}
                key={sp}
                x={sp}
                y={0}
                width={cache.textures.snapPoints.width}
                height={sizes.height}
                texture={i % snapPoint
                    ? cache.textures.snapPoints.small!
                    : cache.textures.snapPoints.large!
                }
            />
        )}
        {tracks.map((track, index) =>
            <VsrgTrackRenderer
                key={index}
                track={track}
                cache={cache}
                keys={keys}
                colors={colors}
                sizes={sizes}
            />
        )}

    </Container>

}