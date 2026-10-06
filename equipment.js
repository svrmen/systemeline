/* Equipment is shared by route IDs. Coordinates are the lower corner in mm;
   the connection at the top centre is schematic until FE/FET drawings exist. */
let equipmentUIReady=false,equipmentDrag=null,pendingAutoRoute=null,lastEquipmentAction=null;
const emptyBindings=()=>({start:null,end:null});
const defaultRouting=()=>({mode:'manual',level:3700,order:'XY',path:'OVERHEAD'});
function equipmentById(id,list=state.equipment){return list.find(item=>item.id===id);}
function manualRouteOrigin(route){const o=route.offset;return route.ui.startType==='NONE'?[o.x,o.y,o.z]:[o.x+Number(route.ui.startW)/2,o.y+Number(route.ui.startD)/2,o.z+Number(route.ui.startH)];}
function routeWorldEnds(route){const start=withRoute(route,originTop);return {start,end:route.segs.reduce((point,seg)=>adv(point,seg.dir,seg.len),start)};}
function equipmentTerminal(item,port=null){const column=equipmentPort(item,port),p=column?.position??item.position,s=column?.size??item.size;return [p.x+s.w/2,p.y+s.d/2,p.z+s.h];}
function equipmentCorners(item){const p=item.position,s=item.size;return [0,s.w].flatMap(x=>[0,s.d].flatMap(y=>[0,s.h].map(z=>[p.x+x,p.y+y,p.z+z])));}
function validateEquipmentProject(snapshot,routes){
  let equipment=snapshot.equipment??[];
  if(snapshot.version===4&&snapshot.equipment===undefined){
    const migrated=equipmentFromRoutes(routes);equipment=migrated.equipment;routes=migrated.routes;
  }
  if(!Array.isArray(equipment)||equipment.length>40)throw new Error('В проекте допускается до 40 объектов оборудования.');
  const ids=new Set();
  equipment=equipment.map(item=>{
    if(!item||!/^e[1-9]\d*$/.test(item.id)||ids.has(item.id))throw new Error('Некорректный или повторный ID оборудования.');ids.add(item.id);
    if(!['TR','NKU'].includes(item.kind)||typeof item.name!=='string'||!item.name.trim()||item.name.length>80)throw new Error('Проверьте тип и название оборудования.');
    if(!item.position||!['x','y','z'].every(k=>Number.isFinite(item.position[k])&&Math.abs(item.position[k])<=1000000))throw new Error('Координаты оборудования: от −1 000 000 до 1 000 000 мм.');
    if(!item.size||!['w','d','h'].every(k=>Number.isFinite(item.size[k])&&item.size[k]>0&&item.size[k]<=100000))throw new Error('Габариты оборудования: положительные числа до 100 000 мм.');
    const columns=validateNKUColumns(item,snapshot.version!==6);
    return {id:item.id,name:item.name.trim(),kind:item.kind,position:{...item.position},size:{...item.size},...(columns?{columns}:{})};
  });
  routes=routes.map(route=>{
    const bindings=route.bindings??emptyBindings(),routing={...defaultRouting(),...route.routing};
    if(!bindings||!['start','end'].every(key=>bindings[key]===null||typeof bindings[key]==='string'&&ids.has(bindings[key])))throw new Error('Оборудование привязанной трассы отсутствует.');
    if(bindings.start&&bindings.start===bindings.end)throw new Error('Начало и конец трассы должны быть разными объектами.');
    if(bindings.end&&equipmentById(bindings.end,equipment).kind!=='NKU')throw new Error('В конце трассы выберите НКУ.');
    if(!['manual','auto'].includes(routing.mode)||!['XY','YX'].includes(routing.order)||!['OVERHEAD','DIRECT'].includes(routing.path)||!Number.isFinite(routing.level)||Math.abs(routing.level)>1000000)throw new Error('Некорректные настройки пути трассы.');
    const clean={...route,bindings:{start:bindings.start,end:bindings.end},routing};
    clean.ports=validateRoutePorts(clean,equipment,snapshot.version!==6);
    // Reject inconsistent saved bindings rather than moving equipment on load.
    for(const side of ['start','end'])if(bindings[side]){
      const item=equipmentById(bindings[side],equipment);
      if(route.ui[side+'Type']!==item.kind||['w','d','h'].some(k=>Number(route.ui[side+k.toUpperCase()])!==item.size[k]))throw new Error('Габариты привязанной трассы не совпадают с оборудованием.');
      if(side==='start'&&['x','y','z'].some(k=>route.offset[k]!==item.position[k]))throw new Error('Начало трассы не совпадает с размещением оборудования.');
    }
    if(routing.mode==='auto'){
      if(!bindings.start||!bindings.end)throw new Error('Автоматическая трасса требует два выбранных объекта.');
      const expected=equipmentPath(equipmentById(bindings.start,equipment),equipmentById(bindings.end,equipment),routing,clean.ports);
      if(JSON.stringify(route.segs)!==JSON.stringify(expected))throw new Error('Путь автоматической трассы не совпадает с оборудованием.');
    }
    return clean;
  });
  return {equipment,routes};
}
function equipmentFromRoutes(entries){
  const equipment=[],routes=JSON.parse(JSON.stringify(entries));
  const get=(kind,position,size)=>{
    let item=equipment.find(e=>e.kind===kind&&JSON.stringify(e.position)===JSON.stringify(position)&&JSON.stringify(e.size)===JSON.stringify(size));
    if(!item){const n=equipment.filter(e=>e.kind===kind).length+1;item={id:'e'+(equipment.length+1),name:(kind==='TR'?'ТР':'НКУ')+n,kind,position,size,...(kind==='NKU'?{columns:singleNKUColumn(size.w)}:{})};equipment.push(item);}return item.id;
  };
  for(const route of routes){
    const ui=route.ui,startSize={w:Number(ui.startW),d:Number(ui.startD),h:Number(ui.startH)},endSize={w:Number(ui.endW),d:Number(ui.endD),h:Number(ui.endH)};
    const end=manualRouteOrigin(route);
    for(const seg of route.segs){const i='XYZ'.indexOf(seg.dir[1]);end[i]+=(seg.dir[0]==='+'?1:-1)*seg.len;}
    route.bindings={start:ui.startType==='NONE'?null:get(ui.startType,{...route.offset},startSize),end:ui.endType==='NKU'&&route.segs.length?get('NKU',{x:end[0]-endSize.w/2,y:end[1]-endSize.d/2,z:end[2]-endSize.h},endSize):null};
    route.ports={start:ui.startType==='NKU'?'c1':null,end:route.bindings.end?'c1':null};
    route.routing={...defaultRouting(),level:Math.max(...route.segs.reduce((points,seg)=>{const p=adv(points[points.length-1],seg.dir,seg.len);return [...points,p];},[[route.offset.x+startSize.w/2,route.offset.y+startSize.d/2,route.offset.z+startSize.h]]).map(p=>p[2]))};
  }
  return {equipment,routes};
}
function equipmentPath(start,end,routing,ports=emptyPorts()){
  const a=equipmentTerminal(start,ports.start),b=equipmentTerminal(end,ports.end),segments=[];let current=[...a];
  const move=(index,value)=>{const delta=value-current[index];if(Math.abs(delta)>1e-7){segments.push({dir:(delta>0?'+':'-')+'XYZ'[index],len:Math.abs(delta)});current[index]=value;}};
  if(a.every((value,i)=>value===b[i]))throw new Error('Точки подключения совпадают. Переместите оборудование.');
  if(routing.path==='OVERHEAD'&&(a[0]!==b[0]||a[1]!==b[1])){
    if(routing.level<Math.max(a[2],b[2]))throw new Error('Отметка трассы должна быть не ниже точек подключения обоих объектов.');
    move(2,routing.level);
  }
  for(const axis of routing.order)move('XYZ'.indexOf(axis),b['XYZ'.indexOf(axis)]);
  move(2,b[2]);return segments;
}
function translateRouteAnnotations(route,delta){for(const anno of route.annos)for(const [view,p]of Object.entries(anno.pos)){const shift=projectRouteDelta(view,delta);for(const key of ['ax','bx'])p[key]+=shift[0];for(const key of ['ay','by'])p[key]+=shift[1];}}
function synchronizeEquipmentRoute(route,equipment,rebuild=true,previousOrigin=null){
  const original=equipmentById(route.bindings?.start),before=previousOrigin??(original?equipmentTerminal(original,route.ports?.start):manualRouteOrigin(route));
  route.ports={...emptyPorts(),...route.ports};
  for(const side of ['start','end']){
    const item=equipmentById(route.bindings?.[side],equipment);if(!item)continue;
    route.ui[side+'Type']=item.kind;for(const key of ['w','d','h'])route.ui[side+key.toUpperCase()]=item.size[key];
    if(side==='start')route.offset={...item.position};
    if(item.kind==='NKU'&&route.ports[side]===null)route.ports[side]=item.columns[0].id;
    if(item.kind!=='NKU')route.ports[side]=null;
  }
  const updated=equipmentById(route.bindings?.start,equipment),after=updated?equipmentTerminal(updated,route.ports.start):manualRouteOrigin(route);
  translateRouteAnnotations(route,after.map((value,i)=>value-before[i]));
  if(rebuild&&route.routing?.mode==='auto')route.segs=equipmentPath(equipmentById(route.bindings.start,equipment),equipmentById(route.bindings.end,equipment),route.routing,route.ports);
}
function applyEquipmentDraft(draft,{fitView=false,persist=true}={}){
  const clean=validateProjectSnapshot(draft);
  state.equipment=clean.equipment;state.routes=clean.routes;installRoute(clean.routes.find(r=>r.id===state.activeRouteId));
  updateRouteControls();updateEquipmentControls();if(fitView)fit();else draw();renderSpec();if(persist)saveState();return true;
}
function updateEquipment(id,patch,{persist=true}={}){
  try{
    const draft=JSON.parse(JSON.stringify(commitActiveRoute())),item=equipmentById(id,draft.equipment);if(!item)throw new Error('Оборудование не найдено.');
    Object.assign(item,patch);for(const route of draft.routes)synchronizeEquipmentRoute(route,draft.equipment);
    applyEquipmentDraft(draft,{persist});$('equipmentStatus').textContent='Положение обновлено. Автоматические трассы перестроены; ручные проверьте по предупреждениям.';return true;
  }catch(error){$('equipmentStatus').textContent=error.message;return false;}
}
function addEquipment(kind){
  try{
    const draft=JSON.parse(JSON.stringify(commitActiveRoute()));if(draft.equipment.length>=40)throw new Error('Достигнут предел 40 объектов.');
    let n=1;while(draft.equipment.some(e=>e.id==='e'+n))n++;
    let count=1;while(draft.equipment.some(e=>e.name===(kind==='TR'?'ТР':'НКУ')+count))count++;
    const item={id:'e'+n,name:(kind==='TR'?'ТР':'НКУ')+count,kind,position:{x:kind==='TR'?0:6000,y:(count-1)*4000,z:0},size:kind==='TR'?{w:2000,d:1400,h:1700}:{w:600,d:600,h:2200}};
    if(kind==='NKU')item.columns=singleNKUColumn(item.size.w);
    draft.equipment.push(item);state.selectedEquipmentId=item.id;applyEquipmentDraft(draft,{fitView:true});return item.id;
  }catch(error){$('equipmentStatus').textContent=error.message;return null;}
}
function importEquipmentFromRoutes(){
  try{
    const draft=commitActiveRoute();if(draft.equipment.length)throw new Error('Оборудование уже создано. Добавьте новый объект кнопками ниже.');
    Object.assign(draft,equipmentFromRoutes(draft.routes));applyEquipmentDraft(draft,{fitView:true});return true;
  }catch(error){$('equipmentStatus').textContent=error.message;return false;}
}
function removeEquipment(){
  try{
    const draft=JSON.parse(JSON.stringify(commitActiveRoute())),id=state.selectedEquipmentId,item=equipmentById(id,draft.equipment);
    if(!item)throw new Error('Выберите объект для удаления.');
    let affected=0;
    for(const route of draft.routes){
      if(!Object.values(route.bindings).includes(id))continue;
      const origin=routeWorldEnds(route).start;
      for(const side of ['start','end'])if(route.bindings[side]===id){
        route.bindings[side]=null;route.ports[side]=null;route.ui[side+'Type']='NONE';
        if(side==='start')route.offset={x:origin[0],y:origin[1],z:origin[2]};
      }
      route.routing.mode='manual';affected++;
    }
    draft.equipment=draft.equipment.filter(e=>e.id!==id);
    applyEquipmentAction(draft,'Удаление '+item.name);state.selectedEquipmentId=null;updateEquipmentControls();
    $('equipmentStatus').textContent=`${item.name} удалён. ${affected?'Связанные трассы сохранены; привязки к объекту сняты.':'Остальные объекты и трассы сохранены.'}`;return true;
  }catch(error){$('equipmentStatus').textContent=error.message;return false;}
}
function equipmentActionFingerprint(snapshot){return JSON.stringify({equipment:snapshot.equipment,routes:snapshot.routes,meta:snapshot.meta});}
function updateEquipmentUndoControl(){
  if(!equipmentUIReady)return;
  let available=false;
  try{available=Boolean(lastEquipmentAction&&!projectStorageBlocked&&equipmentActionFingerprint(validateProjectSnapshot(projectSnapshot()))===equipmentActionFingerprint(lastEquipmentAction.after));}catch(error){}
  for(const id of ['routeBuildUndo','equipmentUndo']){$(id).disabled=!available;$(id).textContent=available?'Отменить: '+lastEquipmentAction.label:'Отменить последнее действие';}
}
function applyEquipmentAction(draft,label){
  if(projectStorageBlocked)throw new Error('Сохранённый проект защищён из-за ошибки восстановления. Сначала сохраните его исходные данные.');
  const before=validateProjectSnapshot(projectSnapshot()),active=draft.routes.find(route=>route.id===draft.activeRouteId);
  const after=validateProjectSnapshot({...draft,...Object.fromEntries(['segs','calc','module','dimOffsets','annos','annoSeq','ui'].map(key=>[key,active[key]]))}),record={version:1,label,before,after};
  // Reserve recovery data and persist the validated result before changing the scene.
  localStorage.setItem(STORAGE_STATE+'.equipmentUndo',JSON.stringify(record));
  localStorage.setItem(STORAGE_STATE,JSON.stringify(after));
  lastEquipmentAction=record;pendingAutoRoute=null;
  applyEquipmentDraft(after,{fitView:true,persist:false});$('storageStatus').textContent='';updateEquipmentUndoControl();
}
function undoEquipmentAction(){
  try{
    const current=validateProjectSnapshot(projectSnapshot());
    if(projectStorageBlocked||!lastEquipmentAction||equipmentActionFingerprint(current)!==equipmentActionFingerprint(lastEquipmentAction.after))throw new Error('После этого действия проект изменился; возврат отключён, чтобы сохранить новые правки.');
    const previous=validateProjectSnapshot(lastEquipmentAction.before),label=lastEquipmentAction.label;
    previous.activeRouteId=current.activeRouteId;previous.showAllRoutes=current.showAllRoutes;previous.showAllDimensions=current.showAllDimensions;previous.specScope=current.specScope;
    localStorage.setItem(STORAGE_STATE,JSON.stringify(previous));
    try{localStorage.removeItem(STORAGE_STATE+'.equipmentUndo');}catch(error){}
    lastEquipmentAction=null;pendingAutoRoute=null;
    applyEquipmentDraft(previous,{fitView:true,persist:false});
    $('routeStatus').textContent=$('equipmentStatus').textContent='Отменено: '+label+'. Прежний путь и оборудование восстановлены.';updateEquipmentUndoControl();return true;
  }catch(error){$('routeStatus').textContent=$('equipmentStatus').textContent=error.message;return false;}
}
function selectedRouteEquipment(route,equipment){
  route.bindings={start:$('routeStartEquipment').value||null,end:$('routeEndEquipment').value||null};
  route.ports={start:$('routeStartColumn').value||null,end:$('routeEndColumn').value||null};
  if(!route.bindings.start||!route.bindings.end)throw new Error('Выберите оборудование в начале и конце трассы.');
  if(route.bindings.start===route.bindings.end)throw new Error('Начало и конец трассы должны быть разными объектами.');
  for(const side of ['start','end'])if(!equipmentById(route.bindings[side],equipment))throw new Error('Выбранное оборудование не найдено.');
  route.ports=validateRoutePorts(route,equipment);
}
function automaticEquipmentDraft(){
  const draft=JSON.parse(JSON.stringify(commitActiveRoute())),route=draft.routes.find(r=>r.id===state.activeRouteId),before=routeWorldEnds(route).start;
  selectedRouteEquipment(route,draft.equipment);
  if(String($('routeLevel').value).trim()==='')throw new Error('Введите отметку трассы.');
  route.routing={mode:'auto',level:Number($('routeLevel').value),order:$('routeOrder').value,path:$('routePath').value};
  if(!Number.isFinite(route.routing.level))throw new Error('Введите конечное число для отметки трассы.');
  synchronizeEquipmentRoute(route,draft.equipment,true,before);route.calc=true;
  return validateProjectSnapshot(draft);
}
function buildEquipmentRoute(){
  try{
    applyEquipmentAction(automaticEquipmentDraft(),'Автоматическое построение');$('routeStatus').textContent='Автоматический путь применён. Перенос оборудования перестраивает эту трассу.';return true;
  }catch(error){$('routeStatus').textContent=error.message;return false;}
}
function connectEquipmentToManualRoute(){
  try{
    const draft=JSON.parse(JSON.stringify(commitActiveRoute())),route=draft.routes.find(r=>r.id===state.activeRouteId),ends=routeWorldEnds(route);
    if(!route.segs.length)throw new Error('Сначала нарисуйте путь либо создайте автоматическую трассу между размещёнными объектами.');
    selectedRouteEquipment(route,draft.equipment);
    for(const side of ['start','end']){
      const item=equipmentById(route.bindings[side],draft.equipment),terminal=equipmentTerminal(item,route.ports[side]),delta=ends[side].map((value,i)=>value-terminal[i]);
      if(delta.some(value=>Math.abs(value)>.000001)){
        const shared=draft.routes.filter(r=>r.id!==route.id&&Object.values(r.bindings).includes(item.id));
        if(shared.length)throw new Error(`${item.name} уже подключён к ${shared.map(r=>r.name).join(', ')}. Его перенос изменит другие линии. Путь сохранён; выберите отдельный объект или совместите точку подключения с концом пути.`);
        for(const [i,key]of ['x','y','z'].entries())item.position[key]+=delta[i];
      }
    }
    route.routing.mode='manual';synchronizeEquipmentRoute(route,draft.equipment,false,ends.start);route.calc=true;
    applyEquipmentAction(draft,'Подключение моего пути');
    $('routeStatus').textContent=`Ваш путь сохранён: ${route.segs.reduce((sum,s)=>sum+s.len,0)} мм. Оборудование размещено на его концах; автоматическая замена выключена.`;return true;
  }catch(error){$('routeStatus').textContent=error.message;return false;}
}
function automaticRouteSelection(){return JSON.stringify(['routeStartEquipment','routeEndEquipment','routeStartColumn','routeEndColumn','routeLevel','routeOrder','routePath'].map(id=>$(id).value));}
function previewAutomaticRoute(){
  try{
    const draft=automaticEquipmentDraft(),route=draft.routes.find(r=>r.id===state.activeRouteId);
    pendingAutoRoute={draft,activeRouteId:state.activeRouteId,fingerprint:equipmentActionFingerprint(validateProjectSnapshot(projectSnapshot())),selection:automaticRouteSelection()};
    const old=state.segs.reduce((sum,s)=>sum+s.len,0),next=route.segs.reduce((sum,s)=>sum+s.len,0);
    $('routeAutoSummary').textContent=`Сейчас: ${old} мм. Новый путь: ${next} мм. Участки: ${route.segs.map(s=>s.dir+' '+s.len+' мм').join(' → ')}. Применение заменит форму и длину выбранной трассы.`;
    $('routeAutoPreview').classList.remove('hid');return true;
  }catch(error){pendingAutoRoute=null;$('routeAutoPreview').classList.add('hid');$('routeStatus').textContent=error.message;return false;}
}
function applyAutomaticPreview(){
  try{
    if(!pendingAutoRoute||pendingAutoRoute.activeRouteId!==state.activeRouteId||pendingAutoRoute.selection!==automaticRouteSelection()||pendingAutoRoute.fingerprint!==equipmentActionFingerprint(validateProjectSnapshot(projectSnapshot())))throw new Error('Параметры или проект изменились. Снова рассчитайте новый путь перед заменой.');
    applyEquipmentAction(pendingAutoRoute.draft,'Автоматическая замена пути');$('routeStatus').textContent='Новый автоматический путь применён. Предыдущий вариант доступен через отмену.';return true;
  }catch(error){$('routeStatus').textContent=error.message;return false;}
}
function detachEquipmentRoute(){
  const origin=originTop();state.routeOffset=$('startType').value==='NONE'?{x:origin[0],y:origin[1],z:origin[2]}:{x:origin[0]-Number($('startW').value)/2,y:origin[1]-Number($('startD').value)/2,z:origin[2]-Number($('startH').value)};state.routeBindings=emptyBindings();state.routePorts=emptyPorts();state.routeRouting.mode='manual';updateRouteControls();draw();renderSpec();saveState();$('routeStatus').textContent='Привязки сняты. Геометрия сохранена для ручного редактирования.';
}
function clearSelectedRoute(){
  try{
    if(!releaseRecoveryStorage())return false;
    const draft=JSON.parse(JSON.stringify(commitActiveRoute())),route=draft.routes.find(r=>r.id===state.activeRouteId);
    Object.assign(route,{segs:[],calc:false,annos:[],annoSeq:1,dimOffsets:Object.fromEntries(PROJECT_VIEWS.map(view=>[view,{}]))});route.routing.mode='manual';
    applyEquipmentAction(draft,'Очистка пути');state.movingAnno={id:null,what:null,view:null};closeRouteEditors();
    msg.textContent='Путь выбранной трассы очищен. Параметры, оборудование и остальные трассы сохранены. Объект удаляется во вкладке «Оборудование».';return true;
  }catch(error){msg.textContent='Путь не очищен: '+error.message;return false;}
}
function boundRouteGap(route=activeRouteData()){
  const item=equipmentById(route.bindings?.end);if(!item||!route.segs.length)return null;
  const end=withRoute(route,endPoint),target=equipmentTerminal(item,route.ports?.end),delta=target.map((value,i)=>value-end[i]);
  return delta.some(value=>Math.abs(value)>.01)?delta:null;
}
function equipmentInScope(routes=visibleRoutes(),planning=state.equipmentEditMode){
  const ids=new Set(routes.flatMap(r=>Object.values(r.bindings??emptyBindings())));return planning?state.equipment:state.equipment.filter(e=>ids.has(e.id));
}
function equipmentBounds(projected){return equipmentInScope().map(item=>{const points=equipmentCorners(item).map(p=>projected?proj(...p):p);return {minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};});}
function drawEquipmentObjects(){
  for(const item of equipmentInScope()){
    const p=item.position,s=item.size,top=equipmentTerminal(item),previous=cadMeta;
    if(item.kind==='NKU')for(const part of nkuColumnGeometry(item))drawEquipmentColumn(part,item);else drawEquipmentColumn({position:p,size:s},item);
    const ports=new Set(visibleRoutes().flatMap(route=>['start','end'].filter(side=>route.bindings?.[side]===item.id).map(side=>route.ports?.[side]??null)));
    if(!ports.size)ports.add(item.columns?.[0]?.id??null);
    for(const port of ports){const point=equipmentTerminal(item,port);cadMeta={type:'CONNECTION_PLATE',equipmentId:item.id,equipmentName:item.name,columnId:port};box(point[0]-60,point[1]-60,point[2],120,120,8,'CAB','#999');}cadMeta=previous;
    drawText3(top,item.name,'center',-20/scale,'#365a83');
    if(!DXF_COLLECT&&state.equipmentEditMode&&state.drawAnnoLines&&item.id===state.selectedEquipmentId){
      const corners=[[p.x,p.y,p.z+s.h],[p.x+s.w,p.y,p.z+s.h],[p.x+s.w,p.y+s.d,p.z+s.h],[p.x,p.y+s.d,p.z+s.h]];
      for(let i=0;i<4;i++)line3(corners[i],corners[(i+1)%4],'#2d6cdf',3/scale,'ANNOT');
    }
  }
}
function updateEquipmentControls(){
  if(!equipmentUIReady)return;
  const options=(select,items,none)=>{select.innerHTML='';if(none){const option=document.createElement('option');option.value='';option.textContent=none;select.appendChild(option);}for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.name+' · '+(item.kind==='TR'?'ТР':'НКУ');select.appendChild(option);}};
  if(!equipmentById(state.selectedEquipmentId))state.selectedEquipmentId=state.equipment[0]?.id??null;
  options($('equipmentSelect'),state.equipment,'Выберите оборудование');$('equipmentSelect').value=state.selectedEquipmentId??'';
  const selected=equipmentById(state.selectedEquipmentId);$('equipmentFields').classList.toggle('hid',!selected);
  if(selected){$('equipmentName').value=selected.name;for(const k of ['x','y','z'])$('equipment'+k.toUpperCase()).value=selected.position[k];for(const k of ['w','d','h'])$('equipment'+k.toUpperCase()).value=selected.size[k];}
  renderNKUColumnEditor(selected);
  $('equipmentImport').disabled=state.equipment.length>0;
  options($('routeStartEquipment'),state.equipment,'Не выбрано');options($('routeEndEquipment'),state.equipment.filter(e=>e.kind==='NKU'),'Не выбрано');
  $('routeStartEquipment').value=state.routeBindings.start??'';$('routeEndEquipment').value=state.routeBindings.end??'';
  for(const side of ['start','end'])routeColumnControl(side,state.routeBindings[side],state.routePorts[side]);
  $('routeLevel').value=state.routeRouting.level;$('routeOrder').value=state.routeRouting.order;$('routePath').value=state.routeRouting.path;
  for(const side of ['start','end'])for(const suffix of ['Type','W','D','H'])$(side+suffix).disabled=Boolean(state.routeBindings[side]);
  for(const axis of ['X','Y','Z'])$('route'+axis).disabled=Boolean(state.routeBindings.start);
  const drawn=state.segs.length>0;
  $('routeBuild').textContent=drawn?'Подключить мой путь':'Создать между объектами';
  $('routeAutomaticSettings').open=!drawn;
  $('routeOriginLabel').textContent=$('startType').value==='NONE'?'Координаты начала трассы: X / Y / Z, мм':'Координаты начала оборудования: X / Y / Z, мм';
  $('routingHint').textContent=drawn?'«Подключить мой путь» сохраняет участки и длины, размещая выбранное оборудование на концах. Общий объект других линий не переносится. Автоматическая замена — отдельное действие ниже.':'Пустая трасса: автоматический путь будет создан между выбранными размещёнными объектами.';
  $('routeModeStatus').textContent=state.routeRouting.mode==='auto'?'Автоматический путь: перемещение оборудования перестраивает эту трассу.':'Ручной путь: заданные участки сохраняются.';
  $('routeAutoPreview').classList.add('hid');pendingAutoRoute=null;updateEquipmentUndoControl();
}
function setEquipmentEditing(enabled){state.equipmentEditMode=enabled;state.placingEquipment=false;closeRouteEditors();if(enabled){setProjection('TOP');updateEquipmentControls();}else draw();}
function equipmentAtPointer(event){
  const p=screenToLocal(event);return [...state.equipment].reverse().find(item=>p.x>=item.position.x&&p.x<=item.position.x+item.size.w&&-p.y>=item.position.y&&-p.y<=item.position.y+item.size.d);
}
function plannedEquipmentPosition(item,event){const p=screenToLocal(event);return {...item.position,x:Math.round((p.x-item.size.w/2)/10)*10,y:Math.round((-p.y-item.size.d/2)/10)*10};}
function initEquipmentUI(){
  equipmentUIReady=true;
  try{const record=JSON.parse(localStorage.getItem(STORAGE_STATE+'.equipmentUndo'));lastEquipmentAction=record?.version===1&&typeof record.label==='string'?{...record,before:validateProjectSnapshot(record.before),after:validateProjectSnapshot(record.after)}:null;}catch(error){lastEquipmentAction=null;}
  updateEquipmentControls();
  $('equipmentImport').onclick=importEquipmentFromRoutes;$('equipmentAddTR').onclick=()=>addEquipment('TR');$('equipmentAddNKU').onclick=()=>addEquipment('NKU');$('equipmentRemove').onclick=removeEquipment;
  $('equipmentSelect').addEventListener('change',()=>{state.selectedEquipmentId=$('equipmentSelect').value;updateEquipmentControls();draw();});
  $('equipmentApply').onclick=()=>updateEquipment(state.selectedEquipmentId,readEquipmentForm());
  $('equipmentColumnAdd').onclick=addNKUColumn;
  for(const side of ['start','end'])$('route'+(side==='start'?'Start':'End')+'Equipment').addEventListener('change',()=>routeColumnControl(side,$('route'+(side==='start'?'Start':'End')+'Equipment').value,null));
  $('equipmentPlace').onclick=()=>{if(!equipmentById(state.selectedEquipmentId))return;setProjection('TOP');state.placingEquipment=true;$('equipmentStatus').textContent='Щёлкните по плану: здесь будет центр выбранного оборудования. Отметка Z сохранится.';};
  $('routeBuild').onclick=()=>state.segs.length?connectEquipmentToManualRoute():buildEquipmentRoute();$('routeDetach').onclick=detachEquipmentRoute;
  $('routeAuto').onclick=previewAutomaticRoute;$('routeAutoApply').onclick=applyAutomaticPreview;$('routeBuildUndo').onclick=$('equipmentUndo').onclick=undoEquipmentAction;
  $('routeAutoCancel').onclick=()=>{pendingAutoRoute=null;$('routeAutoPreview').classList.add('hid');};
  wrap.addEventListener('pointerdown',event=>{
    if(!state.equipmentEditMode||viewMode!=='TOP'||event.button!==0||event.target!==cvs)return;
    if(state.placingEquipment){event.preventDefault();event.stopImmediatePropagation();const item=equipmentById(state.selectedEquipmentId);if(item&&updateEquipment(item.id,{position:plannedEquipmentPosition(item,event)}))state.placingEquipment=false;pointerMoved=true;return;}
    const item=equipmentAtPointer(event);if(!item)return;event.preventDefault();event.stopImmediatePropagation();
    state.selectedEquipmentId=item.id;updateEquipmentControls();equipmentDrag={id:item.id,start:screenToLocal(event),position:{...item.position},moved:false};wrap.setPointerCapture(event.pointerId);draw();
  },true);
  wrap.addEventListener('pointermove',event=>{
    if(!equipmentDrag)return;event.preventDefault();event.stopImmediatePropagation();const p=screenToLocal(event),drag=equipmentDrag;
    const position={...drag.position,x:Math.round((drag.position.x+p.x-drag.start.x)/10)*10,y:Math.round((drag.position.y-p.y+drag.start.y)/10)*10};
    if(updateEquipment(drag.id,{position},{persist:false})){drag.moved=true;pointerMoved=true;}
  },true);
  const finish=event=>{if(!equipmentDrag)return;event.stopImmediatePropagation();equipmentDrag=null;saveState();};
  wrap.addEventListener('pointerup',finish,true);wrap.addEventListener('pointercancel',finish,true);wrap.addEventListener('lostpointercapture',finish,true);
  cvs.addEventListener('click',event=>{if(state.equipmentEditMode){event.stopImmediatePropagation();pointerMoved=false;}},true);
}
function equipmentExportRows(){return equipmentInScope(specificationRoutes(),false).map(item=>[item.name,item.kind==='TR'?'Трансформатор':'НКУ',item.position.x,item.position.y,item.position.z,item.size.w,item.size.d,item.size.h]);}
function routeEndpointNames(route){return ['start','end'].map(side=>{const item=equipmentById(route.bindings?.[side]),part=item?equipmentPort(item,route.ports?.[side]):null;return item?item.name+(part?` / ${part.number}. ${part.column.name}`:''):'Ручное размещение';});}
