import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseNotificationHold} from '../server/capabilities.mjs';
test('missing, blank and oversized release reasons fail before authentication',async()=>{
 const id='80000000-0000-4000-8000-000000000001';
 for(const reason of [undefined,'','   ','a'.repeat(501)])await assert.rejects(releaseNotificationHold({outboxId:id,requestId:id,reason},{verifiedUserClient:{}}),e=>e.status===422);
});

import {normalizeReleaseReason,releaseWhitespace} from '../server/release-reason.mjs';
test('exact Unicode whitespace contract and code-point boundaries',()=>{
 for(const cp of releaseWhitespace){const w=String.fromCodePoint(cp);assert.equal(normalizeReleaseReason(w),null);assert.equal(normalizeReleaseReason(w+'Review'+w),'Review');}
 assert.equal(normalizeReleaseReason('\t\n\u00a0\u2007\ufeff'),null);
 assert.equal(normalizeReleaseReason('😀'.repeat(500)),'😀'.repeat(500));assert.equal(normalizeReleaseReason('😀'.repeat(501)),null);
 for(const invalid of ['\0','\ud800','\udc00'])assert.equal(normalizeReleaseReason(invalid),null);
 assert.equal(normalizeReleaseReason('\u200b'),'\u200b'); // not in the chosen whitespace set
});
