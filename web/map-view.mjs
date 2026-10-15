const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const btn=(text,fn,label)=>{const b=el('button','',text);b.type='button';b.addEventListener('click',fn);if(label)b.setAttribute('aria-label',label);return b;};
export function mapControls(state,redraw){
  const bar=el('div','map-controls');
  const zoom=(change)=>{state.zoom=Math.max(.35,Math.min(1.75,Math.round((state.zoom+change)*100)/100));redraw();};
  bar.append(btn('−',()=>zoom(-.15),'缩小地图'),el('output','zoom-value',`${Math.round(state.zoom*100)}%`),btn('+',()=>zoom(.15),'放大地图'));
  bar.append(btn('适合宽度',()=>{state.fit=true;state.scrollLeft=0;state.scrollTop=0;redraw();}),btn('重置',()=>{state.zoom=1;state.focus=null;state.collapsed.clear();state.scrollLeft=0;state.scrollTop=0;redraw();}));
  const links=btn(state.links?'引用连线：开':'引用连线：关',()=>{state.links=!state.links;redraw();});links.setAttribute('aria-pressed',String(state.links));bar.append(links);
  if(state.focus)bar.append(btn('退出聚焦',()=>{state.focus=null;state.scrollTop=0;redraw();}));
  bar.append(el('span','map-gesture','拖动空白处平移 · Ctrl/⌘ + 滚轮缩放'));
  return bar;
}
export function mountMap(host,map,state,links,onLink,redraw){
  const viewport=el('div','map-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','可缩放知识地图，方向键平移');
  const frame=el('div','map-frame');frame.append(map);viewport.append(frame);host.append(viewport);
  map.style.width=`${Math.max(720,viewport.clientWidth)}px`;
  const worldWidth=parseFloat(map.style.width);
  if(state.fit){state.zoom=Math.max(.35,Math.min(1,(viewport.clientWidth-12)/worldWidth));state.fit=false;host.querySelector('.zoom-value').textContent=`${Math.round(state.zoom*100)}%`;}
  map.style.transform=`scale(${state.zoom})`;
  frame.style.width=`${worldWidth*state.zoom}px`;frame.style.height=`${map.offsetHeight*state.zoom}px`;
  viewport.scrollLeft=state.scrollLeft;viewport.scrollTop=state.scrollTop;
  viewport.addEventListener('scroll',()=>{state.scrollLeft=viewport.scrollLeft;state.scrollTop=viewport.scrollTop;});
  let drag=null;
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0 || e.target.closest('button,input,a,svg'))return;
    drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');
  });
  viewport.addEventListener('pointermove',e=>{if(drag){viewport.scrollLeft=drag.left+drag.x-e.clientX;viewport.scrollTop=drag.top+drag.y-e.clientY;}});
  const end=()=>{drag=null;viewport.classList.remove('panning');};viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
  viewport.addEventListener('keydown',e=>{if(e.target!==viewport)return;const delta={ArrowUp:[0,-80],ArrowDown:[0,80],ArrowLeft:[-80,0],ArrowRight:[80,0]}[e.key];if(delta){e.preventDefault();viewport.scrollBy(...delta);}});
  viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();state.zoom=Math.max(.35,Math.min(1.75,state.zoom+(e.deltaY<0?.1:-.1)));redraw();}},{passive:false});
  if(!state.links)return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('reference-edges');svg.setAttribute('width',String(worldWidth));svg.setAttribute('height',String(map.offsetHeight));
  map.append(svg);
  const cards=new Map(Array.from(map.querySelectorAll('.doc-node')).filter(n=>!n.closest('[hidden]')).map(n=>[n.dataset.path,n]));
  const bounds=map.getBoundingClientRect();let shown=0,total=0;
  for(const link of links){
    if(!['linked','fragment_unchecked'].includes(link.status) || link.from===link.target || !cards.has(link.from) || !cards.has(link.target))continue;
    total++;if(shown>=60)continue;
    const from=cards.get(link.from).getBoundingClientRect(),to=cards.get(link.target).getBoundingClientRect();
    const x1=(from.right-bounds.left)/state.zoom,y1=(from.top-bounds.top)/state.zoom+20;
    const x2=(to.right-bounds.left)/state.zoom,y2=(to.top-bounds.top)/state.zoom+20;
    const lane=Math.min(worldWidth-8,Math.max(x1,x2)+26+(shown%5)*12);
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',`M ${x1} ${y1} C ${lane} ${y1}, ${lane} ${y2}, ${x2} ${y2}`);
    path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',`${link.from} 引用 ${link.target}，来源行 ${link.line}`);
    const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=`${link.from} → ${link.target} · L${link.line}，点击查看引用原文`;path.append(title);
    path.addEventListener('click',()=>onLink(link));path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onLink(link);}});svg.append(path);shown++;
  }
  if(total){const legend=el('div','edge-legend',`虚线为文档中的显式引用 · 当前显示 ${shown}${total>shown?` / ${total}`:''} 条（最多 60 条）`);host.append(legend);}
}
