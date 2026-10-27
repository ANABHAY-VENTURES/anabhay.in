import {readdirSync} from 'node:fs';
const required=['driver.test.mjs','driver-error.test.mjs','driver-lifecycle.test.mjs','driver-shutdown.test.mjs','persistence.test.mjs','binding.test.mjs','release-reason.test.mjs','operator-preflight.test.mjs','regression-selection.test.mjs'];
export function regressionFiles(names=readdirSync(new URL('./',import.meta.url))){
 const selected=names.filter(n=>/^[a-z0-9-]+\.test\.mjs$/.test(n)).sort();
 if(required.some(n=>!selected.includes(n)))throw new Error('Required regression suite missing.');
 return ['scripts/enquiry.test.mjs',...selected.map(n=>'operations/tests/'+n)];
}
