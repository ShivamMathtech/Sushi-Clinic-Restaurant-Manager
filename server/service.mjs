import {ApiError, requireValue as check, text, integer, id, choice, date, minutes, email, flag, ACTIVE, STATUSES, TRANSITIONS, localDate} from './validation.mjs';

const reservationQuery = `SELECT r.*,g.name AS guest_name,g.phone AS guest_phone,g.vip,g.allergies,t.name AS table_name,t.section,t.capacity,s.name AS server_name,s.color AS server_color FROM reservations r JOIN guests g ON g.id=r.guest_id LEFT JOIN dining_tables t ON t.id=r.table_id LEFT JOIN servers s ON s.id=r.server_id`;
export function createService(db) {
  const settings=()=>JSON.parse(db.prepare('SELECT value FROM settings WHERE id=1').get().value);
  function one(table, key, label = 'Record') {
    const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id(key));
    check(row,`${label} not found.`,404);return row;
  }
  function audit(user, action, entity, key, detail='') {
    db.prepare('INSERT INTO audit(user_id,action,entity,entity_id,detail) VALUES(?,?,?,?,?)').run(user.id,action,entity,key??null,detail);
  }
  function mutate(user,action,entity,key,operation) {
    db.exec('BEGIN IMMEDIATE');
    try {const result=operation();audit(user,action,entity,key||result?.id||null);db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  function tableList() {return db.prepare('SELECT t.*,s.name AS server_name,s.color AS server_color FROM dining_tables t LEFT JOIN servers s ON s.id=t.server_id ORDER BY t.section,t.name').all();}
  function guests() {return db.prepare(`SELECT g.*,COALESCE(SUM(r.status='completed'),0) AS visits,COUNT(r.id) AS reservation_count,MAX(CASE WHEN r.status='completed' THEN r.date END) AS last_visit FROM guests g LEFT JOIN reservations r ON r.guest_id=g.id GROUP BY g.id ORDER BY g.name COLLATE NOCASE`).all();}
  function reservations(day) {return db.prepare(`${reservationQuery} WHERE r.date=? ORDER BY r.start_min,r.id`).all(date(day));}
  function guestDetail(key) {
    return {...one('guests',key,'Guest'),reservations:db.prepare(`${reservationQuery} WHERE r.guest_id=? ORDER BY r.date DESC,r.start_min DESC`).all(id(key))};
  }
  function slot(input) {
    const day=date(input.date),start=minutes(input.start_time),duration=integer(input.duration,'Duration',15,360);
    const s=settings();
    check(start>=minutes(s.open_time)&&start+duration<=minutes(s.close_time),'The booking must fit within restaurant opening hours.');
    return {date:day,start_time:input.start_time,start_min:start,duration};
  }
  function unavailable(table, slot, exclude = 0) {
    const busy=db.prepare(`SELECT id FROM reservations WHERE table_id=? AND date=? AND status IN ('reserved','arrived','seated') AND id<>? AND start_min<? AND start_min+duration>? LIMIT 1`).get(table,slot.date,exclude,slot.start_min+slot.duration,slot.start_min);
    if(busy)return 'Already reserved during this time';
    const block=db.prepare('SELECT reason FROM blocks WHERE table_id=? AND date=? AND start_min<? AND start_min+duration>? LIMIT 1').get(table,slot.date,slot.start_min+slot.duration,slot.start_min);
    return block ? `Blocked: ${block.reason}` : '';
  }
  function availability(input) {
    const desired=slot(input),covers=integer(input.covers,'Covers',1,30),exclude=input.exclude ? id(input.exclude) : 0;
    return tableList().filter(t=>t.active).map(t=>{
      const reason=t.capacity<covers?'Too small for this party':unavailable(t.id,desired,exclude);
      return {...t,available:!reason,reason};
    });
  }
  function saveGuest(user,input,key) {
    const old=key?one('guests',key,'Guest'):{};
    const b={...old,...input};
    const row={name:text(b.name,'Guest name',100,true),phone:text(b.phone??'','Phone',35),email:email(b.email),vip:flag(b.vip??false),allergies:text(b.allergies??'','Allergies',500),seating:text(b.seating??'','Seating preferences',300),food:text(b.food??'','Food preferences',300),notes:text(b.notes??'','Notes',2000)};
    check(!row.phone||/^[+()\d\s.\-]{7,35}$/.test(row.phone),'Enter a valid phone number.');
    return mutate(user,key?'updated':'created','guest',key,()=>{
      const cols=Object.keys(row);
      if(key)db.prepare(`UPDATE guests SET ${cols.map(x=>`${x}=?`).join(',')} WHERE id=?`).run(...Object.values(row),id(key));
      else key=Number(db.prepare(`INSERT INTO guests(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...Object.values(row)).lastInsertRowid);
      return one('guests',key);
    });
  }
  function saveReservation(user,input,key) {
    return mutate(user,key?'updated':'created','reservation',key,()=>{
      const old=key?one('reservations',key,'Reservation'):null;
      if(old)check(integer(input.version,'Version',1,2147483647)===old.version,'This reservation was changed by someone else. Reload before saving.',409);
      const b={...old,...input};
      const status=choice(b.status??'reserved',STATUSES,'status');
      if(old) {
        check(status===old.status||TRANSITIONS[old.status].includes(status),'That status change is not allowed.',409);
        check(!['completed','cancelled','no_show'].includes(old.status),'Closed reservations cannot be edited. Create a new booking.',409);
      } else check(['reserved','waitlisted','arrived','seated'].includes(status),'New bookings must be reserved, waitlisted, arrived, or seated.');
      const closingUnchanged=old&&['completed','cancelled','no_show'].includes(status)&&b.date===old.date&&b.start_time===old.start_time&&Number(b.duration)===old.duration;
      const desired=closingUnchanged?{date:old.date,start_time:old.start_time,start_min:old.start_min,duration:old.duration}:slot(b);
      const covers=integer(b.covers,'Covers',1,30),guest_id=id(b.guest_id,'Guest');
      one('guests',guest_id,'Guest');
      let table_id=b.table_id ? id(b.table_id,'Table') : null;
      let server_id=b.server_id ? id(b.server_id,'Server') : null;
      if(status==='waitlisted')table_id=null;
      if(ACTIVE.includes(status)) {
        check(table_id,'Choose an available table, or add the party to the waitlist.');
        const t=one('dining_tables',table_id,'Table');
        check(t.active,'This table is inactive.');
        check(t.capacity>=covers,`Table ${t.name} only seats ${t.capacity} guests.`,409);
        const reason=unavailable(table_id,desired,old?.id||0);check(!reason,reason,409);
        if(!server_id)server_id=t.server_id;
      }
      if(server_id&&ACTIVE.includes(status))check(one('servers',server_id,'Server').active,'This server is inactive.');
      const row={guest_id,...desired,covers,table_id,server_id,status,origin:choice(b.origin??'phone',['phone','online','in_person'],'origin'),notes:text(b.notes??'','Notes',2000)};
      const cols=Object.keys(row);
      if(old)db.prepare(`UPDATE reservations SET ${cols.map(x=>`${x}=?`).join(',')},version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...Object.values(row),old.id);
      else key=Number(db.prepare(`INSERT INTO reservations(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...Object.values(row)).lastInsertRowid);
      return db.prepare(`${reservationQuery} WHERE r.id=?`).get(id(key));
    });
  }
  function saveTable(user,input,key) {
    const old=key?one('dining_tables',key,'Table'):{};const b={...old,...input};
    const row={name:text(b.name,'Table name',15,true),section:text(b.section,'Section',50,true),capacity:integer(b.capacity,'Capacity',1,30),type:choice(b.type??'Standard',['Standard','Window','VIP'],'table type'),server_id:b.server_id?id(b.server_id):null,active:flag(b.active??true)};
    if(row.server_id)check(one('servers',row.server_id,'Server').active,'Choose an active server.');
    check(!db.prepare('SELECT id FROM dining_tables WHERE name=? AND id<>?').get(row.name,key||0),'A table with this name already exists.',409);
    if(key) {
      const pending=db.prepare(`SELECT MAX(covers) AS covers, COUNT(*) AS count FROM reservations WHERE table_id=? AND date>=? AND status IN ('reserved','arrived','seated')`).get(id(key),localDate(settings().timezone));
      check(!pending.count||row.active,'Reassign upcoming reservations before disabling this table.',409);
      check(!pending.count||row.capacity>=pending.covers,'The new capacity is smaller than an upcoming party.',409);
    }
    return mutate(user,key?'updated':'created','table',key,()=>{
      const cols=Object.keys(row);
      if(key)db.prepare(`UPDATE dining_tables SET ${cols.map(x=>`${x}=?`).join(',')} WHERE id=?`).run(...Object.values(row),id(key));
      else key=Number(db.prepare(`INSERT INTO dining_tables(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...Object.values(row)).lastInsertRowid);
      return one('dining_tables',key);
    });
  }
  function saveServer(user,input,key) {
    const old=key?one('servers',key,'Server'):{};const b={...old,...input};
    const name=text(b.name,'Server name',100,true),color=b.color||'#4895cf',active=flag(b.active??true);
    check(/^#[0-9a-f]{6}$/i.test(color),'Choose a valid color.');
    if(key&&!active)check(!db.prepare(`SELECT id FROM reservations WHERE server_id=? AND date>=? AND status IN ('reserved','arrived','seated') LIMIT 1`).get(id(key),localDate(settings().timezone)),'Reassign upcoming reservations before disabling this server.',409);
    return mutate(user,key?'updated':'created','server',key,()=>{
      if(key) {db.prepare('UPDATE servers SET name=?,color=?,active=? WHERE id=?').run(name,color,active,id(key));if(!active)db.prepare('UPDATE dining_tables SET server_id=NULL WHERE server_id=?').run(id(key));}
      else key=Number(db.prepare('INSERT INTO servers(name,color,active) VALUES(?,?,?)').run(name,color,active).lastInsertRowid);
      return one('servers',key);
    });
  }
  function saveEvent(user,input,key) {
    const old=key?one('events',key,'Event'):{};const b={...old,...input};
    const row={title:text(b.title,'Event title',140,true),date:date(b.date),start_time:b.start_time,duration:integer(b.duration,'Duration',15,720),type:choice(b.type,['Dining','Entertainment','Promotion','Private'],'event type'),color:b.color||'#539fd3',description:text(b.description??'','Description',3000)};
    check(minutes(row.start_time)+row.duration<=1440,'The event must finish on the same day.');
    check(/^#[0-9a-f]{6}$/i.test(row.color),'Choose a valid color.');
    return mutate(user,key?'updated':'created','event',key,()=>{
      const cols=Object.keys(row);
      if(key)db.prepare(`UPDATE events SET ${cols.map(x=>`${x}=?`).join(',')} WHERE id=?`).run(...Object.values(row),id(key));
      else key=Number(db.prepare(`INSERT INTO events(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...Object.values(row)).lastInsertRowid);
      return one('events',key);
    });
  }
  function createBlock(user,b) {
    return mutate(user,'created','block',null,()=>{
      const t=one('dining_tables',b.table_id,'Table');check(t.active,'This table is inactive.');
      const s=slot(b),reason=text(b.reason,'Reason',150,true),conflict=unavailable(t.id,s);
      check(!conflict,conflict,409);
      const r=db.prepare('INSERT INTO blocks(table_id,date,start_time,start_min,duration,reason) VALUES(?,?,?,?,?,?)').run(t.id,s.date,s.start_time,s.start_min,s.duration,reason);
      return one('blocks',Number(r.lastInsertRowid));
    });
  }
  function remove(user,entity,key) {
    const tables={guest:'guests',block:'blocks',event:'events'};
    check(tables[entity],'Unsupported deletion.');one(tables[entity],key);
    if(entity==='guest')check(!db.prepare('SELECT id FROM reservations WHERE guest_id=? LIMIT 1').get(id(key)),'This guest has reservation history and cannot be deleted.',409);
    return mutate(user,'deleted',entity,id(key),()=>{db.prepare(`DELETE FROM ${tables[entity]} WHERE id=?`).run(id(key));return {ok:true};});
  }
  function saveSettings(user,b) {
    const row={name:text(b.name,'Restaurant name',80,true),tagline:text(b.tagline??'','Tagline',150),timezone:text(b.timezone,'Time zone',70,true),open_time:b.open_time,close_time:b.close_time,default_duration:integer(b.default_duration,'Default duration',15,360),contact_phone:text(b.contact_phone??'','Contact phone',35)};
    check(minutes(row.close_time)>minutes(row.open_time),'Closing time must be after opening time. Overnight services are not supported.');
    check(row.default_duration<=minutes(row.close_time)-minutes(row.open_time),'Default duration must fit within opening hours.');
    try{new Intl.DateTimeFormat('en',{timeZone:row.timezone}).format();}catch{throw new ApiError(400,'Use a valid IANA time zone, such as Asia/Kolkata.');}
    return mutate(user,'updated','settings',1,()=>{db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(row));return row;});
  }
  function updateUser(actor,key,b) {
    const target=one('users',key,'User');const active=flag(b.active);
    check(target.id!==actor.id,'You cannot disable your own account.');
    if(!active&&target.role==='admin')check(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1").get().n>1,'At least one active administrator is required.');
    return mutate(actor,'updated','user',target.id,()=>{db.prepare('UPDATE users SET active=? WHERE id=?').run(active,target.id);if(!active)db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);return {ok:true};});
  }
  function bootstrap(input) {
    const s=settings(),day=date(input.date||localDate(s.timezone));
    const from=date(input.from||`${day.slice(0,7)}-01`),to=date(input.to||`${day.slice(0,7)}-31`.replace(/31$/,String(new Date(Number(day.slice(0,4)),Number(day.slice(5,7)),0).getDate())));
    check(to>=from&&new Date(to)-new Date(from)<=370*86400000,'Invalid date range.');
    const rows=reservations(day);
    return {settings:s,today:localDate(s.timezone),date:day,guests:guests(),tables:tableList(),servers:db.prepare('SELECT * FROM servers ORDER BY name').all(),reservations:rows,blocks:db.prepare('SELECT b.*,t.name AS table_name FROM blocks b JOIN dining_tables t ON t.id=b.table_id WHERE b.date=?').all(day),events:db.prepare('SELECT * FROM events WHERE date>=? AND date<=? ORDER BY date,start_time').all(from,to),summary:{bookings:rows.filter(r=>r.status!=='waitlisted'&&r.status!=='cancelled'&&r.status!=='no_show').length,covers:rows.filter(r=>ACTIVE.includes(r.status)||r.status==='completed').reduce((n,r)=>n+r.covers,0),seated:rows.filter(r=>r.status==='seated').reduce((n,r)=>n+r.covers,0),waitlist:rows.filter(r=>r.status==='waitlisted').length}};
  }
  function exportReservations(from,to) {
    date(from);date(to);check(to>=from&&new Date(to)-new Date(from)<=366*86400000,'Export at most 366 days at a time.');
    const rows=db.prepare(`${reservationQuery} WHERE r.date>=? AND r.date<=? ORDER BY r.date,r.start_min`).all(from,to);
    const fields=['id','date','start_time','duration','guest_name','guest_phone','covers','table_name','section','server_name','status','origin','notes'];
    const cell=x=>`"${String(x??'').replace(/^[=+@\-\t\r]/,s=>`'${s}`).replaceAll('"','""')}"`;
    return '\ufeff'+[fields.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n');
  }
  return {settings,one,audit,bootstrap,guests,guestDetail,reservations,availability,saveGuest,saveReservation,saveTable,saveServer,saveEvent,createBlock,remove,saveSettings,updateUser,exportReservations};
}
