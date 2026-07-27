import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// See add-to-home-screen.ts for why this lives in its own module.
export const midiDeviceMetadata: BlogMetadata = {
    title: '🎹 Use a MIDI keyboard/device',
    tags: ['Guide'],
    relativeUrl: 'connect-midi-device',
    image: `${base}/assets/blog/zen-keyboard.webp`,
    description: 'How to connect a MIDI keyboard/device to the app, and how to use it in the player and composer.',
    createdAt: new Date('2024/03/19'),
    author: SpecyAuthor,
}
