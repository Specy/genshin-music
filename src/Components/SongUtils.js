import { importNotePositions, appName, instruments } from "../appConfig"
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
    this.bpm = 220
    this.pitch = "C"
    this.data = {
      isComposed: false,
      isComposedVersion: false,
      appName: appName
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
  }, {
    id: 1,
    text: "1/2",
    changer: 1 / 2,
    color: 0x517553
  }, {
    id: 2,
    text: "1/4",
    changer: 1 / 4,
    color: 0x434c7d
  }, {
    id: 3,
    text: "1/8",
    changer: 1 / 8,
    color: 0x774D6D
  }
]
class ComposedSong {
  constructor(name, notes = [], data = {}) {
    data.isComposed = true
    data.isComposedVersion = true
    this.version = 1
    this.data = data
    this.name = name
    this.bpm = 220
    this.pitch = "C"
    this.notes = notes
    this.instruments = [instruments[0], instruments[0], instruments[0]]
    this.breakpoints = [0]
    this.columns = []
    this.selected = 0
    new Array(100).fill().forEach((e) => {
      let column = new Column()
      column.tempoChanger = 0
      this.columns.push(column)
    })
  }
}


function ComposerSongDeSerialization(song) {
  let obj = {
    data: song.data,
    name: song.name,
    bpm: song.bpm ?? 220,
    pitch: song.pitch ?? "C",
    instruments: song.instruments || [instruments[0], instruments[0], instruments[0]],
    breakpoints: song.breakpoints ?? [],
    notes: [],
    selected: 0,
    columns: []
  }
  song.columns.forEach(column => {
    let columnObj = new Column()
    columnObj.tempoChanger = column[0]
    column[1].forEach(note => {
      columnObj.notes.push(new ColumnNote(note[0], note[1]))
    })
    obj.columns.push(columnObj)
  })
  return obj
}
function ComposerToRecording(song) {
  let recordedSong = new Song(song.name)
  let bpmPerMs = Math.floor(60000 / song.bpm)
  let totalTime = 100
  song.columns.forEach(column => {
    column[1].forEach(note => {
      recordedSong.notes.push([note[0], totalTime])
    })
    totalTime += Math.floor(bpmPerMs * TempoChangers[column[0]].changer)
  })
  return recordedSong
}
function ComposerSongSerialization(song) {
  let obj = {
    data: song.data,
    name: song.name,
    bpm: song.bpm,
    pitch: song.pitch,
    breakpoints: song.breakpoints,
    instruments: song.instruments,
    columns: []
  }
  obj.data.appName = appName
  /*
      notes = [tempoChanger,notes] ----> note = [index,layer]
      tempoChanger = Number
  */
  song.columns.forEach(column => {
    let columnArr = [column.tempoChanger]
    let notes = column.notes.map(note => {
      return [note.index, note.layer]
    })
    columnArr[1] = notes
    obj.columns.push(columnArr)
  })
  return obj
}
function prepareSongDownload(song){
  let finalSong = JSON.parse(JSON.stringify(song)) //lose reference
  let oldFormatNotes = {}
  if(finalSong.data?.isComposedVersion){
    oldFormatNotes = composedToOldFormat(finalSong)
  }else{
    oldFormatNotes = recordedToOldFormat(finalSong)
  }
  finalSong.isComposed = finalSong.data.isComposedVersion
  finalSong.pitchLevel = pitchArr.indexOf(finalSong.pitch)
  finalSong.songNotes = oldFormatNotes
  finalSong.bitsPerPage = 16
  finalSong.isEncrypted = false
  return [finalSong] //for compatibility, add back to an array, it will be ignored when importing
  //from this app
}

function prepareSongImport(song){
  //TODO add multi songs in the same file
  if (Array.isArray(song) && song.length > 0) song = song[0]
  let type = getSongType(song)
  if (type === "none") {
      new LoggerEvent("Error", "Invalid song").trigger()
      throw new Error("Error Invalid song")
  }
  if (type === "oldSky") {
      song = oldSkyToNewFormat(song)
  }
  if(appName === 'Sky' && song.data?.appName !== 'Sky'){
      new LoggerEvent("Error", "Invalid song").trigger()
      throw new Error("Error Invalid song")
  }
  if(appName === 'Genshin' && song.data?.appName === 'Sky'){
      song = newSkyFormatToGenshin(song)
  }
  return song
}

function composedToOldFormat(song){
  let convertedNotes = []
  let bpmPerMs = Math.floor(60000 / song.bpm)
  let totalTime = 100
  song.columns.forEach(column => {
    column[1].forEach(note => {
      let layer = 1
      if(note[1] === '111') layer = 3
      if(note[1] === '011') layer = 2
      if(note[1] === '101') layer = 3
      if(note[1] === '001') layer = 2
      if(note[1] === '110') layer = 3
      if(note[1] === '010') layer = 2
      if(note[1] === '100') layer = 1
      let noteObj = {
        key:(layer > 2 ? 2 : layer)+'Key'+note[0],
        time:totalTime
      }
      if(layer > 2) noteObj.l = 3
      convertedNotes.push(noteObj)
    })
    totalTime += Math.floor(bpmPerMs * TempoChangers[column[0]].changer)
  })
  return convertedNotes
}

function recordedToOldFormat(song){
  let convertedNotes = []
  song.notes.forEach(note =>{
    convertedNotes.push({
      time: note[1],
      key: "1Key"+note[0]
    })
  })
  return convertedNotes
}
function getSongType(song) {
  try {
    if (song.data === undefined) {
      //oldSky format
      if(song.songNotes !== undefined && song.pitchLevel !== undefined){
        return "oldSky"
      }
    } else {
      //current format
      if (song.data.isComposedVersion) {
        if (typeof song.name !== "string") return "none"
        if (typeof song.bpm !== "number") return "none"
        if (!pitchArr.includes(song.pitch)) return "none"
        if (Array.isArray(song.breakpoints)) {
          if (song.breakpoints.length > 0) {
            if (typeof song.breakpoints[0] !== "number") return "none"
          }
        } else {
          return "none"
        }
        if (Array.isArray(song.columns)) {
          if (song.columns.length > 0) {
            let column = song.columns[0]
            if (typeof column[0] !== "number") return "none"
          }
        } else {
          return "none"
        }
        return "newComposed"
      } else {
        if (typeof song.name !== "string") return "none"
        if (typeof song.bpm !== "number") return "none"
        if (!pitchArr.includes(song.pitch)) return "none"
        return "newRecorded"
      }
    }

  } catch (e) {
    console.log(e)
    return "none"
  }
  return "none"
}
let genshinLayout = importNotePositions

function newSkyFormatToGenshin(song){
  if(song.data.isComposedVersion){
    song.instruments = song.instruments.map(instrument => 'Lyre')
    song.columns.forEach(column =>{
      column[1] = column[1].map(note => {
        return [genshinLayout[note[0]] , note[1]]
      })

    })
  }
  if(!song.data.isComposedVersion){
    song.notes = song.notes.map(note => {
      note[0] = genshinLayout[note[0]]
      return note
    })
  }
  return song
}

function oldSkyToNewFormat(song) {
  let result = new Song("Error")
  try {
    result = new Song(song.name)
    result.bpm = song.bpm || 220
    result.pitch = (pitchArr[song.pitchLevel || 0]) || "C"
    //remove duplicate notes
    song.songNotes = song.songNotes.filter((note, index, self) =>
      index === self.findIndex((n) => {
        return n.key.split('Key')[1] === note.key.split('Key')[1] && n.time === note.time
      })
    )
    let songNotes = song.songNotes
    songNotes.forEach(note => {
      let data = note.key.split("Key")
      result.notes.push([genshinLayout[data[1]], note.time, note.l ?? Number(data[0])])
    })

    if ([true, "true"].includes(song.isComposed)) {
      result = ComposerSongSerialization(RecordingToComposed(result))
    } else {
      result.notes = result.notes.map(e => [e[0], e[1]])
    }


  } catch (e) {
    console.log(e)
    return new Song("Error importing")
  }
  return result
}
function RecordingToComposed(song) {
  let bpmToMs = Math.floor(60000 / song.bpm)
  let composed = new ComposedSong(song.name, [])
  composed.bpm = song.bpm
  composed.pitch = song.pitch
  let notes = song.notes
  //remove duplicates

  let converted = []
  let grouped = groupByNotes(notes, bpmToMs / 9)
  let combinations = [bpmToMs, Math.floor(bpmToMs / 2), Math.floor(bpmToMs / 4), Math.floor(bpmToMs / 8)]
  for (let i = 0; i < grouped.length; i++) {
    let column = new Column()
    column.notes = grouped[i].map(note => {
      let columnNote = new ColumnNote(note[0])
      if (note[2] === 0) columnNote.layer = "100"
      if (note[2] === 1) columnNote.layer = "100"
      if (note[2] === 2) columnNote.layer = "010"
      if (note[2] === 3) columnNote.layer = "110"
      if (note[2] === undefined) columnNote.layer = "100"
      return columnNote
    })
    let next = grouped[i + 1] || [[0, 0, 0]]
    let difference = next[0][1] - grouped[i][0][1]
    let paddingColumns = []
    while (difference >= combinations[3]) {
      if (difference / combinations[0] >= 1) {
        difference -= combinations[0]
        paddingColumns.push(0)
      } else if (difference / combinations[1] >= 1) {
        difference -= combinations[1]
        paddingColumns.push(1)
      } else if (difference / combinations[2] >= 1) {
        difference -= combinations[2]
        paddingColumns.push(2)
      } else if (difference / combinations[3] >= 1) {
        difference -= combinations[3]
        paddingColumns.push(3)
      }
    }
    let finalPadding = []
    column.tempoChanger = paddingColumns.shift() || 0
    paddingColumns = paddingColumns.forEach((col, i) => {
      let column = new Column()
      column.tempoChanger = col
      finalPadding.push(column)
    })
    converted.push(column, ...finalPadding)
  }
  composed.columns = converted
  return composed
}
class Column {
  constructor() {
    this.notes = []
    this.tempoChanger = 0

  }
}
function groupByNotes(notes, threshold) {
  let result = []
  while (notes.length > 0) {
    let row = [notes.shift()]
    let amount = 0
    for (let i = 0; i < notes.length; i++) {
      if (row[0][1] > notes[i][1] - threshold) amount++
    }
    result.push([...row, ...notes.splice(0, amount)])
  }
  return result
}
class ColumnNote {
  constructor(index, layer = "000") {
    this.index = index
    this.layer = layer
  }
}
let pitchArr = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
function getPitchChanger(pitch) {
  let index = pitchArr.indexOf(pitch)
  if (index < 0) index = 0
  return Number(Math.pow(2, index / 12).toFixed(4))
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
  TempoChangers,
  ComposerSongSerialization,
  ComposerSongDeSerialization,
  ComposerToRecording,
  getPitchChanger,
  getSongType,
  oldSkyToNewFormat,
  RecordingToComposed,
  prepareSongDownload,
  newSkyFormatToGenshin,
  prepareSongImport
}