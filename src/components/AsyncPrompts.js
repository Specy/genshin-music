import { LoggerEvent } from "lib/SongUtils"

async function asyncPrompt(question) {
    return new Promise(resolve => {
        const container = document.createElement("div")
        const text = document.createElement("div")
        const row = document.createElement("div")
        const cancel = document.createElement("button")
        const ok = document.createElement("button")
        const input = document.createElement("input")

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

        row.append(cancel, ok)
        container.append(text, input, row)
        document.body.appendChild(container)

        let disposed = false
        function inputListener(){
            if(disposed) return
            if (input.value.trim() === "") {
                ok.classList.add("disabled")
            } else {
                ok.classList.remove("disabled")
            }
        }
        function cancelListener(){
            if(disposed) return
            resolve(null)
            dispose()
        }
        function okListener(){
            if(disposed) return
            if (input.value.trim() === '') return
            if (input.value.trim() === "Untitled") {
                input.value = ""
                return new LoggerEvent("Warning", '"Untitled" is a reserved word, use another').trigger()
            }
            resolve(input.value.trim())
            dispose()
        }
        function handleKeyboard(event){
            const key = event.code
            if(key === 'Enter') okListener()
            if(key === 'Escape') cancelListener()
        }
        input.focus()
        cancel.addEventListener("click", cancelListener)
        ok.addEventListener("click", okListener)
        window.addEventListener('keydown',handleKeyboard)
        input.addEventListener("input", inputListener)

        function dispose(){
            ok.removeEventListener('click',okListener)
            cancel.removeEventListener('click',cancelListener)
            window.removeEventListener('keydown',handleKeyboard)
            input.removeEventListener('inpit',inputListener)
            disposed = true
            container.classList.add("floating-prompt-hidden")
            setTimeout(() => container.remove(), 200)
        }
    })
}

async function asyncConfirm(question) {
    return new Promise(resolve => {
        const container = document.createElement("div")
        const text = document.createElement("div")
        const row = document.createElement("div")
        const cancel = document.createElement("button")
        const ok = document.createElement("button")

        container.className = "floating-prompt"
        text.innerText = question
        cancel.className = "prompt-button"
        ok.className = "prompt-button"
        row.className = "prompt-row"
        ok.innerText = "Yes"
        ok.style.background = '#628c83'
        cancel.style.background = '#a9525a'
        cancel.innerText = "No"
        
        row.append(cancel, ok)
        container.append(text, row)
        document.body.appendChild(container)

        let disposed = false
        function okListener(){
            if(disposed) return
            resolve(true)
            dispose()
        }
        function cancelListener(){
            if(disposed) return
            resolve(false)
            dispose()
        }
        function handleKeyboard(event){
            const key = event.code
            if(key === 'Enter') okListener()
            if(key === 'Escape') cancelListener()
        }
        cancel.addEventListener("click", cancelListener)
        ok.addEventListener("click", okListener)
        window.addEventListener('keydown',handleKeyboard)
        document.activeElement.blur()
        function dispose(){
            disposed = true
            cancel.removeEventListener('click',cancelListener)
            ok.removeEventListener('click',okListener)
            window.removeEventListener('keydown',handleKeyboard)
            container.classList.add("floating-prompt-hidden")
            setTimeout(() => container.remove(), 200)
        }
    })
}

export {
    asyncConfirm,
    asyncPrompt
}