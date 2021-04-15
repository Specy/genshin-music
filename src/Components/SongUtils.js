
class Recording{
    constructor(){
      this.start = new Date().getTime()
      this.notes = []
    }
    init = () => {
      this.start = new Date().getTime() - 100
      console.log("Started new recording")
    }
    addNote = (index) => {
      if(this.notes.length === 0) this.init()
      let currentTime = new Date().getTime()
      let note = [index, currentTime - this.start]
      this.notes.push(note)
    }
  }
class Song{
       constructor(name,notes,data){
           this.name = name
           this.notes = notes
           if(data !== undefined){
               this.data = {}
           }
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
export {
    Recording,
    Song,
    NoteData
}