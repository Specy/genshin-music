import {beforeEach, describe, expect, it, vi} from 'vitest'
import {logger, LoggerStatus} from '../src/lib/stores/LoggerStore.svelte'
import {homeStore} from '../src/lib/stores/HomeStore.svelte'
import {logsStore} from '../src/lib/stores/LogsStore.svelte'

describe('LoggerStore', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        logger.clearToasts()
    })
    it('log pushes a toast and auto-hides then removes it', () => {
        logger.log('hello', 1000, LoggerStatus.SUCCESS)
        expect(logger.toasts.length).toBe(1)
        expect(logger.toasts[0].text).toBe('hello')
        expect(logger.toasts[0].visible).toBe(true)
        vi.advanceTimersByTime(1001)
        expect(logger.toasts[0]?.visible ?? false).toBe(false)
        vi.advanceTimersByTime(300)
        expect(logger.toasts.length).toBe(0)
    })
    it('pill shows and hides', () => {
        logger.showPill('working')
        expect(logger.pillState).toEqual({visible: true, text: 'working'})
        logger.hidePill()
        expect(logger.pillState.visible).toBe(false)
    })
})

describe('HomeStore', () => {
    it('open/close set the old flag semantics', () => {
        vi.useFakeTimers()
        homeStore.open()
        expect(homeStore.state.visible).toBe(true)
        expect(homeStore.state.isInPosition).toBe(false)
        homeStore.close()
        expect(homeStore.state.isInPosition).toBe(true)
        vi.advanceTimersByTime(151)
        expect(homeStore.state.visible).toBe(false)
    })
})

describe('LogsStore', () => {
    it('dedupes by error identity', () => {
        logsStore.clearLogs()
        const err = new Error('x')
        logsStore.addLog({error: err, message: 'a'})
        logsStore.addLog({error: err, message: 'b'})
        expect(logsStore.logs.length).toBe(1)
    })
})
