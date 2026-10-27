// Test-only, loopback-only TLS proxy. No imports or calls from application code.
import net from 'node:net';
import tls from 'node:tls';
import {readFileSync} from 'node:fs';

export async function createCommitFaultProxy({mode,port,emit,skipCommits=0}) {
  if(!Number.isInteger(skipCommits)||skipCommits<0||skipCommits>1)throw new Error('INVALID_FAULT_CONFIGURATION');
  if(!['before-server-commit','after-server-commit'].includes(mode)||![15432,15433,15434].includes(port)) throw new Error('INVALID_FAULT_CONFIGURATION');
  const ca=readFileSync('/tmp/review-ca.crt');
  const context=tls.createSecureContext({key:readFileSync('/tmp/review-proxy.key'),cert:readFileSync('/tmp/review-proxy.crt')});
  const sockets=new Set();let connections=0,resolvePhase,rejectPhase,closed=false;
  const phase=new Promise((resolve,reject)=>{resolvePhase=resolve;rejectPhase=reject;});phase.catch(()=>{});
  const server=net.createServer(raw=>{
    if(++connections!==1){raw.destroy();rejectPhase(new Error('UNEXPECTED_PROXY_CONNECTION'));return;}
    const id=connections;const track=socket=>{
      sockets.add(socket);socket.on('error',()=>{if(!closed)rejectPhase(new Error('PROXY_TRANSPORT_FAILURE'));});
      socket.once('close',()=>sockets.delete(socket));return socket;
    };
    track(raw);raw.setTimeout(15000,()=>raw.destroy());
    let sslBytes=Buffer.alloc(0);
    const initial=chunk=>{
      sslBytes=Buffer.concat([sslBytes,chunk]);if(sslBytes.length<8)return;
      if(sslBytes.length!==8||sslBytes.readInt32BE(0)!==8||sslBytes.readInt32BE(4)!==80877103){raw.destroy();rejectPhase(new Error('INVALID_SSL_REQUEST'));return;}
      raw.removeListener('data',initial);raw.write('S');
      const front=track(new tls.TLSSocket(raw,{isServer:true,secureContext:context}));
      front.pause();
      const backRaw=track(net.connect({host:'127.0.0.1',port:5432}));
      backRaw.once('connect',()=>{const request=Buffer.alloc(8);request.writeInt32BE(8);request.writeInt32BE(80877103,4);backRaw.write(request);});
      backRaw.once('data',reply=>{
        if(reply.toString()!=='S'){rejectPhase(new Error('BACKEND_TLS_UNAVAILABLE'));backRaw.destroy();return;}
        const back=track(tls.connect({socket:backRaw,servername:'localhost',ca,rejectUnauthorized:true}));
        back.once('secureConnect',()=>{
          if(!back.authorized){rejectPhase(new Error('BACKEND_TLS_UNVERIFIED'));back.destroy();return;}
          emit({phase:'VERIFIED_TLS_TRANSPORT',connection:id});
          let startup=true,frontBytes=Buffer.alloc(0),backBytes=Buffer.alloc(0),commitForwarded=false,commitsSeen=0;
          // Frame headers are inspected; authentication/Bind payloads are not parsed or logged.
          // Only the fixed simple-query COMMIT marker is examined for phase control.
          front.on('data',chunk=>{
            frontBytes=Buffer.concat([frontBytes,chunk]);
            while(frontBytes.length>=(startup?4:5)) {
              const size=startup?frontBytes.readInt32BE(0):1+frontBytes.readInt32BE(1);
              if(size<4||size>65536){rejectPhase(new Error('FRAME_BOUND_EXCEEDED'));front.destroy();return;}
              if(frontBytes.length<size)break;
              const frame=frontBytes.subarray(0,size);frontBytes=frontBytes.subarray(size);
              const commit=!startup&&frame[0]===81&&size===12&&frame.subarray(5).equals(Buffer.from('COMMIT\0'));
              startup=false;
              if(commit&&++commitsSeen>skipCommits){
                emit({phase:'CLIENT_COMMIT_MARKER',connection:id});
                if(mode==='before-server-commit'){resolvePhase({phase:'COMMIT_NOT_FORWARDED',connection:id});return;}
                commitForwarded=true;back.write(frame);emit({phase:'COMMIT_FORWARDED',connection:id});
              }else back.write(frame);
            }
          });
          back.on('data',chunk=>{
            if(!commitForwarded){front.write(chunk);return;}
            // Suppress ALL post-COMMIT server bytes from reaching the client.
            backBytes=Buffer.concat([backBytes,chunk]);
            while(backBytes.length>=5){
              const size=1+backBytes.readInt32BE(1);
              if(size<5||size>65536){rejectPhase(new Error('FRAME_BOUND_EXCEEDED'));back.destroy();return;}
              if(backBytes.length<size)break;
              const frame=backBytes.subarray(0,size);backBytes=backBytes.subarray(size);
              if(frame[0]===67&&size===12&&frame.subarray(5).equals(Buffer.from('COMMIT\0'))){
                emit({phase:'SERVER_COMMIT_ACK_SUPPRESSED',connection:id});resolvePhase({phase:'SERVER_COMMIT_ACK_SUPPRESSED',connection:id});
              }
            }
          });
          front.resume();
        });
      });
    };
    raw.on('data',initial);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {phase,ca:readFileSync('/tmp/review-proxy.crt'),disconnect(){closed=true;for(const socket of sockets)socket.destroy();},
    async close(){closed=true;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
