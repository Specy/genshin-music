import { memo } from 'react'

export default memo(({children}) => {
    return <>
        {children}
    </>
},(prev,next) => {
    if(next.children.key !== null || prev.children.key !== null) return prev.children.key === next.children.key
    return prev.children !== undefined 
})