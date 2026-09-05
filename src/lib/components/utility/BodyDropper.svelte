<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$i18n/binding.svelte';

  export interface DroppedFile<T = ArrayBuffer | object | string> {
    data: T;
    file: File;
  }

  let {
    as,
    onHoverChange,
    onDrop,
    onError,
    showDropArea = false,
    dropAreaStyle = '',
  }: {
    as: 'json' | 'text' | 'buffer';
    onHoverChange?: (isHovering: boolean) => void;
    onDrop: (files: DroppedFile[]) => void;
    onError?: (error: unknown) => void;
    showDropArea?: boolean;
    dropAreaStyle?: string;
  } = $props();

  let isHovering = $state(false);
  let debouncedIsHovering = $state(false);

  $effect(() => {
    void isHovering;
    const handle = setTimeout(() => {
      debouncedIsHovering = isHovering;
    }, 50);
    return () => clearTimeout(handle);
  });

  $effect(() => {
    onHoverChange?.(debouncedIsHovering);
  });

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  function resetDrag() {
    isHovering = false;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!hasFiles(event)) return;
    isHovering = true;
  }

  function handleDrag(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    isHovering = true;
  }

  async function handleDrop(event: DragEvent) {
    resetDrag();
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    const promises: Promise<DroppedFile>[] = files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const fileReader = new FileReader();

          function handleLoad() {
            try {
              const value = fileReader.result as string | ArrayBuffer;
              resolve({
                data: as === 'json' ? JSON.parse(value as string) : value,
                file,
              });
            } catch (e) {
              reject(e);
            }
          }

          try {
            fileReader.addEventListener('loadend', handleLoad, { once: true });
            if (as === 'text' || as === 'json') fileReader.readAsText(file);
            if (as === 'buffer') fileReader.readAsArrayBuffer(file);
          } catch (e) {
            reject(e);
          }
        })
    );
    try {
      const result = await Promise.all(promises);
      onDrop(result);
    } catch (e) {
      console.error(e);
      onError?.(e);
    }
  }

  onMount(() => {
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragenter', handleDrag);
    window.addEventListener('dragleave', resetDrag);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragenter', handleDrag);
      window.removeEventListener('dragleave', resetDrag);
      window.removeEventListener('dragover', handleDragOver);
    };
  });
</script>

{#if showDropArea && debouncedIsHovering}
  <div class="drag-n-drop" style={dropAreaStyle}>
    {t('home:drop_files_here')}
  </div>
{/if}

<style>
  .drag-n-drop {
    background-color: rgba(var(--accent-rgb), 0.7);
    backdrop-filter: blur(4px);
    filter: saturate(0.7);
    color: var(--accent-text);
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    justify-content: center;
    align-items: center;
    display: flex;
    z-index: 5;
    animation:
      infinite drop-pulse 3s,
      fadeInOpacity 0.3s;
    font-size: 2rem;
  }

  @keyframes drop-pulse {
    0% {
      background-color: rgba(var(--accent-rgb), 0.7);
    }

    25% {
      background-color: rgba(var(--primary-rgb), 0.7);
    }
    50% {
      background-color: rgba(var(--accent-rgb), 0.7);
    }
  }
</style>
