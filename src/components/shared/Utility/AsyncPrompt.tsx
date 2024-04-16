import {useObservableObject} from "$lib/Hooks/useObservable"
import {AsyncConfirmState, AsyncPromptState, asyncPromptStore} from "./AsyncPrompts"
import {useEffect, useRef, useState} from 'react'
import {DecoratedCard} from "../layout/DecoratedCard"
import {useTheme} from "$lib/Hooks/useTheme"
import {cn} from "$lib/utils/Utilities"
import {KeyboardProvider} from "$lib/Providers/KeyboardProvider"
import {IGNORE_CLICK_CLASS} from "$lib/Hooks/useClickOutside"
import isMobile from "is-mobile"

export function AsyncPromptWrapper() {
    const confirmState = useObservableObject(asyncPromptStore.confirmState)
    const promptState = useObservableObject(asyncPromptStore.promptState)
    useEffect(() => {
        return () => {
            asyncPromptStore.clearAll()
        }
    }, [])
    return <>
        <AsyncPrompt {...promptState} />
        <AsyncConfirm {...confirmState} />
    </>
}

//TODO this components here look kinda ugly and break the point of react, but it's the best and fastest way to do it for now
function AsyncConfirm({question, deferred, cancellable}: AsyncConfirmState) {
    const isHidden = !deferred
    const [isMounted, setIsMounted] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!isHidden) return setIsMounted(true)
        const timeout = setTimeout(() => setIsMounted(false), 300)
        return () => clearTimeout(timeout)
    }, [isHidden])

    useEffect(() => {
        if (!deferred) return
        //@ts-ignore
        document.activeElement?.blur()
        KeyboardProvider.register("Escape", () => {
            if (!cancellable) return
            asyncPromptStore.answerConfirm(false)
        }, {id: 'AsyncConfirm'})
        KeyboardProvider.register("Enter", () => {
            asyncPromptStore.answerConfirm(true)
        }, {id: 'AsyncConfirm'})
        return () => {
            KeyboardProvider.unregisterById('AsyncConfirm')
        }
    }, [cancellable, deferred])

    function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
        if (e.nativeEvent.composedPath()[0] !== ref.current || !cancellable) return
        asyncPromptStore.answerConfirm(false)
    }

    return <div
        style={!isMounted ? {display: 'none'} : {}}
        onClick={onOverlayClick}
        className={cn(`prompt-overlay ${IGNORE_CLICK_CLASS}`, [isHidden, 'prompt-overlay-hidden'])}
        ref={ref}
    >

        <DecoratedCard
            boxProps={{
                className: cn(`floating-prompt ${IGNORE_CLICK_CLASS}`, [!deferred, 'floating-prompt-hidden'])
            }}
            isRelative={false}
            size={'1.1rem'}
        >
            <div style={{whiteSpace: "pre-wrap"}}>
                {question}
            </div>
            <div className="prompt-row">
                <button
                    className="prompt-button"
                    style={{
                        backgroundColor: 'rgb(169, 82, 90)',
                        color: 'white'
                    }}
                    onClick={() => asyncPromptStore.answerConfirm(false)}
                >
                    No
                </button>
                <button
                    className="prompt-button"
                    style={{
                        backgroundColor: 'rgb(98, 140, 131)',
                        color: 'white'
                    }}
                    onClick={() => asyncPromptStore.answerConfirm(true)}
                >
                    Yes
                </button>
            </div>
        </DecoratedCard>
    </div>
}

function AsyncPrompt({question, deferred, cancellable}: AsyncPromptState) {
    const [value, setValue] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const [theme] = useTheme()
    const [color, setColor] = useState('var(--primary)')
    const isHidden = !deferred
    const [isMounted, setIsMounted] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isHidden) return setIsMounted(true)
        //demount after animation ended
        const timeout = setTimeout(() => setIsMounted(false), 200)
        return () => clearTimeout(timeout)
    }, [isHidden])

    useEffect(() => {
        setColor(theme.layer('primary', 0.1).toString())
    }, [theme])

    useEffect(() => {
        setValue('')
    }, [deferred])

    useEffect(() => {
        if (!isMobile() && deferred) {
            //focus element once it's visible
            const timeout = setTimeout(() => inputRef.current?.focus(), 300)
            return () => clearTimeout(timeout)
        }
    }, [inputRef, deferred])

    useEffect(() => {
        if (!deferred) return
        KeyboardProvider.register("Escape", () => {
            if (!cancellable) return
            asyncPromptStore.answerPrompt(null)
        }, {id: 'AsyncPrompt'})
        KeyboardProvider.register("Enter", () => {
            if (!value) return
            asyncPromptStore.answerPrompt(value)
        }, {id: 'AsyncPrompt'})
        return () => KeyboardProvider.unregisterById('AsyncPrompt')
    }, [cancellable, value, deferred])

    function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
        if (e.nativeEvent.composedPath()[0] !== ref.current || !cancellable) return
        asyncPromptStore.answerPrompt(null)
    }

    return <div
        ref={ref}
        style={!isMounted ? {display: 'none'} : {}}
        onClick={onOverlayClick}
        className={cn(`prompt-overlay ${IGNORE_CLICK_CLASS}`, [isHidden, 'prompt-overlay-hidden'])}
    >
        <DecoratedCard
            boxProps={{
                className: cn(`floating-prompt ${IGNORE_CLICK_CLASS}`, [!deferred, 'floating-prompt-hidden'])
            }}
            isRelative={false}
            size={'1.1rem'}
        >
            <div style={{whiteSpace: "pre-wrap"}}>
                {question}
            </div>
            <input
                ref={inputRef}
                className="prompt-input"
                value={value}
                onKeyDown={e => {
                    if (e.key === 'Enter' && value) asyncPromptStore.answerPrompt(value)
                    if (e.key === 'Escape' && cancellable) asyncPromptStore.answerPrompt(null)
                }}
                onChange={(e) => setValue(e.target.value)}
            />
            <div className="prompt-row">
                <button
                    className="prompt-button"
                    style={{
                        backgroundColor: color,
                        color: 'white'
                    }}
                    onClick={() => asyncPromptStore.answerPrompt(null)}
                >
                    Cancel
                </button>
                <button
                    className={cn('prompt-button', [!value, 'disabled'])}
                    disabled={!value}
                    style={{
                        backgroundColor: color,
                        color: 'white'
                    }}
                    onClick={() => asyncPromptStore.answerPrompt(value)}
                >
                    Ok
                </button>
            </div>
        </DecoratedCard>
    </div>
}