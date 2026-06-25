import {COMPOSER_NOTE_POSITIONS, NOTES_PER_COLUMN} from "$config"
import type {ColumnNote, InstrumentData} from '$lib/Songs/SongClasses';
import type {Texture} from 'pixi.js';
import {ComposerCacheData} from "./ComposerCache";

interface RenderColumnProps {
    notes: ColumnNote[]
    currentLayer: number
    instruments: InstrumentData[]
    index: number
    sizes: {
        width: number
        height: number
    }
    cache: ComposerCacheData
    backgroundCache: Texture
    isBreakpoint: boolean
    isSelected: boolean
    isToolsSelected: boolean
}

export function RenderColumn({
                                 notes,
                                 index,
                                 sizes,
                                 cache,
                                 instruments,
                                 backgroundCache,
                                 isBreakpoint,
                                 isSelected,
                                 isToolsSelected,
                                 currentLayer
                             }: RenderColumnProps) {


    return <pixiContainer
        eventMode="static"
        x={sizes.width * index}
    >
        <pixiSprite
            texture={backgroundCache}
        >
            {(isSelected || isToolsSelected) &&
                <pixiSprite
                    texture={isToolsSelected && !isSelected ? cache.standard[3] : cache.standard[2]}
                    alpha={isToolsSelected && !isSelected ? 0.4 : 0.8}
                    zIndex={1}
                />
            }
            {isBreakpoint &&
                <pixiSprite
                    texture={cache.breakpoints[1]}
                />
            }
        </pixiSprite>

        {notes.map((note) => {
            const layerStatus = note.layer.toLayerStatus(currentLayer, instruments)
            if (layerStatus === 0) return null
            return <pixiSprite
                key={note.index}
                texture={
                    cache.notes[layerStatus]
                }
                y={COMPOSER_NOTE_POSITIONS[note.index] * sizes.height / NOTES_PER_COLUMN}
            >
            </pixiSprite>
        })}
    </pixiContainer>
}

export function isColumnVisible(pos: number, currentPos: number, numberOfColumnsPerCanvas: number) {
    const threshold = numberOfColumnsPerCanvas / 2 + 2
    return (currentPos - threshold) < pos && pos < (currentPos + threshold)
}