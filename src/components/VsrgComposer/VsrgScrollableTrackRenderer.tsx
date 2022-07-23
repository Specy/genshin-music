import { Container, Sprite } from "@inlet/react-pixi";
import { VsrgHitObject, VsrgTrack } from "lib/Songs/VsrgSong";
import { InteractionEvent } from "pixi.js";

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
    isHorizontal: boolean
    selectedHitObject: VsrgHitObject | null
    onSnapPointSelect: (timestamp: number, key: number, type?: 0 | 2) => void
    selectHitObject: (hitObject: VsrgHitObject, trackIndex:number, clickType: number) => void
}
export function VsrgScrollableTrackRenderer({ tracks, keys, sizes, bpm, snapPoint, timestamp, snapPoints, colors, cache, onSnapPointSelect, preventClick, isHorizontal, selectedHitObject, selectHitObject}: VsrgScrollableTrackRendererProps) {
    const lowerBound = timestamp - cache.textures.snapPoints.size
    const upperBound = timestamp + (isHorizontal ? sizes.width : sizes.height) + cache.textures.snapPoints.size
    function handleSnapPointClick(event: InteractionEvent){
        if (preventClick) return
        if (isHorizontal) {
            const y = event.data.global.y
            const x = event.target.x
            onSnapPointSelect(x, Math.floor(y / sizes.keyHeight), event.data.button as 0 | 2)
        } else {
            const y = Math.abs(Math.floor(event.target.y - sizes.height))
            const x = event.data.global.x
            onSnapPointSelect(y, Math.floor(x / sizes.keyWidth), event.data.button as 0 | 2)
        }
    }
    return <Container
        x={isHorizontal ? -timestamp + 120 : 0}
        y={isHorizontal ? 0 : timestamp - 120}
        interactive={true}
        interactiveChildren={true}
    >

        {snapPoints.map((sp, i) => {
            if(lowerBound > sp || sp > upperBound) return null
            return <Sprite
                interactive={true}
                pointertap={handleSnapPointClick}
                key={sp}
                x={isHorizontal ? sp : 0}
                y={isHorizontal ? 0 : -(sp - sizes.height)}
                width={isHorizontal ? cache.textures.snapPoints.size : sizes.width}
                height={isHorizontal ? sizes.height : cache.textures.snapPoints.size}
                texture={i % snapPoint
                    ? cache.textures.snapPoints.small!
                    : cache.textures.snapPoints.large!
                }
            />
        })}
        {tracks.map((track, index) =>
            <VsrgTrackRenderer
                key={index}
                track={track}
                cache={cache}
                keys={keys}
                colors={colors}
                sizes={sizes}
                timestamp={timestamp}
                trackIndex={index}
                selectHitObject={selectHitObject}
                selectedHitObject={selectedHitObject}
                isHorizontal={isHorizontal}
            />
        )}

    </Container>
}
