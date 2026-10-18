import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fixture} from './helpers.mjs';

test('React interface performs real API workflows in a DOM environment',async t=>{
  const f=await fixture({demo:true});
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:f.base,pretendToBeVisual:true});
  const prior={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  globalThis.HTMLElement=dom.window.HTMLElement;globalThis.Node=dom.window.Node;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  let cookie='';
  globalThis.fetch=async(url,options={})=>{
    const response=await prior.fetch(new URL(url,f.base),{...options,headers:{...options.headers,...(cookie?{cookie}:{}),origin:f.base}});
    const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return response;
  };
  const compiled=resolve('tests/.compiled');await mkdir(compiled,{recursive:true});
  await build({entryPoints:['frontend/App.jsx'],outfile:resolve(compiled,'app.mjs'),bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react/jsx-runtime'],logLevel:'silent'});
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const {act}=React,{default:App}=await import(pathToFileURL(resolve(compiled,'app.mjs')));
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=prior.fetch;globalThis.window=prior.window;globalThis.document=prior.document;dom.window.close();await f.close();await rm(compiled,{recursive:true,force:true});});
  const q=selector=>document.querySelector(selector);
  const buttons=(scope=document)=>[...scope.querySelectorAll('button')];
  const button=(text,scope=document)=>buttons(scope).find(x=>x.textContent.trim()===text);
  async function waitFor(predicate,label){for(let i=0;i<150;i++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});if(predicate())return;}throw new Error(`Timed out: ${label}. ${document.body.textContent.slice(-2000)}`);}
  async function click(element){assert.ok(element,'Expected a clickable element');await act(async()=>element.click());}
  async function change(element,value){assert.ok(element,'Expected a form field');await act(async()=>{const proto=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});}
  await act(async()=>root.render(React.createElement(App)));
  await t.test('sign in renders the seeded reservation dashboard',async()=>{
    await waitFor(()=>q('.login-page'),'login screen');await change(q('input[type=email]'),'admin@test.local');await change(q('input[type=password]'),'Admin Test!2026');await click(button('Sign in'));await waitFor(()=>q('.timeline'),'reservation board');assert.match(q('.footer-summary').textContent,/12 reservations/);
  });
  await t.test('quick-seat preset carries the requested party size',async()=>{
    await click(q('[aria-label="Seat 4 guests"]'));await waitFor(()=>q('.table-option'),'table availability');assert.equal(q('.booking-details input[type=number]').value,'4');await click(q('[aria-label="Close dialog"]'));
  });
  await t.test('booking form creates a guest and a real reservation',async()=>{
    await click(q('[aria-label="New reservation"]'));await waitFor(()=>q('.table-option'),'booking form ready');await click(button('New guest',q('[role=dialog]')));await change(q('[aria-label="New guest name"]'),'UI Test Guest');await change(q('[aria-label="New guest phone"]'),'+91 91111 22222');await change(q('.booking-details input[type=time]'),'12:00');await waitFor(()=>q('.table-option')?.textContent.includes('4B')&&!q('.loading-label'),'new availability');await click(q('.table-option:not([disabled])'));await click(button('Create reservation'));await waitFor(()=>!q('[role=dialog]'),'booking saved');assert.ok(f.db.prepare('SELECT id FROM guests WHERE name=?').get('UI Test Guest'));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM reservations WHERE start_time=? AND date=(SELECT date FROM reservations ORDER BY id LIMIT 1)').get('12:00').n,1);
  });
  await t.test('booking details advance arrived, seated and completed statuses',async()=>{
    await waitFor(()=>buttons().find(x=>x.classList.contains('booking-card')&&x.textContent.includes('UI Test Guest')),'created booking card');
    await click(buttons().find(x=>x.classList.contains('booking-card')&&x.textContent.includes('UI Test Guest')));await click(button('Mark arrived'));await waitFor(()=>!q('[role=dialog]'),'arrived');
    await click(buttons().find(x=>x.classList.contains('booking-card')&&x.textContent.includes('UI Test Guest')));await click(button('Seat guest'));await waitFor(()=>!q('[role=dialog]'),'seated');
    await click(buttons().find(x=>x.classList.contains('booking-card')&&x.textContent.includes('UI Test Guest')));await click(button('Complete visit'));await waitFor(()=>!q('[role=dialog]'),'completed');
    assert.equal(f.db.prepare('SELECT status FROM reservations WHERE guest_id=(SELECT id FROM guests WHERE name=?)').get('UI Test Guest').status,'completed');
  });
  await t.test('guestbook displays persisted visit history and allergy notes',async()=>{
    await click(q('[aria-label="Guestbook"]'));await waitFor(()=>q('.guest-profile .donut'),'guest profile');await change(q('.global-search input'),'UI Test Guest');await waitFor(()=>q('.guest-profile h2')?.textContent==='UI Test Guest','searched guest');await waitFor(()=>q('.donut strong')?.textContent==='1','completed visit count');assert.match(q('.guest-history').textContent,/Recent dining history/);
  });
  await t.test('floor, server, event, report and settings views render correctly',async()=>{
    for(const [nav,selector] of [['Tables','.floor-grid'],['Servers','.server-detail'],['Events','.calendar-grid'],['Reports','.metrics-grid'],['Settings','.settings-form']]){await click(q(`[aria-label="${nav}"]`));await waitFor(()=>q(selector),nav);}
    assert.equal(q('.settings-form input').value,'Sushi Clinic');
    await click(button('Staff logins'));await waitFor(()=>q('.settings-users .data-table tbody tr'),'staff accounts');assert.match(q('.settings-users').textContent,/admin@test.local/);
    await click(button('Activity log'));await waitFor(()=>q('.settings-body .data-table tbody tr'),'audit entries');assert.match(q('.settings-body').textContent,/reservation/);
  });
  await t.test('event dialog persists calendar changes',async()=>{
    await click(q('[aria-label="Events"]'));await click(button('Add event'));await change(q('[role=dialog] input:not([type])'),'UI Dining Event');await click(button('Save changes',q('[role=dialog]')));await waitFor(()=>!q('[role=dialog]'),'event saved');await waitFor(()=>document.body.textContent.includes('UI Dining Event'),'calendar updated');assert.ok(f.db.prepare('SELECT id FROM events WHERE title=?').get('UI Dining Event'));
  });
  await t.test('account sign-out returns to login',async()=>{
    await click(q('[aria-label="Your account"]'));await click(button('Sign out'));await waitFor(()=>q('.login-page'),'logged out');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
  });
});
