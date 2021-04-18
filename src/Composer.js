import React, { Component } from 'react'
import {Canvas} from "@react-three/fiber"
import { Flex, Box } from '@react-three/flex'
import ZangoDb from "zangodb"
import Menu from "./Components/Composer/menu/Menu"
import {ComposedSong, LoggerEvent} from "./Components/SongUtils"
import rotateImg from "./assets/icons/rotate.svg"
class Composer extends Component{
    constructor(props){
        super(props)
        this.db = new ZangoDb.Db("Genshin", { songs: [] })
        this.dbCol = {
          songs: this.db.collection("songs")

        }
        this.state = {
            songs: [],
            song: {

            }
        }
        this.syncSongs()
    }
    syncSongs = async () => {
        let songs = await this.dbCol.songs.find().toArray()
        this.setState({
            composedSongs: songs,
            songs: songs
        })
      }
    addSong = async (song) => {
        if (await this.songExists(song.name)){
          return new LoggerEvent("Warning","A song with this name already exists! \n"+ song.name).trigger()
        }
        await this.dbCol.songs.insert(song)
        this.syncSongs()
      }
    songExists = async (name) => {
        return await this.dbCol.songs.findOne({ name: name }) !== undefined
    }
    createNewSong = () => {
        let name = prompt("Write song name:")
        let song = new ComposedSong(name)
        this.setState({
            song: song
        },() => this.addSong(song))
    }
    removeSong = (name) => {
        this.dbCol.songs.remove({ name: name }, this.syncSongs)
      }
    loadSong = (song) =>{
        this.setState({
            song: song
        })
    }
    render(){
        let menuData = {
            songs: this.state.songs
        }
        let menuFunctions = {
            loadSong: this.loadSong,
            removeSong: this.removeSong,
            createNewSong: this.createNewSong,
            changePage: this.props.changePage
        }
        return <div className="app">
                  <div className="rotate-screen">
                    <img src={rotateImg}>
                    </img>
                    For a better experience, add the website to the home screen, and rotate your device
                </div>
            <Menu
                data={menuData}
                functions={menuFunctions}
            />
        </div>
    }
}



export default Composer