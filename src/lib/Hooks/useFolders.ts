import {useEffect, useState} from "react";
import {observe} from "mobx";
import {folderStore} from "$stores/FoldersStore";
import {Folder} from "$lib/Folder";
import {SongStorable} from "$lib/Songs/Song";

type UseFolders = [Folder[]]

export function useFolders(songs?: SongStorable[]): UseFolders {
    const [folders, setFolders] = useState(folderStore.folders)
    const [parsedFolders, setParsedFolders] = useState<Folder[]>([])
    useEffect(() => {
        const dispose = subscribeFolders((folders) => {
            setFolders(folders)
        })
        return dispose
    }, [])
    useEffect(() => {
        if (!songs) return setParsedFolders(folders)
        setParsedFolders(folders.map(folder => {
            const clone = folder.clone()
            const filtered = songs.filter(song => song.folderId === folder.id)

            if (folder.filterType === 'date-created') {
                clone.songs = filtered
            } else if (folder.filterType === 'alphabetical') {
                clone.songs = filtered.sort((a, b) => a.name.localeCompare(b.name))
            } else {
                clone.songs = filtered
            }
            return clone
        }))
    }, [songs, folders])

    return [parsedFolders]
}


export function subscribeFolders(callback: (folders: Folder[]) => void) {
    const dispose = observe(folderStore.folders, () => {
        callback([...folderStore.folders])
    })
    callback([...folderStore.folders])
    return dispose
}
