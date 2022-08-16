import { AppError } from "lib/Errors"
import { makeObservable, observable } from "mobx"
import { Timer } from "types/GeneralTypes"

export enum LoggerStatus {
    ERROR = 'var(--red)',
    WARN = 'var(--orange)',
    SUCCESS = 'var(--accent)'
}

export interface LoggerState {
    timestamp: number
    visible: boolean
    text: string
    timeout: number
    id: number
    type: LoggerStatus
}

export interface PillState {
    visible: boolean
    text: string
}

export class LoggerStore {
    @observable
    toastState: LoggerState = {
        timestamp: 0,
        visible: false,
        text: "",
        timeout: 3000,
        id: 0,
        type: LoggerStatus.WARN
    }
    private toastTimeout: Timer = 0
    @observable
    pillState: PillState = {
        visible: false,
        text: ""
    }
    constructor() {
        makeObservable(this)
    }
    log = (
        text: string,
        timeout: number = 3500,
        type: LoggerStatus = LoggerStatus.SUCCESS,
    ) => {
        Object.assign(this.toastState, {
            text,
            timestamp: Date.now(),
            visible: true,
            timeout,
            id: ++this.toastState.id,
            type
        })
        if (this.toastTimeout !== undefined) clearTimeout(this.toastTimeout)
        this.toastTimeout = setTimeout(this.close, timeout)
    }
    error = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.ERROR)
    }
    logAppError = (error: Error) => {
        if(error instanceof AppError){
            this.error(error.message)
        }else{
            console.error(error)
        }
    }
    success = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.SUCCESS)
    }
    warn = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.WARN)
    }
    close = () => {
        this.setState({ visible: false })
    }
    setState = (state: Partial<LoggerState>) => {
        Object.assign(this.toastState, state)
    }
    setPillState = (state: Partial<PillState>) => {
        Object.assign(this.pillState, state)
    }
    showPill = (text?: string) => {
        this.setPillState({
            text,
            visible: true
        })
    }
    hidePill = () => {
        this.setPillState({ visible: false })
    }
}

export const logger = new LoggerStore()