import {BASE_PATH} from "$config"
import AudioRecorder from "$lib/AudioRecorder"


export type AppAudioNode = {
    node: AudioNode,
    to: AudioDestination | null
}
type AudioDestination = "reverb" | "end"

export class AudioProviderClass {
    audioContext: AudioContext | null = null
    reverbNode: ConvolverNode | null = null
    reverbVolumeNode: GainNode | null = null
    defaultDestination: AudioDestination = "end"
    nodes: AppAudioNode[] = []
    recorder: AudioRecorder | null = null
    isRecording: boolean = false
    reverbLoading: Promise<void> | null = null

    private loadReverb = (): Promise<void> => {
        this.reverbLoading = new Promise(resolve => {
            fetch(`${BASE_PATH}/assets/audio/reverb4.wav`)
                .then(r => r.arrayBuffer())
                .then(b => {
                    if (this.audioContext) {
                        this.audioContext.decodeAudioData(b, (impulse_response) => {
                            const convolver = this.audioContext!.createConvolver()
                            const gainNode = this.audioContext!.createGain()
                            gainNode.gain.value = 2.5
                            convolver.buffer = impulse_response
                            convolver.connect(gainNode)
                            gainNode.connect(this.audioContext!.destination)
                            this.reverbNode = convolver
                            this.reverbVolumeNode = gainNode
                            this.reverbLoading = null
                            resolve()
                        })
                    }
                }).catch((e) => {
                console.error(e)
                this.reverbLoading = null
                resolve()
            })
        })
        return this.reverbLoading
    }
    getAudioContext = (): AudioContext => {
        // @ts-ignore
        if (!this.audioContext) this.audioContext = (new (window.AudioContext || window.webkitAudioContext)())
        return this.audioContext
    }
    waitReverb = async (): Promise<void> => {
        if (this.reverbLoading) {
            await this.reverbLoading
        }
    }
    init = async () => {
        // @ts-ignore
        this.audioContext = this.audioContext ?? (new (window.AudioContext || window.webkitAudioContext)())
        this.recorder = new AudioRecorder(this.audioContext)
        await this.loadReverb()
        this.setAudioDestinations()
        return this
    }

    connect = (node: AudioNode | null, reverbOverride: boolean | null) => {
        if (!node) return this
        this.nodes.push({
            node,
            to: reverbOverride === null ? null : reverbOverride ? 'reverb' : 'end'
        })
        this.setAudioDestinations()
        return this
    }

    destroy = () => {
        this.nodes.forEach(node => node.node.disconnect())
        this.nodes = []
        this.recorder = null
        this.reverbNode = null
        this.reverbVolumeNode = null
    }

    clear = () => {
        this.nodes.forEach(node => node.node.disconnect())
        this.nodes = []
        return this
    }

    disconnect = (node: AudioNode | null) => {
        if (!node) return this
        this.nodes = this.nodes.filter(n => n.node !== node)
        node.disconnect()
        return this
    }

    setReverb = (hasReverb: boolean) => {
        this.defaultDestination = hasReverb ? "reverb" : "end"
        this.setAudioDestinations()
        return this
    }
    setReverbOfNode = (_node: AudioNode | null, hasReverb: boolean | null) => {
        const node = this.nodes.find(n => n.node === _node)
        if (!node) return undefined
        node.to = hasReverb === null ? null : hasReverb ? 'reverb' : 'end'
        this.setNodeDestination(node)
        return node
    }

    startRecording = () => {
        const {recorder, nodes, reverbVolumeNode} = this
        if (!recorder || !recorder.node) return
        if (reverbVolumeNode) reverbVolumeNode.connect(recorder.node)
        for (const node of nodes) {
            const dest = node.to ?? this.defaultDestination
            if (dest === 'end') {
                node.node.connect(recorder.node)
            }
        }
        this.isRecording = true
        recorder.start()
        return this
    }

    stopRecording = async () => {
        const {recorder, reverbVolumeNode, audioContext} = this
        if (!recorder) return
        const recording = await recorder.stop()
        if (reverbVolumeNode && audioContext) {
            reverbVolumeNode.disconnect()
            reverbVolumeNode.connect(this.audioContext!.destination)
        }
        this.isRecording = false
        this.setAudioDestinations()
        return recording
    }
    now = () => {
        return this.audioContext?.currentTime ?? 0
    }
    nowMs = () => {
        return (this.audioContext?.currentTime ?? 0) * 1000
    }
    setAudioDestinations = async () => {
        this.nodes.forEach(node => {
            this.setNodeDestination(node)
        })
        return this
    }

    setNodeDestination(node: AppAudioNode) {
        node.node.disconnect()
        const dest = node.to ?? this.defaultDestination
        if (dest === "reverb") {
            if (!this.reverbNode) {
                console.log("Couldn't connect to reverb")
                if (this.audioContext) node.node.connect(this.audioContext.destination)
            } else {
                node.node.connect(this.reverbNode)
            }
        } else {
            if (this.audioContext) node.node.connect(this.audioContext.destination)
        }
    }

}

export const AudioProvider = new AudioProviderClass()
