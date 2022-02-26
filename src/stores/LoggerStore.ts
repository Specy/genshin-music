import { observable } from "mobx"

interface LoggerDataProps{
    timestamp: number,
    visible: boolean,
    text: string,
    title: string
}
type LoggerData = {
    data: LoggerDataProps
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
    log = (status: string, text: string, timeout: number = 3500) => {
        this.state.data = {
            title: status,
            text,
            timestamp: new Date().getTime(),
            visible: true
        }
        setTimeout(this.close, timeout)
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