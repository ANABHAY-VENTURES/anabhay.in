import pg from 'pg';
import {validateRequest} from './enquiry.mjs';

export class DatabaseFailure extends Error {
  constructor(outcome='not-committed') {
    super(outcome==='shutdown-unconfirmed' ? 'Database shutdown unconfirmed.' : outcome==='unknown' ? 'Database outcome unconfirmed.' : 'Database operation unavailable.');
    this.outcome=outcome;
    this.status=503;
  }
}
const bounded=(value,min,max)=>{
  if(!Number.isInteger(value)||value<min||value>max) throw new DatabaseFailure();
  return value;
};
// Fixed operations only. Neither Pool nor a generic SQL method is exported.
export function createPostgresDriver({ingestion,notification,mode='both',acquisitionMs=1000,
  statementMs=3000,lockMs=1000,operationMs=5000,shutdownMs=6000}, {Pool=pg.Pool}={}) {
  bounded(acquisitionMs,1,5000);bounded(statementMs,1,10000);
  bounded(lockMs,1,statementMs);bounded(operationMs,1,15000);bounded(shutdownMs,1,30000);
  if(!['both','ingestion','notification'].includes(mode)||
    (mode==='ingestion'&&notification!==undefined)||(mode==='notification'&&ingestion!==undefined))throw new DatabaseFailure();
  let closing=false,shutdownPromise;
  const states=[];
  function make(config,capability,defaultMax) {
    if(!config||typeof config.host!=='string'||config.host!==config.expectedHost||
      typeof config.database!=='string'||!config.database||typeof config.user!=='string'||
      !config.user||['postgres','service_role','supabase_admin',capability].includes(config.user)||
      typeof config.password!=='string'||!config.password||
      !config.ssl||config.ssl.rejectUnauthorized!==true) throw new DatabaseFailure();
    const max=bounded(config.max??defaultMax,1,8);
    const pool=new Pool({host:config.host,port:bounded(config.port??5432,1,65535),
      database:config.database,user:config.user,password:config.password,
      ssl:{rejectUnauthorized:true,...(config.ssl.ca?{ca:config.ssl.ca}:{})},
      max,connectionTimeoutMillis:acquisitionMs,idleTimeoutMillis:10000,
      statement_timeout:statementMs,lock_timeout:lockMs,
      idle_in_transaction_session_timeout:5000,application_name:'anabhay-operations'});
    pool.on('error',()=>{}); // No raw server errors, credentials or failed-row details.
    const clients=new WeakMap();
    const track=client=>{
      if(clients.has(client)) return clients.get(client);
      const health={broken:false};
      const connectionError=()=>{health.broken=true;};
      clients.set(client,health);
      client.on?.('error',connectionError);
      client.once?.('end',()=>{client.removeListener('error',connectionError);});
      return health;
    };
    // pg-pool emits connect before checkout removes its idle listener. Own one
    // listener per physical connection, through release/destruction until end.
    // Never remove or replace the pool's independently owned idle listener.
    pool.on('connect',track);
    const state={pool,max,capability,pending:0,active:new Set(),track};states.push(state);return state;
  }
  const ingest=mode==='notification'?null:make(ingestion,'ops_ingestion_api',4);
  // Validate both configs before creating any actual network connections (pools are lazy).
  const notify=mode==='ingestion'?null:make(notification,'ops_notification_api',2);
  async function transaction(state,text,values,signal) {
    if(!state||closing||signal?.aborted||state.pending>=state.max*2) throw new DatabaseFailure();
    state.pending++;
    let client,released=false,commitSent=false,timer,acquireTimer,abort,connectionHealth;
    const dispose=()=>{if(client&&!released){released=true;client.release(true);state.active.delete(dispose);}};
    try {
      const connection=state.pool.connect();
      let abandoned=false;
      try {
        client=await Promise.race([connection,new Promise((_,reject)=>{
          acquireTimer=setTimeout(()=>{abandoned=true;reject(new DatabaseFailure());},acquisitionMs);
        })]);
      } finally {
        clearTimeout(acquireTimer);
        // A late acquisition must not leak a checked-out connection.
        if(abandoned) connection.then(c=>c.release(true),()=>{});
      }
      connectionHealth=state.track(client);
      state.active.add(dispose);
      if(closing||signal?.aborted||connectionHealth.broken) throw new DatabaseFailure();
      const work=async()=>{
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query("SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$2,true), set_config('idle_in_transaction_session_timeout','5000',true)",[String(statementMs),String(lockMs)]);
        // Session identity must be a dedicated LOGIN with only its API membership.
        const health=await client.query("SELECT current_user AS identity, r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb AS privileged, pg_has_role(current_user,$1,'USAGE') AS capability, EXISTS(SELECT 1 FROM pg_roles x WHERE x.rolname<>current_user AND x.rolname<>$1 AND pg_has_role(current_user,x.oid,'MEMBER')) AS extra FROM pg_roles r WHERE r.rolname=current_user",[state.capability]);
        const row=health.rows[0];
        if(!row||row.privileged||row.extra||row.capability!==true) throw new DatabaseFailure();
        const result=await client.query(text,values);
        if(signal?.aborted||released||connectionHealth.broken) throw new DatabaseFailure();
        commitSent=true; // Conservatively unknown from immediately before sending.
        const commit=await client.query('COMMIT');
        if(commit.command!=='COMMIT') throw new DatabaseFailure('unknown');
        if(connectionHealth.broken) throw new DatabaseFailure('unknown');
        return result.rows[0];
      };
      const stopped=new Promise((_,reject)=>{
        abort=()=>{dispose();reject(new DatabaseFailure(commitSent?'unknown':'not-committed'));};
        signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(abort,operationMs);
      });
      const result=await Promise.race([work(),stopped]);
      if(!released){released=true;state.active.delete(dispose);client.release();}
      return result;
    } catch {
      if(client&&!released&&!commitSent) {
        // Attempt explicit rollback, bounded independently; always discard afterward.
        let rollbackTimer;
        try {await Promise.race([client.query('ROLLBACK'),new Promise((_,reject)=>{
          rollbackTimer=setTimeout(()=>reject(new DatabaseFailure()),Math.min(250,operationMs));
        })]);}catch {}finally{clearTimeout(rollbackTimer);}
      }
      // Destroy uncertain/broken clients. Socket disposal is NOT proof of server cancellation.
      // If no COMMIT was sent, the transaction has no path to become durable.
      dispose();throw new DatabaseFailure(commitSent?'unknown':'not-committed');
    } finally {
      clearTimeout(timer);signal?.removeEventListener('abort',abort);state.pending--;
    }
  }
  const validate=request=>{
    const checked=validateRequest(JSON.stringify(request.payload),request.key);
    if(checked.hash!==request.hash) throw new DatabaseFailure();
    return checked;
  };
  const persist=async(request,{signal}={})=>{
    const checked=validate(request);
    const row=await transaction(ingest,'SELECT operations.ingest_enquiry($1,$2,$3::jsonb) AS receipt',
      [checked.key,checked.hash,JSON.stringify(checked.payload)],signal);
    return row.receipt;
  };
  return Object.freeze({
    consumeLimit:async(fingerprint,{signal}={})=>{
      if(typeof fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(fingerprint)) throw new DatabaseFailure();
      const row=await transaction(ingest,'SELECT operations.consume_enquiry_limit($1) AS allowed',[fingerprint],signal);
      if(typeof row.allowed!=='boolean') throw new DatabaseFailure();return row.allowed;
    },
    ingestEnquiry:persist,
    // Explicit retry only; revalidates key/hash/payload, never generates a key.
    reconcileEnquiry:persist,
    claimNotification:async({signal}={})=>(await transaction(notify,'SELECT operations.claim_notification() AS job',[],signal)).job,
    acceptNotification:async(id,token,providerId,{signal}={})=>{await transaction(notify,'SELECT operations.accept_notification($1,$2,$3)',[id,token,providerId],signal);},
    retryNotification:async(id,token,errorCode,{signal}={})=>{await transaction(notify,'SELECT operations.retry_notification($1,$2,$3)',[id,token,errorCode],signal);},
    claimBoundNotification:async({signal}={})=>(await transaction(notify,'SELECT operations.claim_bound_notification() AS job',[],signal)).job,
    readBoundNotification:async(job,{signal}={})=>(await transaction(notify,'SELECT operations.read_bound_notification($1::jsonb) AS content',[JSON.stringify(job)],signal)).content,
    recordBoundAttempt:async(job,record,{signal}={})=>{await transaction(notify,'SELECT operations.record_bound_attempt($1::jsonb,$2,$3)',[JSON.stringify(job),record.key,record.digest],signal);},
    observeBoundNotification:async(job,record,{signal}={})=>{await transaction(notify,'SELECT operations.observe_bound_notification($1::jsonb,$2,$3,$4,$5)',[JSON.stringify(job),record.key,record.digest,record.status,record.messageId??null],signal);},
    finishBoundNotification:async(job,action,value,{signal}={})=>{await transaction(notify,'SELECT operations.finish_bound_notification($1::jsonb,$2,$3)',[JSON.stringify(job),action,value],signal);},
    boundNotificationStatus:async(id,enquiryId,{signal}={})=>(await transaction(notify,'SELECT operations.bound_notification_status($1,$2) AS status',[id,enquiryId],signal)).status,
    shutdown:()=>{
      if(shutdownPromise) return shutdownPromise;
      closing=true;
      shutdownPromise=(async()=>{
      let timeout;
      // Observe every close even after rejection/deadline; disposal is not proof
      // of closure. Only fulfilled pool.end promises permit successful shutdown.
      const closures=states.map(s=>Promise.resolve().then(()=>s.pool.end()));
      const force=new Promise((_,reject)=>{timeout=setTimeout(()=>{reject(new DatabaseFailure('shutdown-unconfirmed'));},shutdownMs);});
      try{await Promise.race([Promise.all(closures),force]);}
      catch{for(const s of states)for(const dispose of [...s.active])dispose();throw new DatabaseFailure('shutdown-unconfirmed');}
      finally{clearTimeout(timeout);}
      })();
      return shutdownPromise;
    }
  });
}

// Process factories expose only their capability and instantiate one pool.
// The combined factory remains for existing isolated tests, not runtime wiring.
export function createIngestionDriver(config,options={},dependencies){
  if(Object.keys(options).some(k=>!['acquisitionMs','statementMs','lockMs','operationMs','shutdownMs'].includes(k)))throw new DatabaseFailure();
  const d=createPostgresDriver({...options,ingestion:config,mode:'ingestion'},dependencies);
  return Object.freeze({consumeLimit:d.consumeLimit,ingestEnquiry:d.ingestEnquiry,reconcileEnquiry:d.reconcileEnquiry,shutdown:d.shutdown});
}
export function createNotificationDriver(config,options={},dependencies){
  if(Object.keys(options).some(k=>!['persistence','acquisitionMs','statementMs','lockMs','operationMs','shutdownMs'].includes(k))||(options.persistence!==undefined&&typeof options.persistence!=='boolean'))throw new DatabaseFailure();
  const {persistence=false,...limits}=options;
  const d=createPostgresDriver({...limits,notification:config,mode:'notification'},dependencies);
  if(persistence)return Object.freeze({claim:d.claimBoundNotification,readContent:d.readBoundNotification,recordAttempt:d.recordBoundAttempt,
    recordObservation:d.observeBoundNotification,finish:d.finishBoundNotification,status:d.boundNotificationStatus,shutdown:d.shutdown});
  return Object.freeze({claimNotification:d.claimNotification,acceptNotification:d.acceptNotification,retryNotification:d.retryNotification,shutdown:d.shutdown});
}
