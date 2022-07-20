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
}


export function VsrgTrackRenderer({ track, sizes, keys, cache }: VsrgTrackRendererProps) {
    const positionSize = sizes.height / keys
    return <>
        {track.hitObjects.map(hitObject => {
            const y = positionSize * hitObject.index + positionSize / 2
            return hitObject.isHeld
                ? <Fragment key={hitObject.timestamp + hitObject.index}>
                    <Sprite
                        texture={cache.getHeldTrailCache(track.color)}
                        anchor={[0, 0.5]}
                        width={hitObject.holdDuration}
                        x={hitObject.timestamp}
                        y={y}
                    /> 
                    <Sprite
                        texture={cache.getHeldHitObjectCache(track.color)}
                        anchor={0.5}
                        x={hitObject.timestamp}
                        angle={45}
                        y={y}
                    />
                    <Sprite
                        texture={cache.getHeldHitObjectCache(track.color)}
                        anchor={0.5}
                        x={hitObject.timestamp + hitObject.holdDuration}
                        y={y}
                    />

                </Fragment>
                : <Sprite
                    key={hitObject.timestamp + hitObject.index}
                    texture={cache.getHitObjectCache(track.color)}
                    anchor={0.5}
                    x={hitObject.timestamp}
                    y={y}
                />

        })}
    </>
}