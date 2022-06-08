import { EMPTY_LAYER } from "appConfig"
import { CombinedLayer } from "types/GeneralTypes"


export class NoteLayer{
    private data: number
    legacyString: CombinedLayer
    static EMPTY_LAYER = new NoteLayer(0)
    constructor(layer: number = 0){
        this.data = layer
        this.legacyString = EMPTY_LAYER
        this.setLegacyString()
    }
    private setLegacyString(){
        const finalLayer = EMPTY_LAYER.split("")
        const string = finalLayer.map((_,i) => 
                this.test(i) ? "1" : "0"
            ).join("") as CombinedLayer
        this.legacyString = string
    }
    setData(data: number){
        this.data = data
        this.setLegacyString()
    }
    asNumber(){
        return this.data
    }
    set(position: number, value: boolean){
        if(value){
            this.data |= (1 << position)
        }else{
            this.data &= ~(1 << position)
        }
        this.setLegacyString()
    }
    toggle(position: number){
        this.data ^= (1 << position);
        this.setLegacyString()
    }
    test(position: number){
        return (this.data & (1 << position)) !== 0
    }

    toArray(){
        return this.serializeBin().split('').map(x => parseInt(x)).reverse()
    }
    isEmpty(){
        return this.data === 0
    }
    serializeHex(){
        return this.data.toString(16)
    }
    serializeBin(){
        return this.data.toString(2)
    }

    static deserializeHex(str: string){
        return new NoteLayer(parseInt(str, 16))
    }
    static deserializeBin(str: string){
        return new NoteLayer(parseInt(str, 2))
    }
    static deserializeDec(str: string){
        return new NoteLayer(parseInt(str, 10))
    }
    clone = () => {
        return new NoteLayer(this.data)
    }
}
