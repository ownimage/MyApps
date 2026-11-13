// Shared daily selection. quote_daily is intentionally shared by every app;
// per-app visibility remains in each app's own showQuote preference.
(function(global){
  "use strict";
  const source = document.currentScript.src;
  const url = new URL('../../Quote/quotes.json',source);
  if(typeof BUILD_NUMBER!=='undefined')url.searchParams.set('v',String(BUILD_NUMBER));
  const key='quote_daily', subscribers=new Set();
  let items=[],state=null,pending=null,timer=null;
  const dayNumber=date=>Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000;
  function notify(){if(state&&items.length)for(const entry of subscribers)entry.render({item:items[state.counter%items.length],state,items});}
  function sync(){
    if(!items.length)return null;
    const now=new Date(),today=dayNumber(now);let stored;
    try{stored=JSON.parse(localStorage.getItem(key));}catch(_){}
    if(!stored||!Number.isSafeInteger(stored.counter)||stored.counter<0||!Number.isSafeInteger(stored.day)||stored.day<0)stored={counter:0,day:today};
    if(today>stored.day){
      const elapsed=today-stored.day,next=stored.counter+elapsed;
      stored.counter=Number.isSafeInteger(next)?next:stored.counter%items.length+elapsed;
      stored.day=today;
    }
    state=stored;
    const serialized=JSON.stringify(state);
    if(localStorage.getItem(key)!==serialized)localStorage.setItem(key,serialized);
    notify();clearTimeout(timer);
    const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
    timer=setTimeout(sync,Math.max(1000,midnight.getTime()-now.getTime()+50));
    return state;
  }
  function load(){
    if(items.length){sync();return Promise.resolve(items);}
    if(pending)return pending;
    pending=fetch(url.href).then(response=>{if(!response.ok)throw Error('Unable to load quotes');return response.json();}).then(data=>{
      if(!Array.isArray(data))throw Error('Invalid quote data');
      items=data.filter(item=>item&&typeof item.q==='string'&&item.q.trim()&&(item.a==null||typeof item.a==='string'));
      if(!items.length)throw Error('No quotes available');sync();return items;
    }).catch(error=>{for(const entry of subscribers)if(entry.error)entry.error(error);throw error;}).finally(()=>{pending=null;});
    return pending;
  }
  function next(){
    const alreadyLoaded=items.length>0;
    return load().then(()=>{
      if(alreadyLoaded){sync();state.counter=state.counter<Number.MAX_SAFE_INTEGER?state.counter+1:0;localStorage.setItem(key,JSON.stringify(state));notify();}
      return state;
    });
  }
  function subscribe(render,error){const entry={render,error};subscribers.add(entry);load().catch(()=>{});return()=>subscribers.delete(entry);}
  function credit(element,item){
    const goodreads=Array.isArray(item.sources)&&!item.sources.includes('zenquotes')&&item.sources.includes('goodreads');
    element.replaceChildren(document.createTextNode('Quote from '));
    const link=document.createElement('a');link.textContent=goodreads?'Goodreads':'ZenQuotes';
    link.href=goodreads?'https://www.goodreads.com/quotes/':'https://zenquotes.io/';link.target='_blank';link.rel='noopener';element.appendChild(link);
  }
  window.addEventListener('focus',sync);window.addEventListener('pageshow',sync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  window.addEventListener('storage',event=>{if(event.key===key||event.key===null)sync();});
  global.SmdQuotes={load,next,sync,subscribe,credit,dayNumber,get items(){return items;},get state(){return state;}};
  global.smdChangeShowQuote=function(enabled){localStorage.setItem(smdKey('showQuote'),String(enabled));if(typeof renderMain==='function')renderMain();};
  global.smdRestoreShowQuote=function(){const control=document.getElementById('showQuote');if(control)control.checked=localStorage.getItem(smdKey('showQuote'))==='true';};
})(window);
