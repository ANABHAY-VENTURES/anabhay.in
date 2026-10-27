// Development transport only. No environment loader, database credentials or outbound IO.
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {handleEnquiry} from './http.mjs';
import {requestFingerprint,postgresEnquiryCapabilities} from './capabilities.mjs';

export const developmentOrigin='https://local-enquiry.example.invalid';
// Same capability interface as createIngestionProcess; this fake proves no durability.
export function createSyntheticIngestionProcess({limit=20,maxRecords=100}={}) {
 if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>1000)throw new Error('Invalid development configuration.');
 const records=new Map();let attempts=0,closed=false;
 const driver={
  async consumeLimit(){if(closed)throw new Error('Unavailable');return ++attempts<=limit;},
  async ingestEnquiry({key,hash}){
   if(closed)throw new Error('Unavailable');
   const old=records.get(key);
   if(old)return old.hash===hash?{...old.receipt,replayed:true}:{conflict:true};
   if(records.size>=maxRecords)throw new Error('Unavailable');
   const receipt={persisted:true,enquiryId:randomUUID(),notification:'queued'};
   // Store hashes/receipts only, never the submitted contact fields.
   records.set(key,{hash,receipt});return receipt;
  }
 };
 return Object.freeze({capabilities:Object.freeze(postgresEnquiryCapabilities(driver)),async shutdown(){closed=true;records.clear();}});
}

export async function startLocalEnquiry(options={}) {
 const {developmentOptIn=false,host='127.0.0.1',port=0,requestDeadlineMs=10000,bodyDeadlineMs=5000,createProcess=createSyntheticIngestionProcess,rateLimitSecret}=options;
 const allowed=['developmentOptIn','host','port','requestDeadlineMs','bodyDeadlineMs','createProcess','rateLimitSecret'];
 if(Object.keys(options).some(k=>!allowed.includes(k))||developmentOptIn!==true||host!=='127.0.0.1'||!Number.isInteger(port)||port<0||port>65535||![requestDeadlineMs,bodyDeadlineMs].every(n=>Number.isInteger(n)&&n>=1&&n<=15000)||bodyDeadlineMs>requestDeadlineMs||typeof createProcess!=='function')throw new Error('Local development opt-in and safe configuration required.');
 // Injection is trusted local code only: never supplied by a request or environment.
 // A real createIngestionProcess may provide this interface only in separately approved tests.
 if(rateLimitSecret!==undefined&&(typeof rateLimitSecret!=='string'||rateLimitSecret.length<32))throw new Error('Invalid development configuration.');
 const process=await createProcess();
 if(typeof process?.capabilities?.abuseCheck!=='function'||typeof process?.capabilities?.persist!=='function'||typeof process?.shutdown!=='function')throw new Error('Ingestion unavailable.');
 const secret=rateLimitSecret??randomBytes(32).toString('hex');let closing;
 const server=createServer({maxHeaderSize:8192},async(req,res)=>{
  let timer,cleanup=()=>{};
  const reply=(status,message)=>{
   if(res.writableEnded||res.destroyed)return;
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Connection':'close'});
   res.end(JSON.stringify({error:message}));
  };
  res.on('finish',()=>{clearTimeout(timer);cleanup();req.destroy();});
  res.on('close',()=>{clearTimeout(timer);cleanup();});
  timer=setTimeout(()=>reply(503,'Service unavailable.'),requestDeadlineMs);
  try {
   if(req.socket.remoteAddress!=='127.0.0.1')return reply(503,'Service unavailable.');
   if(req.headers.host!==`127.0.0.1:${server.address().port}`)return reply(403,'Access denied.');
   if(req.url!=='/enquiries')return reply(404,'Not found.');
   const headers=new Headers();
   for(let i=0;i<req.rawHeaders.length;i+=2)headers.append(req.rawHeaders[i],req.rawHeaders[i+1]);
   let body;
   if(!['GET','HEAD'].includes(req.method))body=new ReadableStream({
    start(controller){
     const data=chunk=>{req.pause();controller.enqueue(new Uint8Array(chunk));};
     const end=()=>{cleanup();controller.close();};
     const error=()=>{cleanup();controller.error(new Error('Body unavailable.'));};
     cleanup=()=>{req.pause();req.off('data',data);req.off('end',end);req.off('error',error);req.off('aborted',error);};
     req.pause();req.on('data',data);req.once('end',end);req.once('error',error);req.once('aborted',error);
    },pull(){req.resume();},cancel(){cleanup();}
   },{highWaterMark:0});
   const request=new Request(`http://127.0.0.1:${server.address().port}/enquiries`,{method:req.method,headers,...(body?{body,duplex:'half'}:{})});
   const dependencies={
    abuseCheck:identity=>process.capabilities.abuseCheck(identity),
    persist:input=>{
     // Do not begin persistence after a deadline/disconnect while rate accounting
     // was pending. Already-started persistence can still have an unknown outcome.
     if(res.writableEnded||res.destroyed)throw new Error('Unavailable');
     return process.capabilities.persist(input);
    }
   };
   const response=await handleEnquiry(request,{enabled:true,allowedOrigins:[developmentOrigin],dependencies,bodyDeadlineMs,fingerprint:requestFingerprint(req.socket.remoteAddress,secret)});
   if(res.writableEnded||res.destroyed)return; // A deadline is not rollback proof.
   res.writeHead(response.status,{...Object.fromEntries(response.headers),Connection:'close'});res.end(await response.text());
  }catch{reply(503,'Service unavailable.');}
 });
 server.maxConnections=16;server.headersTimeout=5000;server.requestTimeout=15000;server.keepAliveTimeout=1000;
 server.on('clientError',(_error,socket)=>socket.destroy());
 try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host,port},()=>{server.off('error',reject);resolve();});});}
 catch{await process.shutdown();throw new Error('Local listener unavailable.');}
 return Object.freeze({address:server.address(),close(){
  if(!closing)closing=(async()=>{await new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();});await process.shutdown();})();
  return closing;
 }});
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='--development-synthetic'){
  console.error('Disabled. Use --development-synthetic for memory-only loopback testing.');process.exitCode=1;
 }else{
  try{
   const local=await startLocalEnquiry({developmentOptIn:true,port:8787});
   console.log('Synthetic only: http://127.0.0.1:8787/enquiries (memory receipts; no database or notifications).');
   const stop=()=>{local.close().catch(()=>{process.exitCode=1;});};
   process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }catch{console.error('Local development endpoint unavailable.');process.exitCode=1;}
 }
}
