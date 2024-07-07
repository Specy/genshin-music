import {SheetFrame} from "$cmp/pages/SheetVisualizer/SheetFrame"
import {useObservableObject} from "$lib/Hooks/useObservable"
import {useTheme} from "$lib/Hooks/useTheme"
import {memo} from "react"
import {playerControlsStore} from "$stores/PlayerControlsStore"
import {APP_NAME} from "$config"
import s from './VisualSheet.module.css'

const layoutType = APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC'


interface PlayerVisualSheetRendererProps {
    columns: number
}
function _PlayerVisualSheetRenderer({columns}: PlayerVisualSheetRendererProps) {
    const pagesState = useObservableObject(playerControlsStore.pagesState)
    const [theme] = useTheme()
    return <>
        {pagesState.pages.length > 0 &&
            <div
                className={s['player-chunks-page']}
                style={{gridTemplateColumns: `repeat(${columns}, 1fr)`}}
            >
                {pagesState.currentPage?.map((e, i) =>
                    <SheetFrame
                        key={i}
                        keyboardLayout={layoutType}
                        theme={theme}
                        selected={i === pagesState.currentChunkIndex}
                        chunk={e}
                        rows={3}
                        hasText={false}
                    />
                )}
            </div>
        }
    </>
}

export const PlayerVisualSheetRenderer = memo(
    _PlayerVisualSheetRenderer,
    (prev, next) => prev.columns === next.columns
)