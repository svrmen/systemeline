/* A physical NKU row runs along +X. Column IDs, not display numbers, bind routes.
   Depth/height are common to the row; electrical functions are user labels. */
const emptyPorts=()=>({start:null,end:null});
const singleNKUColumn=width=>[{id:'c1',name:'Колонна 1',width}];
function validateNKUColumns(item,legacy=false){
  if(item.kind!=='NKU')return undefined;
  const columns=item.columns??(legacy?singleNKUColumn(item.size.w):null);
  if(!Array.isArray(columns)||!columns.length||columns.length>30)throw new Error('НКУ должно содержать от 1 до 30 колонн.');
  const ids=new Set();
  const clean=columns.map(column=>{
    if(!column||typeof column.id!=='string'||!/^c[1-9]\d*$/.test(column.id)||ids.has(column.id))throw new Error('Некорректный или повторный ID колонны НКУ.');ids.add(column.id);
    if(typeof column.name!=='string'||!column.name.trim()||column.name.length>80)throw new Error('Название колонны: от 1 до 80 символов.');
    if(!Number.isFinite(column.width)||column.width<=0||column.width>100000)throw new Error('Ширины колонн должны быть положительными числами до 100 000 мм.');
    return {id:column.id,name:column.name.trim(),width:column.width};
  });
  const total=clean.reduce((sum,column)=>sum+column.width,0);
  if(Math.abs(total-item.size.w)>.000001)throw new Error('Суммарная ширина НКУ не совпадает с ширинами колонн.');
  return clean;
}
function nkuColumnGeometry(item){
  let offset=0;return (item.columns??singleNKUColumn(item.size.w)).map((column,index)=>{
    const position={...item.position,x:item.position.x+offset};offset+=column.width;
    return {column,number:index+1,position,size:{...item.size,w:column.width}};
  });
}
function equipmentPort(item,port){
  if(item.kind!=='NKU')return null;
  if(!port)return null;
  return nkuColumnGeometry(item).find(part=>part.column.id===port)??null;
}
function validateRoutePorts(route,equipment,legacy=false){
  if(route.ports!==undefined&&(!route.ports||typeof route.ports!=='object'||Array.isArray(route.ports)))throw new Error('Некорректные привязки колонн.');
  const ports={...emptyPorts(),...route.ports};
  for(const side of ['start','end']){
    const item=equipmentById(route.bindings[side],equipment);
    if(item?.kind==='NKU'){
      if(legacy&&ports[side]===null)ports[side]=item.columns[0].id;
      if(typeof ports[side]!=='string'||!item.columns.some(c=>c.id===ports[side]))throw new Error('Выбранная колонна подключения отсутствует в НКУ.');
    }else if(ports[side]!==null)throw new Error('Колонну можно выбрать только для подключённого НКУ.');
  }
  return ports;
}
function routeColumnControl(side,equipmentId,port){
  const select=$('route'+(side==='start'?'Start':'End')+'Column'),item=equipmentById(equipmentId);
  select.innerHTML='';select.disabled=item?.kind!=='NKU';
  const parts=item?.kind==='NKU'?item.columns:[];
  if(!parts.length){const option=document.createElement('option');option.value='';option.textContent='Не требуется';select.appendChild(option);}
  for(const [index,column]of parts.entries()){const option=document.createElement('option');option.value=column.id;option.textContent=`${index+1}. ${column.name} · ${column.width} мм`;select.appendChild(option);}
  select.value=parts.some(c=>c.id===port)?port:parts[0]?.id??'';
}
function renderNKUColumnEditor(item){
  $('equipmentColumnsCard').classList.toggle('hid',item?.kind!=='NKU');$('equipmentW').disabled=item?.kind==='NKU';
  const table=$('equipmentColumns');table.innerHTML='';if(item?.kind!=='NKU')return;
  for(const [index,column]of item.columns.entries()){
    const row=document.createElement('div');row.className='column-row';row.dataset.columnId=column.id;
    const number=document.createElement('span');number.textContent=index+1;row.appendChild(number);
    const name=document.createElement('input');name.type='text';name.value=column.name;name.maxLength=80;name.dataset.field='name';name.setAttribute('aria-label',`Колонна ${index+1} название`);row.appendChild(name);
    const width=document.createElement('input');width.type='number';width.min='1';width.value=column.width;width.dataset.field='width';width.setAttribute('aria-label',`Колонна ${index+1} ширина`);row.appendChild(width);
    const remove=document.createElement('button');remove.className='btn';remove.textContent='×';remove.setAttribute('aria-label',`Удалить колонну ${index+1}`);remove.onclick=()=>removeNKUColumn(column.id);row.appendChild(remove);
    table.appendChild(row);
  }
  $('equipmentColumnTotal').textContent=`Колонн: ${item.columns.length}. Общая ширина: ${item.size.w} мм.`;
}
function readEquipmentForm(){
  const patch={name:$('equipmentName').value,position:{},size:{}},item=equipmentById(state.selectedEquipmentId);
  for(const k of ['x','y','z'])patch.position[k]=String($('equipment'+k.toUpperCase()).value).trim()===''?NaN:Number($('equipment'+k.toUpperCase()).value);
  for(const k of ['w','d','h'])patch.size[k]=Number($('equipment'+k.toUpperCase()).value);
  if(item?.kind==='NKU'){
    patch.columns=Array.from(document.querySelectorAll('#equipmentColumns .column-row')).map(row=>({id:row.dataset.columnId,name:row.querySelector('[data-field="name"]').value,width:Number(row.querySelector('[data-field="width"]').value)}));
    patch.size.w=patch.columns.reduce((sum,column)=>sum+column.width,0);
  }
  return patch;
}
function addNKUColumn(){
  try{
    const patch=readEquipmentForm();if(!patch.columns)throw new Error('Выберите НКУ.');
    let number=1;while(patch.columns.some(c=>c.id==='c'+number))number++;
    patch.columns.push({id:'c'+number,name:'Колонна '+(patch.columns.length+1),width:600});patch.size.w+=600;
    return updateEquipment(state.selectedEquipmentId,patch);
  }catch(error){$('equipmentStatus').textContent=error.message;return false;}
}
function removeNKUColumn(id){
  try{
    const item=equipmentById(state.selectedEquipmentId),patch=readEquipmentForm();if(!item||!patch.columns)throw new Error('Выберите НКУ.');
    if(patch.columns.length<=1)throw new Error('В НКУ должна остаться хотя бы одна колонна.');
    if(routeEntries().some(route=>['start','end'].some(side=>route.bindings?.[side]===item.id&&route.ports?.[side]===id)))throw new Error('К колонне подключена трасса. Сначала выберите для неё другую колонну.');
    patch.columns=patch.columns.filter(column=>column.id!==id);patch.size.w=patch.columns.reduce((sum,column)=>sum+column.width,0);
    return updateEquipment(item.id,patch);
  }catch(error){$('equipmentStatus').textContent=error.message;return false;}
}
function equipmentColumnRows(){
  return equipmentInScope(specificationRoutes(),false).filter(item=>item.kind==='NKU').flatMap(item=>nkuColumnGeometry(item).map(part=>[item.name,part.number,part.column.name,part.column.id,part.position.x,part.position.y,part.position.z,part.size.w,part.size.d,part.size.h]));
}
function drawEquipmentColumn(part,item){
  const p=part.position,s=part.size;
  cadMeta={type:'EQUIPMENT',equipmentId:item.id,equipmentName:item.name,equipmentKind:item.kind,equipmentPosition:item.position,equipmentSize:item.size,columnId:part.column?.id,columnName:part.column?.name,columnNumber:part.number,columnPosition:p,columnWidth:s.w};
  box(p.x,p.y,p.z,s.w,s.d,s.h,'CAB','#666',item.kind);
}
