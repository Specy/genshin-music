import { memo, useCallback, useEffect, useState } from "react"
import useDebounce from "$lib/Hooks/useDebounce";

export interface DroppedFile<T = Buffer | object | string> {
    data: T
    file: File
}

interface BodyDropperProps<T> {
    as: 'json' | 'text' | 'buffer'
    onHoverChange?: (isHovering: boolean) => void
    onDrop: (files: DroppedFile<T>[]) => void,
    onError?: (error: any) => void,
    showDropArea?: boolean
    dropAreaStyle?: any
}

function hasFiles(event: DragEvent) {
    return event?.dataTransfer?.types.includes('Files')
}


function BodyDropperComponent<T>({ onHoverChange, onDrop, onError, as, showDropArea = false ,dropAreaStyle = {}}: BodyDropperProps<T>) {
    const [_isHovering, setIsHovering] = useState(false)
    const debouncedIsHovering = useDebounce(_isHovering, 50)
    const resetDrag = useCallback((e?: any) => {
        setIsHovering(false)
    }, [])
    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault()
        if(!hasFiles(e)) return
        setIsHovering(true)
    }, [])

    const handleDrag = useCallback((e: DragEvent) => {
        if(!hasFiles(e)) return
        e.preventDefault()
        setIsHovering(true)
    }, [])

    useEffect(() => {
        onHoverChange?.(debouncedIsHovering)
    }, [debouncedIsHovering, onHoverChange])

    const handleDrop = useCallback(async (e: DragEvent) => {

        resetDrag()
        e.preventDefault()
        const promises: Promise<DroppedFile<T>>[] = Array.from(e.dataTransfer?.files || []).map((file: File) => {
            return new Promise((resolve, reject) => {
                const fileReader = new FileReader()
                function handleLoad() {
                    try {
                        const value = fileReader.result as any
                        resolve({
                            data: as === 'json' ? JSON.parse(value) : value,
                            file: file
                        })
                    } catch (e: any) {

                        reject(e)
                    }
                }
                try {
                    fileReader.addEventListener('loadend', handleLoad, { once: true })
                    if (as === 'text' || as === 'json') fileReader.readAsText(file)
                    if (as === 'buffer') fileReader.readAsArrayBuffer(file)
                } catch (e: any) {
                    reject(e)
                }
            })
        })
        try {
            const result = await Promise.all(promises)
            onDrop(result)
        } catch (e) {
            console.error(e)
            onError?.(e)
        }

    }, [resetDrag, onDrop, onError, as])
    useEffect(() => {
        window.addEventListener('drop', handleDrop)
        return () => window.removeEventListener('drop', handleDrop)
    }, [handleDrop])

    useEffect(() => {
        window.addEventListener('dragenter', handleDrag)
        window.addEventListener('dragleave', resetDrag)
        window.addEventListener('dragover', handleDragOver)
        return () => {
            window.removeEventListener('dragenter', handleDrag)
            window.removeEventListener('dragleave', resetDrag)
            window.removeEventListener('dragover', handleDragOver)
        }
    }, [resetDrag, handleDrag, handleDragOver])
    return <>
        {showDropArea && <DropHoverHinter isHovering={debouncedIsHovering} style={dropAreaStyle}>
            Drop files here
        </DropHoverHinter>
        }
    </>
}
interface HoverHinterProps {
    isHovering: boolean
    children: React.ReactNode
    style: any
}
export const DropHoverHinter = memo(({ isHovering, children, style }: HoverHinterProps) => {
    return <>
        {isHovering && <div className='drag-n-drop' style={style}>
            {children}
        </div>}
    </>
}, (p, n) => {
    return p.children === n.children && p.isHovering === n.isHovering
})

export const BodyDropper = memo(BodyDropperComponent, (p, n) => {
    return p.as === n.as && p.onDrop === n.onDrop && p.onError === n.onError && p.onHoverChange === n.onHoverChange && p.showDropArea === n.showDropArea
}) as typeof BodyDropperComponent
