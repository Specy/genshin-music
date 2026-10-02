import {describe, it} from 'vitest'
import {InstrumentData, NoteLayer} from './imports'
import {expectGolden} from './golden'

function layerFromBits(...positions: number[]): NoteLayer {
    const layer = new NoteLayer()
    positions.forEach(p => layer.set(p, true))
    return layer
}

describe('NoteLayer wire format', () => {
    it('serialization formats are stable', () => {
        const cases = [
            layerFromBits(),            // empty
            layerFromBits(0),           // single first layer
            layerFromBits(1),
            layerFromBits(0, 1),
            layerFromBits(3),
            layerFromBits(0, 3, 7),
            layerFromBits(15),
            layerFromBits(29),          // near BASE_LAYER_LIMIT
            layerFromBits(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
        ]
        expectGolden('note-layer', cases.map(layer => ({
            hex: layer.serializeHex(),
            bin: layer.serializeBin(),
            array: layer.toArray(),
            isEmpty: layer.isEmpty(),
            roundTripHex: NoteLayer.deserializeHex(layer.serializeHex()).serializeHex(),
            roundTripBin: NoteLayer.deserializeBin(layer.serializeBin()).serializeHex(),
            roundTripDec: NoteLayer.deserializeDec(String(layer.asNumber())).serializeHex(),
            statusNoInstruments: [0, 1, 2].map(p => layer.toLayerStatus(p)),
            statusWithInstruments: [0, 1, 2].map(p => layer.toLayerStatus(p, [
                new InstrumentData({icon: 'border'}),
                new InstrumentData({icon: 'circle'}),
                new InstrumentData({icon: 'line'}),
            ])),
        })))
    })
})
