import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {openDatabase} from './database.mjs';
import {createApp} from './http.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||3040),host=process.env.HOST||'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535.');
if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Install Node.js 24 LTS to run Sushi Clinic.');
if(!existsSync(resolve(root,'dist/index.html')))throw new Error('The frontend build is missing. Run npm ci, then npm run build.');
const db=openDatabase(resolve(root,process.env.DATA_DIR||'data','sushi-clinic.sqlite'),{demo:process.env.SEED_DEMO!=='false',adminPassword:process.env.ADMIN_PASSWORD,adminEmail:process.env.ADMIN_EMAIL});
const server=createApp(db,{dist:resolve(root,'dist'),secureCookie:process.env.COOKIE_SECURE==='true'});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is already in use. Close the other app or change PORT in .env.`:e.message);db.close();process.exitCode=1;});
server.listen(port,host,()=>{
  const url=`http://localhost:${port}`;
  console.log(`\nSushi Clinic is ready at ${url}\nDatabase: ${resolve(root,process.env.DATA_DIR||'data','sushi-clinic.sqlite')}\nPress Ctrl+C to stop.\n`);
  if(process.argv.includes('--open')) {
    const child=process.platform==='win32'?spawn('cmd',['/c','start','',url],{stdio:'ignore',windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
    child.on('error',()=>console.log(`Open ${url} in your browser.`));child.unref();
  }
});
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;server.close(()=>{db.close();process.exit(0);});server.closeIdleConnections();});
