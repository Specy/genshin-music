import {useCallback, useRef} from "react"

type FilePickerProps<T> = {
    children: React.ReactNode,
    onError?: (error: any, files: File[]) => void,
    style?: object,
    multiple?: boolean
} & ({
    as: 'json'
    onPick: (files: FileElement<T>[]) => void,
} | {
    as: 'text'
    onPick: (files: FileElement<string>[]) => void,
} | {
    as: 'buffer'
    onPick: (files: FileElement<ArrayBuffer>[]) => void,
} | {
    as: 'file'
    onPick: (files: FileElement<File>[]) => void,
})

export interface FileElement<T> {
    data: T,
    file: File
}

export function FilePicker<T>({children, onPick, style = {}, as, multiple = false, onError}: FilePickerProps<T>) {
    const input = useRef<HTMLInputElement>(null)

    const handleEvent = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files === null) return
        const files = Array.from(event.target.files ?? [])
        if (as === 'file') return onPick(files.map(file => ({data: file, file})))
        const promises: Promise<FileElement<T>>[] = files.map((file: File) => {
            return new Promise((resolve, reject) => {
                const fileReader = new FileReader()

                function handleLoad() {
                    try {
                        const value = fileReader.result as any
                        resolve({
                            data: as === 'json' ? JSON.parse(value) : value,
                            file: file
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
            })
        })
        try {
            const result = await Promise.all(promises)
            //@ts-ignore handled by the union type
            onPick(result)
        } catch (e) {
            console.error(e)
            onError?.(e, files)
        }

        if (input.current !== null) input.current.value = ''
    }, [as, onPick, onError])

    return <>
        <input type='file' style={{display: 'none'}} ref={input} onChange={handleEvent} multiple={multiple}/>
        <div onClick={() => input.current?.click()} style={style}>
            {children}
        </div>
    </>
}