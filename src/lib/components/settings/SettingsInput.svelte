<script lang="ts">
    import type {SettingUpdate, SettingUpdateKey, SettingsNumber, SettingsText} from '$core/types/SettingsPropriety'

    // Old: src/components/shared/Settings/Input.tsx (named `Input` there; renamed `SettingsInput`
    // here to avoid colliding with a plain HTML input, matching this task's own file-list naming).
    //
    // Old's number-branch `handleChange` set `el.value = ""` right before calling `onChange`,
    // commented "have to do this to remove a react bug that adds a 0 at the start". That's a
    // React controlled-input reconciliation workaround (a leading-zero rendering artifact) - it
    // never changes what value gets passed to `onChange`, only mutates the raw DOM element's
    // displayed text a tick early. Svelte doesn't share React's diffing/reconciliation model for
    // controlled inputs, so this bug class doesn't apply - dropped as a documented React-specific
    // dead workaround (same class of decision as dropping `memo()` per the Memoized precedent)
    // rather than porting a no-op DOM mutation that would only risk a visible digit flash.
    //
    // FaMinus/FaPlus (react-icons/fa) inlined below as raw <svg>, no react-icons dependency - same
    // convention as Logger.svelte/HelpTooltip.svelte/FloatingDropdown.svelte (Phase 3). Old had no
    // consumer of Logger's own icon set here (that's FaCheckCircle/FaExclamationTriangle/
    // FaTimesCircle, not FaMinus/FaPlus), so these were fetched fresh from the same source version
    // those files cite (unpkg.com/react-icons@5.6.0/fa/index.mjs, FaMinus/FaPlus GenIcon() calls) -
    // wrapper attrs (stroke/fill/stroke-width/xmlns, height/width defaulting to "1em" since old
    // passed no explicit `size`) match that same established pattern.
    let {
        data,
        objectKey,
        value,
        onChange,
        onComplete,
    }: {
        data: SettingsNumber | SettingsText
        objectKey: SettingUpdateKey
        value: string | number
        onChange: (value: string | number) => void
        onComplete: (data: SettingUpdate) => void
    } = $props()

    function handleChange(e: Event & {currentTarget: EventTarget & HTMLInputElement}) {
        if (data.type === 'number') {
            const numValue = Number(e.currentTarget.value)
            if (!data.threshold || numValue < data.threshold[0] || numValue > data.threshold[1]) return
            onChange(numValue)
        } else {
            onChange(e.currentTarget.value)
        }
    }

    function handleIncrement(sign: number) {
        if (data.type === 'number') {
            const nextValue = Number(value) + (data.increment || 0) * sign
            if (!data.threshold || nextValue < data.threshold[0] || nextValue > data.threshold[1]) return
            onComplete({
                key: objectKey,
                data: {...data, value: nextValue}
            })
        }
    }

    function handleBlur() {
        if (data.value === value) return
        // `data`/`value` are already the same SettingsNumber/SettingsText variant at runtime (this
        // component's own `data` prop type guarantees it) - the shared `SettingUpdate.data` type
        // just can't express that narrowing across an object spread, so this cast is type-level
        // only and changes zero runtime behavior (identical passthrough to old, which used a
        // locally-loosened `data: any` on its own `onComplete` prop to sidestep the same friction).
        onComplete({
            key: objectKey,
            data: {...data, value} as SettingUpdate['data']
        })
    }
</script>

<div class="settings-input">
    {#if data.type === 'number'}
        <button
            onclick={() => handleIncrement(-1)}
            class="settings-input-button"
            style="margin-right:0.15rem"
            aria-label="Decrement"
        >
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
        </button>
    {/if}
    <input
        type={data.type}
        value={value}
        placeholder={data.placeholder || ''}
        onblur={handleBlur}
        onchange={handleChange}
        aria-label={data.name}
    />
    {#if data.type === 'number'}
        <button
            onclick={() => handleIncrement(1)}
            class="settings-input-button"
            style="margin-left:0.15rem"
            aria-label="Increment"
        >
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
        </button>
    {/if}
</div>

<style>
    .settings-input {
        display: flex;
        width: 8rem;
    }

    .settings-input input {
        width: unset;
        min-width: 0;
        display: flex;
        text-align: center;
        height: 1rem;
        flex: 1;
    }

    .settings-input input::-webkit-outer-spin-button,
    .settings-input input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    /* Firefox */
    .settings-input input[type=number] {
        appearance: textfield;
        -moz-appearance: textfield;
    }

    .settings-input-button {
        width: 1.4rem;
        height: 1.4rem;
        font-weight: bold;
        font-family: Arial;
        display: flex;
        padding: 0;
        justify-content: center;
        align-items: center;
        border: none;
        background-color: var(--primary);
        color: var(--primary-text);
        border-radius: 0.2rem;
        cursor: pointer;
        font-size: 0.7rem;
    }
</style>
