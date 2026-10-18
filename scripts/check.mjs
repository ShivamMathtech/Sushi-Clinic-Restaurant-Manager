import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const dir of ['server','scripts'])for(const file of readdirSync(dir).filter(x=>x.endsWith('.mjs'))){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log('Server and script syntax checks passed.');
