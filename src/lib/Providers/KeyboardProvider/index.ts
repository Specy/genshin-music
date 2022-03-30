import { KeyboardCode, KeyboardLetter, KeyboardNumber, KeyboardNumberCode } from "./KeyboardTypes";

export type KeyboardListenerOptions = {
    shift?: boolean;
}
export type KeyboardEventData = { letter: string, shift: boolean, event: KeyboardEvent, code: KeyboardCode }
export type KeyboardListenerCallback = (data: KeyboardEventData) => void
export type KeyboardHandler = {
    callback: KeyboardListenerCallback
    options: KeyboardListenerOptions
}
export class KeyboardProviderClass {
    private handlers: Map<string, KeyboardHandler[]>
    private listeners: KeyboardHandler[] = []
    constructor() {
        this.handlers = new Map<string, KeyboardHandler[]>()
    }
    static get emptyHandler(): KeyboardHandler {
        return {
            callback: () => { },
            options: {
                shift: false
            }
        }
    }
    create = () => {
        window.addEventListener('keydown', this.handleEvent)
    }
    clear = () => {
        this.handlers.clear()
        this.listeners = []
    }
    listen = (callback: KeyboardListenerCallback) => {
        const handler = KeyboardProviderClass.emptyHandler
        handler.callback = callback
        this.listeners.push(handler)
    }
    unlisten = (callback: KeyboardListenerCallback) => {
        this.listeners = this.listeners.filter(handler => handler.callback !== callback)
    }
    unregister = (code: KeyboardCode, callback: KeyboardListenerCallback) => {
        const handlers = this.handlers.get(code)
        if (handlers) {
            this.handlers.set(code, handlers.filter(handler => handler.callback !== callback))
        }
    }
    destroy = () => {
        this.clear()
        window.removeEventListener('keydown', this.handleEvent)
    }
    
    register = (code: KeyboardCode, callback: KeyboardListenerCallback, options?: KeyboardListenerOptions) =>{
        const handler = KeyboardProviderClass.emptyHandler
        handler.callback = callback
        Object.assign(handler.options, options)
        if (this.handlers.has(code)) {
            this.handlers.get(code)?.push(handler)
        } else {
            this.handlers.set(code, [handler])
        }
    }
    registerLetter = (letter: KeyboardLetter, callback: KeyboardListenerCallback, options?: KeyboardListenerOptions) => {
        this.register(`Key${letter}`, callback, options)
    }
    registerNumber = (number: KeyboardNumber, callback: KeyboardListenerCallback, options?: KeyboardListenerOptions) => {
        const letter = number.toString()
        this.register(`Digit${letter}` as KeyboardNumberCode, callback, options)
    }
    private handleEvent = (e: KeyboardEvent) => {
        if (document.activeElement?.tagName === "INPUT") return
        const code = e.code as KeyboardCode
        const letter = code.replace('Key', '')
        const shiftPressed = e.shiftKey
        this.listeners.forEach(handler => handler.callback({ letter, shift: shiftPressed, event: e ,code}))
        if (this.handlers.has(code)) {
            this.handlers.get(code)?.forEach(handler => {
                if (shiftPressed && handler.options.shift) {
                    handler.callback({ letter, shift: shiftPressed, event: e, code })
                } else if (!shiftPressed && !handler.options.shift) {
                    handler.callback({ letter, shift: shiftPressed, event: e, code })
                }
            })
        }
    }
}


export const KeyboardProvider = new KeyboardProviderClass()