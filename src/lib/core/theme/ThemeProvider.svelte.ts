import {ThemeSettings} from '$core/BaseSettings'
import {BASE_THEME_CONFIG} from '$core/legacyConfig'
import {createDebouncer} from '$core/utils/Utilities'
import cloneDeep from 'lodash.clonedeep'
import Color, { type ColorInstance } from 'color'
import {baseThemes} from "./defaultThemes";
import {_themeService} from "../Services/ThemeService";
// Core importing a store: the old code had the same coupling (ThemeProvider.ts imported
// ./ThemeStore) - the P2 strip below was temporary until the runes ThemeStore existed
// (P3 Task 2 restores it). Acceptable and intended here.
import {themeStore} from '$stores/ThemeStore.svelte'

//TODO cleanup everything here, it's held together with tape
export type ThemeKeys = keyof typeof ThemeSettings.data
export type ThemeProp = {
    name: ThemeKeys
    value: string,
    css: string,
    text: string
}
export type ThemeConfig = { [key in ThemeKeys]: ThemeProp }
export type BackgroundProps = 'Composer' | 'Main'
export type OtherKeys = keyof typeof ThemeSettings.other


export type SerializedTheme = ThemeState
const defaultTextColors = {
    light: new Color("#eae8e6"),
    dark: new Color("#151414"),
    lightSubtle: new Color("#b3b3b3"),
    darkSubtle: new Color("#2a2727")
}

export class BaseTheme {
    state: ThemeState

    constructor(name: string) {
        this.state = cloneDeep(ThemeSettings as ThemeState)
        this.state.other.name = name
        this.state.editable = true
    }

    toJson = () => {
        return JSON.stringify(this.state)
    }

    serialize(): SerializedTheme {
        return {
            ...cloneDeep(this.state),
            id: null,
            type: 'theme'
        }
    }
}

const defaultThemes: ThemeState[] = [
    ThemeSettings as ThemeState,
    ...baseThemes
]

export interface ThemeState {
    data: ThemeConfig,
    other: {
        [key in OtherKeys]: string
    },
    id: string | null,
    type: 'theme'
    editable: boolean
}

export class Theme {
    state: ThemeState
    baseTheme: ThemeState

    constructor(baseTheme: ThemeState) {
        this.baseTheme = cloneDeep(baseTheme)
        this.state = $state(cloneDeep(baseTheme))
    }

    static isSerializedType(obj: any) {
        if (typeof obj !== 'object') return false
        if (obj.type === 'theme') return true
        //legacy format recognition
        if (obj.data && obj.other) return true
        return false
    }

    load = async () => {
        try {
            const themeId = _themeService.getCurrentThemeId()
            if (themeId !== null) {
                const defaultTheme = defaultThemes.find(t => t.id === themeId)
                if (defaultTheme) return this.loadFromTheme(defaultTheme)
                const theme = await _themeService.getTheme(themeId)
                if (theme) return this.loadFromTheme(theme)
            }
        } catch (e) {
            console.error(e)
        }
    }
    getId = () => {
        return this.state.id
    }
    get = (prop: ThemeKeys) => {
        return Color(this.state.data[prop].value)
    }
    getText = (prop: ThemeKeys) => {
        return Color(this.state.data[prop].text)
    }
    getOther = (prop: OtherKeys) => {
        return this.state.other[prop]
    }
    getValue = (prop: ThemeKeys) => {
        return this.state.data[prop].value
    }
    toArray = (): ThemeProp[] => {
        return Object.values(this.state.data)
    }
    reset = (prop: ThemeKeys) => {
        this.state.data[prop] = {...this.baseTheme.data[prop]}
    }

    isDefault = (name: ThemeKeys) => {
        const a = new Color(this.state.data[name].value)
        const b = new Color(this.baseTheme.data[name].value)
        return a.hexa().toLowerCase() === b.hexa().toLowerCase()
    }

    isEditable = () => {
        return this.state.editable
    }

    layer = (prop: ThemeKeys, amount: number, threshold?: number) => {
        const value = this.get(prop)
        if (threshold) {
            return value.luminosity() < threshold ? value.darken(amount) : value.lighten(amount)
        } else {
            return value.isDark() ? value.lighten(amount * 1.1) : value.darken(amount)
        }
    }

    getTextColorFromBackground = (color: ColorInstance) => {
        return color.isDark() ? defaultTextColors.light : defaultTextColors.dark
    }
    serialize = (): SerializedTheme => {
        return {
            ...cloneDeep(this.state),
            id: this.state.id ?? null,
            type: 'theme'
        }
    }
    setBackground = (url: string, type: 'Composer' | 'Main') => {
        //@ts-ignore
        this.setOther(('backgroundImage' + type), url)
        this.save()
    }
    loadFromJson = (json: any, id: string | null) => {
        try {
            this.toArray().forEach(e => {
                this.reset(e.name)
            })
            Object.entries(json.data).forEach(([key, value]: [string, any]) => {
                //@ts-ignore
                if (this.baseTheme.data[key] !== undefined) {
                    const filtered = Color(value.value)
                    this.set(key as ThemeKeys, value.value.includes('rgba') ? filtered.rgb().toString() : filtered.toString())
                }
            })
            //keep this above the "other"
            this.state.editable = Boolean(json.editable)
            this.state.id = id
            Object.entries(json.other).forEach(([key, value]: [string, any]) => {
                //@ts-ignore
                if (this.baseTheme.other[key] !== undefined) {
                    this.setOther(key as OtherKeys, value)
                }
            })
        } catch (e) {
            console.error(e)
            console.error("There was an error loading the theme")
        }
    }
    loadFromTheme = (theme: ThemeState) => {
        for (const [key, value] of Object.entries(theme.data)) {
            this.set(key as ThemeKeys, value.value)
        }
        for (const [key, value] of Object.entries(theme.other)) {
            this.setOther(key as OtherKeys, value)
        }
        this.state.editable = Boolean(theme.editable)
        this.state.id = theme.id
    }
    sanitize = (obj: any): SerializedTheme => {
        const sanitized = cloneDeep(this.baseTheme) as SerializedTheme
        Object.entries(obj.data).forEach(([key, value]: [string, any]) => {
            //@ts-ignore
            if (sanitized.data[key] !== undefined) {
                const filtered = Color(value.value)
                //@ts-ignore
                sanitized.data[key].value = filtered.toString()
                //@ts-ignore
                sanitized.data[key].text = filtered.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
            }
        })
        Object.entries(obj.other).forEach(([key, value]: [string, any]) => {
            //@ts-ignore
            if (sanitized.other[key] !== undefined) {
                //@ts-ignore
                sanitized.other[key] = value
            }
        })
        sanitized.id = obj.id
        sanitized.editable = Boolean(obj.editable)
        return sanitized
    }
    wipe = () => {
        this.loadFromJson(cloneDeep(this.baseTheme), this.state.id)
    }

    setOther = (name: OtherKeys, value: string) => {
        this.state.other[name] = value
    }
    set = (name: ThemeKeys, value: string) => {
        this.state.data[name] = {
            ...this.state.data[name],
            name,
            value: value.toLowerCase(),
            text: Color(value).isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
    }
    save = () => {
        themeStore.setCurrentThemeId(this.getId())
        if (!this.state.editable) return
        return themeStore.updateTheme(this.state.id!, cloneDeep(this.state))
    }
}

export const ThemeProvider = new Theme(defaultThemes[0])

// old src/lib/Hooks/useTheme.ts's `subscribeTheme` (spec §6.1's explicit-subscribe-helper for
// non-component consumers - the three Phase-4c pixi renderer classes are plain TS classes, not
// Svelte components, so they cannot rely on template-driven `$derived`/`$effect`). Old:
//   export function subscribeTheme(callback: (theme: Theme) => void) {
//       const debouncer = createDebouncer(50)
//       const dispose = observe(ThemeProvider.state.data, () => {
//           debouncer(() => callback({...ThemeProvider}))
//       })
//       const dispose2 = observe(ThemeProvider.state.other, () => {
//           debouncer(() => callback({...ThemeProvider}))
//       })
//       callback({...ThemeProvider})
//       return () => { dispose(); dispose2() }
//   }
// Ported onto `$effect.root` in place of mobx's `observe`: a detached root effect scope is
// created (the documented mechanism for building effects outside component-init, per Svelte's own
// `$effect.root` doc comment), holding a single `$effect` that reads BOTH `ThemeProvider.toArray()`
// (which itself reads every `state.data[key]` - same technique ThemeVars.svelte's `$derived.by`
// already relies on) and `Object.values(ThemeProvider.state.other)`, mirroring old's two separate
// `observe(...state.data...)` / `observe(...state.other...)` subscriptions in one effect.
// CHANGE-DETECTION (`lastSnapshot`, not a first-run boolean): mobx's `observe` never fires on
// registration, only on a real future mutation - but Svelte's `$effect` always runs at least once
// to discover its dependencies, and empirically (verified live in this session, not assumed) that
// mandatory first run is DEFERRED to a later microtask, not synchronous, and is NOT forced by an
// explicit `flushSync()` call placed here either. A naive `isFirstRun` boolean is UNSAFE as a
// result: if a real theme mutation happens in the window between subscribing and that deferred
// first run, the first run observes the ALREADY-mutated value, and a boolean guard would
// misidentify it as "just establishing deps" and silently swallow a real update - reproduced live
// in this session (a `set()` called immediately after `subscribeTheme()`, with zero delay, was
// dropped entirely under a boolean-flag version of this function). The fix compares a cheap
// snapshot captured at SUBSCRIBE time (the same instant the synchronous `callback(ThemeProvider)`
// below already reported to the caller) against what the effect observes on each of its runs,
// firing the debounced callback exactly when they differ - correct regardless of how many times,
// or exactly when, the underlying effect happens to execute.
// DEVIATION (disclosed): old passed a SHALLOW COPY `{...ThemeProvider}` to `callback` (spreading a
// class instance onto a plain object drops its prototype methods - old's consumers survived only
// because they read plain fields off the copy, never called a method on it). This port passes the
// LIVE rune-backed `ThemeProvider` singleton instead - the same object every already-ported
// consumer (ThemeVars.svelte, BaseNote.svelte, PlayerNote.svelte, the /theme route, ...) reads
// directly, so the Phase-4c renderer classes can call its real methods (`.get()`, `.isDefault()`,
// ...), not just read plain fields off a snapshot.
export function subscribeTheme(callback: (theme: Theme) => void): () => void {
    const debouncer = createDebouncer(50)
    let lastSnapshot = snapshotTheme()
    const dispose = $effect.root(() => {
        $effect(() => {
            // the read below IS the dependency-tracking step (both halves of the theme, mirroring
            // old's two separate `observe(...)` calls); the comparison is what makes this safe
            // against the deferred-first-run race described above
            const snapshot = snapshotTheme()
            if (snapshot === lastSnapshot) return
            lastSnapshot = snapshot
            debouncer(() => callback(ThemeProvider))
        })
    })
    callback(ThemeProvider)
    return dispose
}

function snapshotTheme(): string {
    return JSON.stringify(ThemeProvider.toArray()) + '|' + JSON.stringify(ThemeProvider.state.other)
}

export {
    defaultThemes
}
