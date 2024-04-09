import {memo} from "react";
import {Sprite} from "@pixi/react";
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
        <Sprite
            texture={texture}
            key={breakpoint}
            interactive={false}
            anchor={[0.5, 0]}
            x={(width / (columns - 1)) * breakpoint}
        >
        </Sprite>
    )
}, (p, n) => {
    return p.breakpoints === n.breakpoints && p.texture === n.texture && p.width === n.width && p.columns === n.columns
})