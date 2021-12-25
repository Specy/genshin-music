import React, { Component } from 'react'
import { FaTrash, FaDownload} from 'react-icons/fa';
import ZangoDb from "zangodb"
import { FileDownloader, LoggerEvent,prepareSongDownload } from "lib/Utils"
import { asyncConfirm } from "components/AsyncPrompts"
import { appName } from "appConfig"
import { SimpleMenu } from 'components/SimpleMenu'
import './ErrorPage.css'
class ErrorPage extends Component {
    constructor(props) {
        super(props)
        this.db = new ZangoDb.Db(appName, { songs: [] })
        this.dbCol = {
            songs: this.db.collection("songs")

        }
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
        new LoggerEvent("Success", "Song backup downloaded").trigger()
    }
    syncSongs = async () => {
        let songs = await this.dbCol.songs.find().toArray()
        this.setState({
            songs: songs
        })
    }
    deleteSong = async (name) => {
        if (await asyncConfirm("Are you sure you want to delete the song: " + name)) {
            this.dbCol.songs.remove({ name: name }, this.syncSongs)
        }

    }
    deleteAllSongs = async () =>{
        if (await asyncConfirm("Are you sure you want to delete ALL SONGS?")) {
            this.dbCol.songs.remove({}, this.syncSongs)
        }
    }
    resetSettings = () => {
        localStorage.removeItem(appName+"_Composer_Settings")
        localStorage.removeItem(appName+"_Main_Settings")
        new LoggerEvent("Success", "Settings have been reset").trigger()
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
        new LoggerEvent("Success", "Song downloaded").trigger()
    }
    render() {
        return <div className="error-page app">
            <SimpleMenu functions={{changePage: this.props.changePage}}/>
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