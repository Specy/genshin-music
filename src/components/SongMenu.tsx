import { useTheme } from "lib/Hooks/useTheme";
import { ComposedSong } from "lib/Songs/ComposedSong";
import { RecordedSong } from "lib/Songs/RecordedSong";
import { useEffect, useState } from "react"
import { SongFolder, SongFolderContent } from "./Folder";
import { Folder } from "lib/Folder";
import { SerializedSong } from "lib/Songs/Song";
import { useFolders } from "lib/Hooks/useFolders";



type songType = 'recorded' | 'composed'
type SongKinds = SerializedSong | RecordedSong | ComposedSong
interface SongMenuProps<T> {
    songs: SongKinds[],
    SongComponent: Function,
    componentProps: Omit<T, "data">
    className?: string,
    style?: React.CSSProperties,
    baseType?: songType
}



export function SongMenu<T>({
    songs,
    SongComponent,
    componentProps,
    className,
    style,
    baseType,
}: SongMenuProps<T>) {
    const [noFolderRecorded, setNoFolderRecorded] = useState<Folder>()
    const [noFolderComposed, setNoFolderComposed] = useState<Folder>()
    useEffect(() => {
        setNoFolderRecorded(new Folder("Recorded", null, songs.filter(song => !song.folderId && !song.data.isComposedVersion)))
        setNoFolderComposed(new Folder("Composed", null, songs.filter(song => !song.folderId && song.data.isComposedVersion)))
    }, [songs])
    const [folders] = useFolders(songs)
    const [theme] = useTheme()
    //const selectedColor = theme.layer('menu_background', 0.32).desaturate(0.4)
    const unselectedColor = theme.layer('menu_background', 0.35).lighten(0.2)


    return <div className={className} style={style}>
        {noFolderComposed &&
            <SongFolder
                backgroundColor={unselectedColor.toString()}
                color={theme.getText('menu_background').toString()}
                data={noFolderComposed}
                isDefault={true}
                defaultOpen={baseType === 'composed'}
            >
                <SongFolderContent>
                    {noFolderComposed.songs.map(song =>
                        <SongComponent
                            {...componentProps}
                            data={song}
                            key={song?.id}
                        />
                    )}
                    {noFolderComposed.songs.length === 0 &&
                        <div style={{padding: '0 0.4rem', fontSize: '0.9rem'}}>
                            Go to the composer to create a new song!
                        </div>
                    }
                </SongFolderContent>
            </SongFolder>
        }
        {noFolderRecorded &&
            <SongFolder
                backgroundColor={unselectedColor.toString()}
                color={theme.getText('menu_background').toString()}
                data={noFolderRecorded}
                isDefault={true}
                defaultOpen={baseType === 'recorded'}
            >
                <SongFolderContent>
                    {noFolderRecorded.songs.map(song =>
                        <SongComponent
                            {...componentProps}
                            data={song}
                            key={song?.id}
                        />
                    )}
                    {noFolderRecorded.songs.length === 0 &&
                        <div>
                            Click "Record" to record a new song!
                        </div>
                    }
                </SongFolderContent>
            </SongFolder>
        }
        {folders.map(folder =>
            <SongFolder
                key={folder.id}
                backgroundColor={unselectedColor.toString()}
                color={theme.getText('menu_background').toString()}
                data={folder}
            >
                <SongFolderContent title="Composed">
                    {folder.songs.filter(song => song.data?.isComposedVersion).map(song =>
                        <SongComponent
                            {...componentProps}
                            data={song}
                            key={song?.id}
                        />
                    )}
                </SongFolderContent>
                <SongFolderContent title="Recorded">
                    {folder.songs.filter(song => !song.data?.isComposedVersion).map(song =>
                        <SongComponent
                            {...componentProps}
                            data={song}
                            key={song?.id}
                        />
                    )}
                </SongFolderContent>
            </SongFolder>
        )}

    </div>
}


/*
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

*/