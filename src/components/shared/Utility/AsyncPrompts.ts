import {makeObservable, observable} from "mobx";

async function asyncPrompt(question: string): Promise<string | null> {
    return asyncPromptStore.prompt(question)
}

async function asyncConfirm(question: string, cancellable = true): Promise<boolean | null> {
    return asyncPromptStore.confirm(question, cancellable)
}

export type AsyncPromptState = {
    question: string
    cancellable: boolean
    deferred: ((value: string | null) => void) | null
}
export type AsyncConfirmState = {
    question: string
    cancellable: boolean
    deferred: ((value: boolean | null) => void) | null
}

class AsyncPromptStore {
    @observable
    readonly promptState: AsyncPromptState = {
        question: '',
        cancellable: true,
        deferred: null
    }
    @observable
    readonly confirmState: AsyncConfirmState = {
        question: '',
        cancellable: true,
        deferred: null
    }

    constructor() {
        makeObservable(this)
    }

    prompt(question: string, cancellable = true) {
        if (this.promptState.deferred) this.promptState.deferred(null)
        return new Promise<string | null>(res => {
            Object.assign(this.promptState, {
                question,
                cancellable,
                deferred: res
            })
        })
    }

    answerPrompt(answer: string | null) {
        if (this.promptState.deferred) {
            this.promptState.deferred(answer)
        } else {
            console.warn("No deferred prompt")
        }
        this.promptState.deferred = null
    }

    confirm(question: string, cancellable = true) {
        if (this.confirmState.deferred) this.confirmState.deferred(null)
        return new Promise<boolean | null>(res => {
            Object.assign(this.confirmState, {
                question,
                cancellable,
                deferred: res
            })
        })
    }

    answerConfirm(answer: boolean | null) {
        if (this.confirmState.deferred) {
            this.confirmState.deferred(answer)
        } else {
            console.warn("No deferred confirm")
        }
        this.confirmState.deferred = null
    }

    clearAll() {
        if (this.promptState.deferred) this.promptState.deferred(null)
        if (this.confirmState.deferred) this.confirmState.deferred(null)
    }
}

export const asyncPromptStore = new AsyncPromptStore()

export {
    asyncConfirm,
    asyncPrompt
}