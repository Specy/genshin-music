import {createAudioRecorderPolyfill} from "./MediaRecorderPolyfill";
import {fileService} from "../Services/FileService";

export default class AudioRecorder {
    node: MediaStreamAudioDestinationNode | null
    recorder: MediaRecorder
    audioContext: AudioContext

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext
        this.node = audioContext.createMediaStreamDestination?.() ?? null
        if (!("MediaRecorder" in window)) {
            console.log("Audio recorder Polyfill")
            // @ts-ignore
            this.recorder = new (createAudioRecorderPolyfill(window.AudioContext || window.webkitAudioContext))(this.node?.stream!) as any as MediaRecorder
        } else {
            this.recorder = new MediaRecorder(this.node?.stream!)
        }
    }

    start() {
        this.recorder.start()
    }

    delete() {
        this.node?.disconnect()
        this.node = null
    }

    stop(): Promise<{
        data: Blob,
        toUrl: () => string
    }> {
        return new Promise(resolve => {
            this.recorder.addEventListener('dataavailable', function (e) {
                resolve({
                    data: e.data,
                    toUrl: () => {
                        return URL.createObjectURL(e.data);
                    }
                })
            }, {once: true})
            this.recorder.stop()
        })
    }

    static async downloadBlob(urlBlob: Blob, fileName: string) {
        return fileService.downloadBlobAsWav(urlBlob, fileName)
    }

    async download(urlBlob: Blob, fileName: string) {
        return fileService.downloadBlobAsWav(urlBlob, fileName)
    }
}

