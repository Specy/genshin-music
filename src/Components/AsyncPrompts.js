import { LoggerEvent } from "./SongUtils"

async function asyncPrompt(question) {
    return new Promise(resolve => {
        let container = document.createElement("div")
        container.className = "floating-prompt"
        let text = document.createElement("div")
        text.innerText = question
        let input = document.createElement("input")
        input.type = "text"
        input.placeholder = "Write here"
        input.className = "prompt-input"
        let row = document.createElement("div")
        let cancel = document.createElement("button")
        let ok = document.createElement("button")
        cancel.className = "prompt-button"
        ok.className = "prompt-button disabled"
        row.className = "prompt-row"
        ok.innerText = "Ok"
        cancel.innerText = "Cancel"
        row.append(cancel, ok)
        container.append(text, input, row)
        document.body.appendChild(container)
        input.addEventListener("input", () => {
            if (input.value.trim() === "") {
                ok.classList.add("disabled")
            } else {
                ok.classList.remove("disabled")
            }

        })
        cancel.addEventListener("click", () => {
            container.classList.add("floating-prompt-hidden")
            resolve(null)
            setTimeout(() => container.remove(), 200)
        })
        ok.addEventListener("click", () => {
            if (input.value.trim() === "Untitled") {
                input.value = ""
                return new LoggerEvent("Warning", '"Untitled" is a reserved word, use another').trigger()
            }
            container.classList.add("floating-prompt-hidden")
            resolve(input.value.trim())

            setTimeout(() => container.remove(), 200)
        })
    })
}

async function asyncConfirm(question) {
    return new Promise(resolve => {
        let container = document.createElement("div")
        container.className = "floating-prompt"
        let text = document.createElement("div")
        text.innerText = question
        let row = document.createElement("div")
        let cancel = document.createElement("button")
        let ok = document.createElement("button")

        cancel.className = "prompt-button"
        ok.className = "prompt-button"
        row.className = "prompt-row"
        ok.innerText = "Yes"
        cancel.innerText = "No"
        row.append(cancel, ok)
        container.append(text, row)
        document.body.appendChild(container)
        cancel.addEventListener("click", () => {
            container.classList.add("floating-prompt-hidden")
            resolve(false)
            setTimeout(() => container.remove(), 200)
        })
        ok.addEventListener("click", () => {
            container.classList.add("floating-prompt-hidden")
            resolve(true)
            setTimeout(() => container.remove(), 200)
        })
    })
}

export {
    asyncConfirm,
    asyncPrompt
}