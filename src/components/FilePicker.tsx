import { useRef, useCallback } from "react"
interface FilePickerProps {
    children: React.ReactNode,
    as: 'json' | 'text' | 'buffer'
    onChange: (file: FileElement[]) => void,
    style?: object,
}
export interface FileElement {
    data: Buffer | object | string,
    file: File
}
export function FilePicker({ children, onChange, style = {}, as }: FilePickerProps) {
    const input = useRef<HTMLInputElement>(null)

    const handleEvent = useCallback(async (event: any) => {
        const promises: Promise<FileElement>[] = [...event.target.files].map((file: any) => {
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