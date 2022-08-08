import { Container, Sprite, Text, } from "@inlet/react-pixi";
import { PLAY_BAR_OFFSET } from "appConfig";
import { VsrgHitObject, VsrgSong } from "lib/Songs/VsrgSong";
import { parseMouseClick } from "lib/Utilities";
import { ClickType } from "types/GeneralTypes"
import { InteractionEvent, TextStyle } from "pixi.js";

import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgComposerCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";
import { VsrgTrackRenderer } from "./VsrgTrackRenderer";
import useFontFaceObserver from "use-font-face-observer";
import { useEffect, useState } from "react";
import { defaultVsrgTextStyle } from "./VsrgKeysRenderer";


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
    onAddTime: () => void
    onRemoveTime: () => void
}

const fontFace = [{
    family: 'Bonobo'
}]
export function VsrgScrollableTrackRenderer({ vsrg, sizes, snapPoint, timestamp, snapPoints, colors, cache, onSnapPointSelect, preventClick, isHorizontal, selectedHitObject, selectHitObject, onAddTime, onRemoveTime }: VsrgScrollableTrackRendererProps) {
    const scale = sizes.scaling
    const lowerBound = timestamp - (PLAY_BAR_OFFSET + cache.textures.snapPoints.size) / scale
    const upperBound = timestamp + ((isHorizontal ? sizes.width : sizes.height) - PLAY_BAR_OFFSET) / scale 
    const snapPointSize = cache.textures.snapPoints.size
    const [textStyle, setTextStyle] = useState(defaultVsrgTextStyle)
    const isFontLoaded = useFontFaceObserver(fontFace)
    useEffect(() => {
        setTextStyle(new TextStyle({
            fontFamily: isFontLoaded ? '"Bonobo"' : '"Source Sans Pro", Helvetica, sans-serif',
            fontSize: isFontLoaded ? 25 : 30,
            fill: colors.lineColor[1],
        }))
    }, [isFontLoaded, colors.lineColor])
    function handleSnapPointClick(event: InteractionEvent) {
        if (preventClick) return
        if (isHorizontal) {
            const y = event.data.global.y - sizes.timelineSize
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
        y={isHorizontal ? sizes.timelineSize : (timestamp * scale - PLAY_BAR_OFFSET)}
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
        {timestamp >= vsrg.duration - (isHorizontal ? sizes.width : sizes.height) / scale &&
            <>
                <Container
                    pointertap={onAddTime}
                    interactive={true}
                    x={isHorizontal ? vsrg.duration * scale : 0}
                    anchor={0.5}
                    y={isHorizontal ? 0 : -(vsrg.duration * scale - sizes.height + cache.textures.buttons.height)}
                >
                    <Sprite
                        texture={cache.textures.buttons.time!}
                    />
                    <Text
                        x={cache.textures.buttons.width / 2}
                        anchor={0.5}
                        y={cache.textures.buttons.height / 2}
                        text="Click to add time"
                        style={textStyle}
                    />
                </Container>
                <Container
                    pointertap={onRemoveTime}
                    interactive={true}
                    x={isHorizontal ? vsrg.duration * scale : sizes.width / 2}
                    anchor={0.5}
                    y={isHorizontal ? sizes.height / 2 : -(vsrg.duration * scale - sizes.height + cache.textures.buttons.height)}
                >
                    <Sprite
                        texture={cache.textures.buttons.time!}
                    />
                    <Text
                        x={cache.textures.buttons.width / 2}
                        anchor={0.5}
                        y={cache.textures.buttons.height / 2}
                        text="Click to remove time"
                        style={textStyle}
                    />
                </Container>
            </>
        }
    </Container>
}


