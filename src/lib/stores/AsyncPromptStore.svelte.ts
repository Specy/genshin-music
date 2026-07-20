// Old: src/components/shared/Utility/AsyncPrompts.ts (mobx AsyncPromptStore class + the
// asyncPrompt/asyncConfirm free functions). Deferred-resolver semantics are EXACT: a new
// prompt()/confirm() call while one is already pending first resolves the OLD promise with
// null (supersede-cancel), then synchronously installs the new question/cancellable/deferred -
// same single Object.assign-driven state transition as the old code, just backed by $state
// instead of a mobx @observable.

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
    promptState: AsyncPromptState = $state({
        question: '',
        cancellable: true,
        deferred: null
    })
    confirmState: AsyncConfirmState = $state({
        question: '',
        cancellable: true,
        deferred: null
    })

    prompt = (question: string, cancellable = true) => {
        if (this.promptState.deferred) this.promptState.deferred(null)
        return new Promise<string | null>(res => {
            Object.assign(this.promptState, {
                question,
                cancellable,
                deferred: res
            })
        })
    }

    answerPrompt = (answer: string | null) => {
        if (this.promptState.deferred) {
            this.promptState.deferred(answer)
        } else {
            console.warn('No deferred prompt')
        }
        this.promptState.deferred = null
    }

    confirm = (question: string, cancellable = true) => {
        if (this.confirmState.deferred) this.confirmState.deferred(null)
        return new Promise<boolean | null>(res => {
            Object.assign(this.confirmState, {
                question,
                cancellable,
                deferred: res
            })
        })
    }

    answerConfirm = (answer: boolean | null) => {
        if (this.confirmState.deferred) {
            this.confirmState.deferred(answer)
        } else {
            console.warn('No deferred confirm')
        }
        this.confirmState.deferred = null
    }

    clearAll = () => {
        if (this.promptState.deferred) this.promptState.deferred(null)
        if (this.confirmState.deferred) this.confirmState.deferred(null)
    }
}

export const asyncPromptStore = new AsyncPromptStore()

export async function asyncPrompt(question: string): Promise<string | null> {
    return asyncPromptStore.prompt(question)
}

export async function asyncConfirm(question: string, cancellable = true): Promise<boolean | null> {
    return asyncPromptStore.confirm(question, cancellable)
}
