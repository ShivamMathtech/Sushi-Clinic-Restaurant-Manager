import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {authService, publicUser} from './auth.mjs';
import {createService} from './service.mjs';
import {ApiError, requireValue} from './validation.mjs';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.json':'application/json; charset=utf-8'};
function send(res,status,data,type='application/json; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
async function readJson(req) {
  requireValue((req.headers['content-type']||'').split(';')[0]==='application/json','Send JSON with Content-Type: application/json.',415);
  let length=0;const parts=[];
  for await(const part of req){length+=part.length;requireValue(length<=100000,'Request body is too large.',413);parts.push(part);}
  try{const b=JSON.parse(Buffer.concat(parts).toString('utf8'));requireValue(b&&typeof b==='object'&&!Array.isArray(b),'Expected a JSON object.');return b;}
  catch(e){if(e.status)throw e;throw new ApiError(400,'Invalid JSON request.');}
}
export function createApp(db, options = {}) {
  const auth=authService(db,options),service=createService(db),dist=resolve(options.dist||'dist');
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    try {
      const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method,query=Object.fromEntries(url.searchParams);
      if(!path.startsWith('/api/')) {
        requireValue(method==='GET'||method==='HEAD','Method not allowed.',405);
        let file=resolve(dist,'.'+decodeURIComponent(path));
        requireValue(file===dist||file.startsWith(dist+sep),'Invalid path.',400);
        if(!extname(path))file=resolve(dist,'index.html');
        requireValue(existsSync(file)&&statSync(file).isFile(),'File not found.',404);
        res.setHeader('Cache-Control','no-cache');
        if(method==='HEAD'){res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end();return;}
        send(res,200,readFileSync(file),mime[extname(file)]||'application/octet-stream');return;
      }
      res.setHeader('Cache-Control','no-store');
      if(path==='/api/health'&&method==='GET'){send(res,200,{ok:true,version:'1.0.0'});return;}
      const mutating=!['GET','HEAD'].includes(method);
      if(mutating) {
        const origin=req.headers.origin;
        if(origin){let host;try{host=new URL(origin).host;}catch{throw new ApiError(403,'Invalid request origin.');}requireValue(host===req.headers.host,'Cross-origin requests are not accepted.',403);}
        requireValue(req.headers['sec-fetch-site']!=='cross-site','Cross-site requests are not accepted.',403);
      }
      if(path==='/api/auth/login'&&method==='POST'){send(res,200,auth.login(await readJson(req),req,res));return;}
      const user=auth.requireUser(req);
      if(mutating)auth.csrf(req,user);
      let result,status=200;
      if(path==='/api/auth/session'&&method==='GET')result={user:publicUser(user),csrf:user.csrf};
      else if(path==='/api/auth/logout'&&method==='POST')result=auth.logout(user,res);
      else if(path==='/api/auth/password'&&method==='POST'){result=auth.changePassword(user,await readJson(req));service.audit(user,'changed_password','user',user.id);}
      else if(path==='/api/bootstrap'&&method==='GET')result=service.bootstrap(query);
      else if(path==='/api/availability'&&method==='GET')result=service.availability(query);
      else if(path==='/api/reservations'&&method==='GET')result=service.reservations(query.date);
      else if(path==='/api/guests'&&method==='GET')result=service.guests();
      else if(/^\/api\/guests\/\d+$/.test(path)&&method==='GET')result=service.guestDetail(path.split('/').pop());
      else if(path==='/api/settings'&&method==='PUT'){auth.admin(user);result=service.saveSettings(user,await readJson(req));}
      else if(path==='/api/users'&&method==='GET'){auth.admin(user);result=db.prepare('SELECT id,name,email,role,active FROM users ORDER BY id').all();}
      else if(path==='/api/users'&&method==='POST'){auth.admin(user);result=auth.createUser(await readJson(req));service.audit(user,'created','user',result.id);status=201;}
      else if(/^\/api\/users\/\d+$/.test(path)&&method==='PATCH'){auth.admin(user);result=service.updateUser(user,path.split('/').pop(),await readJson(req));}
      else if(path==='/api/audit'&&method==='GET'){auth.admin(user);result=db.prepare('SELECT a.*,u.name AS user_name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200').all();}
      else if(path==='/api/export/reservations'&&method==='GET') {
        const csv=service.exportReservations(query.from,query.to);res.setHeader('Content-Disposition',`attachment; filename="reservations-${query.from}-${query.to}.csv"`);send(res,200,csv,'text/csv; charset=utf-8');return;
      } else if(path==='/api/export/data'&&method==='GET') {
        auth.admin(user);result={version:1,exported_at:new Date().toISOString(),settings:service.settings()};
        for(const table of ['guests','servers','dining_tables','reservations','blocks','events'])result[table]=db.prepare(`SELECT * FROM ${table}`).all();
        res.setHeader('Content-Disposition','attachment; filename="sushi-clinic-data.json"');service.audit(user,'exported','data',null);
      } else {
        const match=/^\/api\/(guests|reservations|tables|servers|events|blocks)(?:\/(\d+))?$/.exec(path);
        requireValue(match,'Endpoint not found.',404);
        const [,entity,key]=match;
        if(['tables','servers','events'].includes(entity))auth.admin(user);
        if(method==='DELETE'&&key&&['guests','events','blocks'].includes(entity)) {
          if(entity==='guests')auth.admin(user);
          result=service.remove(user,{guests:'guest',events:'event',blocks:'block'}[entity],key);
        } else if((method==='POST'&&!key)||(method==='PATCH'&&key&&entity!=='blocks')) {
          const body=await readJson(req),operations={guests:service.saveGuest,reservations:service.saveReservation,tables:service.saveTable,servers:service.saveServer,events:service.saveEvent,blocks:service.createBlock};
          result=operations[entity](user,body,key?Number(key):undefined);status=key?200:201;
        } else throw new ApiError(405,'Method not allowed.');
      }
      send(res,status,result);
    } catch(error) {
      if(res.headersSent){res.end();return;}
      const status=error.status||500;
      if(status===500)console.error('Request failed:',error);
      send(res,status,{error:status===500?'An unexpected server error occurred. Check the server log.':error.message});
    }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  return server;
}
