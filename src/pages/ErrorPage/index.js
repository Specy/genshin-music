import React, { Component } from 'react'
import { FaTrash, FaDownload} from 'react-icons/fa';
import { DB } from 'Database';
import { FileDownloader,prepareSongDownload } from "lib/Utils"
import { asyncConfirm } from "components/AsyncPrompts"
import { appName } from "appConfig"
import { SimpleMenu } from 'components/SimpleMenu'
import './ErrorPage.css'
import LoggerStore from 'stores/LoggerStore';

class ErrorPage extends Component {
    constructor(props) {
        super(props)
        this.state = {
            songs: []
        }
    }
    componentDidMount(){
        this.syncSongs()
    }
    downloadAllSongs = () => {
        let toDownload = []
        const { songs } = this.state
        songs.forEach(song => {
            if (song._id) delete song._id
            if(appName === "Sky"){
                song = prepareSongDownload(song)
            }
            Array.isArray(song) ? toDownload.push(...song) : toDownload.push(song)
        })
        let fileDownloader = new FileDownloader()
        let json = JSON.stringify(toDownload)
        let date = new Date().toISOString().split('T')[0]
        fileDownloader.download(json,`${appName}_Backup_${date}.json`)
        LoggerStore.success("Song backup downloaded")
    }
    syncSongs = async () => {
        this.setState({
            songs: await DB.getSongs()
        })
    }
    deleteSong = async (name) => {
        if (await asyncConfirm("Are you sure you want to delete the song: " + name)) {
            await DB.removeSong({ name: name })
            this.syncSongs()
        }

    }
    deleteAllSongs = async () =>{
        if (await asyncConfirm("Are you sure you want to delete ALL SONGS?")) {
            await DB.removeSong({})
            this.syncSongs()
        }
    }
    resetSettings = () => {
        localStorage.removeItem(appName+"_Composer_Settings")
        localStorage.removeItem(appName+"_Main_Settings")
        LoggerStore.success("Settings have been reset")
    }
    downloadSong = (song) => {
        if (song._id) delete song._id
        let songName = song.name
        if(appName === "Sky"){
            song = prepareSongDownload(song)
        }
        if(!Array.isArray(song)) song = [song]
        song.forEach(song1 => {
            song1.data.appName = appName
        })
        let json = JSON.stringify(song)
        let fileDownloader = new FileDownloader()
        fileDownloader.download(json,`${songName}.${appName.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
    }
    render() {
        return <div className="error-page app">
            <SimpleMenu/>
            <div className="error-text-wrapper">
                There seems to be an error. <br />
                Here you can download or delete your songs,
                try to find what song caused the error and remove it.
            </div>
            <div className="error-buttons-wrapper">
                <button className="genshin-button" onClick={this.resetSettings}>
                    Reset settings
                </button>
                <button className="genshin-button" onClick={this.deleteAllSongs}>
                    Delete all songs
                </button>
            </div>
            <div className="error-songs-wrapper">
                {this.state.songs.map(song => 
                    <SongRow
                        key={song?.name}
                        data={song}
                        functions={{
                            deleteSong: this.deleteSong,
                            downloadSong: this.downloadSong
                        }}
                    />
                )}
            </div>
        </div>
    }
}

function SongRow(props) {
    let data = props.data
    let deleteSong = props.functions.deleteSong
    let downloadSong = props.functions.downloadSong
    return <div className="song-row">
        <div className="song-name">
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => downloadSong(data)}>
                <FaDownload />

            </button>
            <button className="song-button" onClick={() => deleteSong(data.name)}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}

export default ErrorPage