import {useTheme} from "$lib/Hooks/useTheme";
import {useEffect, useState} from "react"
import {SongFolder, SongFolderContent} from "./Folder";
import {Folder} from "$lib/Folder";
import {SongStorable, SongType} from "$lib/Songs/Song";
import {useFolders} from "$lib/Hooks/useFolders";
import s from './SongMenu.module.css'
import FuzzySearch from "fuzzy-search";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {FaSearch, FaTimes} from "react-icons/fa";
import {IconButton} from "$cmp/shared/Inputs/IconButton";
import {Row} from "$cmp/shared/layout/Row";
import {useTranslation} from "react-i18next";


interface SongMenuProps<T extends { data: SongStorable }> {
    songs: SongStorable[],
    SongComponent: React.FC<any>, //TODO improve this
    componentProps: Omit<T, "data">
    className?: string,
    style?: React.CSSProperties,
    baseType?: SongType
    exclude?: SongType[]
    onCreateFolder?: () => void
}

function isInFolder(folders: Folder[], song: SongStorable) {
    return folders.some(f => f.id === song.folderId)
}

export function SongMenu<T extends { data: SongStorable }>({
                                                               songs,
                                                               SongComponent,
                                                               componentProps,
                                                               className,
                                                               style,
                                                               baseType,
                                                               exclude,
                                                               onCreateFolder,
                                                           }: SongMenuProps<T>) {
    const {t} = useTranslation(['common', 'menu'])
    const [noFolderRecorded, setNoFolderRecorded] = useState<Folder>()
    const [noFolderComposed, setNoFolderComposed] = useState<Folder>()
    const [noFolderVsrg, setNoFolderVsrg] = useState<Folder>()
    const [filteredSongs, setFilteredSongs] = useState<SongStorable[]>([])
    const [searchValue, setSearchValue] = useState<string>('')
    const [folders] = useFolders(filteredSongs)
    const [theme] = useTheme()

    useEffect(() => {
        const excluded = songs.filter(s => !(exclude?.includes(s.type)))
        const searcher = new FuzzySearch(excluded, ['name'], {caseSensitive: false, sort: true})
        if (searchValue === '') return setFilteredSongs(excluded)
        setFilteredSongs(searcher.search(searchValue))
    }, [songs, exclude, searchValue])

    useEffect(() => {
        setNoFolderRecorded(new Folder(t('menu:recorded'), null, filteredSongs.filter(song => !isInFolder(folders,song) && song.type === 'recorded')))
        setNoFolderComposed(new Folder(t('menu:composed'), null, filteredSongs.filter(song => !isInFolder(folders,song) && song.type === 'composed')))
        setNoFolderVsrg(new Folder("Vsrg", null, filteredSongs.filter(song => !isInFolder(folders,song) && song.type === 'vsrg')))
    }, [filteredSongs, folders, t])

    const unselectedColor = theme.layer('menu_background', 0.35).lighten(0.2)
    const unselectedColorText = theme.getTextColorFromBackground(unselectedColor).toString()
    return <div className={className} style={style}>
        <Row justify={'between'} gap='0.5rem'>
            <div className={s['search']}
                 style={{
                     backgroundColor: unselectedColor.toString(),
                     color: unselectedColorText,
                     outline: 'solid 0.2rem transparent',
                     outlineOffset: '-0.2rem',
                     outlineColor: searchValue === "" ? "transparent" : "var(--accent)"
                 }}
            >
                <input
                    type="text"
                    placeholder={t('common:search')}
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    style={{
                        color: unselectedColorText
                    }}
                />
                <IconButton
                    size="1rem"
                    ariaLabel={searchValue === "" ? "Search" : "Clear search"}
                    style={{backgroundColor: "transparent", color: "inherit"}}
                    onClick={() => setSearchValue("")}
                >
                    {searchValue === ""
                        ? <FaSearch/>
                        : <FaTimes/>
                    }
                </IconButton>
            </div>
            {onCreateFolder &&
                <AppButton onClick={onCreateFolder}>
                    {t('menu:create_folder')}
                </AppButton>
            }
        </Row>
        {(!exclude?.includes('composed') && noFolderComposed) &&
            <SongFolder
                backgroundColor={unselectedColor.toString()}
                headerColor={unselectedColorText}
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
                        <div style={{padding: '0.2rem', fontSize: '0.9rem'}}>
                            {t('menu:hint_no_recorded_songs')}
                        </div>
                    }
                </SongFolderContent>
            </SongFolder>
        }
        {(!exclude?.includes('recorded') && noFolderRecorded) &&
            <SongFolder
                backgroundColor={unselectedColor.toString()}
                headerColor={unselectedColorText}
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
                        <div style={{padding: '0.2rem', fontSize: '0.9rem'}}>
                            {t('menu:hint_no_recorded_songs')}
                        </div>
                    }
                </SongFolderContent>
            </SongFolder>
        }
        {(!exclude?.includes('vsrg') && noFolderVsrg) &&
            <SongFolder
                backgroundColor={unselectedColor.toString()}
                headerColor={unselectedColorText}
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
                        <div style={{padding: '0.2rem', fontSize: '0.9rem'}}>
                            {t('menu:hint_no_songs_in_folder')}
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
                headerColor={unselectedColorText}
                color={theme.getText('menu_background').toString()}
                data={folder}
            >
                {(!exclude?.includes('composed') && composed.length > 0) &&
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
                {(!exclude?.includes('recorded') && recorded.length > 0) &&
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
                {(!exclude?.includes('vsrg') && vsrg.length > 0) &&
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
                    <div style={{padding: '0.7rem', paddingTop: "0", fontSize: '0.9rem'}}>
                        {t('menu:folder_empty')}
                    </div>
                }
            </SongFolder>
        })}
    </div>
}

