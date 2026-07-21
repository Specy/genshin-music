<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import {asyncConfirm, asyncPrompt} from '$stores/AsyncPromptStore.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {APP_NAME} from '$core/legacyConfig'
    import {cn} from '$core/utils/Utilities'

    // Old: src/app/_client-pages/uma-mode/index.tsx (168 lines) + UmaMode.module.scss (inlined
    // below - no real SCSS features used, so it drops in as plain CSS like every other .module.scss
    // this migration has ported). Every string literal below (the passphrase-flow copy, including
    // the zalgo/glitch-text ones) was extracted programmatically from the old blob via a small node
    // script rather than hand-typed, to guarantee the combining-diacritic sequences transcribe
    // byte-exact - a manual retype of text like "T̶́h..." risks silently dropping a
    // combining mark, exactly the kind of transcription error this migration's conventions warn
    // against.
    //
    // Effect merge (svelte-ize per this task's brief): old had THREE separate effects - (1)
    // `[ref]` -> measure `bounds` once, (2) `[bounds]` -> populate the initial particle batch
    // (reading `${APP_NAME}_uma_mode` straight from localStorage, NOT the reactive config store -
    // preserved below, see the comment at that read), (3) `[bounds, IS_UMA_MODE]` -> a
    // setInterval(50) that respawns dead particles, restarting the whole interval whenever
    // IS_UMA_MODE changed so future spawns pick up the new emoji pool. Collapsed into one onMount
    // below: `isUmaMode` is a $derived reactive read, so the SAME long-lived interval (never torn
    // down/recreated) already sees the current value on every tick without a restart - functionally
    // identical end behavior (every qualifying respawn after a toggle uses the new pool), just
    // without old's incidental interval-phase reset on each toggle (imperceptible at 50ms).
    //
    // Dropped as inert: ParticleElement's own `key={emoji}` (a React quirk) - React `key` only
    // affects reconciliation at the exact `.map()` call site producing the sibling list; here that
    // site is `particles.map(...)` in the OLD parent, keyed correctly by `particle.id` (unique) -
    // the inner key on ParticleElement's own returned div is a plain prop React silently drops,
    // dead code with zero observable effect. The Svelte {#each} block below is keyed by
    // `particle.id` only, same as the outer (real) old key.
    const nonUmaModeEmojis = ["👻", "👾", "👺", "👹", "👿", "🔥"]
    const umaModeEmojis = ["💀", "🦴", "☠️", "🪦", "⚰️"]
    const umaModeText = umaModeEmojis.join(' ')
    let particleId = 0 // old: module-scope `let id = 0` (persists across remounts); here it's
    // component-instance-scoped (resets on each mount) - unobservable either way, this id is never
    // rendered, only used as the {#each} key for the CURRENT particles array.

    type Particle = {
        emoji: string
        x: number
        y: number
        scale: number
        lifetime: number
        id: number
        aliveAt: number
    }

    function createRandomParticle(bounds: DOMRect, emojis: string[]): Particle {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)]
        const offset = bounds.width / 8
        return {
            emoji,
            x: Math.random() * (bounds.width + offset * 2) - offset,
            y: Math.random() * bounds.height * 2,
            scale: Math.random() * 1.6 + 0.6,
            id: particleId++,
            aliveAt: Date.now(),
            lifetime: DURATION + Math.random() * DURATION
        }
    }

    const DURATION = 2500
    const AMOUNT_OF_PARTICLES = 25
    const wrongMessage = [
        "Thou art not worthy of the almighty destroyer of sheets",
        "This passphrase will only be given to the worthy",
        "Thou shall not pass",
        "Thou shall not pass, unless thou enter the correct passphrase",
        "Thou shall not pass, unless thou enter the correct passphrase, which thou do not have",
        "Thou shall not pass, unless thou enter the correct passphrase, which thou do not have, because thou are not worthy",
        "Thou must explore the world to find the passphrase as it is not this one",
    ]

    let particles = $state<Particle[]>([])
    let buttonEl: HTMLButtonElement | undefined = $state()

    const isUmaMode = $derived(globalConfigStore.state.IS_UMA_MODE)

    onMount(() => {
        setPageVisited('umaMode')
        const bounds = buttonEl?.getBoundingClientRect()
        if (!bounds) return
        // old: reads localStorage directly (NOT globalConfigStore.state.IS_UMA_MODE) for the
        // INITIAL particle batch only - preserved exactly, a deliberate-looking but undocumented
        // divergence from the reactive value used everywhere else on this page.
        const isUmaModeAtMount = JSON.parse(localStorage.getItem(`${APP_NAME}_uma_mode`) || 'false')
        particles = new Array(AMOUNT_OF_PARTICLES).fill(0).map(() =>
            createRandomParticle(bounds, isUmaModeAtMount ? umaModeEmojis : nonUmaModeEmojis)
        )
        const interval = setInterval(() => {
            particles = particles.map(particle => {
                if (Date.now() - particle.aliveAt > particle.lifetime) {
                    return createRandomParticle(bounds, isUmaMode ? umaModeEmojis : nonUmaModeEmojis)
                }
                return particle
            })
        }, 50)
        return () => clearInterval(interval)
    })

    async function toggleUmaMode() {
        if (!isUmaMode) {
            navigator.vibrate(1000)
            const wantsIt = await asyncConfirm(`Thee are about to enter uma mode, this removes the safety features bestowed upon to you by the almighty destroyer of sheets, thou shall be free to use as many layers as thou desire in the composer. Thee also agree that they might not work in the future. Do you accept this fate and join the dark side of uma mode? T̷̡͖̟͛̎h̶̻̱̦̔e̸̢̤̜̿̽ŕ̵̨̳̲̰͒e̶̗̤̊̀͗ ̴͚̉̔ḯ̴͚̯̾̎͂s̸̪̞͊̒͂̓͜ ̶̮͉̤̊ń̵̪̖͙̝͝͠o̸̻̻̓͜ ̷̥͖̄c̷̭̩͎̆o̴̭̮̗̐m̶̯͓̬̥͒͠i̷͖͔͆̎͒̏ͅn̷̟̪͖͗̓̐͜g̸̺̓ ̷͖̜̪͋͆̕b̶̜͉̌̊̈́̐ą̴̢̫̈́̽̾ͅĉ̴̞̞̫̒̂̈́ḱ̸͕̪̀͌. Actually there is just press the button again `)
            if (!wantsIt) return logger.success('A choice worthy of remembrance')
            let attempts = 0
            while (true) {
                const question = await asyncPrompt(
                    attempts === 0
                        ? 'Enter the passphrase to enter uma mode'
                        : `${wrongMessage[Math.floor(Math.random() * wrongMessage.length)]} (${attempts + 1}) \n(hint: UMA it's an acronym)`
                )
                attempts++
                if (!question) return logger.success('A choice worthy of remembrance, join the discord if you want to know the passphrase')
                if (question.toLowerCase().trim().replaceAll(' ', '') === 'unlimitedmultiarrangement') {
                    logger.success('T̶̖̿ḩ̷̈́o̸̲̿u̷̠̍ ̶̥́ ̷̮̽h̵͚̅a̶͚͠s̷͍͂t̶̖̓ ̷̙̒ȅ̷͜n̴͉̋t̶͇͆e̴͎̚r̵̪̽ẻ̷͎d̶̺̊ ̵̦̓t̴̪͛ḧ̵͎́ḙ̸̌ ̴̞̚u̵̖̓m̸̳̀ä̶̬ ̵͉͒m̴̲͠ó̴͇d̴̝̚e̵̳̍,̴̘͘ ̶̳͝ţ̵̅h̵͈̑ó̴̞ǘ̷͍ ̵̏ͅå̷̘ȑ̴̮e̸̡̽ ̴̗̓ ̸̢̒n̴̦͗o̵͍̊t̷̺̃ ̵͎͑p̸̯̈r̵̭͌o̵̬͋t̷̘͑e̸̽ͅć̶͜ṯ̶̉e̸̲̾d̷̦̀ ̴͇̅b̴̦̀y̶̛̬ ̵̗̔t̷͙̒h̷̥̎ê̶̮ ̸͚̀a̵̬͛l̸͈̓m̶̥̽i̶͓̎g̴̘̈h̷̠̔t̶͍̕y̵̗͠ ̶̜̋d̷͙̆e̶̲͆ș̶̏t̷̗͌ř̶̨o̴̼͗y̸̼̆ě̶̫r̸̹̒ ̶̣̿ȏ̷ͅf̸̤͆ ̴̦̓s̶͔̈́h̶̝̅e̶͕̓e̷̦͑t̶͙̔s̵͚͐,̵̘̀ ̴̡̍p̵̻̀r̶̬̉o̵̮̎c̴͙͘e̷̩̊e̸̻͌d̴̘̆ ̸͔̿w̴̗͌i̴̜͗t̵̲̍ḣ̴͖ ̴̗͋c̶̯͒á̷͚u̶͕̇t̴͍͋ḯ̴͖o̶͈̔n̸͉͝', 15000)
                    return globalConfigStore.setUmaMode(true)
                }
            }
        }

        globalConfigStore.setUmaMode(false)
        logger.success('Thou hast ran to salvation, thou are now protected by the almighty destroyer of sheets', 5000)
    }
</script>

<DefaultPage cropped>
    <PageMetadata
        text={isUmaMode ? umaModeText : 'Ȕ̶̲͇̦͇̖̈́̐̒m̶͖̰̜̎ā̴̩̅͐͘͠ ̶̯̘͊̑̃m̵̟͕̌̀o̸̮͌d̸̖̯̤̒̈̚̕ë̴̪̟́̉͂̓'}
        description="Thou whom enter this space shall  not be protected by the almighty destroyer of sheets, who dares enter this hell accepts the fate  they might succumb to.  Proceed with caution"
    />
    <div class="column" style="gap:1rem">
        <h1>Uma Mode</h1>
        <div>
            Thou whom enter this space shall not be protected by the almighty destroyer of sheets,
            who dares enter this hell accepts the fate they might succumb to. Proceed with caution
        </div>
        <button
            bind:this={buttonEl}
            class={cn('uma-mode-button', [isUmaMode, 'uma-mode-on'])}
            onclick={toggleUmaMode}
        >
            <div class="uma-mode-ball">
                {isUmaMode ? '💀' : '😈'}
            </div>
            <div class="uma-mode-text">
                {isUmaMode ? 'Run to salvation' : 'Enter Hell'}
            </div>
            {#each particles as particle (particle.id)}
                <div
                    class="particle"
                    style="--x:{particle.x}px;--y:{particle.y}px;--lifetime:{particle.lifetime}ms;--scale:{particle.scale}"
                >{particle.emoji}</div>
            {/each}
        </button>
        {#if isUmaMode}
            <div>
                If you desire to disable uma mode, press the button again and run to salvation
            </div>
        {/if}
    </div>
</DefaultPage>

<style>
    /* Old: src/app/_client-pages/uma-mode/UmaMode.module.scss - inlined verbatim (no SCSS nesting/
       variables/mixins used in the source). */
    .uma-mode-button {
        border: none;
        background-color: unset;
        --uma-mode-button-size: 6rem;
        --uma-mode-padding: 1.5rem;
        --uma-mode-width: 25rem;
        height: var(--uma-mode-button-size);
        width: var(--uma-mode-width);
        border-radius: 10rem;
        display: flex;
        align-items: center;
        position: relative;
        padding: var(--uma-mode-padding);
        background: linear-gradient(145deg, #ff0000, #ff7100, #ffa100, #ffb400, #ff7100, #ff0000);
        background-size: 150% 150%;
        animation: rainbow 5s ease infinite;
        margin: 2rem auto;
        cursor: pointer;
    }

    .uma-mode-on {
        background: linear-gradient(145deg, #000000, #4a4949, #575757, #31313d, #1a1a21);
        background-size: 150% 150%;
        animation: rainbow 5s ease infinite;
    }

    .uma-mode-ball {
        height: calc(var(--uma-mode-button-size) - var(--uma-mode-padding) * 2);
        width: calc(var(--uma-mode-button-size) - var(--uma-mode-padding) * 2);
        border-radius: 10rem;
        transition: all 0.3s;
        font-size: 3rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .uma-mode-text {
        position: absolute;
        right: calc(var(--uma-mode-padding) + 0.2rem);
        transition: all 0.3s ease-out;
        font-size: 2rem;
        color: white;
        white-space: nowrap;
    }

    .particle {
        position: absolute;
        left: 0;
        bottom: 0;
        pointer-events: none;
        animation: wobble var(--lifetime) linear forwards;
    }

    @keyframes wobble {
        0% {
            opacity: 0;
            transform: translateX(var(--x)) translateY(calc(var(--y) * -1)) scale(var(--scale));
        }

        30% {
            opacity: 1;
            transform: translateX(calc(var(--x) + 0.2rem)) translateY(calc((var(--y) + 21px) * -1)) scale(calc(var(--scale) * 1.05));
        }

        50% {
            opacity: 1;
            transform: translateX(calc(var(--x) - 0.2rem)) translateY(calc((var(--y) + 35px) * -1)) scale(calc(var(--scale) * 1.05));
        }

        80% {
            opacity: 1;
            transform: translateX(calc(var(--x))) translateY(calc((var(--y) + 56px) * -1)) scale(calc(var(--scale) * 1.05));
        }

        100% {
            opacity: 0;
            transform: translateX(calc(var(--x) + 0.2rem)) translateY(calc((var(--y) + 70px) * -1)) scale(var(--scale));
        }
    }

    .uma-mode-on .uma-mode-ball {
        transform: translateX(calc(var(--uma-mode-width) - var(--uma-mode-button-size)));
    }

    .uma-mode-on .uma-mode-text {
        right: calc(100% - var(--uma-mode-padding) - 0.2rem);
        transform: translateX(100%);
    }

    @keyframes rainbow {
        0% {
            background-position: 0% 50%;
        }
        50% {
            background-position: 100% 50%;
        }
        100% {
            background-position: 0% 50%;
        }
    }
</style>
