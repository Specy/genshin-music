import {memo} from "react";
import {Texture} from "pixi.js";

interface ComposerBreakpointsRendererProps {
    breakpoints: number[];
    texture: Texture;
    width: number;
    columns: number
}

export const ComposerBreakpointsRenderer = memo(function ComposerBreakpointsRenderer({
                                                                                         breakpoints,
                                                                                         texture,
                                                                                         columns,
                                                                                         width
                                                                                     }: ComposerBreakpointsRendererProps) {
    return breakpoints.map(breakpoint =>
        <pixiSprite
            texture={texture}
            key={breakpoint}
            interactive={false}
            anchor={{x: 0.5, y: 0}}
            x={(width / (columns - 1)) * breakpoint}
        >
        </pixiSprite>
    )
}, (p, n) => {
    return p.breakpoints === n.breakpoints && p.texture === n.texture && p.width === n.width && p.columns === n.columns
})