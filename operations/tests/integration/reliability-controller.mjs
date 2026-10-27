import {regressionFiles} from '../regression-files.mjs';
// Local-only controller. No PowerShell runner, execution-policy bypass or remote database.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';

const mode=process.argv.slice(2).join(' ');
if(!['--approved-local-campaign','--approved-local-outbox','--approved-local-persistence','--approved-local-binding','--approved-local-release-reason','--approved-local-http'].includes(mode))throw new Error('EXPLICIT_CAMPAIGN_APPROVAL_REQUIRED');
const httpOnly=mode==='--approved-local-http';
const outboxOnly=mode==='--approved-local-outbox';
const persistenceOnly=mode==='--approved-local-persistence';
const releaseOnly=mode==='--approved-local-release-reason';
const bindingOnly=mode==='--approved-local-binding'||releaseOnly;
const root=fileURLToPath(new URL('../../../',import.meta.url));
const run=randomUUID(),pgRef='postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3',
 nodeRef='docker.io/library/node@sha256:ae9f58d5c9f5a537110310be6b3cf67cf9c67146a3bb9310c0cb515fe71c8392';
const report={run,mode:httpOnly?'http-postgres':releaseOnly?'release-reason':bindingOnly?'binding':persistenceOnly?'persistence':outboxOnly?'outbox':'reliability',images:{postgres:pgRef,node:nodeRef},baseline:null,stages:[],resources:[],cleanup:[],integrity:null};
mkdirSync(resolve(root,'operations/local'),{recursive:true});
const reportPath=resolve(root,`operations/local/${report.mode}-${run}.json`);
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2));
async function command(executable,args,{input,ms=30000}={}) {
 return new Promise((resolveCommand,reject)=>{
  const child=spawn(executable,args,{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',timedOut=false;
  const start=performance.now();const timer=setTimeout(()=>{timedOut=true;child.kill();},ms);
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>2000000){child.kill();}});
  child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>2000000){child.kill();}});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('COMMAND_START_FAILURE'));});
  child.on('close',code=>{clearTimeout(timer);resolveCommand({code,timedOut,elapsedMs:Math.round(performance.now()-start),stdout,stderr});});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
async function docker(args,options){const r=await command('docker',args,options);if(r.code!==0||r.timedOut)throw new Error('DOCKER_OPERATION_FAILED');return r.stdout.trim();}
async function git(args){const r=await command('git',args);if(r.code!==0)throw new Error('GIT_READ_FAILED');return r.stdout.trimEnd();}
async function hashes(){const names=(await git(['ls-files','--cached','--others','--exclude-standard'])).split(/\r?\n/).filter(Boolean);return Object.fromEntries(names.map(name=>[name,createHash('sha256').update(readFileSync(resolve(root,name))).digest('hex')]));}
let pgId,nodeId,pgImage,nodeImage,safe=true;
async function inspect(id){const values=JSON.parse(await docker(['inspect',id]));if(values.length!==1||values[0].Id!==id)throw new Error('RESOURCE_IDENTITY_UNCERTAIN');return values[0];}
async function identity(id){const d=await inspect(id);if(d.Config.Labels['anabhay.operations.run']!==run||d.Config.Labels['anabhay.operations.synthetic']!=='true')throw new Error('RESOURCE_LABEL_MISMATCH');return d;}
async function isolation(){
 for(const [id,kind,image] of [[pgId,'postgres',pgImage],[nodeId,'node',nodeImage]])if(id){
  const d=await identity(id);
  if(!d.State.Running||d.Image!==image.Id||d.Mounts.length||d.HostConfig.Binds?.length||Object.keys(d.HostConfig.PortBindings??{}).length)throw new Error('ISOLATION_VIOLATION');
  if(kind==='postgres'){
   const tmp=d.HostConfig.Tmpfs??{};if(d.HostConfig.NetworkMode!=='none'||Object.keys(tmp).length!==1||tmp['/var/lib/postgresql/data']!=='rw,nosuid,nodev,size=512m')throw new Error('DATABASE_ISOLATION_VIOLATION');
  }else if(d.HostConfig.NetworkMode!==`container:${pgId}`||Object.keys(d.HostConfig.Tmpfs??{}).length)throw new Error('NODE_ISOLATION_VIOLATION');
 }
}
async function sql(text){
 await isolation();const result=await command('docker',['exec','-i',pgId,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],{input:text,ms:30000});
 if(result.code!==0||result.timedOut){
  report.sqlFailure={file:report.currentSQLFile??null,sqlstate:result.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]??null,
   reason:result.stderr.includes('generation expression is not immutable')?'GENERATION_EXPRESSION_NOT_IMMUTABLE':'SQL_ERROR_REQUIRES_REVIEW'};save();throw new Error('SQL_OPERATION_FAILED');
 }
 return result.stdout.trim();
}
async function transferContainerFile(source,destination){
 await isolation();
 await new Promise((resolveTransfer,reject)=>{
  const sourceProcess=spawn('docker',['cp',`${pgId}:${source}`,'-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const destinationProcess=spawn('docker',['cp','-',`${nodeId}:${destination}`],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let codes=[],failed=false;const timer=setTimeout(()=>{failed=true;sourceProcess.kill();destinationProcess.kill();reject(new Error('TRANSFER_DEADLINE'));},5000);
  const done=code=>{codes.push(code);if(codes.length===2){clearTimeout(timer);if(failed||codes.some(c=>c!==0))reject(new Error('TRANSFER_FAILED'));else resolveTransfer();}};
  sourceProcess.on('error',()=>done(-1));destinationProcess.on('error',()=>done(-1));sourceProcess.stderr.resume();destinationProcess.stderr.resume();destinationProcess.stdin.on('error',()=>{});
  sourceProcess.on('close',done);destinationProcess.on('close',done);sourceProcess.stdout.pipe(destinationProcess.stdin);
 });
}
function events(output){return output.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));}
async function independentCleanup(evidence){
 await isolation();
 const pids=[...new Set(evidence.flatMap(event=>Object.entries(event).filter(([key,value])=>/Pid$/.test(key)&&Number.isInteger(value)).map(([,value])=>value)))];
 const pidArray=pids.length?`ARRAY[${pids.join(',')}]::integer[]`:'ARRAY[]::integer[]';
 const query=`WITH k AS (SELECT hashtextextended('${run}',0) value), d AS (SELECT oid FROM pg_database WHERE datname=current_database())
 SELECT json_build_object('remainingPids',(SELECT count(*) FROM pg_stat_activity WHERE pid=ANY(${pidArray})),
 'remainingNames',(SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'coord-${run}-%' OR application_name LIKE 'campaign-${run}-%' OR application_name='anabhay-operations'),
 'remainingLocks',(SELECT count(*) FROM pg_locks l CROSS JOIN k CROSS JOIN d WHERE l.locktype='advisory' AND
 (l.pid=ANY(${pidArray}) OR (l.database=d.oid AND l.classid=((k.value>>32)&4294967295)::oid AND l.objid=(k.value&4294967295)::oid AND l.objsubid=1))));`;
 const deadline=performance.now()+5000;let state;
 do{const output=await sql("SET statement_timeout='500ms';"+query);state=JSON.parse(output.split(/\r?\n/).find(line=>line.startsWith('{')));if(state.remainingPids===0&&state.remainingNames===0&&state.remainingLocks===0)break;await delay(50);}while(performance.now()<deadline);
 const processCount=Number(await docker(['exec',nodeId,'sh','-c',"ps -eo comm= | grep -c '^node$' || true"]));
 if(Object.values(state).some(n=>n!==0)||processCount!==0){safe=false;throw new Error('INDEPENDENT_CLEANUP_UNCONFIRMED');}
 return {...state,nodeProcesses:processCount,pidsChecked:pids};
}
async function stage(name,args){
 await isolation();const begin=performance.now();
 const execArgs=['exec','-w','/review/operations',nodeId,'sh','-c','echo $$ > /tmp/review-stage.pid; exec node "$@"','review-stage',...args];
 const result=await command('docker',execArgs,{ms:30000});
 if(result.timedOut){
  await identity(nodeId);
  await docker(['exec',nodeId,'sh','-c','p=$(cat /tmp/review-stage.pid); case "$p" in ""|*[!0-9]*) exit 1;; esac; [ "$p" -gt 1 ] || exit 1; grep -q node /proc/$p/cmdline || exit 1; kill -TERM "$p"']);
 }
 const evidence=events(result.stdout);const cleanup=await independentCleanup(evidence);
 const entry={name,result:result.code===0&&!result.timedOut?'PASS':'FAIL',exitCode:result.code,watchdog:result.timedOut,elapsedMs:Math.round(performance.now()-begin),evidence,cleanup,
  fatalEvent:result.stderr.includes("Unhandled 'error' event")?'UNHANDLED_ERROR_EVENT':null};
  report.stages.push(entry);save();console.log(`${entry.result}: ${name}`);
  if(entry.result!=='PASS')throw new Error('STAGE_FAILED: '+name);
  return entry;
}
const setup=`set -eu
umask 077
mkdir /tmp/review-tls
cd /tmp/review-tls
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 2 -subj /CN=ANABHAY-Disposable-Test-CA >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj /CN=localhost >/dev/null 2>&1
printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 1 -extfile server.ext >/dev/null 2>&1
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out expired.crt -days 0 -extfile server.ext >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -keyout other.key -out other.crt -days 1 -subj /CN=Wrong-Test-CA >/dev/null 2>&1
cp ca.crt /tmp/review-ca.crt
cp other.crt /tmp/review-wrong-ca.crt
chown -R postgres:postgres /tmp/review-tls
chmod 700 /tmp/review-tls
chmod 600 /tmp/review-tls/*.key
`;
try{
 // Docker itself must be local; network=none on a remote daemon is not local-only testing.
 const localEndpoint=host=>typeof host==='string'&&(host.startsWith('npipe:////./pipe/')||host==='unix:///var/run/docker.sock');
 if(process.env.DOCKER_HOST&&!localEndpoint(process.env.DOCKER_HOST))throw new Error('REMOTE_DOCKER_HOST_REFUSED');
 const context=JSON.parse(await docker(['context','inspect']))[0];
 if(!localEndpoint(context?.Endpoints?.docker?.Host))throw new Error('REMOTE_DOCKER_CONTEXT_REFUSED');
 report.dockerEndpoint='verified local named pipe or Unix socket';
 const branch=await git(['branch','--show-current']),head=await git(['rev-parse','HEAD']);
 if(branch!=='main'||head!=='3f33a5ac00a972db66c9064ed10c384a27ac8cd3')throw new Error('GIT_BASELINE_MISMATCH');
 report.baseline={branch,head,status:await git(['status','--short']),hashes:await hashes()};save();
 for(const ref of [pgRef,nodeRef]){
  const image=JSON.parse(await docker(['image','inspect',ref]))[0];
  if(image.Os!=='linux'||image.Architecture!=='amd64'||!image.RepoDigests.some(r=>r.endsWith('@'+ref.split('@')[1])))throw new Error('PINNED_IMAGE_UNAVAILABLE');
  if(ref===pgRef)pgImage=image;else nodeImage=image;
 }
 for(const [kind,ref] of [['postgres',pgRef],['node',nodeRef]]){
  const name=`anabhay-ops-${kind}-${run}`;if(await docker(['container','ls','--all','--filter',`name=^/${name}$`,'--format','{{.ID}}']))throw new Error('RESOURCE_NAME_CONFLICT');
  const args=['create','--pull=never','--name',name,'--label',`anabhay.operations.run=${run}`,'--label','anabhay.operations.synthetic=true'];
  if(kind==='postgres')args.push('--network','none','--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=512m');else args.push('--network',`container:${pgId}`);
  args.push('--entrypoint','sleep',ref,'infinity');const id=await docker(args);if(!/^[a-f0-9]{64}$/.test(id))throw new Error('FULL_ID_UNAVAILABLE');
  if(kind==='postgres')pgId=id;else nodeId=id;report.resources.push({kind,id,name});save();await identity(id);await docker(['start',id]);
 }
 await isolation();await docker(['exec','-i',pgId,'bash','-s'],{input:setup});
 await docker(['exec','-d',pgId,'bash','-c','export POSTGRES_PASSWORD=$(openssl rand -hex 32); exec docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1 -c ssl=on -c ssl_cert_file=/tmp/review-tls/server.crt -c ssl_key_file=/tmp/review-tls/server.key -c log_error_verbosity=verbose > /tmp/review-postgres.log 2>&1']);
 await docker(['exec','-d',pgId,'bash','-c','exec openssl s_server -accept 127.0.0.1:5444 -cert /tmp/review-tls/expired.crt -key /tmp/review-tls/server.key -quiet > /tmp/review-expired.log 2>&1']);
 let ready=false;for(let i=0;i<50;i++){const r=await command('docker',['exec',pgId,'pg_isready','-U','postgres'],{ms:1000});if(r.code===0){ready=true;break;}await delay(100);}if(!ready)throw new Error('POSTGRES_NOT_READY');
 // Synthetic observer is administrative test infrastructure; never a driver credential.
 await docker(['exec','-i',pgId,'bash','-s'],{input:`set -eu
umask 077
o=$(openssl rand -hex 32); i=$(openssl rand -hex 32); n=$(openssl rand -hex 32)
printf '{"observer":"%s","ingestion":"%s","notification":"%s"}' "$o" "$i" "$n" > /tmp/review-credentials.json
psql -X -U postgres -v ON_ERROR_STOP=1 -q <<SQL
CREATE ROLE synthetic_observer LOGIN SUPERUSER PASSWORD '$o';
SQL
`});
 await transferContainerFile('/tmp/review-credentials.json','/tmp');await transferContainerFile('/tmp/review-ca.crt','/tmp');await transferContainerFile('/tmp/review-wrong-ca.crt','/tmp');
 await docker(['exec',nodeId,'mkdir','-p','/review/operations/server','/review/operations/tests/integration','/review/operations/tests/support','/review/js']);
 const files=['operations/package.json','operations/package-lock.json','operations/server/postgres.mjs','operations/server/enquiry.mjs','operations/server/capabilities.mjs','operations/server/release-reason.mjs','operations/server/deadline.mjs','js/enquiry-validation.js',...['coordination-probe.mjs','snapshot-diagnostic.mjs','driver-campaign.mjs','commit-fault-proxy.mjs',...(outboxOnly?['outbox-campaign.mjs']:[]),...(persistenceOnly?['persistence-campaign.mjs']:[])].map(f=>'operations/tests/integration/'+f)];
 if(httpOnly)files.push('operations/server/local-http.mjs','operations/server/local-postgres-http.mjs','operations/server/http.mjs','operations/server/config.mjs','operations/server/process-runtime.mjs','operations/tests/integration/http-postgres-campaign.mjs');
 for(const file of files){if(lstatSync(resolve(root,file)).isSymbolicLink())throw new Error('SOURCE_SYMLINK');await docker(['cp',file,`${nodeId}:/review/${file}`]);}
 if(bindingOnly)for(const file of ['operations/server/notification-worker.mjs','operations/server/notification-store.mjs','operations/server/provider.mjs','operations/tests/support/fake-provider.mjs','operations/tests/integration/binding-campaign.mjs']){
  if(lstatSync(resolve(root,file)).isSymbolicLink())throw new Error('SOURCE_SYMLINK');await docker(['cp',file,`${nodeId}:/review/${file}`]);
 }
 function dependencyCheck(dir){for(const name of readdirSync(dir)){const path=resolve(dir,name),stat=lstatSync(path);if(stat.isSymbolicLink())throw new Error('DEPENDENCY_SYMLINK');if(stat.isDirectory())dependencyCheck(path);}}
 dependencyCheck(resolve(root,'operations/node_modules'));if(JSON.parse(readFileSync(resolve(root,'operations/node_modules/pg/package.json'))).version!=='8.23.1')throw new Error('DEPENDENCY_VERSION_MISMATCH');
 await docker(['cp','operations/node_modules',`${nodeId}:/review/operations/node_modules`]);
 await docker(['exec',nodeId,'openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout','/tmp/review-proxy.key','-out','/tmp/review-proxy.crt','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','extendedKeyUsage=serverAuth']);
 await stage('TLS controls',['tests/integration/driver-campaign.mjs','tls',run]);
 if(!outboxOnly&&!persistenceOnly&&!bindingOnly&&!httpOnly){
  await stage('1 coordination',['tests/integration/coordination-probe.mjs','--approved-isolated-run',run]);
  await stage('1 snapshot diagnostic',['tests/integration/snapshot-diagnostic.mjs','--approved-isolated-run',run]);
 }
 for(const file of ['bootstrap.sql',...['001_staff_crm.sql','002_ingestion_outbox.sql','003_atomic_ingestion.sql','004_capabilities.sql'], ...(httpOnly?[]:['verify.sql','outbox-recovery.sql'])]){
  const path=file.match(/^00/)?'operations/migrations/'+file:'operations/tests/integration/'+file;
  report.currentSQLFile=path;await sql(readFileSync(resolve(root,path),'utf8'));report.stages.push({name:`2 ${file}`,result:'PASS'});save();console.log(`PASS: ${file}`);
 }
 report.databaseBaseline=JSON.parse(await sql(`SELECT json_build_object(
 'tables',(SELECT json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='operations' AND c.relkind='r'),
 'policies',(SELECT json_agg(p) FROM pg_policies p WHERE schemaname='operations'),
 'constraints',(SELECT json_agg(json_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='operations'),
 'indexes',(SELECT json_agg(i) FROM pg_indexes i WHERE schemaname='operations'),
 'roles',(SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'bypassRls',rolbypassrls,'superuser',rolsuper)) FROM pg_roles WHERE rolname LIKE 'ops_%'),
 'functions',(SELECT json_agg(json_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='operations'),
 'initialCounts',json_build_object('leads',(SELECT count(*) FROM operations.leads),'enquiries',(SELECT count(*) FROM operations.website_enquiries),'outbox',(SELECT count(*) FROM operations.notification_outbox)));`));save();
 await docker(['exec','-i',pgId,'bash','-s'],{input:`set -eu
i=$(sed -n 's/.*"ingestion":"\\([a-f0-9]*\\)".*/\\1/p' /tmp/review-credentials.json)
n=$(sed -n 's/.*"notification":"\\([a-f0-9]*\\)".*/\\1/p' /tmp/review-credentials.json)
psql -X -U postgres -v ON_ERROR_STOP=1 -q <<SQL
CREATE ROLE synthetic_ingestion LOGIN INHERIT PASSWORD '$i'; GRANT ops_ingestion_api TO synthetic_ingestion;
CREATE ROLE synthetic_notification LOGIN INHERIT PASSWORD '$n'; GRANT ops_notification_api TO synthetic_notification;
SQL
`});
 if(httpOnly)await stage('HTTP real ingestion and database isolation',['tests/integration/http-postgres-campaign.mjs',run]);
 if(outboxOnly){
  await sql(readFileSync(resolve(root,'operations/tests/integration/outbox-claim-fixture.sql'),'utf8'));
  const workerSQL=readFileSync(resolve(root,'operations/tests/integration/outbox-claim-worker.sql'),'utf8');
  const workers=await Promise.all([sql(workerSQL),sql(workerSQL)]);
  const ids=workers.flatMap(output=>output.split(/\r?\n/).filter(line=>/^[0-9a-f-]{36}$/.test(line)));
  if(ids.length!==2||new Set(ids).size!==2)throw new Error('LEGACY_OUTBOX_CLAIMS_NOT_DISTINCT');
  const state=JSON.parse(await sql("SELECT json_build_object('total',count(*),'processing',count(*) FILTER(WHERE state='processing' AND attempts=1 AND lease_until IS NOT NULL AND lease_token IS NOT NULL)) FROM operations.notification_outbox;"));
  if(state.total!==2||state.processing!==2)throw new Error('LEGACY_OUTBOX_STATE_MISMATCH');
  report.stages.push({name:'outbox claim fixture and two legacy workers',result:'PASS',state,overlap:'not inferred from distinct IDs; separate barrier test follows'});save();
  await stage('outbox deterministic ownership and recovery',['tests/integration/outbox-campaign.mjs',run]);
 }
 if(persistenceOnly||bindingOnly){
  report.currentSQLFile='operations/migrations/005_notification_persistence.sql';
  await sql(readFileSync(resolve(root,report.currentSQLFile),'utf8'));
  report.stages.push({name:'005_notification_persistence.sql',result:'PASS'});save();console.log('PASS: 005_notification_persistence.sql');
  if(persistenceOnly)await stage('persistence metadata and default-denial',['tests/integration/persistence-campaign.mjs',run]);
 }
 if(bindingOnly){
  report.currentSQLFile='operations/migrations/006_notification_capabilities.sql';
  await sql(readFileSync(resolve(root,report.currentSQLFile),'utf8'));
  report.stages.push({name:'006_notification_capabilities.sql',result:'PASS'});save();console.log('PASS: 006_notification_capabilities.sql');
  if(releaseOnly){
   report.currentSQLFile='operations/migrations/007_release_reason.sql';await sql(readFileSync(resolve(root,report.currentSQLFile),'utf8'));report.stages.push({name:'007_release_reason.sql',result:'PASS'});
   report.currentSQLFile='operations/tests/integration/release-reason.sql';await sql(readFileSync(resolve(root,report.currentSQLFile),'utf8'));report.stages.push({name:'release reason authorization, replay and immutability',result:'PASS'});save();console.log('PASS: release reason database assertions');
  }else await stage('durable scoped worker and manager release',['tests/integration/binding-campaign.mjs',run]);
 }
 for(const [name,test] of (outboxOnly||persistenceOnly||bindingOnly||httpOnly?[]:[['2 physical listener lifecycle','lifecycle'],['3 success and rollback','success'],['4 pool bounds','pool'],['5 timeouts','timeouts'],['6 transport faults','commit'],['7 same-key recovery','recovery'],['8 uncertain shutdown','shutdown']])){
  if(test==='recovery'&&!report.stages.some(s=>s.name==='6 transport faults'&&s.result==='PASS')){report.stages.push({name,result:'BLOCKED',reason:'Genuine acknowledged-loss fixture not established'});save();continue;}
  await stage(name,['tests/integration/driver-campaign.mjs',test,run]);
  if(test==='timeouts'){
   const errors=await docker(['exec',pgId,'sh','-c',"grep 'ERROR:' /tmp/review-postgres.log | grep -E 'lock timeout|statement timeout' || true"]);
   report.serverTimeoutEvidence=errors.split(/\r?\n/).filter(Boolean);save();
   if(!errors.includes('55P03')||!errors.includes('57014')){report.stages.at(-1).result='FAIL';report.stages.at(-1).missingEvidence='Expected server SQLSTATE 55P03 and 57014';save();}
  }
 }
  const regression=await command('node',['--test','--test-reporter=spec',...regressionFiles()]);
 report.stages.push({name:'9 Node regression',result:regression.code===0?'PASS':'FAIL',summary:regression.stdout.split(/\r?\n/).filter(l=>/^ℹ (tests|pass|fail|skipped)/.test(l)),exitCode:regression.code});
 for(const [name,args] of [['site',['node',['scripts/check-site.mjs']]],['whitespace',['git',['diff','--check']]]]){const r=await command(...args);report.stages.push({name:`9 ${name}`,result:r.code===0?'PASS':'FAIL',exitCode:r.code,summary:name==='site'?r.stdout.trim():''});}
}catch(error){report.blocker=error.message;console.log('BLOCKED: '+error.message);}
finally{
 // Never remove unknown IDs or labels. Remove Node before its network namespace owner.
 for(const id of [nodeId,pgId].filter(Boolean)){
  try{await identity(id);await docker(['rm','-f',id]);const remaining=await docker(['container','ls','--all','--filter',`id=${id}`,'--format','{{.ID}}']);if(remaining)throw new Error('RESOURCE_STILL_PRESENT');report.cleanup.push({id,removed:true,verifiedBy:'successful exact-ID container listing'});}
  catch(error){report.cleanup.push({id,removed:false,reason:error.message});}
 }
 const after=await hashes();report.integrity={changed:Object.keys(report.baseline?.hashes??{}).filter(k=>after[k]!==report.baseline.hashes[k]),branch:await git(['branch','--show-current']),head:await git(['rev-parse','HEAD']),status:await git(['status','--short']),staged:await git(['diff','--cached','--name-only'])};
 report.verdict=report.blocker||report.cleanup.some(x=>!x.removed)?'BLOCKED':report.stages.some(x=>x.result!=='PASS')?'FAIL':'PASS';save();
 writeFileSync(reportPath.replace(/\.json$/,'.md'),`# Local reliability campaign\n\nVerdict: ${report.verdict}\n\n`+report.stages.map(s=>`- ${s.name}: ${s.result}`).join('\n')+`\n\nProtected file changes: ${report.integrity.changed.length}\nCleanup: ${report.cleanup.map(r=>r.removed?'removed':'UNCONFIRMED').join(', ')}\nNo hosted Auth/provider or production-readiness claim.\n`);
 console.log(`REPORT ${relative(root,reportPath)} VERDICT ${report.verdict}`);
}
