import { useState, useEffect } from "react";
import { observe } from "mobx";
import { songsStore } from "stores/SongsStore";
import { SerializedSong } from "lib/Songs/Song";


type UseSongs = [SerializedSong[]]
export function useSongs(): UseSongs{
    const [songs,setSongs] = useState(songsStore.songs)
    useEffect(() => {
        const dispose = subscribeSongs((songs) => {
            setSongs(songs)
        })
        return dispose
    },[]) 
    return [songs]
}


export function subscribeSongs(callback: (songs: SerializedSong[]) => void){
    const dispose = observe(songsStore.songs,() => {
        callback([...songsStore.songs])
    })
    callback([...songsStore.songs])
    return dispose
}
