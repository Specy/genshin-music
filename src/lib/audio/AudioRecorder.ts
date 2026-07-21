// old: src/lib/audio/AudioRecorder.ts - minimal-diff port; imports only (`../Services/FileService`
// -> `$core/Services/FileService`). Bare `// @ts-ignore` (banned outside `src/lib/core/`)
// converted to `// @ts-expect-error`; `as any as MediaRecorder` -> `as unknown as MediaRecorder`
// (banned `no-explicit-any` - `unknown` is the standard cast-through idiom for the same
// "compiler can't verify this reinterpretation" escape hatch, zero behavior change).
import {createAudioRecorderPolyfill} from "./MediaRecorderPolyfill";
import {fileService} from "$core/Services/FileService";

export default class AudioRecorder {
    node: MediaStreamAudioDestinationNode | null
    recorder: MediaRecorder
    audioContext: AudioContext

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext
        this.node = audioContext.createMediaStreamDestination?.() ?? null
        // both `this.node?.stream!` non-null-assertions-on-optional-chains below are verbatim from
        // the old blob: `this.node` is only null when createMediaStreamDestination is unsupported,
        // an accepted pre-existing risk, not introduced here (eslint-disable-line trailing comments
        // used since a leading @ts-expect-error already occupies the line above the first one)
        if (!("MediaRecorder" in window)) {
            console.log("Audio recorder Polyfill")
            // @ts-expect-error window.webkitAudioContext (legacy Safari prefix) not in Window type definitions
            this.recorder = new (createAudioRecorderPolyfill(window.AudioContext || window.webkitAudioContext))(this.node?.stream!) as unknown as MediaRecorder // eslint-disable-line @typescript-eslint/no-non-null-asserted-optional-chain
        } else {
            this.recorder = new MediaRecorder(this.node?.stream!) // eslint-disable-line @typescript-eslint/no-non-null-asserted-optional-chain
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
