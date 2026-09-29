// THE ONE INSTRUMENT MENU ORDER (components/inputs/instrumentOrder.ts), shared by the settings
// select and the floating pickers so the two can never disagree about where an instrument is.
import {describe, expect, it} from 'vitest'
import {groupInstruments, sortInstrumentGroups, sortedInstruments, UNGROUPED} from '$cmp/inputs/instrumentOrder'
import {INSTRUMENTS} from './imports'

const identity = (name: string) => name

describe('instrument menu order', () => {
    it('plain instruments first, A-Z by label; prefix groups after, A-Z, each sorted', () => {
        const list = ['Piano', 'SFX_Dance', 'Aurora', 'Cello', 'SFX_BirdCall', 'Kit_Snare', 'Harp']
        expect(groupInstruments(list)).toEqual([
            [UNGROUPED, ['Piano', 'Aurora', 'Cello', 'Harp']],
            ['SFX', ['SFX_Dance', 'SFX_BirdCall']],
            ['Kit', ['Kit_Snare']],
        ])
        expect(sortedInstruments(list, 'en', identity))
            .toEqual(['Aurora', 'Cello', 'Harp', 'Piano', 'Kit_Snare', 'SFX_BirdCall', 'SFX_Dance'])
    })

    it('sorts by the label the user reads, not by the instrument name', () => {
        const labels: Record<string, string> = {Lyre: 'Lira', Zither: 'Arpa'}
        expect(sortedInstruments(['Lyre', 'Zither'], 'it', name => labels[name]))
            .toEqual(['Zither', 'Lyre'])
    })

    it('numbered families sort by number, and labels comparing equal keep config order', () => {
        expect(sortedInstruments(['Drum 10', 'Drum 2'], 'en', identity)).toEqual(['Drum 2', 'Drum 10'])
        expect(sortedInstruments(['b', 'B'], 'en', identity)).toEqual(['b', 'B'])
    })

    it('the flat order is exactly the grouped order the select renders', () => {
        const grouped = sortInstrumentGroups(groupInstruments(INSTRUMENTS), 'en', identity)
            .flatMap(([, names]) => names)
        expect(sortedInstruments(INSTRUMENTS, 'en', identity)).toEqual(grouped)
        expect([...sortedInstruments(INSTRUMENTS, 'en', identity)].sort()).toEqual([...INSTRUMENTS].sort())
    })
})
