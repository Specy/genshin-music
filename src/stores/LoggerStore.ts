import { observable } from "mobx"

interface LoggerDataProps{
    timestamp: number,
    visible: boolean,
    text: string,
    title: string
    timeout: number
}
type LoggerData = {
    data: LoggerDataProps
}
class LoggerStore {
    state: LoggerData
    timeout: any
    constructor() {
        this.state = observable({
            data: {
                timestamp: 0,
                visible: false,
                text: "Text",
                title: "Title",
                timeout: 3000
            }
        })
        this.timeout = undefined
    }
    log = (status: string, text: string, timeout: number = 3500) => {
        this.state.data = {
            title: status,
            text,
            timestamp: new Date().getTime(),
            visible: true,
            timeout
        }
        if(this.timeout !== undefined) clearTimeout(this.timeout)
        this.timeout = setTimeout(this.close, timeout)
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
    close = () => {
        this.setState({visible: false})
    }
    setState = (state: Partial<LoggerDataProps>) => {
        this.state.data = {...this.state.data, ...state}
    }
}

export default new LoggerStore()