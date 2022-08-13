import { useEffect } from "react";




export function Title({text}: {text: string}){
    useEffect(() => {
        document.title = text
    }, [text])
    return null
}