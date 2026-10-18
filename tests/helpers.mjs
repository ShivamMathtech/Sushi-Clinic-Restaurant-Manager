import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/http.mjs';
import {resolve} from 'node:path';
export async function fixture({demo=false,dbPath=':memory:'}={}) {
  const db=openDatabase(dbPath,{demo,adminEmail:'admin@test.local',adminPassword:'Admin Test!2026'});
  const server=createApp(db,{dist:resolve('dist')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  function client(){let cookie='',csrf='';return {async request(path,{method='GET',body,headers={},raw=false}={}){
    const r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const sc=r.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];
    const data=raw?await r.text():await r.json();if(data.csrf)csrf=data.csrf;return {status:r.status,headers:r.headers,data};
  },get cookie(){return cookie;},get csrf(){return csrf;}};}
  async function close(){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});db.close();}
  return {db,server,base,client,close};
}
