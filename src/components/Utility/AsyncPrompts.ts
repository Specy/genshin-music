import {logger} from "$stores/LoggerStore";
import { ThemeProvider } from '$/stores/ThemeStore/ThemeProvider'
import isMobile from 'is-mobile'
async function asyncPrompt(question: string):Promise<string | null> {
    return new Promise(resolve => {
        const overlay = document.createElement("div")
        const container = document.createElement("div")
        const text = document.createElement("div")
        const row = document.createElement("div")
        const cancel = document.createElement("button")
        const ok = document.createElement("button")
        const input = document.createElement("input")
        overlay.className = 'prompt-overlay'
        input.type = "text"
        container.className = "floating-prompt"
        input.placeholder = "Write here"
        input.className = "prompt-input"
        cancel.className = "prompt-button"
        ok.className = "prompt-button disabled"
        row.className = "prompt-row"
        ok.innerText = "Ok"
        cancel.innerText = "Cancel"
        text.innerText = question
        cancel.style.backgroundColor = ThemeProvider.layer('primary', 0.1).toString()
        ok.style.backgroundColor = ThemeProvider.layer('primary', 0.1).toString()

        row.append(cancel, ok)
        container.append(text, input, row)
        overlay.append(container)
        document.body.appendChild(overlay)
        overlay.classList.add("ignore_click_outside")
        let disposed = false
        function inputListener() {
            if (disposed) return
            if (input.value.trim() === "") {
                ok.classList.add("disabled")
            } else {
                ok.classList.remove("disabled")
            }
        }
        function cancelListener() {
            if (disposed) return
            resolve(null)
            dispose()
        }
        function okListener() {
            if (disposed) return
            if (input.value.trim() === '') return
            if (input.value.trim() === "Untitled") {
                input.value = ""
                logger.warn('"Untitled" is a reserved word, use another')
            }
            resolve(input.value.trim())
            dispose()
        }

        function handleKeyboard(event: KeyboardEvent) {
            const key = event.code
            if (key === 'Enter') okListener()
            if (key === 'Escape') cancelListener()
        }

        function handleOverlay(e: any) {
            if (e?.path?.[0] === overlay) cancelListener()
        }

        if (!isMobile()) input.focus()
        overlay.addEventListener("click", handleOverlay)
        cancel.addEventListener("click", cancelListener)
        ok.addEventListener("click", okListener)
        window.addEventListener('keydown', handleKeyboard)
        input.addEventListener("input", inputListener)

        function dispose() {
            overlay.removeEventListener("click", handleOverlay)
            ok.removeEventListener('click', okListener)
            cancel.removeEventListener('click', cancelListener)
            window.removeEventListener('keydown', handleKeyboard)
            input.removeEventListener('input', inputListener)
            disposed = true
            overlay.classList.add("prompt-overlay-hidden")
            container.classList.add("floating-prompt-hidden")
            setTimeout(() => clearDOM(overlay), 200)
        }
    })
}

async function asyncConfirm(question: string, cancellable = true): Promise<boolean> {
    return new Promise(resolve => {
        const overlay = document.createElement("div")
        const container = document.createElement("div")
        const text = document.createElement("div")
        const row = document.createElement("div")
        const cancel = document.createElement("button")
        const ok = document.createElement("button")

        overlay.className = 'prompt-overlay'
        container.className = "floating-prompt"
        text.innerText = question
        cancel.className = "prompt-button"
        ok.className = "prompt-button"
        row.className = "prompt-row"
        ok.innerText = "Yes"
        ok.style.background = '#628c83'
        ok.style.color = 'white'
        cancel.style.background = '#a9525a'
        cancel.style.color = 'white'
        cancel.innerText = "No"
        row.append(cancel, ok)
        container.append(text, row)
        overlay.append(container)
        document.body.appendChild(overlay)
        overlay.classList.add("ignore_click_outside")
        let disposed = false
        function okListener() {
            if (disposed) return
            resolve(true)
            dispose()
        }
        function cancelListener() {
            if (disposed) return
            resolve(false)
            dispose()
        }
        function handleKeyboard(event:any) {
            const key = event.code
            if (key === 'Enter') okListener()
            if (key === 'Escape' && cancellable) cancelListener()
        }
        function handleOverlay(e:any) {
            if (e?.path?.[0] === overlay && cancellable) cancelListener()
        }
        overlay.addEventListener("click", handleOverlay)
        cancel.addEventListener("click", cancelListener)
        ok.addEventListener("click", okListener)
        window.addEventListener('keydown', handleKeyboard)
        //@ts-ignore
        document.activeElement?.blur()
        function dispose() {
            disposed = true
            cancel.removeEventListener('click', cancelListener)
            ok.removeEventListener('click', okListener)
            window.removeEventListener('keydown', handleKeyboard)
            overlay.removeEventListener("click", handleOverlay)
            overlay.classList.add("prompt-overlay-hidden")
            container.classList.add("floating-prompt-hidden")
            setTimeout(() => clearDOM(overlay), 200)
        }
    })
}

function clearDOM(element: HTMLElement) {
    element.querySelectorAll('*').forEach(el => el.remove())
    element.remove()
}

export {
    asyncConfirm,
    asyncPrompt
}