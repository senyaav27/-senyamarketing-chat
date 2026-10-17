// Dedicated localhost CI database only. Never run against a production database.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {database,migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {deliverOne} from '../src/worker.js';
import {cfg} from './helpers.js';
const url=new URL(process.env.TEST_DATABASE_URL||'http://invalid');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/senya_chat_ci','Requires dedicated local senya_chat_ci database');
let db=database(url.href),server;
const token=randomBytes(32).toString('hex');
async function start(){server=createApp(db,cfg).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));}
async function request(route,body,headers={}){const r=await fetch('http://127.0.0.1:'+server.address().port+route,{method:body?'POST':'GET',headers:{origin:'https://senyamarketing.ru',authorization:'Bearer '+token,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json();}
try{
 await migrate(db);await migrate(db);await start();
 await request('/api/session',{page:'https://senyamarketing.ru/',utm:{utm_source:'ci'}});
 const body={text:'PostgreSQL integration',clientId:randomBytes(24).toString('hex')};
 await request('/api/messages',body);await request('/api/messages',body);
 let sent=0;await deliverOne(db,async()=>{sent++;return {message_id:70001};});assert.equal(sent,1);
 await request('/webhooks/telegram',{update_id:70001,message:{from:{id:12345},chat:{id:12345},reply_to_message:{message_id:70001},text:'Ответ через PostgreSQL'}},{'X-Telegram-Bot-Api-Secret-Token':cfg.webhookSecret});
 let result=await request('/api/messages');assert.equal(result.messages.length,2);assert.equal(result.messages[1].text,'Ответ через PostgreSQL');
 await new Promise(r=>server.close(r));await db.close();db=database(url.href);await start();
 result=await request('/api/messages');assert.equal(result.messages.length,2);
 console.log('PASS: real PostgreSQL migration, idempotency, durable outbox, webhook round trip, new pool/server restart');
}finally{if(server?.listening)await new Promise(r=>server.close(r));await db.close();}
