import { Sprite } from "@inlet/react-pixi";
import { VsrgTrack } from "lib/Songs/VsrgSong";
import { VsrgCanvasSizes } from "./VsrgCanvas";

interface VsrgTrackRendererProps{
    track: VsrgTrack
    keys: number
    sizes: VsrgCanvasSizes
}


export function VsrgTrackRenderer({track, sizes, keys}: VsrgTrackRendererProps){

    return <>
        {track.hitObjects.map((hitObject) => {
            return <Sprite
            image="https://s3-us-west-2.amazonaws.com/s.cdpn.io/693612/coin.png"
            scale={{ x: 0.5, y: 0.5 }}
            anchor={0.5}
            x={hitObject.timestamp}
            y={sizes.height / keys * hitObject.index}
          />
        })}
    </>
}