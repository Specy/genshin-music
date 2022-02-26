import { useTheme } from "lib/hooks/useTheme";
import { useState } from "react"

interface SongMenuProps {
    songs: any[],
    SongComponent: any,
    componentProps: any,
    className?: string,
    style?: any
}
export function SongMenu({ songs, SongComponent, componentProps, className = '', style = {} }: SongMenuProps) {
    const [songType, setSongType] = useState('recorded')
    const [theme] = useTheme()

    const selectedColor = theme.layer('menu_background',0.32).desaturate(0.4)
    const unselectedColor = theme.layer('menu_background',0.35).lighten(0.2)
    return <div className={`${className}`} style={style}>
        <div className="tab-selector-wrapper">
            <button
                className={'tab-selector'}
                style={{
                    backgroundColor: songType === 'recorded' ? selectedColor.hex() : unselectedColor.hex()
                }}
                onClick={() => setSongType("recorded")}
            >
                Recorded
            </button>
            <button
                className={'tab-selector'}
                style={{
                    backgroundColor: songType !== 'recorded' ? selectedColor.hex() : unselectedColor.hex()
                }}
                onClick={() => setSongType("composed")}
            >
                Composed
            </button>
        </div>
        <div className="songs-wrapper" style={{backgroundColor: selectedColor.hex()}}>
            {songs.filter((song) => 
                songType === 'composed' ? song.data?.isComposedVersion : !song.data?.isComposedVersion
            ).map((song) =>
                <SongComponent
                    {...componentProps}
                    data={song}
                    key={song?.name}
                />
            )}

        </div>
    </div>
}