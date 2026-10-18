import React,{useEffect,useRef,useId} from 'react';

const paths={
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2M8 18h2"/></>,
  guests:<><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M8 17c0-4 8-4 8 0M2 7h4M2 12h4M2 17h4"/></>,
  tables:<>{[3,14].flatMap(x=>[3,14].map(y=><rect key={`${x}${y}`} x={x} y={y} width="7" height="7" rx="1.5"/>))}</>,
  servers:<><rect x="5" y="7" width="14" height="14" rx="2"/><path d="M9 7V4h6v3M9 12h6M12 9v6M9 18h6"/></>,
  events:<><path d="M3 5h18l-9 9L3 5ZM12 14v7M7 21h10M5 2l4 7"/></>,
  chart:<><path d="M4 3v18h17M8 17v-4M13 17V7M18 17V4"/></>,
  settings:<><path d="m9 3-1 3-3 1v4l2 2-1 3 3 3 3-1 3 1 3-3-1-3 2-2V7l-3-1-1-3H9Z"/><circle cx="12" cy="11" r="3"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  plus:<path d="M12 4v16M4 12h16"/>,
  close:<path d="m6 6 12 12M18 6 6 18"/>,
  left:<path d="m14 5-7 7 7 7"/>,right:<path d="m10 5 7 7-7 7"/>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  check:<path d="m5 12 4 4L19 6"/>,
  bell:<><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4"/><path d="M12 2v2"/></>,
  user:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-7 16-7 16 0v2"/></>,
  logout:<><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/></>,
  download:<><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></>,
  edit:<><path d="m15 4 5 5L9 20H4v-5L15 4ZM13 6l5 5"/></>,
  trash:<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
  filter:<><path d="M4 6h16M7 12h10M10 18h4"/><circle cx="8" cy="6" r="1"/><circle cx="14" cy="12" r="1"/></>,
  phone:<path d="m7 3 3 5-3 3c2 3 3 4 6 6l3-3 5 3c-1 8-10 3-14-1S0 4 7 3Z"/>,
  mail:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></>,
  star:<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1 3-7Z"/>,
  block:<><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></>,
  refresh:<><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/></>,
  leaf:<><path d="M20 3C3 0 1 14 9 17c8 3 11-7 11-14ZM4 21 15 10"/></>,
  help:<><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 17v1"/></>,
  sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>
};
export function Icon({name,size=18,...props}) {return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]||paths.calendar}</svg>;}
export function Logo(){return <svg width="30" height="30" viewBox="0 0 36 36" fill="none" aria-hidden="true"><circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="1.2"/><path d="M9 21c-2-10 13-14 17-5 3 8-8 14-12 7-3-5 5-9 8-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="18" cy="19" r="1.6" fill="currentColor"/></svg>;}
export function Button({children,icon,variant='',className='',...props}){return <button className={`btn ${variant} ${className}`} {...props}>{icon&&<Icon name={icon} size={16}/>}<span>{children}</span></button>;}
export function IconButton({icon,label,...props}){return <button className="icon-button" title={label} aria-label={label} {...props}><Icon name={icon}/></button>;}
export function Empty({icon='calendar',title='Nothing here yet',children,action}){return <div className="empty"><div className="empty-icon"><Icon name={icon} size={30}/></div><h3>{title}</h3><p>{children}</p>{action}</div>;}
export function Field({label,children,hint,className=''}){return <label className={`field ${className}`}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Modal({title,subtitle,children,onClose,wide=false}) {
  const ref=useRef(null),heading=useId();
  useEffect(()=>{
    const before=document.activeElement;
    document.body.style.overflow='hidden';
    const root=ref.current;
    root?.querySelector('input,select,textarea,button')?.focus();
    function keyboard(e){
      if(e.key==='Escape')onClose();
      if(e.key==='Tab'){
        const nodes=[...root.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(x=>x.offsetParent!==null);
        const first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',keyboard);
    return()=>{document.body.style.overflow='';document.removeEventListener('keydown',keyboard);before?.focus?.();};
  },[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={heading} className={`modal ${wide?'wide':''}`}><header className="modal-head"><div><h2 id={heading}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><IconButton icon="close" label="Close dialog" onClick={onClose}/></header>{children}</section></div>;
}
export function Avatar({name='',color,size=''}){return <span className={`avatar ${size}`} style={color?{background:color}:undefined}>{name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>;}
export const labels={reserved:'Reserved',arrived:'Arrived',seated:'Seated',completed:'Completed',cancelled:'Cancelled',no_show:'No-show',waitlisted:'Waitlisted',available:'Available',blocked:'Blocked'};
export function Status({value}){return <span className={`status ${value}`}><i/>{labels[value]||value}</span>;}
export function formatDate(day,options={month:'short',day:'numeric'}){return new Intl.DateTimeFormat('en-IN',options).format(new Date(`${day}T12:00:00`));}
export function localDay(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function shiftDay(day,n){const d=new Date(`${day}T12:00:00`);d.setDate(d.getDate()+n);return localDay(d);}
export function toMinutes(time){return Number(time.slice(0,2))*60+Number(time.slice(3));}
export function toClock(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export function displayTime(time){const n=toMinutes(time);return `${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')} ${n>=720?'PM':'AM'}`;}
export function Tabs({value,items,onChange}){return <div className="tabs" role="tablist">{items.map(item=>{const k=typeof item==='string'?item:item.value,label=typeof item==='string'?item:item.label;return <button key={k} role="tab" aria-selected={value===k} className={value===k?'active':''} onClick={()=>onChange(k)}>{label}</button>;})}</div>;}
export function ErrorBox({error}){return error?<div className="error-box" role="alert">{error}</div>:null;}
