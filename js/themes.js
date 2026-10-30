'use strict';
// Optional visual test harness. Ordinary visits never apply a preview theme.
(() => {
  const url = new URL(window.location.href);
  if (url.searchParams.get('themes') !== '1') return;
  const themes = [
    {id:'sea-glass',name:'Sea glass · current',note:'The original navy, cream and sea green.',colors:['#f5f4ed','#15343b','#607375','#d8ded7','#102c34','#f5f4ed','#bdcdcd','#b3dcc7','#102c34','#b3dcc7','#fffef9','#e9ece4','#4b6467','#d4eadc','#a9bfbd']},
    {id:'admiralty',name:'Admiralty chart',note:'Warm ivory, deep navy and brass.',colors:['#F3F0E5','#24343A','#617071','#D9D5C8','#18333F','#F3F0E5','#C3CFCE','#C8AA68','#18333F','#A9CBBF','#FCFAF2','#E8E3D5','#4B5D60','#DDC48D','#B7C8C4']},
    {id:'harbour',name:'Working harbour',note:'Charcoal teal with a buoy-orange accent.',colors:['#ECEFEC','#263431','#5E7069','#CCD5CE','#243B3B','#F1F4EE','#C6D2C8','#D98255','#222E2B','#B8D2C4','#F7F9F5','#DDE4DC','#435A51','#E79D77','#BCCFC3']},
    {id:'regatta',name:'Faded regatta',note:'Sailcloth, indigo and weathered red.',colors:['#F7F0DF','#26384D','#68717C','#DFD6C4','#354B68','#FFF8E9','#D7DFE8','#B9554D','#FFFFFF','#F2DCA6','#FFFAEF','#EDE3D0','#4D5F73','#A1433C','#D5DFEA']},
    {id:'north-pacific',name:'North Pacific',note:'Cool paper, slate blue and muted gold.',colors:['#F0F4F5','#233B4A','#5D7480','#D0DDE1','#263E50','#F4F8FA','#C3D3DF','#DDC68D','#233B4A','#B7D8E6','#FAFDFD','#E0E9ED','#496675','#EAD9AD','#B8CBD8']},
    {id:'evening-watch',name:'Evening watch',note:'Warm paper, oxblood and soft peach.',colors:['#F5EEE8','#413432','#7A6760','#E0D2C9','#462D36','#FFF3E8','#DEC9C6','#E2B48C','#382A2D','#EBCFA6','#FFF9F1','#EADDD2','#69524C','#F0C8A4','#D7BFC1']}
  ];
  const keys=['paper','ink','muted','line','hero','hero-text','hero-muted','accent','button-text','sea','panel','footer','about-text','button-hover','hero-soft'];
  let index=Math.max(0,themes.findIndex(t=>t.id===url.searchParams.get('theme')));
  const panel=document.createElement('details');panel.id='theme-tester';panel.open=true;panel.setAttribute('aria-label','Testing-only theme selector');
  const summary=document.createElement('summary');summary.textContent='Theme tester';
  const body=document.createElement('div');body.className='theme-tester-body';
  const label=document.createElement('label');label.htmlFor='theme-choice';label.textContent='Preview palette';
  const select=document.createElement('select');select.id='theme-choice';
  themes.forEach((t,i)=>{const o=document.createElement('option');o.value=t.id;o.textContent=`${i+1}. ${t.name}`;select.append(o);});
  const swatches=document.createElement('div');swatches.className='theme-swatches';swatches.setAttribute('aria-hidden','true');
  const note=document.createElement('p');note.className='theme-description';note.setAttribute('aria-live','polite');
  const controls=document.createElement('div');controls.className='theme-test-controls';
  const previous=document.createElement('button');previous.type='button';previous.textContent='← Previous';
  const next=document.createElement('button');next.type='button';next.textContent='Next →';
  const exit=document.createElement('button');exit.type='button';exit.textContent='Exit tester';exit.className='theme-exit';
  const hint=document.createElement('p');hint.className='theme-test-hint';hint.textContent='Testing only. Measurement colours stay the same. This URL keeps your selection.';
  controls.append(previous,next,exit);body.append(label,select,swatches,note,controls,hint);panel.append(summary,body);document.body.append(panel);
  function apply(updateUrl=true){
    const t=themes[index];keys.forEach((key,i)=>document.documentElement.style.setProperty('--'+key,t.colors[i]));
    document.documentElement.style.setProperty('--focus',t.colors[7]);
    document.documentElement.dataset.previewTheme=t.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t.colors[4]);
    select.value=t.id;note.textContent=t.note;
    swatches.replaceChildren(...[t.colors[0],t.colors[4],t.colors[7],t.colors[9],t.colors[1]].map(c=>{const s=document.createElement('span');s.style.background=c;return s;}));
    if(updateUrl){const nextUrl=new URL(window.location.href);nextUrl.searchParams.set('theme',t.id);history.replaceState(null,'',nextUrl);}
    window.dispatchEvent(new Event('elusive-theme-change'));
  }
  select.addEventListener('change',()=>{index=themes.findIndex(t=>t.id===select.value);apply();});
  previous.addEventListener('click',()=>{index=(index+themes.length-1)%themes.length;apply();});
  next.addEventListener('click',()=>{index=(index+1)%themes.length;apply();});
  exit.addEventListener('click',()=>{
    keys.concat(['focus']).forEach(k=>document.documentElement.style.removeProperty('--'+k));delete document.documentElement.dataset.previewTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#102c34');
    const nextUrl=new URL(window.location.href);nextUrl.searchParams.delete('themes');nextUrl.searchParams.delete('theme');history.replaceState(null,'',nextUrl);panel.remove();window.dispatchEvent(new Event('elusive-theme-change'));
  });
  apply(false);
})();
