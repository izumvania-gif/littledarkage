import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimTab, type TabChannel, type TabMessage } from '../src/core/tabs.ts';

/** Channels on one bus deliver to everyone but the sender, asynchronously, as BroadcastChannel does. */
function bus(): () => TabChannel {
  const all = new Set<TabChannel>();
  return () => {
    const ch: TabChannel = {
      onmessage: null,
      postMessage: (msg: TabMessage) => {
        for (const other of all) if (other !== ch) queueMicrotask(() => other.onmessage?.({ data: msg }));
      },
      close: () => void all.delete(ch),
    };
    all.add(ch);
    return ch;
  };
}

test('the first tab plays; the second only looks until it takes over, and the first then stops', async () => {
  const open = bus();
  let lost = 0;
  const first = await claimTab(() => lost++, open);
  assert.equal(first.busy, false);
  const second = await claimTab(() => assert.fail('the newer tab is not taken from'), open);
  assert.equal(second.busy, true);
  second.take();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(lost, 1);
  // A third tab now finds the second playing.
  assert.equal((await claimTab(() => undefined, open)).busy, true);
});

test('without BroadcastChannel every tab plays', async () => {
  assert.equal((await claimTab(() => undefined, () => null)).busy, false);
});
