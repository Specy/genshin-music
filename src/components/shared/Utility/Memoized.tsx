import {FC, memo} from 'react'
import {IconType} from "react-icons";

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


interface MemoizedIconProps{
    icon: IconType
    size?: number | string

}
export const MemoizedIcon = memo(function MemoizedIcon({icon: Icon, size}: MemoizedIconProps) {
    return <Icon
        size={size}
    />
} , (prev, next) => {
    return prev.icon === next.icon && prev.size === next.size
})