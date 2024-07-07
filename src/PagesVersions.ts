import {APP_NAME} from "$config";

function makePageVersion<T extends string>(id: T, version: number, changes: string[] = []) {
    return {id, version, changes} as const
}

export const PAGES_VERSIONS = {
    backup: makePageVersion('backup', 0),
    blog: makePageVersion('blog', 0),
    changelog: makePageVersion('changelog', 0),
    composer: makePageVersion('composer', 1, ["Bug fix for audio recording"]),
    deleteCache: makePageVersion('deleteCache', 0),
    donate: makePageVersion('donate', 0),
    error: makePageVersion('error', 0),
    keybinds: makePageVersion('keybinds', 1, ['Fixed bug not allowing MIDI connection']),
    partners: makePageVersion('partners', 0),
    player: makePageVersion('player', 3,
        APP_NAME === "Genshin"
            ? ["Added sheet looping, note hiding in practice mode, custom visual sheet size, turkish translation", "Work on the Nightwind Horn, needs more time"]
            : ["Added sheet looping, note hiding in practice mode, custom visual sheet size, turkish translation"]
    ),
    privacy: makePageVersion('privacy', 0),
    sheetVisualizer: makePageVersion('sheetVisualizer', 0),
    theme: makePageVersion('theme', 0),
    transfer: makePageVersion('transfer', 0),
    umaMode: makePageVersion('umaMode', 0),
    vsrgComposer: makePageVersion('vsrgComposer', 0),
    vsrgPlayer: makePageVersion('vsrgPlayer', 0),
    zenKeyboard: makePageVersion('zenKeyboard', 0),
} as const

export type PagesVersionsKeys = keyof typeof PAGES_VERSIONS