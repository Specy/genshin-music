import { Container, Graphics } from "@inlet/react-pixi";
import { VsrgTrack } from "lib/Songs/VsrgSong";
import { VsrgCanvasColors, VsrgCanvasSizes } from "./VsrgCanvas";
import { VsrgTrackRenderer } from "./VsrgTrackRenderer";


interface VsrgScrollableTrackRendererProps {
    tracks: VsrgTrack[]
    sizes: VsrgCanvasSizes
    keys: number
    bpm: number
    colors: VsrgCanvasColors
    snapPoint: number
    snapPoints: number[]
    timestamp: number
    onHitObjectAdded: (timestamp: number) => void
}
export function VsrgScrollableTrackRenderer({ tracks, keys, sizes, bpm, snapPoint, timestamp, snapPoints, colors }: VsrgScrollableTrackRendererProps) {
    return <Container
        height={sizes.height}
        x={timestamp}
        width={sizes.width - 60}
    >
        {snapPoints.map((sp, i) =>
            <Graphics
                key={sp}
                x={sp}
                draw={g => {
                    g.clear()
                    i % snapPoint
                        ? g.lineStyle(2, colors.lineColor[1])
                        : g.lineStyle(4, colors.secondary[1])
                    g.moveTo(0, 0)
                    g.lineTo(0, sizes.height)
                }}
            />
        )}
        {tracks.map((track, index) =>
            <VsrgTrackRenderer
                key={index}
                track={track}
                keys={keys}
                sizes={sizes}
            />
        )}
    </Container>

}