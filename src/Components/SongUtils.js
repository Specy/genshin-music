import { faTintSlash } from "@fortawesome/free-solid-svg-icons"

class Recording {
  constructor() {
    this.start = new Date().getTime()
    this.notes = []
  }
  init = () => {
    this.start = new Date().getTime() - 100
    console.log("Started new recording")
  }
  addNote = (index) => {
    if (this.notes.length === 0) this.init()
    let currentTime = new Date().getTime()
    let note = [index, currentTime - this.start]
    this.notes.push(note)
  }
}
class Song {
  constructor(name, notes = [], data = {}) {
    this.name = name
    this.version = 1
    this.notes = notes
    this.data = {
      isComposed: false,
      isComposedVersion: false
    }
    Object.entries(data).forEach((entry) => {
      this.data[entry[0]] = entry[1]
    })
  }
}
class LoggerEvent {
  constructor(title, text, timeout) {
    this.title = title
    this.timeout = timeout
    this.text = text
    if (timeout === undefined) this.timeout = 3000
    this.event = new CustomEvent("logEvent", {
      detail: {
        title: this.title,
        text: this.text,
        timeout: this.timeout
      }
    })
  }
  trigger = () => {
    window.dispatchEvent(this.event)
  }
}
class NoteData {
  constructor(index, noteNames, url) {
    this.index = index
    this.noteNames = noteNames
    this.url = url
    this.buffer = new ArrayBuffer(8)
    this.clicked = false
  }
}
class PlayingSong {
  constructor(notes) {
    this.timestamp = new Date().getTime()
    this.notes = notes
  }
}
class FileDownloader {
  constructor(type) {
    if (type === undefined) type = "text/json"
    this.dataType = "data:" + type + ";charset=utf-8,"
  }
  download = (file, name) => {
    let data = this.dataType + encodeURIComponent(file)
    var el = document.createElement("a")
    el.style = "display:none"
    document.body.appendChild(el)
    el.setAttribute("href", data)
    el.setAttribute("download", name)
    el.click();
    el.remove();
  }
}

let TempoChangers = [
  {
    id: 0,
    text: "1",
    changer: 1,
    color: 0x515c6f
  },{
    id: 1,
    text: "1/2",
    changer: 1/2,
    color: 0x4d694e
  },{
    id: 2,
    text: "1/4",
    changer: 1/3,
    color: 0x434c7d
  },{
    id: 3,
    text: "1/8",
    changer: 1/4,
    color: 0x6f5168
  }
]
class ComposedSong {
  constructor(name, notes = [], data = {}) {
    data.isComposed = true
    data.isComposedVersion = true
    this.data = data
    this.name = name
    this.bpm = 220
    this.notes = notes
    this.columns = []
    this.selected = 0
    new Array(100).fill().forEach((e) => {
      this.columns.push(new Column())
    })
    console.log("created new composed song")
  }

}
class Column {
  constructor(color = 0x515c6f) {
    this.notes = []
    this.color = color
    this.TempoChangers = 0
  }
}


class ColumnNote {
  constructor(index, layer = 0, color = 0xd3bd8e) {
    this.index = index
    this.layer = layer
    this.color = color
  }
}

function randomNum(min, max) {
  return Math.floor(Math.random() * max) + min
}
export {
  Recording,
  Song,
  NoteData,
  FileDownloader,
  LoggerEvent,
  PlayingSong,
  ComposedSong,
  ColumnNote,
  Column,
  TempoChangers
}