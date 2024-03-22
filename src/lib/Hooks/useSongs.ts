import {useEffect, useState} from "react";
import {observe} from "mobx";
import {songsStore} from "$stores/SongsStore";
import {SongStorable} from "$lib/Songs/Song";


type UseSongs = [SongStorable[]]
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


export function subscribeSongs(callback: (songs: SongStorable[]) => void){
    const dispose = observe(songsStore.songs,() => {
        callback([...songsStore.songs])
    })
    callback([...songsStore.songs])
    return dispose
}
