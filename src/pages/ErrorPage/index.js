import React, { Component } from 'react'
import { FaTrash, FaDownload } from 'react-icons/fa';
import { DB } from 'Database';
import { FileDownloader } from "lib/Utils"
import { asyncConfirm } from "components/AsyncPrompts"
import { APP_NAME } from "appConfig"
import { SimpleMenu } from 'components/SimpleMenu'
import './ErrorPage.css'
import LoggerStore from 'stores/LoggerStore';
import { SongMenu } from 'components/SongMenu';
class ErrorPage extends Component {
    constructor(props) {
        super(props)
        this.state = {
            songs: []
        }
    }
    componentDidMount() {
        this.syncSongs()
    }
    downloadAllSongs = () => {
        const { songs } = this.state
        const toDownload = songs.map(song => {
            return APP_NAME === 'Sky'? song.toOldFormat() : song.serialize()
        })
        const json = JSON.stringify(toDownload)
        const date = new Date().toISOString().split('T')[0]
        FileDownloader.download(json, `${APP_NAME}_Backup_${date}.json`)
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
    deleteAllSongs = async () => {
        if (await asyncConfirm("Are you sure you want to delete ALL SONGS?")) {
            await DB.removeSong({})
            this.syncSongs()
        }
    }
    resetSettings = () => {
        localStorage.removeItem(APP_NAME + "_Composer_Settings")
        localStorage.removeItem(APP_NAME + "_Main_Settings")
        LoggerStore.success("Settings have been reset")
    }
    downloadSong = (song) => {
        const songName = song.name
        const converted = [APP_NAME === 'Sky'? song.toOldFormat() : song.serialize()]
        const json = JSON.stringify(converted)
        FileDownloader.download(json, `${songName}.${APP_NAME.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
    }
    render() {
        return <div className="error-page app">
            <SimpleMenu />
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
                <SongMenu
                    SongComponent={SongRow}
                    songs={this.state.songs}
                    baseType='recorded'
                    componentProps={{
                        functions: {
                            deleteSong: this.deleteSong,
                            downloadSong: this.downloadSong
                        }
                    }}

                />
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