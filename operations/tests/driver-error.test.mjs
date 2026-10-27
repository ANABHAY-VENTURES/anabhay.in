import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPostgresDriver} from '../server/postgres.mjs';
import {validateRequest} from '../server/enquiry.mjs';

test('checked-out connection error is observed and lost COMMIT remains unknown',async()=>{
  const connections=[];
  class Pool extends EventEmitter {
    async connect(){
      const client=new EventEmitter();connections.push(client);
      client.release=destroy=>{client.destroyed=destroy===true;if(destroy)client.emit('end');};
      client.query=async sql=>{
        if(sql.startsWith('SELECT current_user'))return {rows:[{privileged:false,extra:false,capability:true}]};
        if(sql.includes('ingest_enquiry'))return {rows:[{receipt:{persisted:true}}]};
        if(sql==='COMMIT'){
          const error=new Error('synthetic connection loss');client.emit('error',error);throw error;
        }
        return {rows:[]};
      };return client;
    }
    async end(){}
  }
  const config={host:'test.example.invalid',expectedHost:'test.example.invalid',database:'synthetic',user:'synthetic_login',password:'synthetic-only',ssl:{rejectUnauthorized:true}};
  const driver=createPostgresDriver({ingestion:config,notification:{...config,user:'synthetic_worker'}},{Pool});
  const request=validateRequest(JSON.stringify({schemaVersion:1,fullName:'Synthetic QA',workEmail:'qa@example.invalid',phone:null,organisation:null,projectType:'other',description:'synthetic test enquiry',preferredContactMethod:'email',consent:true,consentVersion:'enquiry-v1',source:'company-website'}),'50000000-0000-4000-8000-000000000001');
  await assert.rejects(driver.ingestEnquiry(request),error=>error.outcome==='unknown');
  assert.equal(connections[0].destroyed,true);assert.equal(connections[0].listenerCount('error'),0);
  await driver.shutdown();
});
