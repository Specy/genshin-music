'use client';

import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {PageMetadata} from "$cmp/shared/Miscellaneous/PageMetadata";
import {asyncConfirm, asyncPrompt} from "$cmp/shared/Utility/AsyncPrompts";
import {APP_NAME} from "$config";
import {useConfig} from "$lib/Hooks/useConfig";
import {cn} from "$lib/utils/Utilities";
import {globalConfigStore} from "$stores/GlobalConfigStore";
import {logger} from "$stores/LoggerStore";
import s from "./UmaMode.module.scss";
import {CSSProperties, useEffect, useRef, useState} from "react";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";


const nonUmaModeEmojis = ["👻", "👾", "👺", "👹", "👿", "🔥"]
const umaModeEmojis = ["💀", "🦴", "☠️", "🪦", "⚰️"]
const umaModeText = umaModeEmojis.join(" ")
let id = 0

function createRandomParticle(bounds: DOMRect, emojis: string[]) {
    const emoji = emojis[Math.floor(Math.random() * emojis.length)]
    const offset = bounds.width / 8
    return {
        emoji,
        x: Math.random() * (bounds.width + offset * 2) - offset,
        y: Math.random() * bounds.height * 2,
        scale: Math.random() * 1.6 + 0.6,
        id: id++,
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
export default function UmaMode() {
    useSetPageVisited('umaMode')
    const {IS_UMA_MODE} = useConfig()
    const [particles, setParticles] = useState<Particle[]>([])
    const ref = useRef<HTMLButtonElement>(null)
    const [bounds, setBounds] = useState<DOMRect | null>(null)
    useEffect(() => {
        if (!bounds) return
        const isUmaMode = JSON.parse(localStorage.getItem(`${APP_NAME}_uma_mode`) || "false")
        const startEmojis = new Array(AMOUNT_OF_PARTICLES).fill(0).map(() => {
            return createRandomParticle(bounds, isUmaMode ? umaModeEmojis : nonUmaModeEmojis)
        })
        setParticles(startEmojis)
    }, [bounds])
    useEffect(() => {
        if (ref.current) {
            setBounds(ref.current.getBoundingClientRect())
        }
    }, [ref])
    useEffect(() => {
        function handleFrame() {
            if (!bounds) return
            setParticles(p => {
                const now = Date.now()
                //ease out each particle if it reaches near the top
                return p.map(particle => {
                    if (now - particle.aliveAt > particle.lifetime) {
                        return createRandomParticle(bounds, IS_UMA_MODE ? umaModeEmojis : nonUmaModeEmojis)
                    }
                    return particle
                })
            })
        }

        const interval = setInterval(handleFrame, 50)
        return () => clearInterval(interval)
    }, [bounds, IS_UMA_MODE])

    async function toggleUmaMode() {
        if (!IS_UMA_MODE) {
            navigator.vibrate(1000)
            const wantsIt = await asyncConfirm(`Thee are about to enter uma mode, this removes the safety features bestowed upon to you by the almighty destroyer of sheets, thou shall be free to use as many layers as thou desire in the composer. Thee also agree that they might not work in the future. Do you accept this fate and join the dark side of uma mode? T̷̡͖̟͛̎h̶̻̱̦̔e̸̢̤̜̿̽ŕ̵̨̳̲̰͒e̶̗̤̊̀͗ ̴͚̉̔ḯ̴͚̯̾̎͂s̸̪̞͊̒͂̓͜ ̶̮͉̤̊ń̵̪̖͙̝͝͠o̸̻̻̓͜ ̷̥͖̄c̷̭̩͎̆o̴̭̮̗̐m̶̯͓̬̥͒͠i̷͖͔͆̎͒̏ͅn̷̟̪͖͗̓̐͜g̸̺̓ ̷͖̜̪͋͆̕b̶̜͉̌̊̈́̐ą̴̢̫̈́̽̾ͅĉ̴̞̞̫̒̂̈́ḱ̸͕̪̀͌. Actually there is just press the button again `)
            if (!wantsIt) return logger.success("A choice worthy of remembrance")
            let attempts = 0
            while (true) {
                const question = await asyncPrompt(
                    attempts === 0
                        ? "Enter the passphrase to enter uma mode"
                        : `${wrongMessage[Math.floor(Math.random() * wrongMessage.length)]} (${attempts + 1}) \n(hint: UMA it's an acronym)`
                )
                attempts++
                if (!question) return logger.success("A choice worthy of remembrance, join the discord if you want to know the passphrase")
                if (question.toLowerCase().trim().replaceAll(" ", "") === "unlimitedmultiarrangement") {
                    logger.success("T̶̖̿ḩ̷̈́o̸̲̿u̷̠̍ ̶̥́ ̷̮̽h̵͚̅a̶͚͠s̷͍͂t̶̖̓ ̷̙̒ȅ̷͜n̴͉̋t̶͇͆e̴͎̚r̵̪̽ẻ̷͎d̶̺̊ ̵̦̓t̴̪͛ḧ̵͎́ḙ̸̌ ̴̞̚u̵̖̓m̸̳̀ä̶̬ ̵͉͒m̴̲͠ó̴͇d̴̝̚e̵̳̍,̴̘͘ ̶̳͝ţ̵̅h̵͈̑ó̴̞ǘ̷͍ ̵̏ͅå̷̘ȑ̴̮e̸̡̽ ̴̗̓ ̸̢̒n̴̦͗o̵͍̊t̷̺̃ ̵͎͑p̸̯̈r̵̭͌o̵̬͋t̷̘͑e̸̽ͅć̶͜ṯ̶̉e̸̲̾d̷̦̀ ̴͇̅b̴̦̀y̶̛̬ ̵̗̔t̷͙̒h̷̥̎ê̶̮ ̸͚̀a̵̬͛l̸͈̓m̶̥̽i̶͓̎g̴̘̈h̷̠̔t̶͍̕y̵̗͠ ̶̜̋d̷͙̆e̶̲͆ș̶̏t̷̗͌ř̶̨o̴̼͗y̸̼̆ě̶̫r̸̹̒ ̶̣̿ȏ̷ͅf̸̤͆ ̴̦̓s̶͔̈́h̶̝̅e̶͕̓e̷̦͑t̶͙̔s̵͚͐,̵̘̀ ̴̡̍p̵̻̀r̶̬̉o̵̮̎c̴͙͘e̷̩̊e̸̻͌d̴̘̆ ̸͔̿w̴̗͌i̴̜͗t̵̲̍ḣ̴͖ ̴̗͋c̶̯͒á̷͚u̶͕̇t̴͍͋ḯ̴͖o̶͈̔n̸͉͝", 15000)
                    return globalConfigStore.setUmaMode(true)
                }
            }
        }

        globalConfigStore.setUmaMode(false)
        logger.success("Thou hast ran to salvation, thou are now protected by the almighty destroyer of sheets", 5000)
    }

    return <DefaultPage cropped>
        <PageMetadata text={IS_UMA_MODE ? umaModeText : "Ȕ̶̲͇̦͇̖̈́̐̒m̶͖̰̜̎ā̴̩̅͐͘͠ ̶̯̘͊̑̃m̵̟͕̌̀o̸̮͌d̸̖̯̤̒̈̚̕ë̴̪̟́̉͂̓"}
                      description="Thou whom enter this space shall  not be protected by the almighty destroyer of sheets, who dares enter this hell accepts the fate  they might succumb to.  Proceed with caution"/>
        <div className="column" style={{gap: "1rem"}}>
            <h1>Uma Mode</h1>
            <div>
                Thou whom enter this space shall not be protected by the almighty destroyer of sheets,
                who dares enter this hell accepts the fate they might succumb to. Proceed with caution
            </div>
            <button
                ref={ref}
                className={cn(`${s['uma-mode-button']}`, [IS_UMA_MODE, s['uma-mode-on']])}
                onClick={toggleUmaMode}
            >
                <div className={`${s['uma-mode-ball']}`}>
                    {IS_UMA_MODE ? "💀" : "😈"}
                </div>
                <div className={`${s['uma-mode-text']}`}>
                    {IS_UMA_MODE ? "Run to salvation" : "Enter Hell"}
                </div>
                {particles.map((particle, i) => <ParticleElement key={particle.id} {...particle} />)}
            </button>
            {IS_UMA_MODE &&
                <div>
                    If you desire to disable uma mode, press the button again and run to salvation
                </div>
            }
        </div>
    </DefaultPage>
}

interface Particle extends ParticleProps {
    id: number
    aliveAt: number
}

interface ParticleProps {
    emoji: string
    x: number
    y: number
    scale: number
    lifetime: number

}

function ParticleElement({emoji, x, y, scale, lifetime}: ParticleProps) {
    return <div
        className={`${s['particle']}`}
        key={emoji}
        //
        style={{
            '--x': `${x}px`,
            '--y': `${y}px`,
            '--lifetime': `${lifetime}ms`,
            '--scale': scale,
        } as CSSProperties}
    >
        {emoji}
    </div>
}
