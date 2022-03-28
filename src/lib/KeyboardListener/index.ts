import { KeyboardCode, KeyboardLetter, KeyboardNumber, KeyboardNumberCode } from "./KeyboardTypes";

export type KeyboardListenerOptions = {
    shift?: boolean;
}
export type KeyboardListenerProps = {letter:string, shift:boolean, event: KeyboardEvent}
export type KeyboardListenerCallback = (data: KeyboardListenerProps) => void
export type KeyboardHandler = {
    callback: KeyboardListenerCallback
    options: KeyboardListenerOptions
}
export class KeyboardListener{
    private handlers: Map<string,KeyboardHandler[]> 
    private listeners: KeyboardHandler[] = []
    constructor(){
        this.handlers = new Map<string, KeyboardHandler[]>()
        window.addEventListener('keydown', this.handleEvent)
    }
    static get emptyHandler(): KeyboardHandler{
        return {
            callback: () => {},
            options: {
                shift: false
            }
        }
    }
    clear(){
        this.handlers.clear()
    }
    listen(callback: KeyboardListenerCallback){
        const handler = KeyboardListener.emptyHandler
        handler.callback = callback
        this.listeners.push(handler)
    }
    unregister(code: KeyboardCode, callback: KeyboardListenerCallback){
        const handlers = this.handlers.get(code)
        if(handlers){
            this.handlers.set(code, handlers.filter(handler => handler.callback !== callback))
        }

    }
    destroy(){
        this.clear()
        window.removeEventListener('keydown', this.handleEvent)
    }
    register(code:KeyboardCode, callback: KeyboardListenerCallback, options?: KeyboardListenerOptions){
        const handler = KeyboardListener.emptyHandler
        handler.callback = callback
        Object.assign(handler.options, options)
        if(this.handlers.has(code)){
            this.handlers.get(code)?.push(handler)
        }else{
            this.handlers.set(code, [handler])
        }
    }
    registerLetter(letter: KeyboardLetter, callback: KeyboardListenerCallback, options?: KeyboardListenerOptions){
        this.register(`Key${letter}`, callback, options)
    }
    registerNumber(number: KeyboardNumber, callback: KeyboardListenerCallback, options?: KeyboardListenerOptions){
        const letter = number.toString()
        this.register(`Digit${letter}` as KeyboardNumberCode, callback, options)
    }
    handleEvent = (e: KeyboardEvent) => {
        if (document.activeElement?.tagName === "INPUT") return
        const key = e.code
        const letter = key.replace('Key', '')
        const shiftPressed = e.shiftKey
        this.listeners.forEach(handler => handler.callback({letter, shift: shiftPressed, event: e}))
        if(this.handlers.has(key)){
            this.handlers.get(key)?.forEach(handler => {
                if(shiftPressed && handler.options.shift){
                    handler.callback({letter, shift: shiftPressed, event: e})
                }else if(!shiftPressed && !handler.options.shift){
                    handler.callback({letter, shift: shiftPressed, event: e})
                }
            })
        }
    }
}

