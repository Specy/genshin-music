<script lang="ts">
  import { untrack } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import StepperButton from '$cmp/inputs/StepperButton.svelte';

  type CommonProps = {
    placeholder?: string;
    class?: ClassValue;
    delay?: number;
    step?: number;
  };
  /**
   * `nullable` is a whole parsing mode, not a flag on the value:
   * - off, the field always holds a number and an unparseable one snaps back to 0;
   * - on, an empty field means "no value" and is handed over as null, which is NOT the same as 0
   *   (a track's local offset of 0 deliberately overrides a nonzero global one, so clearing the
   *   field has to clear the override rather than pin the track to zero).
   */
  type Props = CommonProps &
    (
      | { nullable?: false; value: number; onChange: (value: number) => void }
      | { nullable: true; value: number | null; onChange: (value: number | null) => void }
    );

  let {
    onChange,
    value,
    delay = 800,
    step = 1,
    placeholder,
    nullable = false,
    class: cls = '',
  }: Props = $props();

  // The union above cannot be narrowed through the destructuring, so the handover goes through one
  // cast: with `nullable` off nothing below ever produces a null to hand over.
  const emit = $derived(onChange as (value: number | null) => void);

  // elementValue is a writable $derived (Svelte 5.25+): reading it tracks value normally, but
  // the +/- buttons and the input below can assign to it directly to diverge locally - that
  // override is overwritten the next time value actually changes.
  let elementValue = $derived(`${value ?? ''}`);
  // One-time seed; only the debounce effect below updates it after that.
  // svelte-ignore state_referenced_locally
  let debounced = $state(`${value ?? ''}`);

  $effect(() => {
    void elementValue;
    const handle = setTimeout(() => {
      debounced = elementValue;
    }, delay);
    return () => clearTimeout(handle);
  });

  // onChange goes through untrack(): its consumers (MidiParser.svelte's changeBpm/changeOffset,
  // TrackInfo.svelte's onMaxScaleChange) funnel into convertMidi(), which mutates several $state
  // fields - left untracked, this effect would pick those up as dependencies and self-invalidate,
  // throwing effect_update_depth_exceeded the moment a MIDI file loads.
  $effect(() => {
    // A half-typed number is not an invalid one. The debounce fires while the field still holds
    // only the sign, and treating that as unparseable wipes the '-' the user just typed - the
    // global note offset is routinely negative, so this is normal use, not an edge case. '' is
    // deliberately NOT in this guard: in nullable mode an empty field IS the value that clears
    // the override.
    if (debounced === '-') return;
    if (nullable) {
      // parseInt, not Number: `Number('')` is 0, which is a value, so an empty field would pin
      // the target to zero instead of clearing it.
      const parsed = parseInt(debounced);
      const next = Number.isFinite(parsed) ? parsed : null;
      elementValue = `${next ?? ''}`;
      untrack(() => emit(next));
    } else {
      const parsed = Number(debounced);
      if (Number.isFinite(parsed)) {
        untrack(() => emit(parsed));
      } else {
        elementValue = '0';
      }
    }
  });
</script>

<div class={['numerical-input', cls]}>
  <StepperButton
    direction="decrement"
    onclick={() => (elementValue = `${Number(elementValue) - step}`)}
  />
  <input
    type="text"
    {placeholder}
    value={elementValue}
    oninput={(e) => (elementValue = e.currentTarget.value)}
  />
  <StepperButton
    direction="increment"
    onclick={() => (elementValue = `${Number(elementValue) + step}`)}
  />
</div>

<style>
  .numerical-input {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.15rem;
  }

  /* The settings screen's number input, which SettingsRow paints on its children rather than
     declaring in SettingsInput - repeated here because this one is not inside a settings row. */
  .numerical-input input {
    width: 4rem;
    min-width: 0;
    padding: 0.2rem;
    border: none;
    outline: none;
    border-radius: 0.2rem;
    background-color: var(--primary);
    color: var(--primary-text);
    text-align: center;
  }

  .numerical-input input::placeholder {
    font-size: 0.7rem;
    color: var(--primary-text);
  }
</style>
