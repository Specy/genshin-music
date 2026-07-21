// old: src/lib/audio/MediaRecorderPolyfill.ts (Original source: https://github.com/ai/audio-recorder-polyfill).
// VERBATIM runtime port (Phase-4a Task 2) - the stringified-worker (`createWorker`'s
// `fn.toString()` blob trick) and the `ScriptProcessorNode`-based encode pipeline are both
// deprecated browser mechanisms, kept AS-IS per this task's brief ("flag deprecation, do NOT
// modernize"). Only two classes of change were made, both compiler/lint-forced with zero runtime
// behavior change: (1) `Timer` now imported from `$core/utils/Utilities` (old `$types/GeneralTypes`
// doesn't exist in this tree - Timer relocated there in P3 Task 2); (2) every bare `// @ts-ignore`
// (banned outright by this repo's `@typescript-eslint/ban-ts-comment` outside `src/lib/core/`)
// converted to `// @ts-expect-error <reason>` or a targeted `eslint-disable-next-line` where the
// underlying value is genuinely dynamic (see each comment below) - same fix pattern as
// KeyboardProvider.ts (Phase-4a Task 1) and PwaStore.svelte.ts (Phase-3 Task 2).
// ScriptProcessorNode: deprecated in favor of AudioWorkletNode; not modernized here (out of scope).

import type {Timer} from "$core/utils/Utilities"


type EventName = "start" | "stop" | "pause" | "resume" | "dataavailable" | "error"

// `AudioContext` here is a SHADOWING parameter (the real global AudioContext constructor, or its
// legacy webkit variant, is passed in by the caller: `createAudioRecorderPolyfill(window.AudioContext
// || window.webkitAudioContext)`), not the global type. Typing it precisely would need a real
// AudioContext-or-webkitAudioContext constructor signature (webkitAudioContext has no official
// types) - genuinely dynamic, not a mechanical fix, verbatim from the old blob.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAudioRecorderPolyfill(AudioContext: any) {
    const waveEncoder = () => {
        const BYTES_PER_SAMPLE = 2

        let recorded: Uint8Array[] = []

        function encode(buffer: Uint8Array) {
            const length = buffer.length
            const data = new Uint8Array(length * BYTES_PER_SAMPLE)
            for (let i = 0; i < length; i++) {
                const index = i * BYTES_PER_SAMPLE
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
            const bufferLength = recorded.length ? recorded[0].length : 0
            const length = recorded.length * bufferLength
            const wav = new Uint8Array(44 + length)
            const view = new DataView(wav.buffer)

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
            // @ts-expect-error this function's body is stringified and executed inside the real
            // Worker created below (createWorker's fn.toString() blob trick), where postMessage is
            // DedicatedWorkerGlobalScope.postMessage(message, transfer) - but this file's own "dom"
            // lib (no "webworker") makes the *static* checker resolve the Window overload set
            // instead, which wants a string targetOrigin as the 2nd argument. Zero runtime issue.
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

    // old: `(fn: Function) => {...}` - `Function` is banned by `no-unsafe-function-type`; this is
    // only ever called with `MediaRecorder.encoder` (`waveEncoder`, a niladic function) and only
    // `.toString()`s it, so a variadic-void signature is call-site-accurate with zero behavior
    // change (same substitution already established for `debounce` in P3 Task 2).
    const createWorker = (fn: (...args: unknown[]) => unknown) => {
        const js = fn
            .toString()
            .replace(/^(\(\)\s*=>|function\s*\(\))\s*{/, '')
            .replace(/}$/, '')
        const blob = new Blob([js])
        return new Worker(URL.createObjectURL(blob))
    }

    // old: `(method: any) => {...}` - every call site passes a string literal ('start', 'stop',
    // 'pause', 'resume', 'requestData'); narrowing `any` -> `string` is call-site-accurate with
    // zero behavior change (not a suppressed-error spot, so no @ts-ignore was here to convert).
    const error = (method: string) => {
        const event = new Event('error')
        // @ts-expect-error Event has no `data` property - polyfill attaches one dynamically, same as the real MediaRecorder's ErrorEvent-ish `error` event shape
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque pass-through options bag handed to the shadowed `AudioContext(this.config)` constructor above; verbatim from the old blob
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
            // @ts-expect-error MediaRecorder.encoder is assigned dynamically near the bottom of this file (`MediaRecorder.encoder = waveEncoder`), not declared as a static class member
            this.encoder = createWorker(MediaRecorder.encoder)

            // verbatim `this`-capture from the old blob (kept per this file's "VERBATIM, do NOT
            // modernize" scope - even though the callback below is already an arrow function and
            // could read `this` directly)
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const recorder = this
            this.encoder.addEventListener('message', e => {
                const event = new Event('dataavailable')
                // @ts-expect-error Event has no `data` property (see `error()` above); `recorder.mimeType` is assigned dynamically via `MediaRecorder.prototype.mimeType` near the bottom of this file
                event.data = new Blob([e.data], {type: recorder.mimeType})
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


        addEventListener(...args: [EventName, EventListener]) {
            this.em.addEventListener(...args)
        }

        removeEventListener(...args: [EventName, EventListener]) {
            this.em.removeEventListener(...args)
        }

        dispatchEvent(...args: [Event]) {
            this.em.dispatchEvent(...args)
        }
    }

    // @ts-expect-error mimeType is a polyfill-only prototype addition, not part of the standard MediaRecorder shape declared above
    MediaRecorder.prototype.mimeType = 'audio/wav'

    // @ts-expect-error isTypeSupported is a polyfill-only static addition, not part of the standard MediaRecorder shape declared above
    MediaRecorder.isTypeSupported = mimeType => {
        // @ts-expect-error MediaRecorder.prototype.mimeType is the dynamic prototype addition above
        return MediaRecorder.prototype.mimeType === mimeType
    }

    // @ts-expect-error notSupported is a polyfill-only static addition, not part of the standard MediaRecorder shape declared above
    MediaRecorder.notSupported = !navigator.mediaDevices || !AudioContext

    // @ts-expect-error encoder is a polyfill-only static addition, not part of the standard MediaRecorder shape declared above
    MediaRecorder.encoder = waveEncoder
    return MediaRecorder
}
