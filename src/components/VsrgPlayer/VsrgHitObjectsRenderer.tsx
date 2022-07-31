import { Container, Sprite } from "@inlet/react-pixi";
import { Fragment } from "react";
import { VsrgPlayerCache } from "./VsgPlayerCache";
import { RenderableHitObject, VsrgPlayerCanvasSizes } from "./VsrgPlayerCanvas";


interface VsrgHitObjectsRendererProps {
    cache: VsrgPlayerCache
    offset: number
    renderableHitObjects: RenderableHitObject[]
    timestamp: number
    sizes: VsrgPlayerCanvasSizes
}



export function VsrgHitObjectsRenderer({ timestamp, renderableHitObjects, cache, sizes, offset}: VsrgHitObjectsRendererProps) {
    const scale = sizes.scaling
    return <>
        <Container
            x={0}
            y={timestamp * scale + offset}
        >
            {renderableHitObjects.map(renderableHitObject => {
                const hitObject = renderableHitObject.hitObject
                const x = hitObject.index * sizes.keyWidth + sizes.keyWidth / 2
                const y = -(hitObject.timestamp * scale - sizes.height)
                if (hitObject.isHeld) {
                    return <Fragment key={hitObject.renderId}>
                        <Sprite
                            texture={cache.getHeldTrailCache(renderableHitObject.color)}
                            anchor={[0.5, 1]}
                            width={cache.textures.sizes.trail}
                            height={hitObject.holdDuration * scale}
                            x={x}
                            y={y}
                        />
                        <Sprite
                            texture={cache.getHeldHitObjectCache(renderableHitObject.color)}
                            anchor={0.5}
                            x={x}
                            angle={45}
                            y={y}
                        />
                        <Sprite
                            texture={cache.getHeldHitObjectCache(renderableHitObject.color)}
                            anchor={0.5}
                            x={x}
                            y={y - hitObject.holdDuration * scale}
                        />

                    </Fragment>
                } else {
                    return <Sprite
                        texture={cache.getHitObjectCache(renderableHitObject.color)}
                        key={renderableHitObject.hitObject.renderId}
                        y={y}
                        anchor={0.5}
                        x={x}
                    />
                }
            })}
        </Container>
    </>
}