import {memo} from 'react'

interface MemoizedProps {
    children: React.ReactNode
}

export default memo(function Memoized({children}: MemoizedProps) {
    return <>
        {children}
    </>
}, (prev, next) => {
    //@ts-ignore
    if (next.children?.key !== null || prev.children?.key !== null) return prev.children?.key === next.children?.key
    return prev.children !== undefined
})