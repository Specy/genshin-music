import { InstrumentData } from "./Songs/SongClasses"

//map of the possible combinations of instruments, in binary, 
export type LayerStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16


const HAS_BIGINT = typeof BigInt !== 'undefined'
//ugly way to make it backwards compatible with devices that don't have bigint
export class NoteLayer {
    static MAX_LAYERS = HAS_BIGINT ? 52 : 30
    static BIGGEST_LAYER = HAS_BIGINT ? (1n << BigInt(NoteLayer.MAX_LAYERS)) : (1 << NoteLayer.MAX_LAYERS)
    static MIN_LAYERS = 0
    private data: bigint | number
    static EMPTY_LAYER = new NoteLayer(0)
    constructor(layer: bigint | number = 0, ignoreMax = false) {
        if (!ignoreMax && layer > NoteLayer.BIGGEST_LAYER){
            throw new Error(`Layer ${layer.toString(2).length} Exceeds Max Layers of ${NoteLayer.MAX_LAYERS} layers`)
        }
        if (HAS_BIGINT) {
            this.data = BigInt(layer)
        } else {
            this.data = layer
        }
    }
    static maxLayer(layers: NoteLayer[]) {
        if (layers.length === 0) return NoteLayer.MIN_LAYERS
        let max = layers[0].data
        for (const layer of layers) {
            if (layer.data > max) max = layer.data
        }
        return max
    }
    clear() {
        this.data = 0n
    }
    asNumber() {
        return this.data
    }
    set(position: number, value: boolean) {
        if (HAS_BIGINT) {
            if (value) {
                //@ts-ignore
                this.data |= (1n << BigInt(position))
            } else {
                //@ts-ignore
                this.data &= ~(1n << BigInt(position))
            }
        } else {
            if (value) {
                //@ts-ignore
                this.data |= (1 << position)
            } else {
                //@ts-ignore
                this.data &= ~(1 << position)
            }
        }

    }
    toggle(position: number) {
        if (HAS_BIGINT) {
            //@ts-ignore
            this.data ^= (1n << BigInt(position));
        } else {
            //@ts-ignore
            this.data ^= (1 << position);
        }
    }
    test(position: number) {
        if (HAS_BIGINT) {
            //@ts-ignore
            return (this.data & (1n << BigInt(position))) !== 0n
        } else {
            //@ts-ignore
            return (this.data & (1 << position)) !== 0
        }
    }

    toLayerStatus(position: number, instruments?: InstrumentData[]): LayerStatus {
        if (instruments) {
            let note = this.test(position) ? 1 : 0
            for (let i = 0; i < instruments.length; i++) {
                if (i !== position && this.test(i) && instruments[i].visible) {
                    note |= (1 << instruments[i].toNoteIcon())
                }
            }
            return note as LayerStatus
        } else {
            const isSelected = this.test(position)
            if (this.data === 1n << BigInt(position)) return 1
            return isSelected ? 3 : 2
        }
    }
    toArray() {
        return this.serializeBin().split('').map(x => parseInt(x)).reverse()
    }
    isEmpty() {
        return this.data === 0n
    }
    serializeHex() {
        return this.data.toString(16)
    }
    serializeBin() {
        return this.data.toString(2)
    }
    static deserializeHex(str: string, ignoreMax = false) {
        if (HAS_BIGINT) return new NoteLayer(BigInt('0x' + str), ignoreMax)
        return new NoteLayer(parseInt(str, 16), ignoreMax)
    }
    static deserializeBin(str: string) {
        if (HAS_BIGINT) return new NoteLayer(BigInt('0b' + str))
        return new NoteLayer(parseInt(str, 2))
    }
    static deserializeDec(str: string) {
        if (HAS_BIGINT) return new NoteLayer(BigInt(str))
        return new NoteLayer(parseInt(str, 10))
    }
    clone() {
        return new NoteLayer(this.data)
    }
}


