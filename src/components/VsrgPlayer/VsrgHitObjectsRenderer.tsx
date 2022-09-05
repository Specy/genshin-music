import { Container, Sprite } from "@inlet/react-pixi";
import { PIXI_CENTER_X_END_Y } from "$/appConfig";
import { VsrgHitObject } from "$lib/Songs/VsrgSong";
import { Fragment } from "react";
import { VsrgPlayerCache } from "./VsgPlayerCache";
import { HitObjectStatus, RenderableHitObject, VsrgPlayerCanvasSizes } from "./VsrgPlayerCanvas";


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
    /*
    const debugHitObject = new VsrgHitObject(0, 0)
    const debugRenderable = new RenderableHitObject(debugHitObject)
    */
    return <>
        <Container
            x={0}
            y={timestamp * scale + sizes.height - offset}
            sortableChildren={true}
        >
            {renderableHitObjects.map((renderableHitObject, i) => {
                const hitObject = renderableHitObject.hitObject
                const x = hitObject.index * sizes.keyWidth + sizes.keyWidth / 2
                const y = -(hitObject.timestamp * scale)
                if (
                    (renderableHitObject.status === HitObjectStatus.Hit ||
                        renderableHitObject.status === HitObjectStatus.Missed) &&
                    !hitObject.isHeld
                ) return null
                let min = renderableHitObject.hitObject.index
                let max = min
                for (const note of renderableHitObjects) {
                    if (note === renderableHitObject || 
                        note.status === HitObjectStatus.Missed ||
                        note.status === HitObjectStatus.Hit
                    ) continue
                    if (note.hitObject.timestamp === hitObject.timestamp) {
                        if (note.hitObject.index < min) min = note.hitObject.index
                        if (note.hitObject.index > max) max = note.hitObject.index
                    }
                }
                return <Fragment key={hitObject.renderId}>
                    {(min !== max) &&
                        <Sprite
                            texture={cache.getLinesCache(renderableHitObject.color)}
                            x={min * sizes.keyWidth + sizes.keyWidth / 2}
                            width={(max - min) * sizes.keyWidth}
                            zIndex={-1}
                            y={y - halfWidth}
                        />
                    }
                    {hitObject.isHeld
                        ? <>
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
                        </>
                        : <Sprite
                            texture={cache.getHitObjectCache(renderableHitObject.color)}
                            key={renderableHitObject.hitObject.renderId}
                            y={y}
                            anchor={PIXI_CENTER_X_END_Y}
                            x={x}
                        />
                    }
                </Fragment>
            })}
        </Container>
    </>
}