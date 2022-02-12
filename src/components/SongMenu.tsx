import { observe } from "mobx";
import { useEffect, useState } from "react"
import { ThemeStore } from "stores/ThemeStore";

interface SongMenuProps {
    songs: any[],
    SongComponent: any,
    componentProps: any,
    className?: string,
    style?: any
}
export function SongMenu({ songs, SongComponent, componentProps, className = '', style = {} }: SongMenuProps) {
    const [songType, setSongType] = useState('recorded')
    const [theme, setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,() => {
            setTheme({...ThemeStore})
        })
        return dispose
    }, [])
    const selectedColor = theme.get('menu_background').darken(0.3).desaturate(0.3)
    const unselectedColor = theme.get('menu_background').darken(0.2) 
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