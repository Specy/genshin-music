import { createAudioRecorderPolyfill } from './MediaRecorderPolyfill';
import { fileService } from '$core/Services/FileService';

export default class AudioRecorder {
  node: MediaStreamAudioDestinationNode | null;
  recorder: MediaRecorder;
  audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.node = audioContext.createMediaStreamDestination?.() ?? null;
    // QUIRK: the two `this.node?.stream!` non-null assertions below are unsound on purpose -
    // node is genuinely null when createMediaStreamDestination is unsupported. Preserves that
    // pre-existing crash-on-unsupported-browser risk rather than adding a guard.
    if (!('MediaRecorder' in window)) {
      console.log('Audio recorder Polyfill');
      this.recorder = new (createAudioRecorderPolyfill(
      // @ts-expect-error window.webkitAudioContext (legacy Safari prefix) not in Window type definitions
        window.AudioContext || window.webkitAudioContext
      ))(this.node?.stream!) as unknown as MediaRecorder; // eslint-disable-line @typescript-eslint/no-non-null-asserted-optional-chain
    } else {
      this.recorder = new MediaRecorder(this.node?.stream!); // eslint-disable-line @typescript-eslint/no-non-null-asserted-optional-chain
    }
  }

  start() {
    this.recorder.start();
  }

  delete() {
    this.node?.disconnect();
    this.node = null;
  }

  stop(): Promise<{
    data: Blob;
    toUrl: () => string;
  }> {
    return new Promise((resolve) => {
      this.recorder.addEventListener(
        'dataavailable',
        function (e) {
          resolve({
            data: e.data,
            toUrl: () => {
              return URL.createObjectURL(e.data);
            },
          });
        },
        { once: true }
      );
      this.recorder.stop();
    });
  }

  static async downloadBlob(urlBlob: Blob, fileName: string) {
    return fileService.downloadBlobAsWav(urlBlob, fileName);
  }

  async download(urlBlob: Blob, fileName: string) {
    return fileService.downloadBlobAsWav(urlBlob, fileName);
  }
}
