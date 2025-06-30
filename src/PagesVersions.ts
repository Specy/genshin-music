import {APP_NAME} from "$config";

function makePageVersion<T extends string>(id: T, version: number, changes: string[] = []) {
    return {id, version, changes} as const
}

export const PAGES_VERSIONS = {
    backup: makePageVersion('backup', 0),
    blog: makePageVersion('blog', 0),
    changelog: makePageVersion('changelog', 0),
    composer: makePageVersion('composer', 3, ["Improved timing", "Fixed MIDI Channel export"]),
    deleteCache: makePageVersion('deleteCache', 0),
    donate: makePageVersion('donate', 0),
    error: makePageVersion('error', 0),
    keybinds: makePageVersion('keybinds', 1, ['Fixed bug not allowing MIDI connection']),
    partners: makePageVersion('partners', 1, ['Added new partner!']),
    player: makePageVersion('player', 6,
        APP_NAME === "Genshin"
            ? ["Added Ukulele and Djem Djem Drum", 'Improved timing', 'Bug fixes in the visualizer']
            : ['Improved timing', 'Bug fixes in the visualizer'],
    ),
    privacy: makePageVersion('privacy', 0),
    sheetVisualizer: makePageVersion('sheetVisualizer', 2, ["When downloading as PDF, it will now have a white background so it's easier to print"]),
    theme: makePageVersion('theme', 0),
    transfer: makePageVersion('transfer', 0),
    umaMode: makePageVersion('umaMode', 0),
    vsrgComposer: makePageVersion('vsrgComposer', 0),
    vsrgPlayer: makePageVersion('vsrgPlayer', 0),
    zenKeyboard: makePageVersion('zenKeyboard', 0),
} as const

export type PagesVersionsKeys = keyof typeof PAGES_VERSIONS