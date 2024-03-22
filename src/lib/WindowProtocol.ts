export type Ask<T, R> = {
    payload: T,
    response: R
}
export type Tell<T> = {
    message: T
}


export type ProtocolDescriptor = Record<string, Ask<any, any> | Tell<any>>

type ExtractEvent<T extends ProtocolDescriptor, E extends (Ask<any, any> | Tell<any>)> = Pick<T, {
    [K in keyof T]: T[K] extends E ? K : never
}[keyof T]>
type AskEvents<T extends ProtocolDescriptor> = ExtractEvent<T, Ask<any, any>>
type TellEvents<T extends ProtocolDescriptor> = ExtractEvent<T, Tell<any>>

type AskHandler<T> = T extends Ask<infer P, infer R> ? (payload: P) => Promise<R> : never
type TellHandler<T> = T extends Tell<infer P> ? (message: P) => void : never
type Payload<T> = T extends Ask<infer P, infer R> ? P : never
type AskResponse<T> = T extends Ask<infer _, infer R> ? R : never
type Message<T> = T extends Tell<infer P> ? P : never
type PendingAskRequest<T> = {
    id: number
    eventName: string
    resolve: (payload: T) => void
    reject: (error: any) => void
}
type PayloadMessage<E> = {
    eventName: E
    id: number
} & ({
    type: "ask"
    payload: any
} | {
    type: "tell"
    payload: any
} | {
    type: "response"
    result: any
} | {
    type: "error-response"
    error: any
})


export class WindowProtocol<P extends ProtocolDescriptor, A = AskEvents<P>, T = TellEvents<P>> {
    private _id = 0
    askHandlers = new Map<keyof A, AskHandler<Ask<any, any>>>()
    tellHandlers = new Map<keyof T, TellHandler<TellEvents<any>[string]>>()
    askPool = new Map<number, PendingAskRequest<any>>()
    private validDomains
    private target: Window | null = null
    private connectionPromise: {
        resolve: () => void
        reject: (error: any) => void
    } | null = null
    inited = false
    constructor(validDomains: string[]) {
        this.validDomains = new Set(validDomains)
        //@ts-ignore
        this.registerAskHandler("ping", async () => "pong")
    }
    async init() {
        if (this.inited) return console.warn("already inited window protocol")
        //listen for messages only if it has a parent
        window.addEventListener("message", this.receive, false)
        this.inited = true
        console.log(`window ${window.location.href} ready to listen for messages`)
    }
    connect = async (to: Window, timeout = 6000): Promise<void> => {
        if (window === to) return console.warn("cannot connect to self")
        console.log(`connecting from ${window.location.href} to`, to)
        this.target = to
        if (this.connectionPromise) this.connectionPromise.reject("reconnecting")
        return new Promise((resolve, reject) => {
            this.connectionPromise = { resolve, reject }
            let resolved = false
            let intervalTime = 500
            let retries = timeout / intervalTime
            const interval = setInterval(async () => {
                try {
                    retries--
                    if (retries <= 0) {
                        if (resolved) return
                        reject("timeout")
                        clearInterval(interval)
                        return
                    }

                    //@ts-ignore
                    const pong = await this.ask("ping", undefined, to)
                    if (pong === "pong") {
                        resolved = true
                        clearInterval(interval)
                        resolve()
                    }
                } catch (e) {
                    if (resolved) return
                    reject(e)
                    clearInterval(interval)
                }
            }, 1000)

        })
    }

    dispose() {
        window.removeEventListener("message", this.receive)
        const pool = this.askPool.values()
        for (const pending of pool) {
            pending.reject("disposed")
        }
        this.askPool.clear()
        this.askHandlers.clear()
        this.tellHandlers.clear()
        this.connectionPromise?.reject("disposed")
        this.connectionPromise = null
        this.target = null
    }
    public registerAskHandler<K extends keyof A>(key: K, handler: AskHandler<A[K]>) {
        this.askHandlers.set(key, handler)
    }
    public registerTellHandler<K extends keyof T>(key: K, handler: TellHandler<T[K]>) {
        this.tellHandlers.set(key, handler)
    }
    public ask<K extends keyof A>(key: K, payload: Payload<A[K]>, to?: Window): Promise<AskResponse<A[K]>> {
        return new Promise((resolve, reject) => {
            this._id++
            this.askPool.set(this._id, {
                id: this._id,
                eventName: key as string,
                resolve: resolve as any,
                reject: reject as any,
            })
            const message = {
                type: "ask",
                payload,
                id: this._id,
                eventName: key,

            } satisfies PayloadMessage<keyof A | keyof T>
            this.send(message, to ?? this.target!)
        })
    }
    public tell<K extends keyof T>(key: K, message: Message<T[K]>, to?: Window) {
        const payload = {
            type: "tell",
            payload: message,
            eventName: key,
            id: this._id++
        } satisfies PayloadMessage<keyof A | keyof T>
        this.send(payload, to ?? this.target!)
    }
    private receive = async (message: MessageEvent<PayloadMessage<keyof A | keyof T>>) => {
        if (!this.validDomains.has(message.origin)) return console.warn("Blocked window message, invalid domain", message.origin)
        const data = message.data
        if (data.type === "ask") {
            const handler = this.askHandlers.get(data.eventName as keyof A)
            if (!handler) return
            try {
                const result = await handler(data.payload)
                const response = {
                    type: "response",
                    result,
                    id: data.id,
                    eventName: data.eventName,
                } satisfies PayloadMessage<keyof A | keyof T>
                this.send(response, message.source!)
            } catch (e) {
                console.error(e)
                const response = {
                    type: "error-response",
                    error: e,
                    id: data.id,
                    eventName: data.eventName,
                } satisfies PayloadMessage<keyof A | keyof T>
                this.send(response, message.source!)
            }
        } else if (data.type === "tell") {
            const handler = this.tellHandlers.get(data.eventName as keyof T)
            if (!handler) return
            handler(data.payload)
        } else if (data.type === "response") {
            const pending = this.askPool.get(data.id)
            if (!pending) return
            this.askPool.delete(data.id)
            pending.resolve(data.result)
        } else if (data.type === "error-response") {
            const pending = this.askPool.get(data.id)
            if (!pending) return
            this.askPool.delete(data.id)
            pending.reject(data.error)
        }
    }
    private send = async (payload: any, to: Window | MessageEventSource) => {
        try {
            //@ts-ignore
            to.postMessage(payload, "*")
        } catch {
            console.warn("failed to send message to", to)
        }
    }
}



