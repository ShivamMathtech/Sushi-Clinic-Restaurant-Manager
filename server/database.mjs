import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {hashPassword} from './auth.mjs';
import {clock, localDate} from './validation.mjs';

export const DEFAULT_SETTINGS = {name:'Sushi Clinic', tagline:'A little care. A memorable table.', timezone:'Asia/Kolkata', open_time:'12:00', close_time:'23:00', default_duration:90, contact_phone:'+91 98765 43210'};
export function openDatabase(path, options = {}) {
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','host')),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS guests(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',vip INTEGER NOT NULL DEFAULT 0,allergies TEXT NOT NULL DEFAULT '',seating TEXT NOT NULL DEFAULT '',food TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS servers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,color TEXT NOT NULL DEFAULT '#4895cf',active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS dining_tables(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,section TEXT NOT NULL,capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 30),type TEXT NOT NULL DEFAULT 'Standard',server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS reservations(id INTEGER PRIMARY KEY,guest_id INTEGER NOT NULL REFERENCES guests(id),date TEXT NOT NULL,start_time TEXT NOT NULL,start_min INTEGER NOT NULL,duration INTEGER NOT NULL CHECK(duration BETWEEN 15 AND 360),covers INTEGER NOT NULL CHECK(covers BETWEEN 1 AND 30),table_id INTEGER REFERENCES dining_tables(id),server_id INTEGER REFERENCES servers(id),status TEXT NOT NULL CHECK(status IN ('reserved','arrived','seated','completed','cancelled','no_show','waitlisted')),origin TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS reservations_date_time ON reservations(date,start_min);
    CREATE INDEX IF NOT EXISTS reservations_table_slot ON reservations(table_id,date,status,start_min);
    CREATE INDEX IF NOT EXISTS reservations_guest ON reservations(guest_id,date);
    CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY,table_id INTEGER NOT NULL REFERENCES dining_tables(id),date TEXT NOT NULL,start_time TEXT NOT NULL,start_min INTEGER NOT NULL,duration INTEGER NOT NULL,reason TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS blocks_table_slot ON blocks(table_id,date,start_min);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,title TEXT NOT NULL,date TEXT NOT NULL,start_time TEXT NOT NULL,duration INTEGER NOT NULL,type TEXT NOT NULL,color TEXT NOT NULL,description TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,entity_id INTEGER,detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
  `);
  db.prepare('INSERT OR IGNORE INTO settings(id,value) VALUES(1,?)').run(JSON.stringify(DEFAULT_SETTINGS));
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    const password=options.adminPassword || 'SushiAdmin!2026';
    if(password.length<12) throw new Error('ADMIN_PASSWORD must have at least 12 characters.');
    if(options.demo===false && !options.adminPassword) throw new Error('Set ADMIN_PASSWORD before starting with SEED_DEMO=false.');
    db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run('Restaurant Admin',options.adminEmail || 'admin@sushiclinic.local',hashPassword(password),'admin');
    if(options.demo!==false) {
      db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run('Front Desk','host@sushiclinic.local',hashPassword('SushiHost!2026'),'host');
      seedDemo(db);
    }
  }
  return db;
}
function seedDemo(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const staff=[['Jaye Rowe','#6cbd78'],['Raymundo Salido','#4b9ad0'],['Angus Ogles','#8b6ab5'],['Fred Toan','#d69b58'],['Edgardo Woodyard','#d67aa5']];
    const insertServer=db.prepare('INSERT INTO servers(name,color) VALUES(?,?)');
    for(const s of staff)insertServer.run(...s);
    const tables=[['3A','Patio',4,'Window',1],['3B','Patio',2,'Standard',2],['3C','Patio',6,'Standard',3],['4A','Patio',4,'Window',1],['4B','Ground Floor',4,'Standard',2],['4C','Ground Floor',6,'VIP',3],['5A','Ground Floor',2,'Standard',4],['5B','Ground Floor',8,'VIP',5],['5C','Terrace',4,'Window',1],['6A','Terrace',6,'Standard',4],['6B','Terrace',2,'Standard',5],['6C','Terrace',4,'Window',2]];
    const insertTable=db.prepare('INSERT INTO dining_tables(name,section,capacity,type,server_id) VALUES(?,?,?,?,?)');
    for(const t of tables)insertTable.run(...t);
    const names=['Kate Mara','Sandra Bullock','Natalie Portman','Amy Adams','Arnold Schwarzenegger','Spencer Stallone','Dakota Johnson','Glen Eastwood','Scarlett Johansson','Mark Ruffalo','Felisa Oshiro','Emery Larios','Lavern Escobedo','Derle Manfre','Sheil Morlan','Brent Oram','Maya Kapoor','Arjun Mehta'];
    const insertGuest=db.prepare('INSERT INTO guests(name,phone,email,vip,allergies,seating,food,notes) VALUES(?,?,?,?,?,?,?,?)');
    for(let i=0;i<names.length;i++)insertGuest.run(names[i],`+91 90000 ${String(10000+i)}`,`guest${i+1}@example.com`,i%4===0?1:0,i===10?'Peanuts':i===3?'Shellfish':'',i%3===0?'Window, Quiet area':'Patio',i%2===0?'Sushi, Green tea':'Sashimi, Miso soup',i===10?'Prefers a quiet table. Confirm allergies before service.':'');
    const insert=db.prepare('INSERT INTO reservations(guest_id,date,start_time,start_min,duration,covers,table_id,server_id,status,origin,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const today=localDate();
    const rows=[[1,1020,3,1,'seated'],[2,1080,2,2,'arrived'],[3,1110,4,3,'reserved'],[4,1080,4,4,'reserved'],[5,1140,3,5,'reserved'],[6,1080,5,6,'reserved'],[7,1170,2,7,'reserved'],[8,1020,6,8,'seated'],[9,1140,3,9,'reserved'],[10,1200,5,10,'reserved'],[11,1080,2,11,'arrived'],[12,1230,4,12,'reserved']];
    for(const [g,start,covers,t,status] of rows)insert.run(g,today,clock(start),start,90,covers,t,tables[t-1][4],status,g%2?'phone':'online',g===1?'Anniversary dinner':'');
    for(let i=0;i<3;i++)insert.run(13+i,today,clock(1110+i*15),1110+i*15,90,i+2,null,null,'waitlisted','in_person','');
    for(let n=1;n<=6;n++) {
      for(let i=0;i<4;i++)insert.run(i===0?11:i+n,localDate('Asia/Kolkata',-n),clock(1080+i*30),1080+i*30,90,2+i%3,i+1,i+1,n===3&&i===2?'cancelled':n===4&&i===3?'no_show':'completed','phone','');
    }
    for(let n=1;n<=5;n++)for(let i=0;i<4;i++)insert.run(i===0?11:i+n,localDate('Asia/Kolkata',n),clock(1080+i*30),1080+i*30,90,2+i%3,i+1,i+1,'reserved','online','');
    db.prepare('INSERT INTO blocks(table_id,date,start_time,start_min,duration,reason) VALUES(?,?,?,?,?,?)').run(12,today,'16:00',960,120,'Table maintenance');
    const ev=db.prepare('INSERT INTO events(title,date,start_time,duration,type,color,description) VALUES(?,?,?,?,?,?,?)');
    for(const [title,offset,time,type,color,description] of [['Sunday sushi social',0,'17:00','Dining','#63b673','A relaxed evening with the chef’s seasonal selection.'],['Jazz on the terrace',3,'19:00','Entertainment','#539fd3','Live acoustic jazz in the terrace dining room.'],['Family night · kids menu',6,'18:00','Promotion','#d48ba3','A family-friendly menu and a warm welcome.'],['Omakase evening',10,'19:00','Dining','#8c73b4','An intimate chef-led tasting experience.'],['Private dining',14,'18:00','Private','#d5a261','Private event. Add table blocks separately to reserve the floor.']]) ev.run(title,localDate('Asia/Kolkata',offset),time,120,type,color,description);
    db.prepare('INSERT INTO audit(user_id,action,entity,detail) VALUES(1,?,?,?)').run('seeded','demo','Sample records created for a local demonstration.');
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
