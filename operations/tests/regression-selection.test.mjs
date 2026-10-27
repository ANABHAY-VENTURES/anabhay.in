import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {regressionFiles} from './regression-files.mjs';
test('regression discovery requires lifecycle, persistence, reason and selection suites',()=>{
 const names=regressionFiles().slice(1).map(n=>n.split('/').at(-1));
 for(const missing of ['driver-lifecycle.test.mjs','driver-shutdown.test.mjs','persistence.test.mjs','release-reason.test.mjs','operator-preflight.test.mjs'])assert.throws(()=>regressionFiles(names.filter(n=>n!==missing)));
 assert.match(readFileSync(new URL('./integration/reliability-controller.mjs',import.meta.url),'utf8'),/\.\.\.regressionFiles\(\)/);
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts.test,'node --test tests/*.test.mjs');
});
