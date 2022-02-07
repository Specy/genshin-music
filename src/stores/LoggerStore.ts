import { observable } from "mobx"
type LoggerData = {
    data: {
        timestamp: number,
        visible: boolean,
        text: string,
        title: string
    }
}
class LoggerStore {
    state: LoggerData
    constructor() {
        this.state = observable({
            data: {
                timestamp: 0,
                visible: false,
                text: "Text",
                title: "Title"
            }
        })
    }
    log = (status: string, text: string, timeout: number = 3000) => {
        this.state.data = {
            title: status,
            text,
            timestamp: new Date().getTime(),
            visible: true
        }
        setTimeout(() => {
            this.state.data = {
                ...this.state.data,
                visible: false
            }
        }, timeout)
    }
    error = (text: string, timeout?: number) => {
        this.log('Error', text, timeout)
    }
    success = (text: string, timeout?: number) => {
        this.log('Success', text, timeout)
    }
    warn = (text: string, timeout?: number) => {
        this.log('Warning', text, timeout)
    }
}


export default new LoggerStore()