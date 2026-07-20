<script lang="ts">
    import {onMount} from 'svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/shared/Utility/BodyDropper.tsx
    // The old file also exported a separate `DropHoverHinter` sub-component
    // (itself `memo`-wrapped) that BodyDropper rendered conditionally on
    // `showDropArea`, and which internally re-checked `isHovering` before
    // rendering the `.drag-n-drop` div - i.e. the div only ever showed when
    // BOTH conditions were true. DropHoverHinter had no other consumers on the
    // parent branch and isn't in this task's file list, so its logic is
    // flattened directly into the `{#if}` below (same net condition). Both
    // `memo()` wraps (BodyDropperComponent and DropHoverHinter) are dropped for
    // the same reason the brief already calls out for Memoized/MemoizedIcon:
    // a React re-render optimization Svelte's fine-grained reactivity doesn't
    // need. `.drag-n-drop` CSS is global (App.css), ported in the same task.
    export interface DroppedFile<T = ArrayBuffer | object | string> {
        data: T
        file: File
    }

    let {
        as,
        onHoverChange,
        onDrop,
        onError,
        showDropArea = false,
        dropAreaStyle = '',
    }: {
        as: 'json' | 'text' | 'buffer'
        onHoverChange?: (isHovering: boolean) => void
        onDrop: (files: DroppedFile[]) => void
        onError?: (error: unknown) => void
        showDropArea?: boolean
        dropAreaStyle?: string
    } = $props()

    let isHovering = $state(false)
    let debouncedIsHovering = $state(false)

    // Old: useDebounce(_isHovering, 50) - re-runs the 50ms timer on every change,
    // clearing the previous one, exactly like the old hook's effect cleanup.
    $effect(() => {
        void isHovering
        const handle = setTimeout(() => {
            debouncedIsHovering = isHovering
        }, 50)
        return () => clearTimeout(handle)
    })

    $effect(() => {
        onHoverChange?.(debouncedIsHovering)
    })

    function hasFiles(event: DragEvent): boolean {
        return event.dataTransfer?.types.includes('Files') ?? false
    }

    function resetDrag() {
        isHovering = false
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault()
        if (!hasFiles(event)) return
        isHovering = true
    }

    function handleDrag(event: DragEvent) {
        if (!hasFiles(event)) return
        event.preventDefault()
        isHovering = true
    }

    async function handleDrop(event: DragEvent) {
        resetDrag()
        event.preventDefault()
        const files = Array.from(event.dataTransfer?.files ?? [])
        const promises: Promise<DroppedFile>[] = files.map(file => new Promise((resolve, reject) => {
            const fileReader = new FileReader()

            function handleLoad() {
                try {
                    const value = fileReader.result as string | ArrayBuffer
                    resolve({
                        data: as === 'json' ? JSON.parse(value as string) : value,
                        file
                    })
                } catch (e) {
                    reject(e)
                }
            }

            try {
                fileReader.addEventListener('loadend', handleLoad, {once: true})
                if (as === 'text' || as === 'json') fileReader.readAsText(file)
                if (as === 'buffer') fileReader.readAsArrayBuffer(file)
            } catch (e) {
                reject(e)
            }
        }))
        try {
            const result = await Promise.all(promises)
            onDrop(result)
        } catch (e) {
            console.error(e)
            onError?.(e)
        }
    }

    onMount(() => {
        window.addEventListener('drop', handleDrop)
        window.addEventListener('dragenter', handleDrag)
        window.addEventListener('dragleave', resetDrag)
        window.addEventListener('dragover', handleDragOver)
        return () => {
            window.removeEventListener('drop', handleDrop)
            window.removeEventListener('dragenter', handleDrag)
            window.removeEventListener('dragleave', resetDrag)
            window.removeEventListener('dragover', handleDragOver)
        }
    })
</script>

{#if showDropArea && debouncedIsHovering}
    <div class="drag-n-drop" style={dropAreaStyle}>
        {t('home:drop_files_here')}
    </div>
{/if}
