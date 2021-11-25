import { audioContext } from "../appConfig";
export default class AudioRecorder{
    constructor(){
        this.node = audioContext.createMediaStreamDestination()
        this.recorder = new MediaRecorder(this.node.stream)
    }
    start(){
        this.recorder.start()
    }
    stop(){
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
    download(urlBlob,fileName){
        const anchor = document.createElement("a")
        anchor.download = fileName
        anchor.href = urlBlob
        anchor.click();
    }
}