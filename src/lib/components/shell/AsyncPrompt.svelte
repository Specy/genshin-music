<script lang="ts">
    import {onMount} from 'svelte'
    import isMobile from 'is-mobile'
    import {asyncPromptStore} from '$stores/AsyncPromptStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {cn} from '$core/utils/Utilities'
    import {t} from '$i18n/binding.svelte'
    import DecoratedCard from '../layout/DecoratedCard.svelte'

    // Old: src/components/shared/Utility/AsyncPrompt.tsx - three React components in one file
    // (AsyncPromptWrapper, AsyncConfirm, AsyncPrompt). Svelte can't export more than one named
    // component per file (same constraint DecoratedCard's RawDecoratedBox hit in Task 5), so
    // this single file plays the old AsyncPromptWrapper's role: it mounts BOTH dialogs (confirm
    // + free-text prompt) directly against `asyncPromptStore.promptState` / `.confirmState`
    // rather than re-splitting them into props passed down to two more sub-components.
    //
    // KeyboardProvider (the old global priority-based key registry) is not ported - out of
    // scope for this task (brief: "keyboard handling via <svelte:window onkeydown> scoped to
    // visible state" - see handleWindowKeydown below for how that's implemented). The old
    // AsyncPrompt additionally had a *second*, functionally redundant Enter/Escape handler
    // directly on the <input>'s onKeyDown - keydown always bubbles to window regardless (neither
    // old handler ever called stopPropagation), so it collapses into the single window-level
    // handler below with no behavior change (calling `answerPrompt` twice was already harmless
    // in the old code too: the second call always saw `deferred` already cleared and hit the
    // "No deferred prompt" warn branch).
    //
    // `IGNORE_CLICK_CLASS` (old $lib/Hooks/useClickOutside.ts, = 'ignore_click_outside') is kept
    // below as a literal class string for DOM/class parity - the click-outside hook itself has
    // no consumer yet in this port and isn't part of this task's file list (same "keep the dead
    // class for parity" treatment as Task 5's `#__next` in App.css).
    //
    // `useTheme()` -> direct `ThemeProvider` reads (same replacement Switch.svelte/Select.svelte
    // used in Task 5): a `$derived` on `ThemeProvider.layer(...)` replaces the old
    // subscribeTheme-driven `color` state + effect.
    //
    // `e.nativeEvent.composedPath()[0] !== ref.current` (old overlay-click-to-cancel guard) ->
    // `e.target !== e.currentTarget`: equivalent here (no shadow DOM anywhere in this component
    // tree) and avoids needing a bound ref just for the comparison.
    //
    // Quirk preserved deliberately: AsyncConfirm's Yes/No buttons are translated (`t('common:
    // yes')` / `t('common:no')`), but AsyncPrompt's Cancel/Ok buttons are literal English text -
    // exactly like the old file (AsyncConfirm called `useTranslation('common')` + `t(...)`;
    // AsyncPrompt never did).

    onMount(() => {
        return () => {
            asyncPromptStore.clearAll()
        }
    })

    const promptState = asyncPromptStore.promptState
    const confirmState = asyncPromptStore.confirmState

    // ---- Confirm dialog ----
    let confirmIsMounted = $state(false)
    $effect(() => {
        if (confirmState.deferred) {
            confirmIsMounted = true
            return
        }
        // demount after animation ended
        const timeout = setTimeout(() => {
            confirmIsMounted = false
        }, 300)
        return () => clearTimeout(timeout)
    })
    $effect(() => {
        if (!confirmState.deferred) return
        const activeEl = document.activeElement as HTMLElement | null
        activeEl?.blur()
    })

    function handleConfirmOverlayClick(e: MouseEvent) {
        if (e.target !== e.currentTarget || !confirmState.cancellable) return
        asyncPromptStore.answerConfirm(null)
    }

    function handleConfirmKeydown(e: KeyboardEvent) {
        if (!confirmState.deferred) return
        if (e.key === 'Escape' && confirmState.cancellable) asyncPromptStore.answerConfirm(null)
        if (e.key === 'Enter') asyncPromptStore.answerConfirm(true)
    }

    // ---- Prompt dialog ----
    let promptIsMounted = $state(false)
    let value = $state('')
    let inputEl: HTMLInputElement | undefined = $state()
    const color = $derived(ThemeProvider.layer('primary', 0.1).toString())

    $effect(() => {
        if (promptState.deferred) {
            promptIsMounted = true
            return
        }
        // demount after animation ended
        const timeout = setTimeout(() => {
            promptIsMounted = false
        }, 200)
        return () => clearTimeout(timeout)
    })
    $effect(() => {
        void promptState.deferred
        value = ''
    })
    $effect(() => {
        if (isMobile() || !promptState.deferred) return
        // focus element once it's visible
        const timeout = setTimeout(() => inputEl?.focus(), 300)
        return () => clearTimeout(timeout)
    })

    function handlePromptOverlayClick(e: MouseEvent) {
        if (e.target !== e.currentTarget || !promptState.cancellable) return
        asyncPromptStore.answerPrompt(null)
    }

    function handlePromptKeydown(e: KeyboardEvent) {
        if (!promptState.deferred) return
        if (e.key === 'Enter' && value) asyncPromptStore.answerPrompt(value)
        if (e.key === 'Escape' && promptState.cancellable) asyncPromptStore.answerPrompt(null)
    }

    // `<svelte:window>` can only appear once per component and must be top-level (not inside a
    // block) - so unlike the old per-dialog KeyboardProvider effects (which only registered
    // their listener while that dialog's own `deferred` was set), a single window keydown
    // listener is always attached for the lifetime of this component, and each handler below
    // guards itself on its own dialog's `deferred` state instead ("scoped to visible state" via
    // an internal early-out rather than via conditional mounting).
    function handleWindowKeydown(e: KeyboardEvent) {
        handleConfirmKeydown(e)
        handlePromptKeydown(e)
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!--
    The two overlay divs below are click-to-cancel backdrops, not independent controls: their
    only interactive purpose is dismissing the dialog on an outside click, and that action is
    already fully keyboard-reachable via the window Escape handler above plus the explicit
    No/Cancel buttons inside. Giving a full-viewport backdrop its own role="button"/tabindex (the
    fix svelte-check suggests, and the one DecoratedCard applies for its own onclick in Task 5)
    would be a real a11y regression here, not an improvement: it would insert a screen-reader-
    focusable stop the size of the whole screen ahead of the actual dialog content. Suppressing
    both rules is therefore the deliberate, correct call for this specific "backdrop" pattern -
    same treatment mainstream accessible modal implementations (e.g. Radix/Headless UI dialogs)
    give their overlay element.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    style={!confirmIsMounted ? 'display:none' : ''}
    onclick={handleConfirmOverlayClick}
    class={cn('prompt-overlay ignore_click_outside', [!confirmState.deferred, 'prompt-overlay-hidden'])}
>
    <DecoratedCard
        className={cn('floating-prompt ignore_click_outside', [!confirmState.deferred, 'floating-prompt-hidden'])}
        isRelative={false}
        size="1.1rem"
    >
        <div style="white-space:pre-wrap">{confirmState.question}</div>
        <div class="prompt-row">
            <button
                class="prompt-button"
                style="background-color:rgb(169, 82, 90);color:white"
                onclick={() => asyncPromptStore.answerConfirm(false)}
            >
                {t('common:no')}
            </button>
            <button
                class="prompt-button"
                style="background-color:rgb(98, 140, 131);color:white"
                onclick={() => asyncPromptStore.answerConfirm(true)}
            >
                {t('common:yes')}
            </button>
        </div>
    </DecoratedCard>
</div>

<!-- Same backdrop pattern/reasoning as the confirm overlay above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    style={!promptIsMounted ? 'display:none' : ''}
    onclick={handlePromptOverlayClick}
    class={cn('prompt-overlay ignore_click_outside', [!promptState.deferred, 'prompt-overlay-hidden'])}
>
    <DecoratedCard
        className={cn('floating-prompt ignore_click_outside', [!promptState.deferred, 'floating-prompt-hidden'])}
        isRelative={false}
        size="1.1rem"
    >
        <div style="white-space:pre-wrap">{promptState.question}</div>
        <input bind:this={inputEl} class="prompt-input" bind:value />
        <div class="prompt-row">
            <button
                class="prompt-button"
                style="background-color:{color};color:white"
                onclick={() => asyncPromptStore.answerPrompt(null)}
            >
                Cancel
            </button>
            <button
                class={cn('prompt-button', [!value, 'disabled'])}
                disabled={!value}
                style="background-color:{color};color:white"
                onclick={() => asyncPromptStore.answerPrompt(value)}
            >
                Ok
            </button>
        </div>
    </DecoratedCard>
</div>
