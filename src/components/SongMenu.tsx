import { useTheme } from "lib/Hooks/useTheme";
import { ComposedSong } from "lib/ComposedSong";
import { RecordedSong } from "lib/RecordedSong";
import { useEffect, useState } from "react"
import { SerializedSongType } from "types/SongTypes";
import { SongFolder } from "./Folder";
import { Folder } from "lib/Folder";



type songType = 'recorded' | 'composed'
type SongKinds = SerializedSongType | RecordedSong | ComposedSong
interface SongMenuProps<T> {
    songs: SongKinds[],
    SongComponent: Function,
    componentProps: Omit<T, "data">
    className?: string,
    style?: React.CSSProperties,
    scrollerStyle?: React.CSSProperties
    baseType: songType
}



export function SongMenu<T>({
    songs,
    SongComponent,
    componentProps,
    className = '',
    style = {},
    baseType = 'recorded',
    scrollerStyle = {}
}: SongMenuProps<T>) {
    const [songType, setSongType] = useState<songType>('recorded')
    const [theme] = useTheme()
    useEffect(() => {
        setSongType(baseType)
    }, [baseType])
    const selectedColor = theme.layer('menu_background', 0.32).desaturate(0.4)
    const unselectedColor = theme.layer('menu_background', 0.35).lighten(0.2)
    return <div className={`${className}`} style={style}>
        <div className="tab-selector-wrapper">
            <button
                className={'tab-selector'}
                style={{
                    backgroundColor: songType === 'recorded' ? selectedColor.toString() : unselectedColor.toString()
                }}
                onClick={() => setSongType("recorded")}
            >
                Recorded
            </button>
            <button
                className={'tab-selector'}
                style={{
                    backgroundColor: songType !== 'recorded' ? selectedColor.toString() : unselectedColor.toString()
                }}
                onClick={() => setSongType("composed")}
            >
                Composed
            </button>
        </div>
        <div className="songs-wrapper" style={{ backgroundColor: selectedColor.toString(), ...scrollerStyle }}>
            {songs.filter((song) =>
                songType === 'composed' ? song.data?.isComposedVersion : !song.data?.isComposedVersion
            ).map((song) =>
                <SongComponent
                    {...componentProps}
                    data={song}
                    key={song?.id}
                />
            )}
        </div>
        <SongFolder 
            backgroundColor={unselectedColor.toString()}
            color={theme.getText('menu_background').toString()}
            renameFolder={() => { }}
            data={new Folder("Some folder")}
        > 
            Empty for now, just proof of concept
            <br />
            Bla bla some space
            <br />
            Bla bla some space
            <br />
            Bla bla some space
        </SongFolder>
    </div>
}