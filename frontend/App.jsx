import React,{useState,useEffect,useRef} from 'react';
import {api,setCsrf,query} from './api.js';
import {Icon,Logo,IconButton,Button,ErrorBox,Modal,Field,localDay,shiftDay,formatDate,Status} from './ui.jsx';
import {ReservationForm,ReservationDetail,GuestForm,TableForm,ServerForm,EventForm,BlockForm,ConfirmModal} from './forms.jsx';
import {CalendarPage,GuestsPage,TablesPage,ServersPage,EventsPage,ReportsPage,SettingsPage} from './pages.jsx';

const navigation=[['calendar','Calendar'],['guests','Guestbook'],['tables','Tables'],['servers','Servers'],['events','Events'],['chart','Reports']];
function Login({onLogin}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function login(e){e.preventDefault();setBusy(true);setError('');try{const result=await api('/auth/login',{method:'POST',body:{email,password}});onLogin(result.user);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="login-page"><div className="login-story"><div className="login-logo"><Logo/><span>SUSHI CLINIC</span></div><div><span className="eyebrow">THE ART OF HOSPITALITY</span><h1>Every table.<br/>Every guest.<br/><em>A little more care.</em></h1><p>Your restaurant, beautifully in sync.<br/>Reservations, familiar faces, and a floor that flows.</p><div className="login-seats" aria-hidden="true">{['3A','4B','5C','6A','3B','4C'].map((n,i)=><div key={n} className={i%3===0?'filled':''}><span>{n}</span><i/><i/><i/><i/></div>)}</div></div><small>RESERVATIONS · GUESTBOOK · FLOOR MANAGEMENT</small></div><main className="login-form"><div className="login-form-inner"><span className="eyebrow">WELCOME TO THE FRONT DESK</span><h2>Good service starts here.</h2><p>Sign in to your restaurant workspace.</p><form onSubmit={login}><Field label="Email address"><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@restaurant.com"/></Field><Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field><ErrorBox error={error}/><Button variant="primary" type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}<Icon name="right" size={16}/></Button></form><div className="login-help"><Icon name="help"/><p>First time here? Use the local demo credentials in <strong>START_HERE.txt</strong>. Ask your administrator for a staff account.</p></div><small className="login-foot">Sushi Clinic Restaurant Manager · v1.0</small></div></main></div>;
}
function Account({user,onClose,onLogout,notify}) {
  const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[again,setAgain]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();if(next!==again){setError('The new passwords do not match.');return;}setBusy(true);setError('');try{await api('/auth/password',{method:'POST',body:{current_password:current,new_password:next}});notify('Password changed. Other sessions have been signed out.');onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Modal title="Your account" subtitle={`${user.name} · ${user.role}`} onClose={onClose}><form onSubmit={submit}><div className="form-body"><p>{user.email}</p><h4>Change password</h4><Field label="Current password"><input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} required/></Field><Field label="New password · at least 12 characters"><input type="password" autoComplete="new-password" minLength="12" maxLength="128" value={next} onChange={e=>setNext(e.target.value)} required/></Field><Field label="Confirm new password"><input type="password" autoComplete="new-password" value={again} onChange={e=>setAgain(e.target.value)} required/></Field><ErrorBox error={error}/></div><footer className="modal-footer"><Button type="button" icon="logout" onClick={onLogout}>Sign out</Button><Button type="submit" variant="primary" disabled={busy}>{busy?'Saving…':'Change password'}</Button></footer></form></Modal>;
}
export default function App() {
  const [user,setUser]=useState(null),[authLoading,setAuthLoading]=useState(true),[authError,setAuthError]=useState(''),[data,setData]=useState(null),[page,setPage]=useState('calendar'),[day,setDay]=useState(''),[search,setSearch]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[modal,setModal]=useState(null),[toast,setToast]=useState(''),[selectedGuest,setSelectedGuest]=useState(null),[time,setTime]=useState(new Date());
  const seq=useRef(0),toastTimer=useRef(null);
  useEffect(()=>{api('/auth/session').then(r=>setUser(r.user)).catch(e=>{if(e.status!==401)setAuthError(e.message);}).finally(()=>setAuthLoading(false));},[]);
  useEffect(()=>{const timer=setInterval(()=>setTime(new Date()),30000);return()=>clearInterval(timer);},[]);
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  useEffect(()=>{
    if(!user)return;
    const request=++seq.current;setLoading(true);
    let from,to;
    if(day){const d=new Date(`${day.slice(0,7)}-01T12:00:00`);from=shiftDay(localDay(d),-((d.getDay()+6)%7));to=shiftDay(from,41);}
    api(`/bootstrap?${query({date:day,from,to})}`).then(result=>{if(request!==seq.current)return;setData(result);if(!day)setDay(result.date);setError('');}).catch(e=>{if(request!==seq.current)return;if(e.status===401){setUser(null);setData(null);setModal(null);}else setError(e.message);}).finally(()=>{if(request===seq.current)setLoading(false);});
  },[user,day,revision]);
  function notify(message){setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),4500);}
  function saved(message,result){
    if(result?.guest_id&&result.date)setData(current=>{
      if(!current)return current;
      const reservations=current.reservations.filter(r=>r.id!==result.id);
      if(result.date===current.date)reservations.push(result);
      reservations.sort((a,b)=>a.start_min-b.start_min||a.id-b.id);
      return {...current,reservations,summary:{bookings:reservations.filter(r=>!['waitlisted','cancelled','no_show'].includes(r.status)).length,covers:reservations.filter(r=>['reserved','arrived','seated','completed'].includes(r.status)).reduce((n,r)=>n+r.covers,0),seated:reservations.filter(r=>r.status==='seated').reduce((n,r)=>n+r.covers,0),waitlist:reservations.filter(r=>r.status==='waitlisted').length}};
    });
    setModal(null);setRevision(n=>n+1);notify(message||'Saved.');
  }
  function navigate(next){setPage(next);setSearch('');}
  function viewGuest(id){setSelectedGuest(id);navigate('guests');setModal(null);}
  function open(m){setModal(m);}
  function confirmDelete(entity,record){setModal({type:'confirm',title:`Delete ${entity==='guests'?'guest':entity==='events'?'event':'table block'}?`,message:entity==='guests'?'Guests with reservation history are protected from deletion. This action cannot be undone.':'This action cannot be undone.',action:()=>api(`/${entity}/${record.id}`,{method:'DELETE'})});}
  async function logout(){try{await api('/auth/logout',{method:'POST',body:{}});setUser(null);setCsrf('');setData(null);setModal(null);}catch(e){notify(e.message);}}
  if(authLoading)return <div className="startup"><Logo/><p>Opening your workspace…</p></div>;
  if(authError)return <div className="startup"><h2>Cannot connect to the server</h2><p>{authError}</p><Button onClick={()=>location.reload()}>Try again</Button></div>;
  if(!user)return <Login onLogin={u=>{setUser(u);setPage('calendar');setDay('');}}/>;
  if(!data)return <div className="startup"><Logo/>{error?<><ErrorBox error={error}/><Button onClick={()=>setRevision(n=>n+1)}>Retry connection</Button><Button onClick={logout}>Sign out</Button></>:<p>Preparing the restaurant…</p>}</div>;
  const current=navigation.find(([id])=>id===page)?.[1]||'Settings';
  const capacity=data.tables.filter(t=>t.active).reduce((n,t)=>n+t.capacity,0);
  const props={data,day,setDay,search,open,user,viewGuest,notify,saved,confirmDelete,selectedGuest,setSelectedGuest,loading};
  return <div className="app"><aside className="sidebar"><button className="brand" aria-label="Sushi Clinic home" onClick={()=>navigate('calendar')}><Logo/></button><nav aria-label="Main navigation">{navigation.map(([id,label])=><button key={id} className={page===id?'selected':''} title={label} aria-label={label} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><Icon name={id}/><span>{label}</span></button>)}</nav><div className="sidebar-bottom">{user.role==='admin'&&<button aria-label="Settings" title="Settings" className={page==='settings'?'selected':''} onClick={()=>navigate('settings')}><Icon name="settings"/></button>}<button aria-label="Your account" title="Your account" onClick={()=>open({type:'account'})}><Icon name="user"/></button></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><span>{current}</span><i/><strong>{data.settings.name}</strong></div><div className="service-time"><Icon name="sun"/><span>{new Intl.DateTimeFormat('en-IN',{timeZone:data.settings.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(time)}</span><small>{data.settings.timezone.split('/').at(-1).replaceAll('_',' ')}</small></div><div className="topbar-end"><div className="capacity"><span>Seated <strong>{data.summary.seated}/{capacity}</strong></span><div><i style={{width:`${Math.min(100,data.summary.seated/(capacity||1)*100)}%`}}/></div></div><IconButton icon="refresh" label="Refresh restaurant data" disabled={loading} onClick={()=>setRevision(n=>n+1)}/><button className="notification-button" aria-label="Today’s activity" title="Service summary" onClick={()=>open({type:'summary'})}><Icon name="bell"/>{data.summary.waitlist>0&&<i/>}</button><button className="new-button" aria-label="New reservation" title="New reservation" onClick={()=>open({type:'reservation'})}><Icon name="plus" size={25}/></button></div></header>
      <div className="datebar"><div className="date-navigation"><IconButton icon="left" label="Previous day" onClick={()=>setDay(shiftDay(day,-1))}/><label className="date-control"><span>{formatDate(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span><input type="date" aria-label="Service date" value={day} min="2000-01-01" max="2100-12-31" onChange={e=>{if(e.target.value)setDay(e.target.value);}}/></label><IconButton icon="right" label="Next day" onClick={()=>setDay(shiftDay(day,1))}/><button className="text-button today-button" onClick={()=>setDay(data.today)}>Today</button></div><div className="global-search"><Icon name="search" size={16}/><input aria-label={`Search ${current.toLowerCase()}`} value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${current.toLowerCase()}…`}/>{search&&<IconButton icon="close" label="Clear search" onClick={()=>setSearch('')}/>}</div></div>
      {loading&&<div className="loading-bar"/>}{error&&<div className="connection-error"><ErrorBox error={error}/><Button onClick={()=>setRevision(n=>n+1)}>Retry</Button></div>}
      <main className={`main-content page-${page}`} aria-busy={loading}>{page==='calendar'&&<CalendarPage {...props}/>} {page==='guests'&&<GuestsPage {...props}/>} {page==='tables'&&<TablesPage {...props}/>} {page==='servers'&&<ServersPage {...props}/>} {page==='events'&&<EventsPage {...props}/>} {page==='chart'&&<ReportsPage {...props}/>} {page==='settings'&&<SettingsPage {...props}/>}</main>
      <footer className="statusbar"><div className="legend"><Status value="reserved"/><Status value="seated"/><Status value="arrived"/></div><span className="footer-summary">{data.summary.bookings} reservations · {data.summary.covers} covers</span><div className="footer-actions"><button onClick={()=>open({type:'block'})}>Create block <Icon name="block" size={15}/></button><span>Quick seat</span>{[2,3,4,5,6].map(c=><button className="quick-seat" key={c} onClick={()=>open({type:'reservation',preset:{status:'seated'},record:undefined,covers:c})} aria-label={`Seat ${c} guests`}><Icon name="user" size={15}/><sup>{c}</sup></button>)}</div></footer>
    </div>
    {toast&&<div className="toast" role="status"><Icon name="check"/>{toast}<IconButton icon="close" label="Dismiss notification" onClick={()=>setToast('')}/></div>}
    {modal?.type==='reservation'&&<ReservationForm key={`booking-${modal.record?.id||'new'}`} data={data} day={day} record={modal.record} preset={{...modal.preset,...(modal.covers?{covers:modal.covers}:{})}} onClose={()=>setModal(null)} onSaved={saved}/>}
    {modal?.type==='detail'&&<ReservationDetail record={modal.record} onClose={()=>setModal(null)} onSaved={saved} onEdit={record=>open({type:'reservation',record})} onGuest={viewGuest}/>}
    {modal?.type==='guest'&&<GuestForm record={modal.record} onClose={()=>setModal(null)} onSaved={saved} onDelete={user.role==='admin'&&modal.record?()=>confirmDelete('guests',modal.record):undefined}/>}
    {modal?.type==='table'&&<TableForm data={data} record={modal.record} onClose={()=>setModal(null)} onSaved={saved}/>}
    {modal?.type==='server'&&<ServerForm record={modal.record} onClose={()=>setModal(null)} onSaved={saved}/>}
    {modal?.type==='event'&&<EventForm record={modal.record} day={modal.day||day} onClose={()=>setModal(null)} onSaved={saved} onDelete={modal.record?()=>confirmDelete('events',modal.record):undefined}/>}
    {modal?.type==='block'&&<BlockForm data={data} day={day} preset={modal.preset} onClose={()=>setModal(null)} onSaved={saved}/>}
    {modal?.type==='confirm'&&<ConfirmModal {...modal} onClose={()=>setModal(null)} onSaved={saved}/>}
    {modal?.type==='account'&&<Account user={user} onClose={()=>setModal(null)} onLogout={logout} notify={notify}/>}
    {modal?.type==='event-view'&&<Modal title={modal.record.title} subtitle={modal.record.type} onClose={()=>setModal(null)}><div className="form-body"><p>{formatDate(modal.record.date,{dateStyle:'full'})} · {displayEventTime(modal.record.start_time)}</p><p>{modal.record.description||'No additional details.'}</p></div></Modal>}
    {modal?.type==='summary'&&<Modal title="Service at a glance" subtitle={formatDate(day,{dateStyle:'full'})} onClose={()=>setModal(null)}><div className="form-body summary-list">{[['Reservations',data.summary.bookings],['Expected covers',data.summary.covers],['Seated covers',data.summary.seated],['Waitlisted parties',data.summary.waitlist],['Active table blocks',data.blocks.length]].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}<p className="help-text">Counts come from the selected day’s saved records. Refresh to see updates made by another host.</p></div></Modal>}
  </div>;
}
function displayEventTime(t){return t;}
