import { useState, useEffect } from "react";
import { observe } from "mobx";
import { folderStore } from "$stores/FoldersStore";
import { Folder } from "$lib/Folder";
import { SerializedSong } from "$lib/Songs/Song";

type UseFolders = [Folder[]]
export function useFolders(songs?: SerializedSong[]): UseFolders {
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
            clone.songs = songs.filter(song => song.folderId === folder.id)
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
