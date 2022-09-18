import { AppError } from "$lib/Errors"
import { makeObservable, observable } from "mobx"
import { Timer } from "$types/GeneralTypes"

export enum LoggerStatus {
    ERROR = 'var(--red)',
    WARN = 'var(--orange)',
    SUCCESS = 'var(--accent)'
}

export interface ToastState {
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
    private lastId = 0
    @observable
    toasts: ToastState[] = []
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
        const id = ++this.lastId
        this.toasts.push({
            text,
            timestamp: Date.now(),
            timeout,
            visible: true,
            id,
            type
        })
        setTimeout(() => this.hideToast(id), timeout)
        setTimeout(() => this.removeToast(id), timeout + 300)
    }
    error = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.ERROR)
    }
    logAppError = (error: Error) => {
        if (error instanceof AppError) {
            this.error(error.message)
        } else {
            console.error(error)
        }
    }
    success = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.SUCCESS)
    }
    warn = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.WARN)
    }
    clearToasts = () => {
        this.toasts.splice(0, this.toasts.length)
    }
    hideToast = (id: number) => {
        this.setState(id, { visible: false })
    }
    removeToast = (id: number) => {
        this.toasts.splice(0, this.toasts.length, ...this.toasts.filter(t => t.id !== id))
    }
    setState = (id: number, state: Partial<ToastState>) => {
        const toast = this.toasts.find(t => t.id === id)
        if (toast) {
            Object.assign(toast, state)
        }

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