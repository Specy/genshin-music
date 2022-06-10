import { useState, useEffect } from "react";
import { observe } from "mobx";
import { folderStore } from "stores/FoldersStore";
import { Folder } from "lib/Folder";
import { SerializedSong } from "lib/Songs/Song";

type UseFolders = [Folder[]]
export function useFolders(songs?: SerializedSong[]): UseFolders{
    const [folders,setFolders] = useState(folderStore.folders)
    const [parsedFolders, setParsedFolders ] = useState<Folder[]>([])
    useEffect(() => {
        const dispose = subscribeFolders((folders) => {
            setFolders(folders)
        })
        return dispose
    },[]) 
    useEffect(() => {
        if(songs){
            setParsedFolders(folders.map(folder => {
                folder.songs = songs.filter(song => song.folderId === folder.id)
                return folder
            }))
        }else{
            setParsedFolders(folders)
        }

    },[songs, folders])

    return [parsedFolders]
}


export function subscribeFolders(callback: (folders: Folder[]) => void){
    const dispose = observe(folderStore.folders,() => {
        callback([...folderStore.folders])
    })
    callback([...folderStore.folders])
    return dispose
}
