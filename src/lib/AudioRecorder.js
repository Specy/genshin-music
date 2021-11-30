import { audioContext } from "appConfig";
import toWav from 'audiobuffer-to-wav'
export default class AudioRecorder {
    constructor() {
        this.node = audioContext.createMediaStreamDestination()
        this.recorder = new MediaRecorder(this.node.stream)
    }
    start() {
        this.recorder.start()
    }
    stop() {
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

    async download(urlBlob, fileName) {
        const anchor = document.createElement("a")
        const wav = toWav(await blobToAudio(urlBlob))
        var blob = new Blob([new DataView(wav)], {
            type: 'audio/wav'
        })
        anchor.download = fileName
        anchor.href = URL.createObjectURL(blob)
        anchor.click();
    }
}

function blobToAudio(blob) {
    return new Promise(resolve => {
        const audioContext = new AudioContext();
        const fileReader = new FileReader();
        fileReader.onloadend = () => {
            audioContext.decodeAudioData(fileReader.result, (audioBuffer) => {
                resolve(audioBuffer)
            });
        };
        fileReader.readAsArrayBuffer(blob);
    })
}