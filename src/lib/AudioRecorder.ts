import { AUDIO_CONTEXT } from "appConfig";
//@ts-ignore
import toWav from 'audiobuffer-to-wav'
import MediaRecorderPolyfill from 'audio-recorder-polyfill'

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
    async download(urlBlob:Blob, fileName:string) {
        //TODO add file downloader here
        const anchor = document.createElement("a")
        const wav = toWav(await blobToAudio(urlBlob))
        const blob = new Blob([new DataView(wav)], {
            type: 'audio/wav'
        })
        anchor.download = fileName
        anchor.href = URL.createObjectURL(blob)
        anchor.click();
    }
}

function blobToAudio(blob:Blob): Promise<AudioBuffer> {
    return new Promise(resolve => {
        const audioContext = new AudioContext();
        const fileReader = new FileReader();
        function handleLoad(){
            audioContext.decodeAudioData(fileReader.result as ArrayBuffer, (audioBuffer) => {
                resolve(audioBuffer)
            })
        }
        fileReader.addEventListener('loadend',handleLoad, {once: true})
        fileReader.readAsArrayBuffer(blob);
    })
}