<script module lang="ts">
  export interface FileElement<T> {
    data: T;
    file: File;
  }
</script>

<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  type FilePickerProps = {
    children: Snippet;
    onError?: (error: unknown, files: File[]) => void;
    style?: string;
    multiple?: boolean;
  } & (
    | {
        as: 'json';
        onPick: (files: FileElement<T>[]) => void;
      }
    | {
        as: 'text';
        onPick: (files: FileElement<string>[]) => void;
      }
    | {
        as: 'buffer';
        onPick: (files: FileElement<ArrayBuffer>[]) => void;
      }
    | {
        as: 'file';
        onPick: (files: FileElement<File>[]) => void;
      }
  );

  let { children, onPick, style = '', as, multiple = false, onError }: FilePickerProps = $props();

  // `as`/`onPick` are destructured independently from the discriminated
  // union above, so TS can't correlate `as === 'file'` back to narrowing
  // `onPick`'s parameter type - this one loose-typed alias covers every
  // onPick(...) call below instead of an assertion at each site. `$derived`
  // (not `const`) so it keeps tracking the real `onPick` prop, not just
  // whatever reference was passed at first render.
  const pick = $derived(onPick as (files: FileElement<T | string | ArrayBuffer | File>[]) => void);

  let input: HTMLInputElement | undefined = $state();

  async function handleEvent(event: Event & { currentTarget: HTMLInputElement }) {
    const fileList = event.currentTarget.files;
    if (fileList === null) return;
    const files = Array.from(fileList);
    if (as === 'file') {
      const result = pick(files.map((file) => ({ data: file, file })));
      // Match the buffered modes below: the same file must be selectable again after a failed or
      // cancelled import. Reset after the callback has synchronously claimed ownership of it.
      if (input) input.value = '';
      return result;
    }
    const promises: Promise<FileElement<string | ArrayBuffer>>[] = files.map(
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
      pick(result);
    } catch (e) {
      console.error(e);
      onError?.(e, files);
    }
    if (input) input.value = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input?.click();
    }
  }
</script>

<input type="file" style="display:none" bind:this={input} onchange={handleEvent} {multiple} />
<div role="button" tabindex="0" onclick={() => input?.click()} onkeydown={handleKeydown} {style}>
  {@render children()}
</div>
