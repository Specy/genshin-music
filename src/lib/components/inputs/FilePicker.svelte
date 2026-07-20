<script module lang="ts">
    // Old: src/components/shared/Inputs/FilePicker.tsx
    export interface FileElement<T> {
        data: T
        file: File
    }
</script>

<script lang="ts" generics="T">
    import type {Snippet} from 'svelte'

    type FilePickerProps = {
        children: Snippet
        onError?: (error: unknown, files: File[]) => void
        style?: string
        multiple?: boolean
    } & ({
        as: 'json'
        onPick: (files: FileElement<T>[]) => void
    } | {
        as: 'text'
        onPick: (files: FileElement<string>[]) => void
    } | {
        as: 'buffer'
        onPick: (files: FileElement<ArrayBuffer>[]) => void
    } | {
        as: 'file'
        onPick: (files: FileElement<File>[]) => void
    })

    let {children, onPick, style = '', as, multiple = false, onError}: FilePickerProps = $props()

    // `as` and `onPick` are destructured independently from the discriminated
    // union above, so TS can no longer correlate "as === 'file'" back to
    // narrowing onPick's parameter type (a well-known TS limitation once a
    // discriminated union is destructured) - this single loose-typed alias is
    // used for every onPick(...) call below instead of a `@ts-expect-error` at
    // each call site; it's exactly as unchecked as the old code's `//@ts-ignore
    // handled by the union type` on the equivalent call. `$derived` (not a
    // plain `const`) so it keeps tracking the real `onPick` prop rather than
    // only capturing whatever reference was passed in at first render.
    const pick = $derived(onPick as (files: FileElement<T | string | ArrayBuffer | File>[]) => void)

    let input: HTMLInputElement | undefined = $state()

    async function handleEvent(event: Event & {currentTarget: HTMLInputElement}) {
        const fileList = event.currentTarget.files
        if (fileList === null) return
        const files = Array.from(fileList)
        if (as === 'file') {
            return pick(files.map(file => ({data: file, file})))
        }
        const promises: Promise<FileElement<string | ArrayBuffer>>[] = files.map(file => new Promise((resolve, reject) => {
            const fileReader = new FileReader()

            function handleLoad() {
                try {
                    const value = fileReader.result as string | ArrayBuffer
                    resolve({
                        data: as === 'json' ? JSON.parse(value as string) : value,
                        file
                    })
                } catch (e) {
                    reject(e)
                }
            }

            try {
                fileReader.addEventListener('loadend', handleLoad, {once: true})
                if (as === 'text' || as === 'json') fileReader.readAsText(file)
                if (as === 'buffer') fileReader.readAsArrayBuffer(file)
            } catch (e) {
                reject(e)
            }
        }))
        try {
            const result = await Promise.all(promises)
            pick(result)
        } catch (e) {
            console.error(e)
            onError?.(e, files)
        }
        if (input) input.value = ''
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            input?.click()
        }
    }
</script>

<input type="file" style="display:none" bind:this={input} onchange={handleEvent} {multiple} />
<div role="button" tabindex="0" onclick={() => input?.click()} onkeydown={handleKeydown} {style}>
    {@render children()}
</div>
