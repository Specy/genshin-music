import { makeObservable, observable } from "mobx";

type Log = {
    error?: Error
    message: string
}

class LogsStore{
    @observable
    logs: Log[] = []
    constructor(){
        makeObservable(this)
    }
    addLog(log: Log){
        this.logs.push(log)
    }
    clearLogs(){
        this.logs.splice(0, this.logs.length)
    }
}

export const logsStore = new LogsStore()