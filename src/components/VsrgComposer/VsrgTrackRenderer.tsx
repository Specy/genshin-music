import { Sprite } from "@inlet/react-pixi";
import { VsrgTrack } from "lib/Songs/VsrgSong";
import { Fragment } from "react";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";

interface VsrgTrackRendererProps {
    track: VsrgTrack
    keys: number
    sizes: VsrgCanvasSizes
    cache: VsrgCanvasCache
    colors: VsrgCanvasColors
    isHorizontal: boolean
}


export function VsrgTrackRenderer({ track, sizes, keys, cache, isHorizontal }: VsrgTrackRendererProps) {
    const positionSizeHorizontal = sizes.height / keys
    const positionSizeVertical = sizes.width / keys
    return <>
        {track.hitObjects.map(hitObject => {
            const x = isHorizontal
                ? hitObject.timestamp
                : positionSizeVertical * hitObject.index + positionSizeVertical / 2
            const y = isHorizontal
                ? positionSizeHorizontal * hitObject.index + positionSizeHorizontal / 2
                : -(hitObject.timestamp - sizes.height)
            return hitObject.isHeld
                ? <Fragment key={hitObject.timestamp + hitObject.index}>
                    {isHorizontal
                        ? <Sprite
                            texture={cache.getHeldTrailCache(track.color)}
                            anchor={[0, 0.5]}
                            height={cache.textures.sizes.trail}
                            width={hitObject.holdDuration}
                            x={x}
                            y={y}
                        />
                        : <Sprite
                            texture={cache.getHeldTrailCache(track.color)}
                            anchor={[0.5, 1]}
                            width={cache.textures.sizes.trail}
                            height={hitObject.holdDuration}
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
                        x={isHorizontal ? hitObject.timestamp + hitObject.holdDuration : x}
                        y={isHorizontal ? y : y - hitObject.holdDuration}
                    />
                </Fragment>
                : <Sprite
                    key={hitObject.timestamp + hitObject.index}
                    texture={cache.getHitObjectCache(track.color)}
                    anchor={0.5}
                    x={x}
                    y={y}
                />

        })}
    </>
}