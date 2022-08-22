import { useTheme } from "$lib/Hooks/useTheme";
import { ComposedSong } from "$lib/Songs/ComposedSong";
import { RecordedSong } from "$lib/Songs/RecordedSong";
import { useEffect, useState } from "react"
import { SongFolder, SongFolderContent } from "./Folder";
import { Folder } from "$lib/Folder";
import { SerializedSong, SongType } from "$lib/Songs/Song";
import { useFolders } from "$lib/Hooks/useFolders";
import { VsrgSong } from "$lib/Songs/VsrgSong";



type SongKinds = SerializedSong | RecordedSong | ComposedSong | VsrgSong
interface SongMenuProps<T> {
    songs: SongKinds[],
    SongComponent: Function,
    componentProps: Omit<T, "data">
    className?: string,
    style?: React.CSSProperties,
    baseType?: SongType
    exclude?: SongType[]
}



export function SongMenu<T>({
    songs,
    SongComponent,
    componentProps,
    className,
    style,
    baseType,
    exclude,

}: SongMenuProps<T>) {
    const [noFolderRecorded, setNoFolderRecorded] = useState<Folder>()
    const [noFolderComposed, setNoFolderComposed] = useState<Folder>()
    const [noFolderVsrg, setNoFolderVsrg] = useState<Folder>()
    const [filteredSongs, setFilteredSongs] = useState<SongKinds[]>([])
    const [folders] = useFolders(filteredSongs)
    useEffect(() => {
        setFilteredSongs(songs.filter(s => !exclude?.includes(s.type) ?? true))
    }, [songs, exclude])
    useEffect(() => {
        function isInFolder(song: SongKinds) {
            return folders.some(f => f.id === song.folderId)
        }
        setNoFolderRecorded(new Folder("Recorded", null, filteredSongs.filter(song => !isInFolder(song) && song.type === 'recorded')))
        setNoFolderComposed(new Folder("Composed", null, filteredSongs.filter(song => !isInFolder(song) && song.type === 'composed')))
        setNoFolderVsrg(new Folder("Vsrg", null, filteredSongs.filter(song => !isInFolder(song) && song.type === 'vsrg')))
    }, [filteredSongs,folders])
    const [theme] = useTheme()
    const unselectedColor = theme.layer('menu_background', 0.35).lighten(0.2)
    return <div className={className} style={style}>
        {((!exclude?.includes('composed') ?? true) && noFolderComposed) &&
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
                        <div style={{ padding: '0.2rem', fontSize: '0.9rem' }}>
                            No songs here, compose one!
                        </div>
                    }
                </SongFolderContent>
            </SongFolder>
        }
        {((!exclude?.includes('recorded') ?? true) && noFolderRecorded) &&
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
                        <div style={{ padding: '0.2rem', fontSize: '0.9rem' }}>
                            No songs here, record one!
                        </div>
                    }
                </SongFolderContent>
            </SongFolder>
        }
        {((!exclude?.includes('vsrg') ?? true) && noFolderVsrg) &&
            <SongFolder
                backgroundColor={unselectedColor.toString()}
                color={theme.getText('menu_background').toString()}
                data={noFolderVsrg}
                isDefault={true}
                defaultOpen={baseType === 'recorded'}
            >
                <SongFolderContent>
                    {noFolderVsrg.songs.map(song =>
                        <SongComponent
                            {...componentProps}
                            data={song}
                            key={song?.id}
                        />
                    )}
                    {noFolderVsrg.songs.length === 0 &&
                        <div style={{ padding: '0.2rem', fontSize: '0.9rem' }}>
                            No songs here, record one!
                        </div>
                    }
                </SongFolderContent>
            </SongFolder>
        }
        {folders.map(folder => {
            const composed = folder.songs.filter(song => song.type === 'composed')
            const recorded = folder.songs.filter(song => song.type === 'recorded')
            const vsrg = folder.songs.filter(song => song.type === 'vsrg')
            return <SongFolder
                key={folder.id}
                backgroundColor={unselectedColor.toString()}
                color={theme.getText('menu_background').toString()}
                data={folder}
            >
                {((!exclude?.includes('composed') ?? true) && composed.length > 0) &&
                    <SongFolderContent title="Composed">
                        {composed.map(song =>
                            <SongComponent
                                {...componentProps}
                                data={song}
                                key={song?.id}
                            />
                        )}
                    </SongFolderContent>
                }
                {((!exclude?.includes('recorded') ?? true) && recorded.length > 0) &&
                    <SongFolderContent title="Recorded">
                        {recorded.map(song =>
                            <SongComponent
                                {...componentProps}
                                data={song}
                                key={song?.id}
                            />
                        )}
                    </SongFolderContent>
                }
                {((!exclude?.includes('vsrg') ?? true) && vsrg.length > 0) &&
                    <SongFolderContent title="Vsrg">
                        {vsrg.map(song =>
                            <SongComponent
                                {...componentProps}
                                data={song}
                                key={song?.id}
                            />
                        )}
                    </SongFolderContent>
                }
                {(composed.length === 0 && recorded.length === 0 && vsrg.length === 0) &&
                    <div style={{ padding: '0.7rem', paddingTop: "0", fontSize: '0.9rem' }}>
                        The folder is empty
                    </div>
                }
            </SongFolder>
        })}
    </div>
}