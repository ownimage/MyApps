const { applyThemeAndWait: theme } = require("./theme-controls");
// Compute actual alpha-composited surfaces, including Bootstrap's inset table
// stripe/hover shadow. Canvas decodes CSS color(srgb) and color-mix results.
function inspectContrast() {
  const ctx=document.createElement('canvas').getContext('2d');
  function rgba(c) {ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);}
  function over(a,b){return a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1);}
  function lum(c){return c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
  function ratio(a,b){let x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  const surfaceCache=new Map();
  function surfaces(el) {
    if(!el)return [[255,255,255,1]];
    if(surfaceCache.has(el))return surfaceCache.get(el);
    const cs=getComputedStyle(el);
    let colors=surfaces(el.parentElement).map(c=>over(rgba(cs.backgroundColor),c));
    const stops=cs.backgroundImage.match(/rgba?\([^)]+\)|color\([^)]+\)|#[\da-f]{3,8}/gi)||[];
    if(stops.length)colors=colors.flatMap(c=>stops.map(stop=>over(rgba(stop),c)));
    if(el.matches('td,th')){
      const shadow=cs.boxShadow.match(/rgba?\([^)]+\)|color\([^)]+\)/);
      if(shadow)colors=colors.map(c=>over(rgba(shadow[0]),c));
    }
    colors=[...new Map(colors.map(c=>[JSON.stringify(c),c])).values()];
    surfaceCache.set(el,colors);return colors;
  }
  function bg(el){return surfaces(el)[0];}
  const failures=[];
  document.querySelectorAll('#topTiles *, #mainTabs *').forEach(el=>{
    if(!el.getClientRects().length || getComputedStyle(el).visibility==='hidden')return;
    const text=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()) || el.matches('input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=radio])');
    if(!text || el.matches('style,script,option,.smd-tab-btn'))return;
    const cs=getComputedStyle(el), surface=bg(el);
    const r=Math.min(...surfaces(el).map(c=>ratio(over(rgba(cs.color),c),c)));
    if(r<4.49)failures.push({text:(el.value||el.textContent).trim().slice(0,45),tag:el.tagName,cls:el.className,ratio:+r.toFixed(2),fg:cs.color,bg:surface});
  });
  document.querySelectorAll('sc-diagram .sc-diagram__icon, sc-diagram .sc-diagram__track, sc-diagram .sc-diagram__chevron').forEach(el=>{
    if(!el.getClientRects().length || getComputedStyle(el).display==='none')return;
    const cs=getComputedStyle(el),color=cs.stroke;
    const r=Math.min(...surfaces(el).map(c=>ratio(over(rgba(color),c),c)));
    if(r<2.99)failures.push({text:'diagram '+(el.closest('[data-node]')?.dataset.node||el.closest('[data-flow]')?.dataset.flow),ratio:+r.toFixed(2),fg:color,bg:surfaces(el)});
  });
  const battery=document.querySelector('#topTiles .battery-icon');
  if(battery && battery.getClientRects().length){
    const tile=battery.closest('.tile'),fill=battery.querySelector('.battery-fill');
    for(const [label,color] of [['battery outline',getComputedStyle(battery).borderTopColor],['battery fill',getComputedStyle(fill).backgroundColor]]) {
      if(label==='battery fill' && !fill.getBoundingClientRect().width)continue;
      const r=Math.min(...surfaces(tile).map(c=>ratio(over(rgba(color),c),c)));
      if(r<2.99)failures.push({text:label,ratio:+r.toFixed(2),fg:color,bg:surfaces(tile)});
    }
  }
  const activeChart = document.querySelector('#graph-panel[active]') ? window._powerChart : document.querySelector('#kwh-panel[active]') ? window._energyChart : null;
  if(activeChart) {
    const c=activeChart, surface=bg(c.canvas.closest('.graph-wrap'));
    function check(label,col,min){const r=ratio(rgba(col),surface);if(r<min-.01)failures.push({text:label,ratio:+r.toFixed(2),fg:col,bg:surface});}
    for(const scale of Object.values(c.scales)){check('axis ticks '+scale.id,scale.options.ticks.color,4.5);if(scale.options.title.display)check('axis title '+scale.id,scale.options.title.color,4.5);}
    check('legend',c.options.plugins.legend.labels.color,4.5);
    c.data.datasets.forEach(ds=>check(ds.label,ds.borderColor,3));
  }
  return failures;
}

module.exports={theme,inspectContrast};
