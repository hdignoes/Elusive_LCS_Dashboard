'use strict';
// Fixed exhibit: one same-origin archive request, no polling or live endpoints.
const $ = id => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('en-CA',{timeZone:'Etc/GMT+7',year:'numeric',month:'2-digit',day:'2-digit'});
const displayDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Etc/GMT+7',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'shortOffset'});
const shortDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Etc/GMT+7',month:'short',day:'numeric'});
let records=[], visible=[], routeTrack=[], key='PM2_5', selected=null, map, layers, marker, canvasRenderer, chartGeometry, keyIndex=0;
const finite = v => typeof v==='number' && Number.isFinite(v);
const meta = () => CONFIG.pollutants[key];
const value = r => r[key];
const mappable = r => validCoord(r) && !r.gps_stale;
const validCoord = r => finite(r.lat)&&finite(r.lon)&&Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180;
const colour = v => !finite(v)?'#9aa6a6':(meta().breaks.find(b=>v<=b.max)||meta().breaks.at(-1)).color;
const pageColor = name => getComputedStyle(document.documentElement).getPropertyValue('--'+name).trim();
const format = v => finite(v)?v.toLocaleString('en-CA',{maximumFractionDigits:2}):'Unavailable';
function distance(a,b){const rad=Math.PI/180;const x=(b.lat-a.lat)*rad,y=(b.lon-a.lon)*rad;const h=Math.sin(x/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(y/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));}
function connected(a,b){const hours=(b.time-a.time)/3600;return mappable(a)&&mappable(b)&&hours>0&&hours<=.5&&distance(a,b)/hours/1.852<=20;}
// Leave ordinary page scrolling alone; opt in to map zoom with Ctrl.
function initCtrlScroll(map){
 const container=map.getContainer(),hint=document.getElementById('map-scroll-hint');
 let hintTimer,zoomTimer,delta=0,point;
 function hideHint(){hint.classList.remove('visible');clearTimeout(hintTimer);}
 container.addEventListener('wheel',e=>{
  if(!e.deltaY)return;
  if(!e.ctrlKey){
   clearTimeout(zoomTimer);delta=0;
   hint.classList.add('visible');clearTimeout(hintTimer);hintTimer=setTimeout(hideHint,1400);
   return;
  }
  e.preventDefault();e.stopPropagation();hideHint();
  delta+=e.deltaY*(e.deltaMode===1?20:e.deltaMode===2?container.clientHeight:1);
  point=map.mouseEventToContainerPoint(e);clearTimeout(zoomTimer);
  zoomTimer=setTimeout(()=>{
   const step=Math.sign(delta)*Math.min(1,Math.max(.25,Math.abs(delta)/200));
   const zoom=Math.max(map.getMinZoom(),Math.min(map.getMaxZoom(),map.getZoom()-step));
   if(delta)map.setZoomAround(point,zoom);
   delta=0;
  },60);
 },{passive:false});
 container.addEventListener('mouseleave',()=>{hideHint();clearTimeout(zoomTimer);delta=0;});
}
function initMap(){
 if(!window.L){$('map-status').textContent='The map could not load. The observations remain available below.';return;}
 map=L.map('map',{zoomControl:false,preferCanvas:true,scrollWheelZoom:false,zoomSnap:.25,zoomDelta:.5});
 L.control.zoom({position:'topright'}).addTo(map);
 initCtrlScroll(map);
 L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles &copy; Esri — Sources: Esri, HERE, Garmin, USGS, NGA, EPA, NPS',maxZoom:18}).addTo(map);
 canvasRenderer=L.canvas({padding:.2});layers=L.layerGroup().addTo(map);
 map.on('click',e=>{let nearest=null,best=Infinity;for(const r of visible){if(!mappable(r))continue;const p=map.latLngToContainerPoint([r.lat,r.lon]);const d=p.distanceTo(e.containerPoint);if(d<best){best=d;nearest=r;}}if(nearest&&best<45)selectRecord(nearest);});
}
function activeTrack(){return routeTrack.filter(r=>$('day').value==='all'||r.day===$('day').value);}
function fitRoute(){if(!map)return;const points=[...visible.filter(mappable),...activeTrack()].map(r=>[r.lat,r.lon]);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[45,45],maxZoom:12});}
function renderRoute(){if(!map)return;layers.clearLayers();const fullTrack=activeTrack();const trackPaths=[];for(let i=1;i<fullTrack.length;i++){if(connected(fullTrack[i-1],fullTrack[i]))trackPaths.push([[fullTrack[i-1].lat,fullTrack[i-1].lon],[fullTrack[i].lat,fullTrack[i].lon]]);}if(trackPaths.length){L.polyline(trackPaths,{color:'#fffef9',weight:6,opacity:.9,interactive:false,renderer:canvasRenderer}).addTo(layers);L.polyline(trackPaths,{color:'#264b50',weight:2.4,opacity:.9,interactive:false,renderer:canvasRenderer}).addTo(layers);}const hasPositions=visible.some(mappable)||fullTrack.length>0;$('map-status').hidden=hasPositions;if(!hasPositions)$('map-status').textContent='No reliable positions are available for this day. Air-quality observations remain available in the timeline.';const seen=new Set();for(const r of visible){if(!mappable(r))continue;const position=`${r.lat},${r.lon}`;if(seen.has(position))continue;seen.add(position);L.circleMarker([r.lat,r.lon],{radius:2,color:colour(value(r)),stroke:false,fillOpacity:.7,renderer:canvasRenderer,interactive:false}).addTo(layers);}const buckets=new Map();for(let i=1;i<visible.length;i++){const a=visible[i-1],b=visible[i];if(!connected(a,b))continue;const c=colour(value(b));if(!buckets.has(c))buckets.set(c,[]);buckets.get(c).push([[a.lat,a.lon],[b.lat,b.lon]]);}for(const [c,paths] of buckets){L.polyline(paths,{color:c,weight:3.5,opacity:.95,renderer:canvasRenderer,interactive:false}).addTo(layers);}const first=fullTrack[0]||visible.find(mappable),last=fullTrack.at(-1)||visible.findLast(mappable);for(const [r,label] of [[first,'First recorded position'],[last,'Last recorded position']]){if(r)L.circleMarker([r.lat,r.lon],{radius:5,color:'#173d42',weight:2,fillColor:'#fffef9',fillOpacity:1,renderer:canvasRenderer}).bindTooltip(label).on('click',()=>{if(r.coord_source)selectRecord(r);else{if(marker){marker.remove();marker=null;}$('reading-value').textContent='No sensor reading';$('reading-date').textContent=displayDate.format(r.time*1000);$('reading-location').textContent=`${r.lat.toFixed(4)}°, ${r.lon.toFixed(4)}°`;}}).addTo(layers);}fitRoute();}
function selectRecord(r){selected=r;keyIndex=visible.indexOf(r);$('reading-value').textContent=`${format(value(r))}${finite(value(r))?' '+meta().unit:''}`;$('reading-date').textContent=displayDate.format(r.time*1000);$('reading-location').textContent=`${r.lat.toFixed(4)}°, ${r.lon.toFixed(4)}°`;if(marker){marker.remove();marker=null;}if(map&&mappable(r)){marker=L.circleMarker([r.lat,r.lon],{radius:7,color:'#173d42',weight:2,fillColor:colour(value(r)),fillOpacity:1,renderer:canvasRenderer}).addTo(map);if(!map.getBounds().contains([r.lat,r.lon]))map.panTo([r.lat,r.lon]);}drawChart();}
function renderLegend(){const m=meta();const trackLegend=document.createElement('span'),trackSwatch=document.createElement('i');trackSwatch.style.background='#264b50';trackLegend.append(trackSwatch,document.createTextNode('No reading'));$('legend').replaceChildren(trackLegend,...m.breaks.map(b=>{const span=document.createElement('span'),i=document.createElement('i');i.style.background=b.color;span.append(i,document.createTextNode(`${b.label}${m.unit?' '+m.unit:''}`));return span;}));$('band-note').textContent=m.note;}
function summary(){const vals=visible.map(value).filter(finite).sort((a,b)=>a-b);const n=vals.length;const median=n?(vals[Math.floor((n-1)/2)]+vals[Math.ceil((n-1)/2)])/2:null;$('median').textContent=`${format(median)} ${meta().unit}`;$('range').textContent=n?`${format(vals[0])}–${format(vals.at(-1))} ${meta().unit}`:'Unavailable';$('valid-count').textContent=n.toLocaleString('en-CA');}
function drawChart(){const canvas=$('chart'),rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=rect.width,h=rect.height,left=54,right=w-18,top=20,bottom=h-40;const vals=visible.map(value).filter(finite);if(!vals.length){ctx.fillStyle=pageColor('muted');ctx.fillText('No observations for this measurement.',left,60);return;}
 const t0=visible[0].time,t1=visible.at(-1).time;let min=Math.min(0,...vals),max=Math.max(...vals);if(max===min)max=min+1;max+=(max-min)*.08;const x=r=>left+(r.time-t0)/(t1-t0||1)*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);chartGeometry={left,right,t0,t1};
 ctx.font='11px system-ui, sans-serif';ctx.textBaseline='middle';for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);ctx.strokeStyle=pageColor('line');ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle=pageColor('muted');ctx.textAlign='right';ctx.fillText(format(v),left-10,yy);}
 for(let i=0;i<5;i++){const t=t0+(t1-t0)*i/4;ctx.fillStyle=pageColor('muted');ctx.textAlign=i===0?'left':i===4?'right':'center';ctx.fillText(shortDate.format(t*1000),left+(right-left)*i/4,h-16);}
 // All records contribute; nearby samples are drawn on a lightweight canvas.
 for(let i=0;i<visible.length;i++){const r=visible[i];if(!finite(value(r)))continue;ctx.strokeStyle=colour(value(r));ctx.fillStyle=colour(value(r));ctx.lineWidth=1.15;const prev=visible[i-1];if(prev&&finite(value(prev))&&r.time-prev.time<=1800){ctx.beginPath();ctx.moveTo(x(prev),y(value(prev)));ctx.lineTo(x(r),y(value(r)));ctx.stroke();}else{ctx.fillRect(x(r)-1,y(value(r))-1,2,2);}}
 if(selected&&visible.includes(selected)&&finite(value(selected))){const xx=x(selected),yy=y(value(selected));ctx.strokeStyle=pageColor('ink');ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=pageColor('ink');ctx.beginPath();ctx.arc(xx,yy,4,0,Math.PI*2);ctx.fill();}
 canvas.setAttribute('aria-label',`${meta().label} timeline in ${meta().unit||'index units'}. ${vals.length} valid observations. Use left and right arrow keys to browse.`);
}
function apply(){visible=records.filter(r=>$('day').value==='all'||r.day===$('day').value);if(marker){marker.remove();marker=null;}selected=null;renderLegend();renderRoute();summary();selectRecord(visible.find(r=>finite(value(r)))||visible[0]);}
function heroRoute(){const svg=$('hero-route'),ns='http://www.w3.org/2000/svg',pts=records.filter(mappable);if(!pts.length)return;const project=r=>[260+(r.lon+127.5)*Math.cos(52*Math.PI/180)*48,270-(r.lat-52)*48];const trackPath=document.createElementNS(ns,'path');trackPath.setAttribute('d',routeTrack.map((r,i)=>{const [x,y]=project(r);return `${i&&connected(routeTrack[i-1],r)?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join(''));trackPath.setAttribute('fill','none');trackPath.setAttribute('stroke','#789f95');trackPath.setAttribute('stroke-width','1.5');svg.append(trackPath);let d='';for(let i=0;i<pts.length;i++){const p=project(pts[i]);d+=`${i&&connected(pts[i-1],pts[i])?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;}const path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','#b3dcc7');path.setAttribute('stroke-width','1.8');svg.append(path);const dots=document.createElementNS(ns,'path');dots.setAttribute('d',pts.filter((r,i)=>i%4===0).map(r=>{const [x,y]=project(r);return `M${x.toFixed(1)},${y.toFixed(1)}l.1,0`;}).join(''));dots.setAttribute('stroke','#b3dcc7');dots.setAttribute('stroke-width','2');dots.setAttribute('stroke-opacity','.55');dots.setAttribute('stroke-linecap','round');svg.append(dots);for(const [r,label] of [[routeTrack[0]||pts[0],'VICTORIA'],[routeTrack.at(-1)||pts.at(-1),'KETCHIKAN / FINISH']]){const [x,y]=project(r);const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','4');circle.setAttribute('fill','#eef5e7');svg.append(circle);const text=document.createElementNS(ns,'text');text.setAttribute('x',x+10);text.setAttribute('y',y+20);text.setAttribute('class','svg-label');text.textContent=label;svg.append(text);}}
async function init(){for(const group of CONFIG.pollutantGroups){const optgroup=document.createElement('optgroup');optgroup.label=group.label;for(const k of group.keys){const o=document.createElement('option');o.value=k;o.textContent=CONFIG.pollutants[k].label;optgroup.append(o);}$('pollutant').append(optgroup);}$('pollutant').value=key;
 try{const response=await fetch('data/june-2026.json');if(!response.ok)throw Error(`Archive request failed (${response.status})`);const data=await response.json();routeTrack=(data.route_track?.rows||[]).filter(r=>(!data.position_matching?.race_start||r[0]>=data.position_matching.race_start)&&(!data.position_matching?.race_finish||r[0]<=data.position_matching.race_finish)).map(r=>({time:r[0],lat:r[1],lon:r[2],day:dateFormat.format(r[0]*1000)}));records=data.rows.map(row=>Object.fromEntries(data.columns.map((c,i)=>[c,row[i]]))).filter(r=>dateFormat.format(r.time*1000).startsWith('2026-06')&&(!data.position_matching?.race_start||r.time>=data.position_matching.race_start)&&(!data.position_matching?.race_finish||r.time<=data.position_matching.race_finish)).map(r=>({...r,day:dateFormat.format(r.time*1000)}));if(!records.length)throw Error('No June records found.');const days=[...new Set(records.map(r=>r.day))];for(const d of days){const option=document.createElement('option');option.value=d;option.textContent=shortDate.format(records.find(r=>r.day===d).time*1000);$('day').append(option);}heroRoute();initMap();if(map)$('map-status').hidden=true;apply();
 }catch(error){$('map-status').textContent='The June archive could not load. Please reload the page to try again.';console.error(error);return;}
 $('pollutant').addEventListener('change',()=>{key=$('pollutant').value;apply();});$('day').addEventListener('change',apply);$('reset').addEventListener('click',fitRoute);
 $('chart').addEventListener('click',e=>{if(!chartGeometry)return;const {left,right,t0,t1}=chartGeometry;const x=e.clientX-$('chart').getBoundingClientRect().left;const time=t0+Math.max(0,Math.min(1,(x-left)/(right-left)))*(t1-t0);selectRecord(visible.reduce((best,r)=>Math.abs(r.time-time)<Math.abs(best.time-time)?r:best));});
 $('chart').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();keyIndex=e.key==='Home'?0:e.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,keyIndex+(e.key==='ArrowRight'?1:-1)));selectRecord(visible[keyIndex]);});new ResizeObserver(()=>drawChart()).observe($('chart').parentElement);
}
init();

window.addEventListener('elusive-theme-change',()=>{if(visible.length)drawChart();});
