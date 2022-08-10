import { Container, Sprite } from "@inlet/react-pixi";
import { PIXI_CENTER_X_END_Y } from "appConfig";
import { VsrgHitObject } from "lib/Songs/VsrgSong";
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



export function VsrgHitObjectsRenderer({ timestamp, renderableHitObjects, cache, sizes, offset }: VsrgHitObjectsRendererProps) {
    const scale = sizes.scaling
    const halfWidth = sizes.hitObjectSize / 2
    return <>
        <Container
            x={0}
            y={timestamp * scale + sizes.height - offset}
        >
            {renderableHitObjects.map(renderableHitObject => {
                const hitObject = renderableHitObject.hitObject
                const x = hitObject.index * sizes.keyWidth + sizes.keyWidth / 2
                const y = -(hitObject.timestamp * scale)
                if (hitObject.isHeld) {
                    return <Fragment key={hitObject.renderId}>
                        <Sprite
                            texture={cache.getHeldTrailCache(renderableHitObject.color)}
                            anchor={PIXI_CENTER_X_END_Y}
                            width={cache.textures.sizes.trail}
                            height={hitObject.holdDuration * scale}
                            x={x}
                            y={y - halfWidth}
                        />
                        <Sprite
                            texture={cache.getHeldHitObjectCache(renderableHitObject.color)}
                            anchor={0.5}
                            angle={45}
                            x={x}
                            y={y - halfWidth}
                        />
                        <Sprite
                            texture={cache.getHeldHitObjectCache(renderableHitObject.color)}
                            anchor={PIXI_CENTER_X_END_Y}
                            x={x}
                            y={y - hitObject.holdDuration * scale} 
                        />

                    </Fragment>
                } else {
                    return <Sprite
                        texture={cache.getHitObjectCache(renderableHitObject.color)}
                        key={renderableHitObject.hitObject.renderId}
                        y={y}
                        anchor={PIXI_CENTER_X_END_Y}
                        x={x}
                    />
                }
            })}
        </Container>
    </>
}