import React, { Component } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash, faDownload } from '@fortawesome/free-solid-svg-icons'
import ZangoDb from "zangodb"
import { FileDownloader, LoggerEvent } from "./SongUtils"
import { asyncConfirm } from "./AsyncPrompts"
class ErrorPage extends Component {
    constructor(props) {
        super(props)
        this.db = new ZangoDb.Db("Genshin", { songs: [] })
        this.dbCol = {
            songs: this.db.collection("songs")

        }
        this.state = {
            songs: []
        }
        this.syncSongs()
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
    resetSettings = () => {
        localStorage.removeItem("Genshin_Composer_Settings")
        localStorage.removeItem("Genshin_Main_Settings")
        new LoggerEvent("Success", "Settings have been reset").trigger()
    }
    downloadSong = (song) => {
        if (song._id) delete song._id
        let json = JSON.stringify(song)
        let fileDownloader = new FileDownloader()
        fileDownloader.download(json, song.name + ".gensheet")
    }
    render() {
        return <div className="error-page app">
            <div className="error-text-wrapper">
                There seems to be an error. <br />
                Here you can download or delete your songs,
                try to find what song caused the error and remove it.
            </div>
            <div className="error-buttons-wrapper">
                <button className="genshin-button" onClick={this.resetSettings}>
                    Reset settings
                </button>
            </div>
            <div className="error-songs-wrapper">
                {this.state.songs.map(song => {
                    return <SongRow
                        data={song}
                        functions={
                            {
                                deleteSong: this.deleteSong,
                                downloadSong: this.downloadSong
                            }
                        }
                    >

                    </SongRow>
                })}
            </div>
            <button
                className="error-go-back genshin-button"
                onClick={() => this.props.changePage("")}
            >
                Go back to main page
            </button>
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
                <FontAwesomeIcon icon={faDownload} />

            </button>
            <button className="song-button" onClick={() => deleteSong(data.name)}>
                <FontAwesomeIcon icon={faTrash} color="#ed4557" />
            </button>
        </div>
    </div>
}

export default ErrorPage