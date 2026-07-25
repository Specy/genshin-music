import {describe, expect, it} from 'vitest'
import {LeaveGuard} from '../src/lib/stores/navigationGuard.svelte'

// Old: src/app/_navigation/leaveGuard.test.ts (node:test/node:assert) - the same three cases,
// ported to Vitest. Each test builds its own `new LeaveGuard()` (matching old, which never tested
// through the module singleton either) so cases stay isolated from one another.
describe('LeaveGuard', () => {
    it('delegates a navigation target to the registered leave handler', async () => {
        const guard = new LeaveGuard()
        const seenTargets: string[] = []
        guard.register(async (target) => {
            seenTargets.push(target)
            return false
        })

        const canLeave = await guard.canLeave('/composer')

        expect(canLeave).toBe(false)
        expect(seenTargets).toEqual(['/composer'])
    })

    it('a stale cleanup cannot remove a newer leave handler', async () => {
        const guard = new LeaveGuard()
        const firstCleanup = guard.register(async () => false)
        guard.register(async () => true)
        firstCleanup()

        expect(await guard.canLeave('__back__')).toBe(true)
    })

    it('allows navigation when no handler is registered', async () => {
        const guard = new LeaveGuard()

        expect(await guard.canLeave('/player')).toBe(true)
    })
})
