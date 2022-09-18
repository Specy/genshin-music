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
        //prevent duplicate of the same error
        if(this.logs.find(l => l.error === log.error)) return
        this.logs.push(log)
    }
    clearLogs(){
        this.logs.splice(0, this.logs.length)
    }
}

export const logsStore = new LogsStore()