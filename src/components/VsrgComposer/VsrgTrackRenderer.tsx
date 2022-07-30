import { Container, Sprite } from "@inlet/react-pixi";
import { PLAY_BAR_OFFSET } from "appConfig";
import { VsrgHitObject, VsrgTrack } from "lib/Songs/VsrgSong";
import { parseMouseClick } from "lib/Utilities";
import { ClickType } from "types/GeneralTypes"

import { Fragment } from "react";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgComposerCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";

interface VsrgTrackRendererProps {
    track: VsrgTrack
    trackIndex: number
    keys: number
    sizes: VsrgCanvasSizes
    cache: VsrgCanvasCache
    colors: VsrgCanvasColors
    isHorizontal: boolean
    selectedHitObject: VsrgHitObject | null
    timestamp: number
    selectHitObject: (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => void
}


export function VsrgTrackRenderer({ track, sizes, keys, cache, isHorizontal, selectedHitObject, selectHitObject, trackIndex, timestamp }: VsrgTrackRendererProps) {
    const scale = sizes.scaling
    const positionSizeHorizontal = sizes.height / keys
    const positionSizeVertical = sizes.width / keys
    const lowerBound = timestamp - PLAY_BAR_OFFSET / scale - cache.textures.sizes.hitObject
    const upperBound = timestamp + (isHorizontal ? sizes.width : sizes.height) / scale - PLAY_BAR_OFFSET + cache.textures.sizes.hitObject
    return <>
        {track.hitObjects.map(hitObject => {
            if(lowerBound > hitObject.timestamp + hitObject.holdDuration || hitObject.timestamp > upperBound) return null
            const x = isHorizontal
                ? hitObject.timestamp * scale
                : positionSizeVertical * hitObject.index + positionSizeVertical / 2
            const y = isHorizontal
                ? positionSizeHorizontal * hitObject.index + positionSizeHorizontal / 2
                : -(hitObject.timestamp * scale - sizes.height)
            return hitObject.isHeld
                ? <Container
                    interactive={true}
                    pointerdown={(e) => {
                        selectHitObject(hitObject, trackIndex, parseMouseClick(e.data.button))
                    }}
                    key={hitObject.renderId}
                >
                    {isHorizontal
                        ? <Sprite
                            texture={cache.getHeldTrailCache(track.color)}
                            anchor={[0, 0.5]}
                            height={cache.textures.sizes.trail}
                            width={hitObject.holdDuration * scale}
                            x={x}
                            y={y}
                        />
                        : <Sprite
                            texture={cache.getHeldTrailCache(track.color)}
                            anchor={[0.5, 1]}
                            width={cache.textures.sizes.trail}
                            height={hitObject.holdDuration * scale}
                            x={x}
                            y={y}
                        />
                    }
                    <Sprite
                        texture={cache.getHeldHitObjectCache(track.color)}
                        anchor={0.5}
                        x={x}
                        angle={45}
                        y={y}
                    />
                    <Sprite
                        texture={cache.getHeldHitObjectCache(track.color)}
                        anchor={0.5}
                        x={isHorizontal ? (hitObject.timestamp + hitObject.holdDuration) * scale : x}
                        y={isHorizontal ? y : (y - hitObject.holdDuration * scale)}
                    />
                    {hitObject === selectedHitObject &&
                        <Sprite
                            texture={cache.getSelectionRingsCache(track.color)}
                            anchor={0.5}
                            x={x}
                            y={y}
                        />
                    }
                </Container>
                : <Fragment key={hitObject.renderId}>
                    {hitObject === selectedHitObject &&
                        <Sprite
                            texture={cache.getSelectionRingsCache(track.color)}
                            anchor={0.5}
                            x={x}
                            y={y}
                        />
                    }
                    <Sprite
                        texture={cache.getHitObjectCache(track.color)}
                        interactive={true}
                        pointerdown={(e) => {
                            selectHitObject(hitObject, trackIndex, parseMouseClick(e.data.button))
                        }}
                        anchor={0.5}
                        x={x}
                        y={y}
                    />

                </Fragment>

        })}
    </>
}