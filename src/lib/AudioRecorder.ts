import { AUDIO_CONTEXT } from "$/appConfig";
import MediaRecorderPolyfill from 'audio-recorder-polyfill'
import { fileService } from "./Services/FileService";

export default class AudioRecorder {
    node: MediaStreamAudioDestinationNode | null
    recorder: MediaRecorder
    constructor() {
        this.node = AUDIO_CONTEXT.createMediaStreamDestination()
        if(!window.MediaRecorder){
            console.log("Audio recorder Polyfill")
            this.recorder = new MediaRecorderPolyfill(this.node.stream)
        }else{
            this.recorder = new MediaRecorder(this.node.stream)
        }
    }
    start() {
        this.recorder.start()
    }
    delete(){
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
            }, { once: true })
            this.recorder.stop()
        })
    }
    static async downloadBlob(urlBlob:Blob, fileName:string){
        fileService.downloadBlobAsWav(urlBlob, fileName)

    }
    async download(urlBlob:Blob, fileName:string) {
        fileService.downloadBlobAsWav(urlBlob, fileName)
    }
}

