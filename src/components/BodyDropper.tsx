import { useCallback, useEffect } from "react"

export interface DroppedFile<T> {
    data: Buffer | object | string | T,
    file: File
}

interface BodyDropperProps<T> {
    children: React.ReactNode,
    as: 'json' | 'text' | 'buffer'
    onHoverChange?: (isHovering: boolean) => void
    onDrop: (files: DroppedFile<T>[]) => void,
    onError?: (error: any) => void,
}
export function BodyDropper<T>({children,onHoverChange, onDrop, onError, as}: BodyDropperProps<T>){
	const resetDrag = useCallback(() => {
        onHoverChange?.(false)
	},[onHoverChange])

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault()
		onHoverChange?.(true)
	},[onHoverChange])

	const handleDrag = useCallback((e: DragEvent) => {
		e.preventDefault()
        onHoverChange?.(true)
	},[onHoverChange])

	const handleDrop = useCallback(async (e: DragEvent) => {
		resetDrag()
        e.preventDefault()
        const promises: Promise<DroppedFile<T>>[] = Array.from(e.dataTransfer?.files || []).map((file: File) => {
            return new Promise(resolve => {
                const fileReader = new FileReader()
                function handleLoad(){
                    try{
                        const value = fileReader.result as any
                        resolve({
                            data: as === 'json' ? JSON.parse(value) : value,
                            file: file
                        })
                    }catch(e:any){
                        onError?.(e)
                    }
                }
                try{
                    fileReader.addEventListener('loadend',handleLoad,{once: true})
                    if (as === 'text' || as === 'json') fileReader.readAsText(file)
                    if (as === 'buffer') fileReader.readAsArrayBuffer(file)
                }catch(e:any){
                    onError?.(e)
                }
            })
        })
        onDrop(await Promise.all(promises))
		e.preventDefault()
	},[resetDrag,onDrop,onError,as])
    useEffect(() => {
		document.body.addEventListener('drop', handleDrop)
        return () => document.body.removeEventListener('drop', handleDrop)
    },[handleDrop])

    useEffect(() => {
        document.body.addEventListener('dragenter', handleDrag)
		document.body.addEventListener('dragleave', resetDrag)
		document.body.addEventListener('dragover', handleDragOver)
        return () => {
            document.body.removeEventListener('dragenter', handleDrag)
            document.body.removeEventListener('dragleave', resetDrag)
            document.body.removeEventListener('dragover', handleDragOver)
        }
    },[resetDrag, handleDrag, handleDragOver])
    return <>
        {children}
    </>
}