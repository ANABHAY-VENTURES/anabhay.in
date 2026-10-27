// Local source inspection only: no credentials, environment reads, SQL or network.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function inspectOperatorReadiness(read=path=>readFileSync(path,'utf8')) {
 const migrations=[];
 for(const name of ['001_staff_crm','002_ingestion_outbox','003_atomic_ingestion','004_capabilities','005_notification_persistence','006_notification_capabilities','007_release_reason']) {
  const source=read(new URL(`../migrations/${name}.sql`,import.meta.url));
  if(typeof source!=='string'||!source.trim())throw new Error('Local migration unavailable.');
  migrations.push({name,sha256:createHash('sha256').update(source).digest('hex')});
 }
 const sql=read(new URL('../migrations/006_notification_capabilities.sql',import.meta.url));
 const checks={
  inactiveByDefault:/active boolean not null default false/.test(sql),
  explicitTeamScope:/create table operations.notification_worker_teams/.test(sql),
  assignedTeamRequired:/l\.team_id=s\.team_id/.test(sql)&&/s\.team_id is not null/.test(sql),
  managerRelease:/staff\.role='manager'/.test(sql)&&/notification_release_events/.test(sql),
  legacyWorkerAccessRevoked:/revoke execute on function operations\.claim_notification/.test(sql)
 };
 return {mode:'LOCAL_SOURCE_ONLY',checks,migrations,
  databaseReadiness:'NOT VERIFIED',configuration:'NOT VERIFIED — credentials are not inspected',
  provisioning:'BLOCKED — operator authorization and audited provisioning capabilities are undefined',
  activationAllowed:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 if(process.argv.slice(2).join(' ')!=='--source-only'){console.error('Use --source-only; database access is not supported.');process.exitCode=1;}
 else try{const result=inspectOperatorReadiness();console.log(JSON.stringify(result,null,2));if(Object.values(result.checks).some(v=>!v))process.exitCode=1;}
 catch{console.error('Local source preflight failed.');process.exitCode=1;}
}
