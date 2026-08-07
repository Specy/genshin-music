import {APP_NAME} from "./legacyConfig";

function makePageVersion<T extends string>(id: T, version: number, changes: string[] = []) {
    return {id, version, changes} as const
}

export const PAGES_VERSIONS = {
    backup: makePageVersion('backup', 1, ["Redesigned the page"]),
    blog: makePageVersion('blog', 0),
    changelog: makePageVersion('changelog', 0),
    composer: makePageVersion('composer', 4, [
        "Added sustained notes: long press a note on the keyboard to choose how many columns it lasts",
        "The canvas now scrolls smoothly while playing, with a line marking where you are in the song",
    ]),
    deleteCache: makePageVersion('deleteCache', 0),
    donate: makePageVersion('donate', 0),
    error: makePageVersion('error', 0),
    keybinds: makePageVersion('keybinds', 1, ['Fixed bug not allowing MIDI connection']),
    partners: makePageVersion('partners', 1, ['Added new partner!']),
    player: makePageVersion('player', 8, [
        "Hold a note to sustain it, on the instruments that support it",
        ...(APP_NAME === "Sky" ? ["Added the Sustained recorder instrument"] : []),
    ]),
    privacy: makePageVersion('privacy', 0),
    sheetVisualizer: makePageVersion('sheetVisualizer', 3, [
        "Sustained notes are now shown in the sheet",
        "Redesigned the page",
    ]),
    theme: makePageVersion('theme', 0),
    transfer: makePageVersion('transfer', 0),
    umaMode: makePageVersion('umaMode', 0),
    vsrgComposer: makePageVersion('vsrgComposer', 1, [
        "Fixed selecting hit objects and switching between the horizontal and vertical editor",
        "New layers now get a different color",
    ]),
    vsrgPlayer: makePageVersion('vsrgPlayer', 0),
    zenKeyboard: makePageVersion('zenKeyboard', 1, ["Hold a note to sustain it, on the instruments that support it"]),
} as const

export type PagesVersionsKeys = keyof typeof PAGES_VERSIONS
