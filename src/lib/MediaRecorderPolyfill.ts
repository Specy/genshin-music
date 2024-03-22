// Original source: https://github.com/ai/audio-recorder-polyfill

import {Timer} from "$types/GeneralTypes"


type EventName = "start" | "stop" | "pause" | "resume" | "dataavailable" | "error"
export function createAudioRecorderPolyfill(AudioContext: any) {
  let waveEncoder = () => {
    let BYTES_PER_SAMPLE = 2

    let recorded: Uint8Array[] = []

    function encode(buffer: Uint8Array) {
      let length = buffer.length
      let data = new Uint8Array(length * BYTES_PER_SAMPLE)
      for (let i = 0; i < length; i++) {
        let index = i * BYTES_PER_SAMPLE
        let sample = buffer[i]
        if (sample > 1) {
          sample = 1
        } else if (sample < -1) {
          sample = -1
        }
        sample = sample * 32768
        data[index] = sample
        data[index + 1] = sample >> 8
      }
      recorded.push(data)
    }

    function dump(sampleRate: number) {
      let bufferLength = recorded.length ? recorded[0].length : 0
      let length = recorded.length * bufferLength
      let wav = new Uint8Array(44 + length)
      let view = new DataView(wav.buffer)

      // RIFF identifier 'RIFF'
      view.setUint32(0, 1380533830, false)
      // file length minus RIFF identifier length and file description length
      view.setUint32(4, 36 + length, true)
      // RIFF type 'WAVE'
      view.setUint32(8, 1463899717, false)
      // format chunk identifier 'fmt '
      view.setUint32(12, 1718449184, false)
      // format chunk length
      view.setUint32(16, 16, true)
      // sample format (raw)
      view.setUint16(20, 1, true)
      // channel count
      view.setUint16(22, 1, true)
      // sample rate
      view.setUint32(24, sampleRate, true)
      // byte rate (sample rate * block align)
      view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true)
      // block align (channel count * bytes per sample)
      view.setUint16(32, BYTES_PER_SAMPLE, true)
      // bits per sample
      view.setUint16(34, 8 * BYTES_PER_SAMPLE, true)
      // data chunk identifier 'data'
      view.setUint32(36, 1684108385, false)
      // data chunk length
      view.setUint32(40, length, true)
      for (let i = 0; i < recorded.length; i++) {
        wav.set(recorded[i], i * bufferLength + 44)
      }

      recorded = []
      postMessage(wav.buffer, [wav.buffer])
    }

    onmessage = e => {
      if (e.data[0] === 'encode') {
        encode(e.data[1])
      } else if (e.data[0] === 'dump') {
        dump(e.data[1])
      }
    }
  }

  let createWorker = (fn: Function) => {
    let js = fn
      .toString()
      .replace(/^(\(\)\s*=>|function\s*\(\))\s*{/, '')
      .replace(/}$/, '')
    let blob = new Blob([js])
    return new Worker(URL.createObjectURL(blob))
  }

  let error = (method: any) => {
    let event = new Event('error')
    // @ts-ignore
    event.data = new Error('Wrong state for ' + method)
    return event
  }

  let context: AudioContext

  /**
   * Audio Recorder with MediaRecorder API.
   *
   * @example
   * navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
   *   let recorder = new MediaRecorder(stream)
   * })
   */
  class MediaRecorder {
    stream: MediaStream
    config: any
    state: "inactive" | "recording" | "paused"
    em: DocumentFragment
    encoder: Worker
    clone: MediaStream | undefined
    input: MediaStreamAudioSourceNode | undefined
    processor: ScriptProcessorNode | undefined
    slicing: Timer | undefined
    constructor(stream: MediaStream, config = null) {
      this.stream = stream
      this.config = config
      this.state = 'inactive'

      this.em = document.createDocumentFragment()
      // @ts-ignore
      this.encoder = createWorker(MediaRecorder.encoder)

      let recorder = this
      this.encoder.addEventListener('message', e => {
        let event = new Event('dataavailable')
        // @ts-ignore
        event.data = new Blob([e.data], { type: recorder.mimeType })
        recorder.em.dispatchEvent(event)
        if (recorder.state === 'inactive') {
          recorder.em.dispatchEvent(new Event('stop'))
        }
      })
    }


    start(timeslice: number) {
      if (this.state !== 'inactive') {
        return this.em.dispatchEvent(error('start'))
      }

      this.state = 'recording'

      if (!context) {
        context = new AudioContext(this.config)
      }
      this.clone = this.stream.clone()
      this.input = context.createMediaStreamSource(this.clone)
      this.processor = context.createScriptProcessor(2048, 1, 1)

      this.encoder.postMessage(['init', context.sampleRate])

      this.processor.onaudioprocess = e => {
        if (this.state === 'recording') {
          this.encoder.postMessage(['encode', e.inputBuffer.getChannelData(0)])
        }
      }

      this.input.connect(this.processor)
      this.processor.connect(context.destination)

      this.em.dispatchEvent(new Event('start'))

      if (timeslice) {
        this.slicing = setInterval(() => {
          if (this.state === 'recording') this.requestData()
        }, timeslice)
      }

      return undefined
    }

    /**
     * Stop media capture and raise `dataavailable` event with recorded data.
     *
     * @return {undefined}
     *
     * @example
     * finishButton.addEventListener('click', () => {
     *   recorder.stop()
     * })
     */
    stop() {
      if (this.state === 'inactive') {
        return this.em.dispatchEvent(error('stop'))
      }

      this.requestData()
      this.state = 'inactive'
      this.clone!.getTracks().forEach(track => {
        track.stop()
      })
      this.processor!.disconnect()
      this.input!.disconnect()
      return clearInterval(this.slicing)
    }

    /**
     * Pauses recording of media streams.
     *
     * @return {undefined}
     *
     * @example
     * pauseButton.addEventListener('click', () => {
     *   recorder.pause()
     * })
     */
    pause() {
      if (this.state !== 'recording') {
        return this.em.dispatchEvent(error('pause'))
      }

      this.state = 'paused'
      return this.em.dispatchEvent(new Event('pause'))
    }

    /**
     * Resumes media recording when it has been previously paused.
     *
     * @return {undefined}
     *
     * @example
     * resumeButton.addEventListener('click', () => {
     *   recorder.resume()
     * })
     */
    resume() {
      if (this.state !== 'paused') {
        return this.em.dispatchEvent(error('resume'))
      }

      this.state = 'recording'
      return this.em.dispatchEvent(new Event('resume'))
    }

    /**
     * Raise a `dataavailable` event containing the captured media.
     *
     * @return {undefined}
     *
     * @example
     * this.on('nextData', () => {
     *   recorder.requestData()
     * })
     */
    requestData() {
      if (this.state === 'inactive') {
        return this.em.dispatchEvent(error('requestData'))
      }

      return this.encoder.postMessage(['dump', context.sampleRate])
    }


    addEventListener(...args: [EventName, Function]) {
      // @ts-ignore
      this.em.addEventListener(...args)
    }

    removeEventListener(...args: [EventName, Function]) {
      // @ts-ignore
      this.em.removeEventListener(...args)
    }

    dispatchEvent(...args: [Event]) {
      this.em.dispatchEvent(...args)
    }
  }

  // @ts-ignore
  MediaRecorder.prototype.mimeType = 'audio/wav'

  // @ts-ignore
  MediaRecorder.isTypeSupported = mimeType => {
    // @ts-ignore
    return MediaRecorder.prototype.mimeType === mimeType
  }

  // @ts-ignore

  MediaRecorder.notSupported = !navigator.mediaDevices || !AudioContext

  // @ts-ignore
  MediaRecorder.encoder = waveEncoder
  return MediaRecorder
}