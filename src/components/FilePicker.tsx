import { useRef, useCallback } from "react"
interface FilePickerProps<T> {
    children: React.ReactNode,
    as: 'json' | 'text' | 'buffer'
    onChange: (files: FileElement<T>[]) => void,
    style?: object,
}
export interface FileElement<T> {
    data: Buffer | object | string | T,
    file: File
}
export function FilePicker<T>({ children, onChange, style = {}, as }: FilePickerProps<T>) {
    const input = useRef<HTMLInputElement>(null)

    const handleEvent = useCallback(async (event: any) => {
        const promises: Promise<FileElement<T>>[] = [...event.target.files].map((file: any) => {
            return new Promise(resolve => {
                const fileReader = new FileReader()
                fileReader.onloadend = () => {
                    const value: any = fileReader.result
                    resolve({
                        data: as === 'json' ? JSON.parse(value) : value,
                        file: file
                    })
                }
                if (as === 'text' || as === 'json') fileReader.readAsText(file)
                if (as === 'buffer') fileReader.readAsArrayBuffer(file)
            })
        })
        onChange(await Promise.all(promises))
        if(input.current !== null) input.current.value = ''
    }, [as, onChange])

    return <>
        <input type='file' style={{ display: 'none' }} ref={input} onChange={handleEvent} />
        <div onClick={() => input.current?.click()} style={style}>
            {children}
        </div>
    </>
}