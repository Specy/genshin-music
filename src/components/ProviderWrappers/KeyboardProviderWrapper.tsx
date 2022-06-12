import { KeyboardProvider } from "lib/Providers/KeyboardProvider";
import { useEffect } from "react";

interface KeyboardProviderWrapperProps {
    children: React.ReactNode;
}
export function KeyboardProviderWrapper({ children }: KeyboardProviderWrapperProps) {
    useEffect(() => {
        KeyboardProvider.create()
        return () => KeyboardProvider.destroy() //TODO decide if calling destroy or dispose for all providers
    })
    return <>
        {children}
    </>
}