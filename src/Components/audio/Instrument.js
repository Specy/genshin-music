class Instrument{
    constructor(instrumentName){
        this.instrumentName = instrumentName
        this.layout = []
        this.keyboardLayout = 
            ("Q W E R T Y U "+
             "A S D F G H J "+
             "Z X C V B N M").split(" ")
        
        this.mobileLayout = 
            ("do re mi fa so la ti "+
            "do re mi fa so la ti "+
            "do re mi fa so la ti").split(" ")
        let i = 0
        if(instrumentName === undefined) return
        for(const noteName of this.keyboardLayout){
            let noteNames = {
                keyboard: noteName,
                mobile: this.mobileLayout[i]
            }
            let url = `${window.location.origin}/assets/audio/${instrumentName}/${i}.mp3`
            let note = new NoteData(i,noteNames,url)
            this.layout.push(note)
            i++
        }

    }
    setBuffers = (bufferArray) =>{
        bufferArray.forEach((buffer, i) =>{
            this.layout[i].buffer = buffer
        })
    }
}

class NoteData{
    constructor(index,noteNames,url){
        this.index = index
        this.noteNames = noteNames
        this.url = url 
        this.buffer = new ArrayBuffer(8)
        this.clicked = false
    }
}
export default Instrument