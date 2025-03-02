import {memo, useCallback, useEffect, useState} from 'react'
import {
    FaBars,
    FaClone,
    FaCog,
    FaDownload,
    FaEdit,
    FaEllipsisH,
    FaFolder,
    FaHome,
    FaMusic,
    FaPen,
    FaSave,
    FaTimes,
    FaTrash
} from 'react-icons/fa';
import {APP_NAME} from '$config'
import {MenuButton, MenuItem} from '$cmp/shared/Menu/MenuItem'
import {MenuPanel, MenuPanelWrapper} from '$cmp/shared/Menu/MenuPanel'
import DonateButton from '$cmp/shared/Miscellaneous/DonateButton'
import {MemoizedIcon} from '$cmp/shared/Utility/Memoized';
import Analytics from '$lib/Analytics';
import {logger} from '$stores/LoggerStore';
import {AppButton} from '$cmp/shared/Inputs/AppButton';
import {SongMenu} from '$cmp/shared/pagesLayout/SongMenu';
import {ComposerSettingsDataType} from '$lib/BaseSettings';
import {SettingUpdate, SettingVolumeUpdate} from '$types/SettingsPropriety';
import {useTheme} from '$lib/Hooks/useTheme';
import {Theme} from '$stores/ThemeStore/ThemeProvider';
import {hasTooltip, Tooltip} from '$cmp/shared/Utility/Tooltip';
import {HelpTooltip} from '$cmp/shared/Utility/HelpTooltip';
import {FloatingDropdown, FloatingDropdownRow, FloatingDropdownText} from '$cmp/shared/Utility/FloatingDropdown';
import {Midi} from '@tonejs/midi';
import {asyncConfirm, asyncPrompt} from '$cmp/shared/Utility/AsyncPrompts';
import {SettingsPane} from "$cmp/shared/Settings/SettingsPane";
import {SerializedSong, SongStorable, SongType} from '$lib/Songs/Song';
import {useFolders} from '$lib/Hooks/useFolders';
import {Folder} from '$lib/Folder';
import {songsStore} from '$stores/SongsStore';
import {folderStore} from '$stores/FoldersStore';
import {useSongs} from '$lib/Hooks/useSongs';
import {KeyboardProvider} from '$lib/Providers/KeyboardProvider';
import useClickOutside from '$lib/Hooks/useClickOutside';
import {fileService} from '$lib/Services/FileService';
import {songService} from '$lib/Services/SongService';
import {ComposedSong} from '$lib/Songs/ComposedSong';
import {RecordedSong} from '$lib/Songs/RecordedSong';
import {RecordedOrComposed} from '$types/SongTypes';
import {FileElement, FilePicker} from '$cmp/shared/Inputs/FilePicker';
import isMobile from 'is-mobile';
import Link from 'next/link';
import {useConfig} from '$lib/Hooks/useConfig';
import {isAudioFormat, isMidiFormat, isVideoFormat} from '$lib/utils/Utilities';
import {MenuContextProvider, MenuSidebar} from "$cmp/shared/Menu/MenuContent";
import {useTranslation} from "react-i18next";
import {DefaultLanguageSelector} from "$cmp/shared/i18n/LanguageSelector";
import {Separator} from "$cmp/shared/separator/Separator";

interface MenuProps {
    data: {
        settings: ComposerSettingsDataType,
        hasChanges: boolean,
        isRecordingAudio: boolean,
    }
    functions: {
        loadSong: (song: SerializedSong) => void
        renameSong: (newName: string, id: string) => void
        downloadSong: (song: SerializedSong, as: 'song' | 'midi') => void
        createNewSong: () => void
        changePage: (page: string | 'Home') => void
        updateThisSong: () => void
        handleSettingChange: (data: SettingUpdate) => void
        changeVolume: (data: SettingVolumeUpdate) => void
        changeMidiVisibility: (visible: boolean) => void
        startRecordingAudio: (override?: boolean) => void
    }
    inPreview?: boolean
}

export type MenuTabs = 'Songs' | 'Help' | 'Settings' | 'Home'
const excludedSongs: SongType[] = ['vsrg']

function Menu({data, functions, inPreview}: MenuProps) {
    const {t} = useTranslation(['composer', 'common', 'menu', 'logs', 'settings', 'confirm', 'question', 'tutorials'])
    const [isOpen, setOpen] = useState(false)
    const [isVisible, setVisible] = useState(false)
    const {IS_MIDI_AVAILABLE} = useConfig()
    const [songs] = useSongs()
    const [folders] = useFolders()
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const {
        loadSong,
        changePage,
        renameSong,
        handleSettingChange,
        changeVolume,
        createNewSong,
        changeMidiVisibility,
        updateThisSong,
        downloadSong
    } = functions
    const [theme] = useTheme()
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        if (isMobile()) {
            setVisible(false)
        } else {
            setOpen(false)
        }
    }, {active: (isOpen && isVisible), ignoreFocusable: true})

    useEffect(() => {
        KeyboardProvider.register("Escape", () => {
            setVisible(false)
        }, {id: "composer_menu"})
        return () => KeyboardProvider.unregisterById("composer_menu")
    }, [])

    const toggleMenu = useCallback((override?: boolean) => {
        if (typeof override !== "boolean") override = undefined
        setVisible((old) => override !== undefined ? override : !old)
    }, [])

    const removeSong = useCallback(async (name: string, id: string) => {
        const confirm = await asyncConfirm(t('confirm:delete_song', {song_name: name}))
        if (confirm) {
            await songsStore.removeSong(id)
            Analytics.userSongs('delete', {page: 'composer'})
        }
    }, [t])
    const createFolder = useCallback(async () => {
        const name = await asyncPrompt(t('question:enter_folder_name'))
        if (!name) return
        folderStore.createFolder(name)
    }, [t])

    const importFile = useCallback(async (files: FileElement<SerializedSong[] | SerializedSong>[]) => {
        for (const file of files) {
            try {
                const songs = (Array.isArray(file.data) ? file.data : [file.data]) as SerializedSong[]
                await fileService.importAndLog(songs)
            } catch (e) {
                console.error(e)
                if (e) console.error(e)
                logger.error(
                    t('logs:error_importing_invalid_format'),
                    8000
                )
            }
        }
    }, [t])
    const songFunctions = {
        loadSong,
        removeSong,
        toggleMenu,
        downloadSong,
        renameSong,
    }
    return <MenuContextProvider
        style={inPreview ? {position: "absolute"} : {}}
        ref={menuRef}
        open={isOpen}
        setOpen={setOpen}
        current={selectedMenu}
        setCurrent={setSelectedMenu}
        visible={isVisible}
    >
        <div className="hamburger" onClick={() => setVisible(!isVisible)}>
            <MemoizedIcon icon={FaBars}/>
        </div>
        <MenuSidebar>
            <MenuButton onClick={() => toggleMenu()} className='close-menu' ariaLabel={t('menu:close_menu')}>
                <MemoizedIcon icon={FaTimes} className={'icon'}/>
            </MenuButton>
            <MenuButton
                onClick={updateThisSong}
                className={data.hasChanges ? "not-saved" : ""}
                ariaLabel='Save'
                style={{marginTop: 'auto'}}
            >
                <MemoizedIcon icon={FaSave} className={'icon'}/>
            </MenuButton>
            <MenuItem id={"Songs"} ariaLabel={t('menu:open_songs_menu')}>
                <MemoizedIcon icon={FaMusic} className={'icon'}/>
            </MenuItem>
            <MenuItem id={"Settings"} ariaLabel={t('menu:open_settings_menu')}>
                <MemoizedIcon icon={FaCog} className={'icon'}/>
            </MenuItem>
            <MenuButton
                onClick={() => changePage('Home')}
                ariaLabel='Open home menu'
                style={{border: "solid 0.1rem var(--secondary)"}}
            >
                <MemoizedIcon icon={FaHome} className={'icon'}/>
            </MenuButton>
        </MenuSidebar>
        <MenuPanelWrapper style={inPreview ? {position: 'absolute'} : {}}>
            <MenuPanel id="Songs">
                <div className="songs-buttons-wrapper">
                    <HelpTooltip>
                        <ul>
                            {/*TODO should do this better?*/}
                            <li>{t('tutorials:composer.li_1')} </li>
                            <li>{t('tutorials:composer.li_2')} </li>
                            <li>{t('tutorials:composer.li_3')} </li>
                            <li>{t('tutorials:composer.li_4')} </li>
                            <li>{t('tutorials:composer.li_5')} </li>
                            <li>{t('tutorials:composer.li_6')} </li>
                        </ul>
                    </HelpTooltip>
                    <AppButton
                        onClick={() => {
                            changeMidiVisibility(true);
                            toggleMenu()
                        }}
                        style={{marginLeft: 'auto'}}
                    >
                        {t('create_from_midi_or_audio')}
                    </AppButton>
                    <AppButton onClick={createNewSong}>
                        {t('create_new_song')}
                    </AppButton>
                </div>
                <SongMenu<SongRowProps>
                    songs={songs}
                    exclude={excludedSongs}
                    SongComponent={SongRow}
                    style={{marginTop: '0.6rem'}}
                    onCreateFolder={createFolder}
                    componentProps={{
                        theme,
                        folders,
                        functions: songFunctions
                    }}
                />
                <div className='row' style={{justifyContent: "flex-end", gap: '0.2rem'}}>
                    <FilePicker<SerializedSong | SerializedSong[]>
                        onPick={importFile}
                        onError={(e, files) => {
                            if (e) console.error(e)
                            if (files?.length > 0) {
                                const file = files![0]
                                const name = file.name
                                if (isMidiFormat(name)) logger.warn(t('warning_opening_midi_importer'), 6000)
                                else if (isVideoFormat(name) || isAudioFormat(name)) logger.warn(t('warning_opening_audio_importer'), 6000)
                                else return logger.error(t('error_importing_file_invalid_format'), 8000)
                                changeMidiVisibility(true)
                                toggleMenu()
                            } else {
                                logger.error(
                                    t('error_importing_file_invalid_format_audio_video'),
                                    8000
                                )
                            }
                        }}
                        as='json'
                        multiple={true}
                    >
                        <AppButton>
                            {t('menu:import_song_sheet')}
                        </AppButton>
                    </FilePicker>
                </div>
                <div className="songs-buttons-wrapper" style={{marginTop: 'auto'}}>
                    <AppButton
                        style={{marginTop: '0.5rem'}}
                        className={`record-btn`}
                        onClick={() => {
                            setOpen(false)
                            setTimeout(() => {
                                functions.startRecordingAudio(!data.isRecordingAudio)
                            }, 300)
                        }}
                        toggled={data.isRecordingAudio}
                    >
                        {data.isRecordingAudio ? t('stop_recording_audio') : t('start_recording_audio')}
                    </AppButton>
                </div>
            </MenuPanel>
            <MenuPanel id="Settings">
                <SettingsPane
                    settings={data.settings}
                    onUpdate={handleSettingChange}
                    changeVolume={changeVolume}
                />
                <Separator background={'var(--secondary)'} height={'0.1rem'} verticalMargin={'0.5rem'}/>
                <div className='settings-row-wrap'>
                    {t('settings:select_language')} <DefaultLanguageSelector/>
                </div>
                <div className='settings-row-wrap'>
                    {IS_MIDI_AVAILABLE &&
                        <Link href="/keybinds">
                            <AppButton
                                style={{width: 'fit-content'}}
                            >
                                {t('menu:connect_midi_keyboard')}
                            </AppButton>
                        </Link>
                    }
                    <Link href="/theme" onClick={(e) => e.preventDefault()}>
                        <AppButton
                            onClick={() => changePage('theme')}
                            style={{width: 'fit-content'}}
                        >
                            {t('menu:change_app_theme')}
                        </AppButton>
                    </Link>

                </div>
                <DonateButton/>
            </MenuPanel>
        </MenuPanelWrapper>
    </MenuContextProvider>

}


interface SongRowProps {
    data: SongStorable
    theme: Theme
    folders: Folder[]
    functions: {
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string) => void
        toggleMenu: (override: boolean) => void
        loadSong: (song: SerializedSong) => void
        downloadSong: (song: SerializedSong, as: 'midi' | 'song') => void
    }
}

function SongRow({data, functions, theme, folders}: SongRowProps) {
    const {t} = useTranslation((['composer', 'common', 'menu', 'logs', 'settings']))
    const {removeSong, toggleMenu, renameSong, loadSong, downloadSong} = functions
    const buttonStyle = {backgroundColor: theme.layer('primary', 0.15).toString()}
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    if (data.type === 'vsrg') return <div className='row'>
        {t('menu:invalid_song')}
    </div>
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={async () => {
            if (isRenaming) return
            logger.showPill(t('logs:loading_song'))
            const song = await songService.getOneSerializedFromStorable(data)
            logger.hidePill()
            if (!song) return logger.error(t('logs:could_not_find_song'))
            loadSong(song)
            toggleMenu(false)
        }}>
            {isRenaming
                ? <input
                    className={`song-name-input ${isRenaming ? "song-rename" : ""}`}
                    disabled={!isRenaming}
                    onChange={(e) => setSongName(e.target.value)}
                    style={{width: "100%", color: "var(--primary-text)"}}
                    value={songName}
                />
                : <div style={{marginLeft: '0.3rem'}}>
                    {songName}
                </div>
            }
            <Tooltip>
                {isRenaming ? t('menu:song_name') : t('menu:open_in_composer')}
            </Tooltip>
        </div>
        <div className="song-buttons-wrapper">
            <FloatingDropdown
                Icon={FaEllipsisH}
                ignoreClickOutside={isRenaming}

                style={buttonStyle}
                tooltip={t('settings:more_options')}
                onClose={() => setIsRenaming(false)}
            >
                <AppButton
                    className='row row-centered'
                    style={{padding: "0.4rem"}}
                    onClick={() => {
                        if (isRenaming) {
                            renameSong(songName, data.id!)
                            setIsRenaming(false)
                        }
                        setIsRenaming(!isRenaming)
                    }}
                >
                    <FaPen style={{marginRight: "0.4rem"}}/>
                    <FloatingDropdownText text={isRenaming ? t('common:save') : t('common:rename')}/>
                </AppButton>
                <FloatingDropdownRow style={{padding: '0 0.4rem'}}>
                    <FaFolder style={{marginRight: "0.4rem"}}/>
                    <select className='dropdown-select'
                            value={data.folderId || "_None"}
                            onChange={async (e) => {
                                const id = e.target.value
                                const song = await songService.getOneSerializedFromStorable(data)
                                if (!song) return logger.error(t('logs:could_not_find_song'))
                                songsStore.addSongToFolder(song, id !== "_None" ? id : null)
                            }}
                    >
                        <option value={"_None"}>
                            {t('common:none')}
                        </option>
                        {folders.map(folder =>
                            <option key={folder.id} value={folder.id!}>{folder.name}</option>
                        )}
                    </select>
                </FloatingDropdownRow>
                <FloatingDropdownRow
                    style={{width: '100%'}}
                    onClick={async () => {
                        if (data?.type === 'recorded') logger.warn(t('logs:converting_recorded_to_composed_warning'))
                        const song = await songService.getOneSerializedFromStorable(data)
                        if (!song) return logger.error(t('logs:could_not_find_song'))
                        loadSong(song)
                        toggleMenu(false)
                    }}
                >
                    <FaEdit style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={t('common:edit_song')}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.getOneSerializedFromStorable(data)
                    if (!song) return logger.error(t('logs:could_not_find_song'))
                    downloadSong(song, 'song')
                }}>
                    <FaDownload style={{marginRight: "0.4rem"}}/>
                    <FloatingDropdownText text={t('common:download')}/>
                </FloatingDropdownRow>
                {(data.type === 'recorded' || data.type === "composed") &&
                    <FloatingDropdownRow onClick={async () => {
                        const song = await songService.getOneSerializedFromStorable(data)
                        if (!song) return logger.error(t('logs:could_not_find_song'))
                        downloadSong(song, 'midi')
                    }}>
                        <FaDownload style={{marginRight: "0.4rem"}} size={14}/>
                        <FloatingDropdownText text={t('common:download_midi')}/>
                    </FloatingDropdownRow>
                }

                <FloatingDropdownRow
                    onClick={async () => {
                        const parsed = await songService.fromStorableSong(data)
                        const clone = parsed.clone()
                        clone.name = `${parsed.name} - (clone)`
                        await songsStore.addSong(clone)
                        logger.log(t('logs:cloned_song', {song_name: data.name}))
                    }}
                >
                    <FaClone style={{marginRight: "0.4rem"}}/>
                    <FloatingDropdownText text={t('composer:clone_song')}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => removeSong(data.name, data.id!)}>
                    <FaTrash color="#ed4557" style={{marginRight: "0.4rem"}}/>
                    <FloatingDropdownText text={t('common:delete')}/>
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}

export default memo(Menu, (p, n) => {
    return p.data.settings === n.data.settings &&
        p.data.hasChanges === n.data.hasChanges &&
        p.data.isRecordingAudio === n.data.isRecordingAudio
})