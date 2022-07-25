import { Container, Sprite, Text, } from "@inlet/react-pixi";
import { PLAY_BAR_OFFSET } from "appConfig";
import { VsrgHitObject, VsrgSong, VsrgTrack } from "lib/Songs/VsrgSong";
import { parseMouseClick } from "lib/Utilities";
import { ClickType } from "types/GeneralTypes"
import { InteractionEvent } from "pixi.js";

import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";
import { VsrgTrackRenderer } from "./VsrgTrackRenderer";
import { vsrgComposerStore } from "stores/VsrgComposerStore";


interface VsrgScrollableTrackRendererProps {
    vsrg: VsrgSong
    cache: VsrgCanvasCache
    sizes: VsrgCanvasSizes
    colors: VsrgCanvasColors
    snapPoint: number
    snapPoints: number[]
    timestamp: number
    preventClick: boolean
    isHorizontal: boolean
    selectedHitObject: VsrgHitObject | null
    onSnapPointSelect: (timestamp: number, key: number, clickType?: ClickType) => void
    selectHitObject: (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => void
}
export function VsrgScrollableTrackRenderer({vsrg,  sizes, snapPoint, timestamp, snapPoints, colors, cache, onSnapPointSelect, preventClick, isHorizontal, selectedHitObject, selectHitObject }: VsrgScrollableTrackRendererProps) {
    const scale = sizes.scaling
    const lowerBound = timestamp - cache.textures.snapPoints.size - PLAY_BAR_OFFSET / scale
    const upperBound = timestamp + (isHorizontal ? sizes.width : sizes.height) / scale
    const snapPointSize = cache.textures.snapPoints.size
    function handleSnapPointClick(event: InteractionEvent) {
        if (preventClick) return
        if (isHorizontal) {
            const y = event.data.global.y
            const x = event.target.x / scale
            onSnapPointSelect(x, Math.floor(y / sizes.keyHeight), parseMouseClick(event.data.button))
        } else {
            const y = Math.abs(Math.floor(event.target.y - sizes.height + snapPointSize) / scale)
            const x = event.data.global.x
            onSnapPointSelect(y, Math.floor(x / sizes.keyWidth), parseMouseClick(event.data.button))
        }
    }
    return <Container
        x={isHorizontal ? (-timestamp * scale + PLAY_BAR_OFFSET) : 0}
        y={isHorizontal ? 0 : (timestamp * scale - PLAY_BAR_OFFSET)}
        interactive={true}
        interactiveChildren={true}
    >
        {snapPoints.map((sp, i) => {
            if (lowerBound > sp || sp > upperBound) return null
            return <Sprite
                key={sp}
                interactive={true}
                pointertap={handleSnapPointClick}
                x={isHorizontal ? sp * scale : 0}
                y={isHorizontal ? 0 : -(sp * scale - sizes.height + snapPointSize)}
                width={isHorizontal ? snapPointSize : sizes.width}
                height={isHorizontal ? sizes.height : snapPointSize}
                texture={i % snapPoint
                    ? cache.textures.snapPoints.small!
                    : cache.textures.snapPoints.large!
                }
            />
        })}
        {(lowerBound < 0) &&
            <Sprite
                x={isHorizontal ? -PLAY_BAR_OFFSET : 0}
                y={isHorizontal ? 0 : sizes.height}
                texture={cache.textures.snapPoints.empty!}
            />
        }
        {vsrg.tracks.map((track, index) =>
            <VsrgTrackRenderer
                key={index}
                track={track}
                cache={cache}
                keys={vsrg.keys}
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


