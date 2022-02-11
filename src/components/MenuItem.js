import { observe } from "mobx"
import Theme from "pages/Theme"
import { memo, useEffect, useState } from "react"
import { ThemeStore } from "stores/ThemeStore"
export default memo(function MenuItem(props) {
    const [theme, setTheme] = useState(ThemeStore)
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,() => {
            setTheme({...ThemeStore})
        })
        return dispose
    })
    const { className, action, children, type } = props
    return <div
        className={className ? `menu-item ${className}` : "menu-item"}
        style={{backgroundColor: theme.get('primary').darken(0.1)}}
        onClick={() => action?.(type)}
    >
        {children}
    </div>
},(prev,next) => {
    if(next.children.key !== null || prev.children.key !== null) return prev.children.key === next.children.key
    return prev.children !== undefined && prev.className === next.className
})