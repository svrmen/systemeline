/* Route contexts reuse the established geometry engine synchronously. No renderer,
   persistence, or event may run with another route's parameters left installed. */
const ROUTE_FIELDS=['segs','calc','module','dimOffsets','annos','annoSeq','lastDir','routeName','routeOffset'];
let routeContextDepth=0, routeInteractive=true, routesUIReady=false;
function activeRouteData(){
  return {...singleProjectSnapshot(),id:state.activeRouteId,name:state.routeName,offset:{...state.routeOffset},lastDir:state.lastDir};
}
function routeEntries(){
  const active=activeRouteData();
  return state.routes.length?state.routes.map(route=>route.id===state.activeRouteId?active:route):[active];
}
function installRoute(route){
  Object.assign(state,{segs:route.segs,calc:route.calc,module:route.module,dimOffsets:route.dimOffsets,annos:route.annos,annoSeq:route.annoSeq,lastDir:route.lastDir||'+Z',routeName:route.name,routeOffset:{...route.offset}});
  $('mat').value=route.ui.mat;fillRatings(false);
  for(const key of PROJECT_UI_KEYS)$(key).value=route.ui[key];
}
function withRoute(route,action){
  const fields=Object.fromEntries(ROUTE_FIELDS.map(key=>[key,state[key]]));
  const ui=Object.fromEntries(PROJECT_UI_KEYS.map(key=>[key,$(key).value]));
  const equipment={...equipmentDimensions},previousId=state.activeRouteId,previousAnnoId=annoId;
  routeContextDepth++;
  try{state.activeRouteId=route.id;installRoute(route);return action(route);}
  finally{
    Object.assign(state,fields);state.activeRouteId=previousId;annoId=previousAnnoId;
    $('mat').value=ui.mat;fillRatings(false);for(const key of PROJECT_UI_KEYS)$(key).value=ui[key];
    Object.assign(equipmentDimensions,equipment);routeContextDepth--;
  }
}
function visibleRoutes(){return state.showAllRoutes?routeEntries():[activeRouteData()];}
function specificationRoutes(){return state.specScope==='all'?routeEntries():[activeRouteData()];}
function unionBounds(bounds,axes){return Object.fromEntries(axes.flatMap(axis=>[['min'+axis,Math.min(...bounds.map(b=>b['min'+axis]))],['max'+axis,Math.max(...bounds.map(b=>b['max'+axis]))]]));}
function sceneFloorBounds(){return unionBounds(visibleRoutes().map(route=>withRoute(route,floorBoundsXY)),['X','Y']);}
function sceneProjectedBounds(){return unionBounds(visibleRoutes().map(route=>withRoute(route,routeBoundsProjected)),['X','Y']);}
function routeDimensionLabel(label){return state.showAllRoutes&&state.showAllDimensions&&state.routes.length>1?`${state.routeName} · ${label}`:label;}
function drawSceneRoutes(){
  dimLayer.innerHTML='';dimensionBoxes=[];
  const routes=visibleRoutes().sort((a,b)=>Number(a.id===state.activeRouteId)-Number(b.id===state.activeRouteId));
  const activeId=state.activeRouteId;
  try{for(const route of routes)withRoute(route,()=>{
    routeInteractive=route.id===activeId;
    drawStartCab();drawPath();drawEndCab();if(state.segs.length)drawEndCap(P().busW);
    if(!routeInteractive&&state.drawAnnoLines){ctx.save();ctx.setTransform(DPR,0,0,DPR,0,0);drawRouteAnnotations(ctx);ctx.restore();}
    if(routes.length>1)drawText3(originTop(),state.routeName,'center',-24/scale,'#365a83');
  });}finally{routeInteractive=true;}
}
function drawOverlayToCanvas(context){
  dimensionBoxes=[];const activeId=state.activeRouteId,previous=routeInteractive;
  try{for(const route of visibleRoutes())withRoute(route,()=>{routeInteractive=route.id===activeId;drawRouteOverlayToCanvas(context);});}
  finally{routeInteractive=previous;}
}
function validateRouteFields(){
  if(!routesUIReady)return;
  if(!$('routeName').value.trim())throw new Error('Введите название трассы.');
  for(const axis of ['X','Y','Z']){
    const value=$('route'+axis).value;
    if(String(value).trim()===''||!Number.isFinite(Number(value))||Math.abs(Number(value))>1000000)throw new Error('Координаты начала: конечные числа от −1 000 000 до 1 000 000 мм.');
  }
}
function validateProjectSnapshot(snapshot){
  const root=validateSingleProjectSnapshot(snapshot);
  if(snapshot.version!==undefined&&snapshot.version!==4)throw new Error('Версия проекта не поддерживается.');
  const raw=snapshot.routes??[{...root,id:'r1',name:'Трасса 1',offset:{x:0,y:0,z:0}}];
  if(!Array.isArray(raw)||!raw.length||raw.length>20)throw new Error('Проект должен содержать от 1 до 20 трасс.');
  const ids=new Set();
  const routes=raw.map(route=>{
    if(!route||typeof route.id!=='string'||!/^r[1-9]\d*$/.test(route.id)||ids.has(route.id))throw new Error('Некорректный или повторный номер трассы.');
    ids.add(route.id);
    if(typeof route.name!=='string'||!route.name.trim()||route.name.length>80)throw new Error('Название трассы: от 1 до 80 символов.');
    if(!route.offset||!['x','y','z'].every(axis=>Number.isFinite(route.offset[axis])&&Math.abs(route.offset[axis])<=1000000))throw new Error('Некорректные координаты трассы.');
    const clean=validateSingleProjectSnapshot(route);
    return {...clean,id:route.id,name:route.name.trim(),offset:{...route.offset},lastDir:['+X','-X','+Y','-Y','+Z','-Z'].includes(route.lastDir)?route.lastDir:'+Z'};
  });
  const activeRouteId=snapshot.activeRouteId??routes[0].id;
  if(!ids.has(activeRouteId))throw new Error('Выбранная трасса отсутствует в проекте.');
  if(snapshot.showAllRoutes!==undefined&&typeof snapshot.showAllRoutes!=='boolean')throw new Error('Некорректный режим общего вида.');
  if(snapshot.showAllDimensions!==undefined&&typeof snapshot.showAllDimensions!=='boolean')throw new Error('Некорректный режим размеров.');
  if(snapshot.specScope!==undefined&&!['active','all'].includes(snapshot.specScope))throw new Error('Некорректная область спецификации.');
  return {...root,version:4,routes,activeRouteId,showAllRoutes:snapshot.showAllRoutes??false,showAllDimensions:snapshot.showAllDimensions??false,specScope:snapshot.specScope??'active'};
}
function projectSnapshot(){
  validateRouteFields();
  return {...singleProjectSnapshot(),version:4,routes:routeEntries(),activeRouteId:state.activeRouteId,showAllRoutes:state.showAllRoutes,showAllDimensions:state.showAllDimensions,specScope:state.specScope};
}
function commitActiveRoute(){
  const clean=validateProjectSnapshot(projectSnapshot());state.routes=clean.routes;return clean;
}
function updateRouteControls(){
  if(!routesUIReady)return;
  const select=$('routeSelect');select.innerHTML='';
  for(const route of routeEntries()){const option=document.createElement('option');option.value=route.id;option.textContent=route.name;select.appendChild(option);}
  select.value=state.activeRouteId;$('routeName').value=state.routeName;
  for(const axis of ['X','Y','Z'])$('route'+axis).value=state.routeOffset[axis.toLowerCase()];
  $('showAllRoutes').checked=state.showAllRoutes;$('specScope').value=state.specScope;
  $('showAllDimensions').checked=state.showAllDimensions;
  $('routeRemove').disabled=state.routes.length<=1;
  $('routeHint').textContent=state.showAllRoutes?'Общий вид. Размеры и выноски редактируются у выбранной трассы.':'Показана выбранная трасса. Координаты — нижний угол оборудования в начале, мм.';
}
function closeRouteEditors(){
  for(const popup of [pop,epop,apop])popup.style.display='none';
  state.editingIdx=null;state.movingAnno={id:null,what:null,view:null};state.addAnno=false;wrap.style.cursor='';
}
function switchRoute(id){
  try{
    commitActiveRoute();const route=state.routes.find(route=>route.id===id);if(!route)throw new Error('Трасса не найдена.');
    closeRouteEditors();state.activeRouteId=id;installRoute(route);ensureAnnoNumbers();
    $('endDims').classList.toggle('hid',$('endType').value!=='NKU');syncModule();updateRouteControls();
    $('routeStatus').textContent='';fit();renderSpec();saveState();return true;
  }catch(error){$('routeStatus').textContent='Не удалось переключить трассу: '+error.message;$('routeSelect').value=state.activeRouteId;return false;}
}
function addRoute(kind='TR_NKU',copy=false){
  try{
    commitActiveRoute();if(state.routes.length>=20)throw new Error('Достигнут предел 20 трасс.');
    let number=1;while(state.routes.some(route=>route.id==='r'+number))number++;
    const source=activeRouteData(),route=JSON.parse(JSON.stringify(source));
    route.id='r'+number;route.name=copy?`${source.name.slice(0,64)} (копия)`:kind==='NKU_NKU'?'Связь НКУ':`ТР${number} → НКУ${number}`;
    route.offset.y+=4000;
    route.annos=[];route.annoSeq=1;route.dimOffsets=Object.fromEntries(PROJECT_VIEWS.map(view=>[view,{}]));
    let linked=false;
    if(!copy){
      route.segs=[];route.calc=false;route.ui.startType=kind==='NKU_NKU'?'NKU':'TR';route.ui.endType='NKU';
      if(kind!=='NKU_NKU'){route.ui.startW=2000;route.ui.startD=1400;route.ui.startH=1700;}
      else{
        const ends=state.routes.filter(candidate=>candidate.segs.length&&candidate.ui.endType==='NKU').slice(0,2);
        if(ends.length===2){
          const a=withRoute(ends[0],endPoint),b=withRoute(ends[1],endPoint);
          for(const key of ['W','D','H']){route.ui['start'+key]=ends[0].ui['end'+key];route.ui['end'+key]=ends[1].ui['end'+key];}
          route.offset={x:a[0]-route.ui.startW/2,y:a[1]-route.ui.startD/2,z:a[2]-route.ui.startH};
          ['X','Y','Z'].forEach((axis,index)=>{const delta=b[index]-a[index];if(delta)route.segs.push({dir:(delta>0?'+':'-')+axis,len:Math.abs(delta)});});
          if(!route.segs.length)throw new Error('Выбранные НКУ совпадают. Измените координаты исходных трасс.');
          linked=true;
        }
      }
    }
    validateProjectSnapshot({...projectSnapshot(),routes:[...state.routes,route]});
    state.routes.push(route);state.showAllRoutes=true;state.specScope='all';switchRoute(route.id);
    $('routeStatus').textContent=copy?'Геометрия скопирована со смещением 4000 мм по Y. Выноски и положения размеров создаются отдельно.':linked?'Связь построена между концами первых двух непустых трасс к НКУ. Проверьте исполнение и путь. Координаты зафиксированы; после изменения исходных трасс связь нужно скорректировать.':'Новая трасса пустая. Постройте её стрелками или используйте «Копия» существующей.';
    return route.id;
  }catch(error){$('routeStatus').textContent=error.message;return null;}
}
function removeActiveRoute(){
  if(state.routes.length<=1)return false;
  try{commitActiveRoute();state.routes=state.routes.filter(route=>route.id!==state.activeRouteId);const route=state.routes[0];state.activeRouteId=route.id;installRoute(route);closeRouteEditors();ensureAnnoNumbers();updateRouteControls();fit();renderSpec();saveState();return true;}
  catch(error){$('routeStatus').textContent=error.message;return false;}
}
function calculateAllRoutes(){
  try{
    commitActiveRoute();state.routes.forEach(route=>route.calc=route.segs.length>0);state.calc=state.segs.length>0;
    state.specScope='all';updateRouteControls();draw();renderSpec();saveState();$('routeStatus').textContent='Разбиение рассчитано для всех непустых трасс.';return true;
  }catch(error){$('routeStatus').textContent=error.message;return false;}
}
function specForScope(){
  const entries=specificationRoutes();if(entries.length===1)return computeSpec();
  const specs=entries.map(route=>withRoute(route,()=>({...computeSpec(),route})));
  const result={module:'По трассам',parts:new Map(),joints:{total:0,mod:0,corners:0,nku:0,tr:0},routes:specs};
  for(const key of ['totalLen','straightLen','vert','horiz','nkuBlocks','trBlocks','endCap','mounts','lenHoriz','lenUp','lenDown'])result[key]=specs.reduce((sum,spec)=>sum+spec[key],0);
  for(const spec of specs){for(const key of Object.keys(result.joints))result.joints[key]+=spec.joints[key];for(const [length,count]of spec.parts)result.parts.set(length,(result.parts.get(length)||0)+count);}
  return result;
}
function costForScope(spec){
  if(!spec.routes)return computeCost(spec);
  const grouped=new Map();
  for(const routeSpec of spec.routes)withRoute(routeSpec.route,()=>{
    for(const line of computeCost(routeSpec).lines){
      const unit=typeof line.qty==='string'?'м':'шт',quantity=line.quantity??parseFloat(line.qty);
      const key=JSON.stringify([line.ref,unit,line.ref.startsWith('Уточнить')?[$('mat').value,$('rating').value,$('ip').value,conductorCode(),line.title]:null]);
      if(!grouped.has(key))grouped.set(key,{...line,quantity:0,unit,routes:[]});
      const target=grouped.get(key);target.quantity+=quantity;target.routes.push(routeSpec.route.name);
    }
  });
  const lines=[...grouped.values()].map(line=>({...line,qty:line.unit==='м'?line.quantity.toFixed(3)+' м':line.quantity,sum:line.price==null?null:Math.round(line.quantity*line.price*100)/100}));
  const missingPrices=lines.filter(line=>line.sum==null).length;
  return {lines,missingPrices,total:missingPrices?null:lines.reduce((sum,line)=>sum+Math.round(line.sum*100),0)/100};
}
function exportScopeReady(){
  try{validateProjectSnapshot(projectSnapshot());}catch(error){msg.textContent='Исправьте параметры перед экспортом: '+error.message;return false;}
  const pending=specificationRoutes().filter(route=>route.segs.length&&!route.calc);
  if(pending.length){msg.textContent='Сначала рассчитайте разбиение: '+pending.map(route=>route.name).join(', ');return false;}
  if(!specificationRoutes().some(route=>route.segs.length)){msg.textContent='Нет участков для экспорта.';return false;}return true;
}
function captureProjectViews(all=state.showAllRoutes){
  const previous={view:viewMode,projection:proj,panX,panY,scale,all:state.showAllRoutes};
  try{
    state.showAllRoutes=all;
    return PROJECT_VIEWS.map(view=>{setProjection(view);const canvas=captureWithOverlay();return {name:view,src:canvas.toDataURL('image/png')};});
  }finally{viewMode=previous.view;proj=previous.projection;panX=previous.panX;panY=previous.panY;scale=previous.scale;state.showAllRoutes=previous.all;document.querySelectorAll('.viewbtn[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===viewMode));draw();}
}
function routeSummaryRows(){
  return specificationRoutes().map(route=>withRoute(route,()=>{
    const spec=computeSpec();
    return [route.name,$('mat').value,Number($('rating').value),$('ip').value,conductorLabel(),$('orientation').value==='EDGE'?'На ребро':'На плоскость',spec.module,spec.totalLen,spec.straightLen,spec.nkuBlocks,spec.trBlocks,spec.joints.total,spec.mounts,route.calc?'Рассчитано':'Без разбиения'];
  }));
}
function initRoutesUI(){
  if(!state.routes.length)state.routes=[activeRouteData()];routesUIReady=true;updateRouteControls();
  $('routeSelect').addEventListener('change',()=>switchRoute($('routeSelect').value));
  $('routeAdd').onclick=()=>addRoute($('routeKind').value);
  $('routeCopy').onclick=()=>addRoute('TR_NKU',true);$('routeRemove').onclick=removeActiveRoute;$('calcAll').onclick=calculateAllRoutes;
  $('routeName').addEventListener('input',()=>{if(!$('routeName').value.trim()){$('routeStatus').textContent='Введите название трассы.';return;}state.routeName=$('routeName').value.trim();$('routeStatus').textContent='';saveState();const selected=$('routeSelect').selectedOptions?.[0];if(selected)selected.textContent=state.routeName;draw();renderSpec();});
  for(const axis of ['X','Y','Z'])$('route'+axis).addEventListener('input',()=>{
    try{
      validateRouteFields();const before={...state.routeOffset};
      for(const key of ['x','y','z'])state.routeOffset[key]=Number($('route'+key.toUpperCase()).value);
      // Callouts use projected model coordinates; move both ends with their route.
      const delta=[state.routeOffset.x-before.x,state.routeOffset.y-before.y,state.routeOffset.z-before.z];
      for(const anno of state.annos)for(const [view,p]of Object.entries(anno.pos)){const shift=projectRouteDelta(view,delta);p.ax+=shift[0];p.ay+=shift[1];p.bx+=shift[0];p.by+=shift[1];}
      $('routeStatus').textContent='';draw();saveState();
    }catch(error){$('routeStatus').textContent=error.message;}
  });
  $('showAllRoutes').addEventListener('change',()=>{state.showAllRoutes=$('showAllRoutes').checked;updateRouteControls();fit();saveState();});
  $('showAllDimensions').addEventListener('change',()=>{state.showAllDimensions=$('showAllDimensions').checked;draw();saveState();});
  $('specScope').addEventListener('change',()=>{state.specScope=$('specScope').value;renderSpec();saveState();});
}
function projectRouteDelta(view,[x,y,z]){return view==='ISO'?[(x-y)*C,(x+y)*S-z]:view==='TOP'?[x,-y]:view==='FRONT'?[x,-z]:view==='BACK'?[-x,-z]:view==='LEFT'?[y,-z]:[-y,-z];}
