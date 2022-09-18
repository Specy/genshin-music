import { useRef, useCallback } from "react"
interface FilePickerProps<T> {
    children: React.ReactNode,
    as: 'json' | 'text' | 'buffer'
    onPick: (files: FileElement<T>[]) => void,
    onError?: (error: any) => void,
    style?: object,
    multiple?: boolean
}
export interface FileElement<T> {
    data: Buffer | object | string | T,
    file: File
}
export function FilePicker<T>({ children, onPick, style = {}, as, multiple = false, onError }: FilePickerProps<T>) {
    const input = useRef<HTMLInputElement>(null)

    const handleEvent = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {

        if (event.target.files === null) return
        const promises: Promise<FileElement<T>>[] = Array.from(event.target.files).map((file: File) => {
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
                    fileReader.addEventListener('loadend', handleLoad, { once: true })
                    if (as === 'text' || as === 'json') fileReader.readAsText(file)
                    if (as === 'buffer') fileReader.readAsArrayBuffer(file)
                } catch (e) {
                    reject(e)
                }
            })
        })
        try {
            const result = await Promise.all(promises)
            onPick(result)
        } catch (e) {
            console.error(e)
            onError?.(e)
        }

        if (input.current !== null) input.current.value = ''
    }, [as, onPick, onError])

    return <>
        <input type='file' style={{ display: 'none' }} ref={input} onChange={handleEvent} multiple={multiple} />
        <div onClick={() => input.current?.click()} style={style}>
            {children}
        </div>
    </>
}