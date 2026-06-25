import {memo} from "react";
import {VsrgCanvasSizes} from "./VsrgComposerCanvas";
import {VsrgCanvasCache} from "./VsrgComposerCache";

interface VsrgTimelineBreakpointsRendererProps {
    cache: VsrgCanvasCache
    breakpoints: number[]
    sizes: VsrgCanvasSizes
    duration: number
}


//TODO add cache as bitmap
function _VsrgTimelineBreakpointsRenderer({cache, breakpoints, sizes, duration}: VsrgTimelineBreakpointsRendererProps) {

    return <>
        <pixiContainer>
            {breakpoints.map(breakpoint =>
                <pixiSprite
                    key={breakpoint}
                    texture={cache.textures.timeline.breakpoint!}
                    x={breakpoint / duration * sizes.width}
                />
            )}
        </pixiContainer>
    </>
}

export const VsrgTimelineBreakpointsRenderer = memo<VsrgTimelineBreakpointsRendererProps>(_VsrgTimelineBreakpointsRenderer,
    (p, n) =>
        p.breakpoints === n.breakpoints && p.cache === n.cache && p.sizes === n.sizes && p.duration === n.duration
)