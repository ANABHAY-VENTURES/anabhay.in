import pg from 'pg';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Independent coordination test only: no driver calls, migrations or persistent writes.
class ProbeFailure extends Error {
  constructor(stage, code=null) { super(stage); this.stage=stage; this.code=code; }
}
const sqlstate=error=>/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null;
async function bounded(operation, milliseconds, stage, operations, client) {
  const record={stage,client,settled:false,timedOut:false,promise:null,sqlstate:null};
  operations.push(record);
  // Track actual settlement separately from the caller's Promise.race result.
  record.promise=Promise.resolve().then(operation).then(value=>{
    record.settled=true;return value;
  },error=>{record.settled=true;record.sqlstate=sqlstate(error);throw error;});
  let timer;
  try {return await Promise.race([record.promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>{record.timedOut=true;reject(new ProbeFailure(stage));},milliseconds);
  })]);}finally{clearTimeout(timer);}
}
export function isolatedConfiguration(args) {
  if(args.length!==2||args[0]!=='--approved-isolated-run'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args[1])) throw new ProbeFailure('ISOLATION_APPROVAL_REQUIRED');
  // These files must be provisioned inside disposable storage by reviewed setup.
  // Never load a host .env, arbitrary connection URL or production configuration.
  const credentials=JSON.parse(readFileSync('/tmp/review-credentials.json','utf8'));
  if(typeof credentials.observer!=='string'||!credentials.observer) throw new ProbeFailure('MISSING_SYNTHETIC_CREDENTIAL');
  return {runId:args[1],config:{host:'127.0.0.1',port:5432,database:'postgres',
    user:'synthetic_observer',password:credentials.observer,
    ssl:{rejectUnauthorized:true,ca:readFileSync('/tmp/review-ca.crt')},
    connectionTimeoutMillis:1000}};
}

export async function runCoordination({config,runId,snapshotDiagnostic=false}) {
  if(config.host!=='127.0.0.1'||config.port!==5432||config.database!=='postgres'||
    config.user!=='synthetic_observer'||config.ssl?.rejectUnauthorized!==true||
    !/^[0-9a-f-]{36}$/i.test(runId)) throw new ProbeFailure('INVALID_ISOLATED_CONFIGURATION');
  const started=performance.now(),clients=[],pids={},operations=[];
  let stage='CONNECT',holder,observer,waiter,snapshot,operation,settled=false,holderReleased=false,failure;
  const evidence=(stage,extra={})=>console.log(JSON.stringify({stage,
    elapsedMs:Math.round(performance.now()-started),...pids,...extra}));
  function client(label,statementTimeout) {
    const c=new pg.Client({...config,application_name:`coord-${runId}-${label}`,
      statement_timeout:statementTimeout,lock_timeout:label==='waiter'?10000:1000,
      idle_in_transaction_session_timeout:15000});
    c.on('error',error=>{
      failure??=new ProbeFailure('CONNECTION_ERROR',sqlstate(error));
      evidence('CONNECTION_ERROR',{sqlstate:sqlstate(error),result:'FAIL'});
    });clients.push(c);return c;
  }
  const wait=(c,operation,ms,label)=>bounded(operation,ms,label,operations,c);
  const query=(c,text,values=[])=>wait(c,()=>c.query(text,values),500,'QUERY_CALLER_DEADLINE');
  const lockSQL='SELECT pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text,0))';
  // Same UUID-string hashing and bigint transaction lock used by migration 003.
  const key=runId.toLowerCase();
  const activitySQL='SELECT pid,state,wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1';
  try {
    holder=client('holder',1000);waiter=client('waiter',12000);observer=client('observer',250);
    for(const [label,c] of [['holder',holder],['waiter',waiter],['observer',observer]]) {
      await wait(c,()=>c.connect(),1500,'CONNECT_DEADLINE');
      const result=await query(c,'SELECT pg_backend_pid() AS pid');pids[`${label}Pid`]=result.rows[0].pid;
    }
    if(new Set(Object.values(pids)).size!==3) throw new ProbeFailure('PIDS_NOT_DISTINCT');
    await query(observer,"SELECT set_config('stats_fetch_consistency','none',false)");
    await query(holder,'BEGIN');
    await query(holder,lockSQL,[key]); // Awaited acquisition is the explicit holder barrier.
    const held=await query(observer,`WITH k AS (SELECT pg_catalog.hashtextextended($2::text,0) AS value)
      SELECT l.database,l.classid,l.objid,l.objsubid FROM pg_locks l CROSS JOIN k
      WHERE l.pid=$1 AND l.locktype='advisory' AND l.granted AND l.objsubid=1
      AND l.classid=((k.value>>32)&4294967295)::oid
      AND l.objid=(k.value&4294967295)::oid`,[pids.holderPid,key]);
    if(held.rowCount!==1) throw new ProbeFailure('HOLDER_LOCK_NOT_ESTABLISHED');
    evidence('HOLDER_ACQUIRED',{settlement:'not-dispatched'});
    if(snapshotDiagnostic) {
      const baseline=(await query(observer,activitySQL,[pids.waiterPid])).rows[0];
      if(baseline?.pid!==pids.waiterPid||baseline.state!=='idle'||baseline.wait_event_type==='Lock') throw new ProbeFailure('AUTOCOMMIT_BASELINE_NOT_IDLE');
      evidence('AUTOCOMMIT_PRE_DISPATCH_BASELINE',{observation:baseline,settlement:'not-dispatched'});
      snapshot=client('snapshot',1000);await wait(snapshot,()=>snapshot.connect(),1500,'SNAPSHOT_CONNECT_DEADLINE');
      pids.snapshotPid=(await query(snapshot,'SELECT pg_backend_pid() AS pid')).rows[0].pid;
      if(new Set(Object.values(pids)).size!==4) throw new ProbeFailure('SNAPSHOT_PID_NOT_DISTINCT');
      await query(snapshot,"SELECT set_config('stats_fetch_consistency','snapshot',false)");
      await query(snapshot,'BEGIN');
      const snapshotBaseline=(await query(snapshot,activitySQL,[pids.waiterPid])).rows[0];
      if(snapshotBaseline?.pid!==pids.waiterPid||snapshotBaseline.state!=='idle'||snapshotBaseline.wait_event_type==='Lock') throw new ProbeFailure('TRANSACTION_BASELINE_NOT_IDLE');
      evidence('TRANSACTION_PRE_DISPATCH_BASELINE',{observation:snapshotBaseline,settlement:'not-dispatched'});
    }
    stage='OBSERVE_WAITER';
    // Attach both handlers in the same turn; polling never awaits this operation.
    operation=wait(waiter,()=>waiter.query(lockSQL,[key]).then(value=>{
      settled=true;return {ok:true,value};
    },error=>{settled=true;return {ok:false,error};}),12500,'WAITER_CALLER_DEADLINE');
    // Observe even if observation fails before we await this promise.
    operation.catch(()=>{});
    const deadline=performance.now()+2000;
    let relation;
    do {
      const result=await query(observer,`SELECT a.pid,a.state,a.wait_event_type,a.wait_event,
        $2::integer=ANY(pg_blocking_pids(a.pid)) AS expected_blocker,
        EXISTS(SELECT 1 FROM pg_locks w JOIN pg_locks h
          ON h.locktype=w.locktype AND h.database IS NOT DISTINCT FROM w.database
          AND h.classid=w.classid AND h.objid=w.objid AND h.objsubid=w.objsubid
          WHERE w.pid=$1 AND h.pid=$2 AND w.locktype='advisory'
          AND w.objsubid=1 AND NOT w.granted AND h.granted) AS matching_ungranted
        FROM pg_stat_activity a WHERE a.pid=$1`,[pids.waiterPid,pids.holderPid]);
      relation=result.rows[0];
      if(failure) throw failure;
      if(settled) {
        const outcome=await operation;
        throw new ProbeFailure('WAITER_SETTLED_BEFORE_RELEASE',sqlstate(outcome.error));
      }
      if(relation?.expected_blocker===true&&relation.matching_ungranted===true&&relation.wait_event_type==='Lock') break;
      await delay(20);
    }while(performance.now()<deadline);
    if(!relation?.expected_blocker||!relation.matching_ungranted||relation.wait_event_type!=='Lock') throw new ProbeFailure('OBSERVATION_DEADLINE');
    evidence('EXACT_WAITER_OBSERVED',{waitClassification:relation.wait_event_type,settlement:'pending'});
    if(snapshotDiagnostic) {
      for(let i=0;i<2;i++) {
        const live=await query(observer,'SELECT $2::integer=ANY(pg_blocking_pids($1)) AS blocked',[pids.waiterPid,pids.holderPid]);
        if(settled||live.rows[0]?.blocked!==true) throw new ProbeFailure('DIAGNOSTIC_WAITER_NO_LONGER_BLOCKED');
        evidence('TRANSACTION_SNAPSHOT_OBSERVATION',{observation:(await query(snapshot,activitySQL,[pids.waiterPid])).rows[0],settlement:'pending'});
      }
      await query(snapshot,'SELECT pg_stat_clear_snapshot()');
      evidence('CLEARED_SNAPSHOT_OBSERVATION',{observation:(await query(snapshot,activitySQL,[pids.waiterPid])).rows[0]});
      const live=(await query(observer,activitySQL,[pids.waiterPid])).rows[0];
      if(settled||live?.pid!==pids.waiterPid||live.wait_event_type!=='Lock') throw new ProbeFailure('DIAGNOSTIC_AUTOCOMMIT_NOT_BLOCKED');
      evidence('AUTOCOMMIT_OBSERVATION',{observation:live,settlement:'pending'});
      await query(snapshot,'ROLLBACK');
    }
    if(settled) throw new ProbeFailure('WAITER_SETTLED_BEFORE_RELEASE');
    stage='RELEASE';await query(holder,'ROLLBACK');holderReleased=true;
    const result=await wait(waiter,()=>operation,2000,'POST_RELEASE_DEADLINE');
    if(!result.ok) throw result.error;
    const locks=await query(observer,"SELECT 1 FROM pg_locks WHERE pid IN ($1,$2) AND locktype='advisory'",[pids.holderPid,pids.waiterPid]);
    if(locks.rowCount!==0) throw new ProbeFailure('ADVISORY_LOCK_REMAINS');
    evidence('COMPLETED_AFTER_RELEASE',{settlement:'fulfilled'});
  }catch(error){
    failure??=new ProbeFailure(error instanceof ProbeFailure?error.stage:stage,sqlstate(error));
    evidence(failure.stage,{sqlstate:sqlstate(failure),settlement:settled?'settled':'pending',result:'FAIL'});
  }finally{
    if(holder&&!holderReleased) {
      try{await query(holder,'ROLLBACK');holderReleased=true;}catch(error){
        failure??=new ProbeFailure('ROLLBACK_UNCONFIRMED',sqlstate(error));
        evidence('ROLLBACK_UNCONFIRMED',{sqlstate:sqlstate(error),result:'FAIL'});
      }
    }
    // end() closes active pg connections; no connection is returned to a pool.
    const cleanup=await Promise.allSettled(clients.filter(c=>c!==observer).map(c=>wait(c,()=>c.end(),1500,'CONNECTION_END_DEADLINE')));
    if(operation) {
      try{await wait(waiter,()=>operation,1500,'OUTSTANDING_OPERATION_DEADLINE');}
      catch(error){failure??=new ProbeFailure('OUTSTANDING_OPERATION_DEADLINE',sqlstate(error));evidence('OUTSTANDING_OPERATION_DEADLINE',{result:'FAIL'});}
    }
    if(observer&&pids.holderPid&&pids.waiterPid) {
      try {
        const deadline=performance.now()+1500;let remaining;
        do {
          remaining=await query(observer,'SELECT pid FROM pg_stat_activity WHERE pid=ANY($1::integer[])',
            [[pids.holderPid,pids.waiterPid,...(pids.snapshotPid?[pids.snapshotPid]:[])]]);
          if(remaining.rowCount===0) break;await delay(20);
        }while(performance.now()<deadline);
        if(remaining.rowCount!==0) throw new ProbeFailure('BACKEND_CLEANUP_UNCONFIRMED');
        evidence('HOLDER_WAITER_BACKENDS_ABSENT');
      }catch(error){failure??=new ProbeFailure('BACKEND_CLEANUP_UNCONFIRMED',sqlstate(error));evidence('BACKEND_CLEANUP_UNCONFIRMED',{sqlstate:sqlstate(error),result:'FAIL'});}
    }
    if(observer) cleanup.push(...await Promise.allSettled([wait(observer,()=>observer.end(),1500,'OBSERVER_END_DEADLINE')]));
    // Drain tracked underlying promises, not merely their timed-out race wrappers.
    const outstanding=operations.filter(record=>!record.settled);
    if(outstanding.length) {
      try{await wait(null,()=>Promise.allSettled(outstanding.map(record=>record.promise)),1500,'OPERATION_DRAIN_DEADLINE');}
      catch(error){failure??=new ProbeFailure('OPERATION_DRAIN_DEADLINE',sqlstate(error));}
    }
    for(const record of operations) if(record.timedOut||!record.settled) {
      failure??=new ProbeFailure(record.stage,record.sqlstate);
      evidence(record.stage,{sqlstate:record.sqlstate,settlement:record.settled?'settled-after-deadline':'unconfirmed',result:'FAIL'});
    }
    if(cleanup.some(r=>r.status==='rejected')) {
      const rejected=cleanup.find(r=>r.status==='rejected').reason;
      failure??=new ProbeFailure(rejected instanceof ProbeFailure?rejected.stage:'CLEANUP_UNCONFIRMED',sqlstate(rejected));
      evidence('CLEANUP_UNCONFIRMED',{sqlstate:sqlstate(rejected),result:'FAIL'});
    }
    else evidence('CLIENT_CLOSE_ACKNOWLEDGED',{settlement:settled?'settled':'not-dispatched'});
  }
  if(failure) throw failure;
}
export function reportEntryFailure(error) {
  console.error(JSON.stringify({stage:error instanceof ProbeFailure?error.stage:'ENTRY_CONFIGURATION_FAILURE',sqlstate:sqlstate(error),result:'FAIL'}));
  process.exitCode=1;
}
async function main(){try{await runCoordination(isolatedConfiguration(process.argv.slice(2)));}catch(error){reportEntryFailure(error);}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
