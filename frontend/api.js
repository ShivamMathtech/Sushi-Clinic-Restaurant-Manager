let csrf = '';
export function setCsrf(value) { csrf=value||''; }
export async function api(path,options={}) {
  const headers={...options.headers};
  if(options.body!==undefined)headers['Content-Type']='application/json';
  if(options.method&&options.method!=='GET')headers['X-CSRF-Token']=csrf;
  const response=await fetch(`/api${path}`,{credentials:'same-origin',...options,headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const data=await response.json().catch(()=>({error:'The server returned an invalid response.'}));
  if(!response.ok){const error=new Error(data.error||'Request failed.');error.status=response.status;throw error;}
  if(data.csrf)setCsrf(data.csrf);
  return data;
}
export const query = values => new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null&&v!=='')).toString();
