import { Sprite } from "@inlet/react-pixi";
import { VsrgTrack } from "lib/Songs/VsrgSong";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { VsrgCanvasCache } from "./VsrgComposerCache";

interface VsrgTrackRendererProps{
    track: VsrgTrack
    keys: number
    sizes: VsrgCanvasSizes
    cache: VsrgCanvasCache
    colors: VsrgCanvasColors
}


export function VsrgTrackRenderer({track, sizes, keys, cache, colors}: VsrgTrackRendererProps){
    const positionSize = sizes.height / keys
    return <>
        {track.hitObjects.map(hitObject => {
            return <Sprite
            key={hitObject.timestamp + hitObject.index}
            texture={cache.getHitObjectCache(track.color)}
            anchor={0.5}
            x={hitObject.timestamp}
            y={positionSize * hitObject.index + positionSize / 2}
          />
        })}
    </>
}