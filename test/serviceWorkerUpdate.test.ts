import {describe, expect, it} from 'vitest'
import {
    isServiceWorkerUpdateStatus,
    shouldPromptForServiceWorkerUpdate,
} from '../src/lib/serviceWorkerUpdate'

describe('service worker update prompt eligibility', () => {
    it('does not prompt a freshly loaded sole tab', () => {
        expect(
            shouldPromptForServiceWorkerUpdate({
                currentClientIsStale: false,
                hasOtherClients: false,
            }),
        ).toBe(false)
    })

    it.each([
        {currentClientIsStale: true, hasOtherClients: false},
        {currentClientIsStale: false, hasOtherClients: true},
        {currentClientIsStale: true, hasOtherClients: true},
    ])('prompts for stale or multi-tab clients: %o', (status) => {
        expect(shouldPromptForServiceWorkerUpdate(status)).toBe(true)
    })

    it('accepts only complete worker status replies', () => {
        expect(
            isServiceWorkerUpdateStatus({currentClientIsStale: false, hasOtherClients: false}),
        ).toBe(true)
        expect(isServiceWorkerUpdateStatus({currentClientIsStale: false})).toBe(false)
        expect(
            isServiceWorkerUpdateStatus({currentClientIsStale: 'false', hasOtherClients: false}),
        ).toBe(false)
        expect(isServiceWorkerUpdateStatus(null)).toBe(false)
    })
})
