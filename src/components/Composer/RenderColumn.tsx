import { COMPOSER_NOTE_POSITIONS, NOTES_PER_COLUMN } from "appConfig"
import type { ColumnNote } from 'lib/SongClasses';
import type { Texture } from 'pixi.js';
import { Container, Sprite } from '@inlet/react-pixi';
import { ComposerCacheData } from "./TextureCache";

interface RenderColumnProps {
    notes: ColumnNote[]
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
    onClick: (index: number) => void
}

export function RenderColumn({ notes, index, sizes, onClick, cache, backgroundCache, isBreakpoint, isSelected, isToolsSelected }: RenderColumnProps) {
    return <Container
        pointertap={() => onClick(index)}
        interactive={true}
        x={sizes.width * index}
    >
        <Sprite
            texture={backgroundCache}
            interactiveChildren={false}
        >
            {(isSelected || isToolsSelected) &&
                <Sprite
                    texture={isToolsSelected && !isSelected ? cache.standard[3] : cache.standard[2]}
                    alpha={isToolsSelected && !isSelected ? 0.4 : 0.8}
                    zIndex={1}
                />
            }
            {isBreakpoint &&
                <Sprite
                    texture={cache.breakpoints[1]}
                />
            }
        </Sprite>

        {notes.map((note) => {
            return <Sprite
                key={note.index}
                texture={cache.notes[note.layer.legacyString]}
                y={COMPOSER_NOTE_POSITIONS[note.index] * sizes.height / NOTES_PER_COLUMN}
            >
            </Sprite>
        })}

    </Container>
}




export function isColumnVisible(pos: number, currentPos: number, numberOfColumnsPerCanvas: number) {
    const threshold = numberOfColumnsPerCanvas / 2 + 2
    return (currentPos - threshold) < pos && pos < (currentPos + threshold)
}