import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './helpers.mjs';
import {openDatabase} from '../server/database.mjs';

test('HTTP API protects and persists restaurant workflows',async t=>{
  const f=await fixture();t.after(()=>f.close());
  const admin=f.client(),host=f.client(),anonymous=f.client();
  let guest,table1,table2,server,booking,waiting;
  const day='2030-05-12';
  const create=(path,body)=>admin.request('/api/'+path,{method:'POST',body});
  const patch=(path,body)=>admin.request('/api/'+path,{method:'PATCH',body});
  await t.test('anonymous requests are rejected; health and packaged frontend are served',async()=>{
    assert.equal((await anonymous.request('/api/bootstrap')).status,401);
    const health=await anonymous.request('/api/health');assert.equal(health.data.ok,true);
    const html=await anonymous.request('/',{raw:true});assert.equal(html.status,200);assert.match(html.data,/app.js/);assert.equal(html.headers.get('x-frame-options'),'DENY');
    assert.equal((await anonymous.request('/server/database.mjs',{raw:true})).status,404);
  });
  await t.test('login validates credentials and uses HttpOnly SameSite cookies',async()=>{
    assert.equal((await anonymous.request('/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'wrong'}})).status,401);
    const r=await admin.request('/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'Admin Test!2026'}});assert.equal(r.status,200);assert.equal(r.data.user.role,'admin');assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);assert.equal((await admin.request('/api/auth/session')).data.user.email,'admin@test.local');
  });
  await t.test('cross-origin and missing-CSRF writes are rejected',async()=>{
    assert.equal((await create('guests',{name:'A'})).status,201);
    assert.equal((await admin.request('/api/guests',{method:'POST',body:{name:'B'},headers:{'X-CSRF-Token':''}})).status,403);
    assert.equal((await admin.request('/api/guests',{method:'POST',body:{name:'B'},headers:{origin:'https://another-site.example'}})).status,403);
    assert.equal((await admin.request('/api/guests',{method:'POST',body:{name:'B'},headers:{'sec-fetch-site':'cross-site'}})).status,403);
  });
  await t.test('administrator creates host login and access rules are enforced',async()=>{
    assert.equal((await create('users',{name:'Host User',email:'host@test.local',password:'Host Test!2026',role:'host'})).status,201);
    assert.equal((await host.request('/api/auth/login',{method:'POST',body:{email:'host@test.local',password:'Host Test!2026'}})).status,200);
    assert.equal((await host.request('/api/settings',{method:'PUT',body:{}})).status,403);
    assert.equal((await host.request('/api/users')).status,403);
    assert.equal((await host.request('/api/events',{method:'POST',body:{}})).status,403);
    assert.equal((await host.request('/api/export/data')).status,403);
  });
  await t.test('guest, server and table creation validate input',async()=>{
    guest=(await create('guests',{name:'Test Guest',phone:'+91 99887 76655',email:'test@example.com',vip:true,allergies:'Peanuts'})).data;
    assert.equal(guest.vip,1);
    assert.equal((await create('guests',{name:'Test',email:'bad'})).status,400);
    server=(await create('servers',{name:'Jamie Server',color:'#4499bb'})).data;
    table1=(await create('tables',{name:'T1',section:'Patio',capacity:4,server_id:server.id})).data;
    table2=(await create('tables',{name:'T2',section:'Patio',capacity:6})).data;
    assert.equal((await create('tables',{name:'T1',section:'Patio',capacity:4})).status,409);
    assert.equal((await create('tables',{name:'Bad',section:'Patio',capacity:0})).status,400);
  });
  const bookingBody=(overrides={})=>({guest_id:guest.id,date:day,start_time:'18:00',duration:90,covers:3,table_id:table1.id,status:'reserved',...overrides});
  await t.test('reservation is stored with server assignment and guest profile joins',async()=>{
    const r=await create('reservations',bookingBody());assert.equal(r.status,201);booking=r.data;assert.equal(booking.server_id,server.id);assert.equal(booking.guest_name,'Test Guest');assert.equal(booking.version,1);
  });
  await t.test('overlapping bookings are rejected; boundary-adjacent bookings are accepted',async()=>{
    assert.equal((await create('reservations',bookingBody({start_time:'19:00'}))).status,409);
    assert.equal((await create('reservations',bookingBody({start_time:'19:30'}))).status,201);
  });
  await t.test('availability applies capacity, date, duration, and edit exclusion',async()=>{
    const q=`date=${day}&start_time=18:00&duration=90&covers=3`;
    const a=(await admin.request(`/api/availability?${q}`)).data;
    assert.equal(a.find(x=>x.id===table1.id).available,false);assert.equal(a.find(x=>x.id===table2.id).available,true);
    const b=(await admin.request(`/api/availability?${q}&exclude=${booking.id}`)).data;assert.equal(b.find(x=>x.id===table1.id).available,true);
  });
  await t.test('booking validation rejects invalid date, time, duration, covers and hours',async()=>{
    for(const overrides of [{date:'2030-02-30'},{date:'bad'},{start_time:'24:00'},{start_time:'22:30'},{start_time:'10:00'},{duration:0},{covers:-1},{covers:7,table_id:table2.id},{guest_id:9999}]){const r=await create('reservations',bookingBody(overrides));assert.ok(r.status>=400&&r.status<500,JSON.stringify(overrides));}
  });
  await t.test('simultaneous requests cannot double-book a table',async()=>{
    const r=await Promise.all(Array.from({length:8},()=>create('reservations',bookingBody({table_id:table2.id}))));
    assert.equal(r.filter(x=>x.status===201).length,1);assert.equal(r.filter(x=>x.status===409).length,7);
  });
  await t.test('stale reservation updates are rejected',async()=>{
    const update=await patch(`reservations/${booking.id}`,{version:booking.version,notes:'Window requested'});assert.equal(update.status,200);booking=update.data;
    assert.equal((await patch(`reservations/${booking.id}`,{version:1,notes:'stale update'})).status,409);
    assert.equal((await patch(`reservations/${booking.id}`,{notes:'no version'})).status,400);
  });
  await t.test('waitlist assignment, seating, completion and terminal status rules work',async()=>{
    waiting=(await create('reservations',bookingBody({status:'waitlisted',table_id:null,start_time:'21:00'}))).data;assert.equal(waiting.table_id,null);
    waiting=(await patch(`reservations/${waiting.id}`,{version:waiting.version,status:'reserved',table_id:table1.id})).data;assert.equal(waiting.status,'reserved');
    assert.equal((await patch(`reservations/${waiting.id}`,{version:waiting.version,status:'completed'})).status,409);
    waiting=(await patch(`reservations/${waiting.id}`,{version:waiting.version,status:'arrived'})).data;
    waiting=(await patch(`reservations/${waiting.id}`,{version:waiting.version,status:'seated'})).data;
    waiting=(await patch(`reservations/${waiting.id}`,{version:waiting.version,status:'completed'})).data;assert.equal(waiting.status,'completed');
    assert.equal((await patch(`reservations/${waiting.id}`,{version:waiting.version,status:'reserved'})).status,409);
  });
  await t.test('closed visits release the slot and appear in guest history',async()=>{
    assert.equal((await create('reservations',bookingBody({start_time:'21:00'}))).status,201);
    const g=(await admin.request(`/api/guests/${guest.id}`)).data;assert.ok(g.reservations.some(r=>r.status==='completed'));
    assert.equal((await admin.request(`/api/guests/${guest.id}`,{method:'DELETE'})).status,409);
  });
  await t.test('table blocks conflict with bookings and protect availability',async()=>{
    assert.equal((await create('blocks',{table_id:table1.id,date:day,start_time:'18:00',duration:30,reason:'Maintenance'})).status,409);
    const block=(await create('blocks',{table_id:table1.id,date:day,start_time:'12:00',duration:120,reason:'Maintenance'})).data;assert.ok(block.id);
    assert.equal((await create('reservations',bookingBody({start_time:'12:30'}))).status,409);
    assert.equal((await host.request(`/api/blocks/${block.id}`,{method:'DELETE'})).status,200);
    assert.equal((await create('reservations',bookingBody({start_time:'12:30'}))).status,201);
  });
  await t.test('pending reservations protect table capacity and staff assignments',async()=>{
    assert.equal((await patch(`tables/${table1.id}`,{capacity:2})).status,409);
    assert.equal((await patch(`tables/${table1.id}`,{active:false})).status,409);
    assert.equal((await patch(`servers/${server.id}`,{active:false})).status,409);
  });
  await t.test('events support create, edit and delete',async()=>{
    let r=await create('events',{title:'Jazz night',date:day,start_time:'18:00',duration:120,type:'Entertainment',color:'#4599bb'});assert.equal(r.status,201);const eid=r.data.id;
    r=await patch(`events/${eid}`,{title:'Acoustic jazz'});assert.equal(r.data.title,'Acoustic jazz');
    assert.equal((await admin.request(`/api/events/${eid}`,{method:'DELETE'})).status,200);
  });
  await t.test('settings reject invalid time zones and overnight hours',async()=>{
    const b=(await admin.request('/api/bootstrap?date='+day)).data;assert.ok(b.summary.bookings>0);
    assert.equal((await admin.request('/api/settings',{method:'PUT',body:{...b.settings,timezone:'Unknown/Nowhere'}})).status,400);
    assert.equal((await admin.request('/api/settings',{method:'PUT',body:{...b.settings,open_time:'23:00',close_time:'12:00'}})).status,400);
    assert.equal((await admin.request('/api/settings',{method:'PUT',body:{...b.settings,name:'Test Restaurant'}})).status,200);
  });
  await t.test('CSV escapes spreadsheet formulas; JSON omits credentials; audit is populated',async()=>{
    await patch(`guests/${guest.id}`,{name:'=HYPERLINK("bad")'});
    const csv=await admin.request(`/api/export/reservations?from=${day}&to=${day}`,{raw:true});assert.equal(csv.status,200);assert.match(csv.data,/'=HYPERLINK/);assert.match(csv.headers.get('content-disposition'),/attachment/);
    const dump=await admin.request('/api/export/data');assert.ok(dump.data.reservations.length);assert.equal(dump.data.users,undefined);assert.doesNotMatch(JSON.stringify(dump.data),/password_hash|csrf|session_id/);
    const log=await admin.request('/api/audit');assert.ok(log.data.some(a=>a.entity==='reservation'));
  });
  await t.test('existing bookings can be closed after service hours change',async()=>{
    const before=(await admin.request('/api/bootstrap?date='+day)).data.settings;
    await admin.request('/api/settings',{method:'PUT',body:{...before,open_time:'20:00'}});
    const result=await patch(`reservations/${booking.id}`,{version:booking.version,status:'cancelled'});
    assert.equal(result.status,200);assert.equal(result.data.status,'cancelled');
    await admin.request('/api/settings',{method:'PUT',body:before});
  });
  await t.test('SQL-like input is stored as data and XSS is served only as JSON',async()=>{
    const name=`<script>alert(1)</script>'); DROP TABLE guests; --`;
    const r=await create('guests',{name});assert.equal(r.status,201);assert.equal(r.data.name,name);
    assert.ok((await admin.request('/api/guests')).data.length>1);
    assert.equal((await admin.request(`/api/guests/${r.data.id}`,{method:'DELETE'})).status,200);
  });
  await t.test('password changes support spaces and revoke other sessions',async()=>{
    const other=f.client();await other.request('/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'Admin Test!2026'}});
    const pw=' New password!2026 ';
    assert.equal((await admin.request('/api/auth/password',{method:'POST',body:{current_password:'Admin Test!2026',new_password:pw}})).status,200);
    assert.equal((await other.request('/api/auth/session')).status,401);
    assert.equal((await other.request('/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:pw}})).status,200);
    assert.equal((await other.request('/api/auth/logout',{method:'POST',body:{}})).status,200);
    assert.equal((await other.request('/api/auth/session')).status,401);
  });
  await t.test('users cannot disable themselves; disabling a host ends its session',async()=>{
    assert.equal((await patch('users/1',{active:false})).status,400);
    const u=(await admin.request('/api/users')).data.find(u=>u.role==='host');
    assert.equal((await patch(`users/${u.id}`,{active:false})).status,200);
    assert.equal((await host.request('/api/bootstrap')).status,401);
  });
});

test('SQLite records survive a close and reopen; demo seed is idempotent',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sushi-persistence-'));const path=join(dir,'app.sqlite');
  try{let db=openDatabase(path);const count=db.prepare('SELECT COUNT(*) AS n FROM guests').get().n;db.prepare('UPDATE guests SET notes=? WHERE id=1').run('Persist this note');db.close();db=openDatabase(path);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM guests').get().n,count);assert.equal(db.prepare('SELECT notes FROM guests WHERE id=1').get().notes,'Persist this note');db.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
