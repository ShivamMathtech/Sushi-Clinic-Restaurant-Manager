import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';

test('distribution starts without node_modules and produces a restorable backup',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sushi-distribution-'));
  let child;
  try{
    for(const file of ['server','dist','scripts/backup.mjs','package.json'])await cp(resolve(file),join(dir,file),{recursive:true});
    assert.equal(existsSync(join(dir,'node_modules')),false);
    const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
    child=spawn(process.execPath,['--env-file-if-exists=.env','server/main.mjs'],{cwd:dir,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:'./data',SEED_DEMO:'false',ADMIN_EMAIL:'clean@test.local',ADMIN_PASSWORD:'Clean Startup!2026'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{clearInterval(poll);reject(new Error('Startup timed out: '+output));},10000);
      const poll=setInterval(()=>{if(output.includes('Sushi Clinic is ready')){clearInterval(poll);clearTimeout(timeout);resolve();}},25);
      child.once('error',e=>{clearInterval(poll);clearTimeout(timeout);reject(e);});
      child.once('exit',code=>{if(code){clearInterval(poll);clearTimeout(timeout);reject(new Error('Startup failed: '+output));}});
    });
    const base=`http://127.0.0.1:${port}`;
    assert.equal((await fetch(base+'/api/health')).status,200);
    assert.match(await (await fetch(base+'/')).text(),/app\.js/);
    const javascript=await fetch(base+'/app.js');assert.equal(javascript.status,200);assert.ok((await javascript.text()).length>100000);
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'clean@test.local',password:'Clean Startup!2026'})});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];const state=await(await fetch(base+'/api/bootstrap',{headers:{cookie}})).json();assert.equal(state.guests.length,0);assert.equal(state.tables.length,0);
    const result=await new Promise((resolve,reject)=>{const backup=spawn(process.execPath,['scripts/backup.mjs'],{cwd:dir,env:{...process.env,DATA_DIR:'./data'},stdio:['ignore','pipe','pipe']});let output='';backup.stdout.on('data',b=>output+=b);backup.stderr.on('data',b=>output+=b);backup.on('error',reject);backup.on('exit',code=>resolve({code,output}));});
    assert.equal(result.code,0,result.output);const file=result.output.split('Backup saved: ')[1].trim().split('\n')[0];assert.ok((await stat(file)).size>0);
    const backupDb=new DatabaseSync(file,{readOnly:true});assert.equal(backupDb.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);assert.equal(backupDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');backupDb.close();
  }finally{if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await closed;}await rm(dir,{recursive:true,force:true});}
});
