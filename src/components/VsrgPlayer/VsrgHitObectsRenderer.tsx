import { Container, Sprite } from "@inlet/react-pixi";
import { VsrgPlayerCache } from "./VsgPlayerCache";
import { RenderableHitObject, VsrgPlayerCanvasSizes } from "./VsrgPlayerCanvas";


interface VsrgHitObjectsRendererProps {
    cache: VsrgPlayerCache
    renderableHitObjects: RenderableHitObject[]
    timestamp: number
    sizes: VsrgPlayerCanvasSizes
}



export function VsrgHitObjectsRenderer({ timestamp, renderableHitObjects, cache , sizes}: VsrgHitObjectsRendererProps) {

    return <>
        <Container
            x={0}
            y={timestamp}
        >
            {renderableHitObjects.map(renderableHitObject => {
                return <Sprite
                    texture={cache.getHitObjectCache(renderableHitObject.color)}
                    key={renderableHitObject.hitObject.renderId}
                    y={-renderableHitObject.hitObject.timestamp}
                    anchor={[0, 0.5]}
                    x={renderableHitObject.hitObject.index * sizes.keyWidth }
                />
            })}
        </Container>
    </>
}