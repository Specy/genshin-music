import assert from 'node:assert/strict';
import test from 'node:test';
import {LeaveGuard} from './leaveGuard.ts';

test('delegates a navigation target to the registered leave handler', async () => {
    const guard = new LeaveGuard();
    const seenTargets: string[] = [];
    guard.register(async (target) => {
        seenTargets.push(target);
        return false;
    });

    const canLeave = await guard.canLeave('/composer');

    assert.equal(canLeave, false);
    assert.deepEqual(seenTargets, ['/composer']);
});

test('a stale cleanup cannot remove a newer leave handler', async () => {
    const guard = new LeaveGuard();
    const firstCleanup = guard.register(async () => false);
    guard.register(async () => true);
    firstCleanup();

    assert.equal(await guard.canLeave('__back__'), true);
});

test('allows navigation when no handler is registered', async () => {
    const guard = new LeaveGuard();

    assert.equal(await guard.canLeave('/player'), true);
});
