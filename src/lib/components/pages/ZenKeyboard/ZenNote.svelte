<script lang="ts">
  import { untrack } from 'svelte';
  import { game } from '$game';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { preventDefault } from '$core/utils/Utilities';
  import type { ObservableNote } from '$lib/audio/Instrument.svelte';
  import type { InstrumentName, NoteStatus } from '$core/types';
  import type { NoteImage } from '$lib/games/types';
  import GenshinNoteBorder from '$cmp/GenshinNoteBorder.svelte';
  import SvgNote from '$cmp/SvgNote.svelte';
  import { suppressNativeTouch } from '$cmp/suppressNativeTouch';

  // QUIRK: noteImage is a redundant prop, always equal to note.noteImage (ZenKeypad's only call
  // site passes noteImage={note.noteImage}) - used only as the truthiness gate in the template
  // below, while the actual glyph name passed to SvgNote reads from note.noteImage instead. Kept
  // as two separate reads rather than simplified into one.
  let {
    note,
    onClick,
    onRelease,
    noteImage,
    noteText,
    instrumentName,
    keyPadding,
    held = false,
  }: {
    note: ObservableNote;
    noteText: string;
    noteImage: NoteImage;
    instrumentName: InstrumentName;
    keyPadding: number;
    onClick: (note: ObservableNote) => void;
    onRelease?: (note: ObservableNote) => void;
    /** This note is currently physically held (pointer or bound key) — shown pressed-down. */
    held?: boolean;
  } = $props();

  let status: NoteStatus = $state('');
  let statusId = $state(0);
  let ref: HTMLDivElement | undefined = $state();

  // ── press animation, shaped as attack → hold → release ──
  // A press animates ONCE, into the held look, and stays there: the attack spins the note down
  // to HELD_SCALE and fills forwards, so "holding" is not an animation at all - it is simply the
  // attack's own final frame left standing. The release then spins the other way back to full
  // size. The two halves meet exactly (same scale, same rotation modulo a turn), so nothing
  // snaps between them.
  //
  // Only sustaining instruments get a hold: `held` is never set for the others (the zen page
  // only fills its held-set when `instrument.supportsSustain`), and those play the attack and
  // release fused into ONE continuous spin instead - the same motion with the hold's duration
  // taken out, which is what "no loop section" looks like.
  const HELD_SCALE = 0.8;
  const ATTACK_MS = 400;
  const RELEASE_MS = 400;
  // One turn per 400ms in all three, so the spin reads at one speed whatever the instrument does.
  const ONE_SHOT_MS = 400;
  // Frame-path only: how long its click flash runs before the button settles into the pressed
  // look. The frameless path needs no such delay - its attack animation ends IN the held look.
  const PRESSED_VISUAL_DELAY_MS = 120;

  let pressedVisual = $state(false);
  let pressTimeout: ReturnType<typeof setTimeout> | 0 = 0;
  // Deliberately NOT $state: nothing renders from it. It only remembers that this component
  // still owes a release animation for a press whose attack it already played.
  let holdingFrameless = false;
  let currentAnimation: Animation | undefined;
  // Bumped by every attack and every release, so a press landing during the awaited tail of
  // playFramelessRelease() below invalidates that pending release instead of racing it.
  let animationSeq = 0;

  $effect(() => {
    if (held) {
      if (game.features.hasNoteFrame) {
        clearTimeout(pressTimeout);
        pressTimeout = setTimeout(() => {
          pressedVisual = true;
        }, PRESSED_VISUAL_DELAY_MS);
      } else {
        holdingFrameless = true;
      }
    } else {
      clearTimeout(pressTimeout);
      pressTimeout = 0;
      if (game.features.hasNoteFrame) {
        if (untrack(() => pressedVisual)) {
          pressedVisual = false;
          playFrameReleaseAnimation();
        }
      } else if (holdingFrameless) {
        // Unconditional on the frameless path, unlike the frame path's `if (pressedVisual)`:
        // the attack is filled forwards, so skipping the release would leave the note shrunk
        // forever rather than merely skipping a flourish.
        holdingFrameless = false;
        playFramelessRelease();
      }
    }
  });

  function playFrameReleaseAnimation() {
    status = 'clicked';
    untrack(() => {
      statusId += 1;
    });
    setTimeout(() => {
      status = '';
    }, 100);
  }

  function playAttack(willHold: boolean) {
    if (!ref) return;
    currentAnimation?.cancel();
    animationSeq += 1;
    currentAnimation = ref.animate(willHold ? attackKeyframes : oneShotKeyframes, {
      duration: willHold ? ATTACK_MS : ONE_SHOT_MS,
      // `forwards` is what makes the hold free: the note is parked in the attack's last frame
      // until something cancels it, which is exactly what the release below does.
      fill: willHold ? 'forwards' : 'none',
    });
  }

  async function playFramelessRelease() {
    const seq = (animationSeq += 1);
    const attack = currentAnimation;
    // A tap shorter than the attack still gets its whole spin first. Cutting in mid-attack
    // would jump the note from wherever the spin had it to the release's HELD_SCALE start -
    // the very snap this sequencing exists to remove. The wait only ever costs a tap the tail
    // of one 400ms spin, and the two animations still read as one continuous motion.
    if (attack && attack.playState === 'running') {
      try {
        await attack.finished;
      } catch {
        return; // cancelled by a newer press, which owns the note's animation now
      }
      if (seq !== animationSeq || !ref) return;
    }
    if (!ref) return;
    currentAnimation?.cancel();
    currentAnimation = ref.animate(releaseKeyframes, { duration: RELEASE_MS });
  }

  // No explicit `Keyframe[]` annotation (TS infers it structurally, which is all
  // `.animate()` needs) - the global `Keyframe` type identifier trips this repo's plain
  // (non-type-aware) `no-undef` eslint rule, which doesn't recognize it the way `KeyboardEvent`/
  // `PointerEvent`/etc. are recognized via the `globals` package's browser list.
  //
  // The explicit offsets keep the rotation rate constant (90deg at 25%, 270deg at 75%) while
  // letting the scale move only at the ends - the shrink lands in the first quarter of the
  // attack, the growth in the last quarter of the release.
  const attackKeyframes = [
    { transform: 'rotateY(0deg) scale(1)', offset: 0 },
    { transform: `rotateY(90deg) scale(${HELD_SCALE})`, offset: 0.25 },
    { transform: `rotateY(360deg) scale(${HELD_SCALE})`, offset: 1 },
  ];
  // Reverse spin, starting from precisely where the attack parked the note.
  const releaseKeyframes = [
    { transform: `rotateY(0deg) scale(${HELD_SCALE})`, offset: 0 },
    { transform: `rotateY(-270deg) scale(${HELD_SCALE})`, offset: 0.75 },
    { transform: 'rotateY(-360deg) scale(1)', offset: 1 },
  ];
  // Attack and release with no hold between them: one turn that shrinks on the way in and
  // grows back on the way out. Same single 360deg spin the non-sustaining instruments have
  // always had here.
  const oneShotKeyframes = [
    { transform: 'rotateY(0deg) scale(1)', offset: 0 },
    { transform: `rotateY(90deg) scale(${HELD_SCALE})`, offset: 0.25 },
    { transform: `rotateY(270deg) scale(${HELD_SCALE})`, offset: 0.75 },
    { transform: 'rotateY(360deg) scale(1)', offset: 1 },
  ];

  function handleClick(e: PointerEvent) {
    preventDefault(e);
    onClick(note);
  }

  function parseClass(status: NoteStatus) {
    let className = game.notes.cssClasses.note;
    switch (status) {
      case 'clicked':
        className += ` click-event`;
        break;
      default:
        break;
    }
    return className;
  }

  function parseBorderFill(status: NoteStatus) {
    if (status === 'clicked') return 'transparent';
    else if (status === 'toClickNext' || status === 'toClickAndNext') return '#63aea7';
    return 'var(--note-border-fill)';
  }

  function getTextColor() {
    const noteBg = theme.get('note_background');
    if (game.features.hasNoteFrame) {
      if (noteBg.luminosity() > 0.65) {
        return game.themes.baseConfig.text.note;
      } else {
        return noteBg.isDark()
          ? game.themes.baseConfig.text.light
          : game.themes.baseConfig.text.dark;
      }
    } else {
      return noteBg.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark;
    }
  }

  // void-reads all three note.data fields (not just whichever the body below touches) so this
  // effect reruns on ANY of them changing, matching a whole-object observer rather than a
  // narrower per-field subscription. Don't trim these to "just the fields used".
  //
  // QUIRK: this effect also fires once immediately on mount, so every zen-keyboard note
  // auto-plays its "clicked"/flip animation once on page load, and again whenever the instrument
  // is swapped (a fresh ObservableNote) - a faithful reproduction of existing old behavior, not a
  // bug to suppress. Likewise, the setTimeout below that clears status is never cancelled - if
  // this effect reruns within 100ms of a previous run, an earlier scheduled reset can clear a
  // newer "clicked" status. A pre-existing race, kept as-is rather than given a clearTimeout old
  // never had.
  //
  // QUIRK (load-bearing, a real bug this port found - not old parity): statusId += 1 below reads
  // and writes the same $state within this effect's own run - without untrack(), that's
  // effect_update_depth_exceeded (reproduced live). untrack() confines the increment's read so
  // it isn't tracked as this effect's own dependency; {#key statusId} still re-keys normally,
  // since untrack only suppresses THIS effect's tracking, not the write's propagation to other
  // subscribers. Do not remove untrack() here. Same fix pattern in VsrgLatestScore.svelte,
  // Player.svelte, NumericalInput.svelte, zen-keyboard/+page.svelte.
  $effect(() => {
    void note.data.status;
    void note.data.delay;
    void note.data.animationId;
    if (game.features.hasNoteFrame) {
      status = 'clicked';
      untrack(() => {
        statusId += 1;
      });
      setTimeout(() => {
        status = '';
      }, 100);
    } else {
      // untrack(held): whether this press will be held decides WHICH animation plays, but it
      // must not become a dependency of this effect - `held` flipping back to false on release
      // would otherwise re-fire the press animation straight over the release flourish.
      // Both writes (the page's held-set add and this note's animationId bump) happen in the
      // same synchronous handler, so `held` is already true here for a sustaining instrument.
      playAttack(untrack(() => held));
    }
  });

  const textColor = $derived(getTextColor());
  const clickColor = $derived(game.instruments.data[instrumentName]?.clickColor);
  const animationBorderColor = $derived(
    clickColor && theme.isDefault('accent') ? clickColor : undefined
  );
  // $derived.by(...) (not the bare $derived(expr) sugar) is required: TypeScript narrows status's
  // type to its $state('') initializer literal when the comparison is inlined directly as
  // $derived's argument, since it can't see the reassignment inside the $effect above - wrapping
  // in its own arrow function gives a fresh, unnarrowed read (the same fix PlayerKeyboard.svelte
  // uses for its hideNotes/keyboardClass).
  const svgBackground = $derived.by(() =>
    status === 'clicked'
      ? clickColor && theme.isDefault('accent')
        ? clickColor
        : 'var(--accent)'
      : 'var(--note-background)'
  );
  const className = $derived(
    `${parseClass(status)} ${game.features.hasNoteFrame ? '' : 'sky-zen-note'}`
  );
  // Only the frame path has a CSS-driven pressed look to transition into. The frameless path's
  // hold IS its attack animation's filled-forwards last frame, so it wants no inline transform
  // and no transition: a `transition:transform` here would animate the element back to its
  // untransformed state the instant the release cancels that fill, fighting the release
  // animation over the same property.
  const noteStyle = $derived(
    game.features.hasNoteFrame
      ? `transition:transform 120ms ease,filter 120ms ease;${
          pressedVisual ? 'transform:scale(0.88);filter:brightness(1.15)' : ''
        }`
      : ''
  );
</script>

<button
  {@attach suppressNativeTouch}
  onpointerdown={handleClick}
  onpointerup={() => onRelease?.(note)}
  onpointerleave={() => onRelease?.(note)}
  onpointercancel={() => onRelease?.(note)}
  oncontextmenu={preventDefault}
  class="button-hitbox-bigger"
  style="padding:{keyPadding}rem"
>
  {#if game.features.hasNoteFrame}
    {#key statusId}
      <div
        class={game.notes.cssClasses.noteAnimation}
        style={animationBorderColor ? `border-color:${animationBorderColor}` : ''}
      ></div>
    {/key}
  {/if}
  <div bind:this={ref} class={className} style={noteStyle}>
    {#if game.features.hasNoteFrame}
      <GenshinNoteBorder class="genshin-border" fill={parseBorderFill(status)} />
    {/if}
    {#if noteImage}
      <!-- QUIRK: BaseNote.svelte's SvgNote render passes no color prop (untinted) while this
                 one does - both are correct, deliberate parity with old. Don't "fix" the asymmetry
                 by adding color to BaseNote's render. -->
      <SvgNote
        name={note.noteImage}
        color={theme.isDefault('accent') ? game.instruments.data[instrumentName]?.fill : undefined}
        background={svgBackground}
      />
    {/if}
    <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
      {noteText}
    </div>
  </div>
</button>

<style>
  /* No :global() needed: this class only ever lands on the <div> directly above, which this
       file's own template creates, so normal Svelte scoping already reaches it. */
  .sky-zen-note {
    opacity: 0.8;
  }
</style>
