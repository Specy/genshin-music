import { EMPTY_LAYER } from "appConfig"


//1 = has current layer, 2 = has other layers, 3 = has both
export type LayerStatus = 1 | 2 | 3
export class NoteLayer{
    private data: number
    static EMPTY_LAYER = new NoteLayer(0)
    constructor(layer: number = 0){
        this.data = layer
    }

    setData(data: number){
        this.data = data
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
    }
    toggle(position: number){
        this.data ^= (1 << position);
    }
    test(position: number){
        return (this.data & (1 << position)) !== 0
    }
    toLayerStatus(position: number){
        const isSelected = this.test(position)
        if(this.data === 1 << position) return 1
        return isSelected ? 3 : 2
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
