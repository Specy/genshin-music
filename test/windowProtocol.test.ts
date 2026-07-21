import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {WindowProtocol} from '../src/lib/protocol/WindowProtocol'

// RPC correlation logic for src/lib/protocol/WindowProtocol.ts (ask/tell/response routing, origin
// validation, ping/pong, timeout), same style as test/keyboardProvider.test.ts (real event
// dispatch against a single live instance, mocked target/source `postMessage`s standing in for
// the other end of the channel - no second real WindowProtocol instance is needed since every
// case here only exercises ONE instance's own ask()/receive()/connect() correlation logic).

const VALID_ORIGIN = 'https://valid.example.com'
const OTHER_ORIGIN = 'https://not-allowed.example.com'

function dispatchMessage(data: unknown, origin = VALID_ORIGIN, source: unknown = null) {
    window.dispatchEvent(new MessageEvent('message', {data, origin, source: source as Window | null}))
}

describe('WindowProtocol', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only generic protocol descriptor, see keyboardProvider.test.ts's own `as any` casts for the same "not testing the type layer" rationale
    let protocol: WindowProtocol<any>

    beforeEach(() => {
        protocol = new WindowProtocol([VALID_ORIGIN])
        protocol.init()
    })

    afterEach(() => {
        protocol.dispose()
    })

    it('ask() sends an "ask" message to the target and resolves the matching pending request on "response"', async () => {
        const target = {postMessage: vi.fn()}
        const promise = protocol.ask('getThing', {id: 1}, target as unknown as Window)

        expect(target.postMessage).toHaveBeenCalledTimes(1)
        const [sentPayload, sentOrigin] = target.postMessage.mock.calls[0]
        expect(sentPayload).toMatchObject({type: 'ask', eventName: 'getThing', payload: {id: 1}})
        expect(sentOrigin).toBe('*')

        dispatchMessage({type: 'response', id: sentPayload.id, eventName: 'getThing', result: {name: 'found'}})

        await expect(promise).resolves.toEqual({name: 'found'})
    })

    it('ask() rejects the matching pending request on "error-response"', async () => {
        const target = {postMessage: vi.fn()}
        const promise = protocol.ask('getThing', {id: 1}, target as unknown as Window)
        const sentPayload = target.postMessage.mock.calls[0][0]

        dispatchMessage({type: 'error-response', id: sentPayload.id, eventName: 'getThing', error: 'boom'})

        await expect(promise).rejects.toBe('boom')
    })

    it('routes a "response" only to the pending ask with the matching id, leaving others pending', async () => {
        const target = {postMessage: vi.fn()}
        const first = protocol.ask('getThing', {id: 1}, target as unknown as Window)
        const second = protocol.ask('getThing', {id: 2}, target as unknown as Window)
        const [firstId, secondId] = target.postMessage.mock.calls.map(c => c[0].id)
        expect(firstId).not.toBe(secondId)

        // resolve the SECOND request first - the first must remain pending until its own id arrives
        dispatchMessage({type: 'response', id: secondId, eventName: 'getThing', result: 'second-result'})
        await expect(second).resolves.toBe('second-result')

        dispatchMessage({type: 'response', id: firstId, eventName: 'getThing', result: 'first-result'})
        await expect(first).resolves.toBe('first-result')
    })

    it('an incoming "tell" invokes the registered tell handler with its payload', () => {
        const handler = vi.fn()
        protocol.registerTellHandler('setThing', handler)

        dispatchMessage({type: 'tell', id: 99, eventName: 'setThing', payload: {id: 7}})

        expect(handler).toHaveBeenCalledWith({id: 7})
    })

    it('an incoming "ask" invokes the registered ask handler and posts a "response" back to message.source', async () => {
        const handler = vi.fn(async (payload: {id: number}) => ({name: `item-${payload.id}`}))
        protocol.registerAskHandler('getThing', handler)
        const source = {postMessage: vi.fn()}

        dispatchMessage({type: 'ask', id: 5, eventName: 'getThing', payload: {id: 3}}, VALID_ORIGIN, source)
        await vi.waitFor(() => expect(source.postMessage).toHaveBeenCalledTimes(1))

        expect(handler).toHaveBeenCalledWith({id: 3})
        expect(source.postMessage).toHaveBeenCalledWith(
            {type: 'response', result: {name: 'item-3'}, id: 5, eventName: 'getThing'},
            '*'
        )
    })

    it('an incoming "ask" whose handler throws posts an "error-response" back instead', async () => {
        protocol.registerAskHandler('getThing', async () => {
            throw new Error('handler failed')
        })
        const source = {postMessage: vi.fn()}

        dispatchMessage({type: 'ask', id: 6, eventName: 'getThing', payload: {}}, VALID_ORIGIN, source)
        await vi.waitFor(() => expect(source.postMessage).toHaveBeenCalledTimes(1))

        const [responsePayload] = source.postMessage.mock.calls[0]
        expect(responsePayload).toMatchObject({type: 'error-response', id: 6, eventName: 'getThing'})
        expect(responsePayload.error).toBeInstanceOf(Error)
    })

    it('the constructor auto-registers a "ping" ask handler that answers "pong"', async () => {
        const source = {postMessage: vi.fn()}
        dispatchMessage({type: 'ask', id: 1, eventName: 'ping', payload: undefined}, VALID_ORIGIN, source)
        await vi.waitFor(() => expect(source.postMessage).toHaveBeenCalledTimes(1))
        expect(source.postMessage).toHaveBeenCalledWith(
            {type: 'response', result: 'pong', id: 1, eventName: 'ping'},
            '*'
        )
    })

    it('ignores a message whose origin is not in validDomains (handler never fires, warns instead)', () => {
        const handler = vi.fn()
        protocol.registerAskHandler('getThing', handler)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        })

        dispatchMessage({type: 'ask', id: 1, eventName: 'getThing', payload: {}}, OTHER_ORIGIN, {postMessage: vi.fn()})

        expect(handler).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith('Blocked window message, invalid domain', OTHER_ORIGIN)
        warnSpy.mockRestore()
    })

    it('connect() resolves once the target answers a "ping" ask with "pong"', async () => {
        vi.useFakeTimers()
        try {
            const target = {
                postMessage: vi.fn((payload: {eventName: string, id: number}) => {
                    if (payload.eventName === 'ping') {
                        dispatchMessage({type: 'response', id: payload.id, eventName: 'ping', result: 'pong'})
                    }
                })
            }
            const connected = protocol.connect(target as unknown as Window, 6000)
            await vi.advanceTimersByTimeAsync(1000)
            await expect(connected).resolves.toBeUndefined()
        } finally {
            vi.useRealTimers()
        }
    })

    it('connect() rejects with "timeout" once the retry budget is exhausted without a pong', async () => {
        vi.useFakeTimers()
        try {
            const target = {postMessage: vi.fn()} // never answers
            const connected = protocol.connect(target as unknown as Window, 2000)
            connected.catch(() => {
            }) // avoid an unhandled-rejection warning while timers advance below
            await vi.advanceTimersByTimeAsync(4000)
            await expect(connected).rejects.toBe('timeout')
        } finally {
            vi.useRealTimers()
        }
    })
})
