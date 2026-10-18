import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,process.env.DATA_DIR||'data','sushi-clinic.sqlite');
if(!existsSync(source)){console.error('No database exists yet. Start the application first.');process.exit(1);}
const dir=resolve(root,'backups');mkdirSync(dir,{recursive:true});
const target=resolve(dir,`sushi-clinic-${new Date().toISOString().replaceAll(':','-').replaceAll('.','-')}.sqlite`);
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,target);console.log(`Backup saved: ${target}`);}finally{db.close();}
