const assert=require('node:assert/strict');
const {browser}=require('./startup.test.cjs');
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
const json=(b,source)=>JSON.parse(b.run('JSON.stringify('+source+')'));
function fixture(){
 const b=browser();b.boot();b.run("$('startType').value='TR';$('startW').value=2000;$('startD').value=1400;$('startH').value=1700;$('endType').value='NKU';state.segs=[{dir:'+Z',len:2000},{dir:'+Y',len:2000},{dir:'+X',len:6000},{dir:'-Z',len:1500}];state.calc=true;state.annos=[{id:1,text:'Ввод',pos:{ISO:{ax:17,ay:23,bx:40,by:50},TOP:{ax:100,ay:1900,bx:200,by:2000}}}];saveState();updateEquipmentControls()");return b;
}
check('original route NKU becomes the row without moving the path or duplicating its cabinet',()=>{
 const b=fixture(),ends=json(b,'[originTop(),endPoint()]'),segs=json(b,'state.segs'),annos=json(b,'validateProjectSnapshot(projectSnapshot()).annos');
 // Unrelated placed equipment must not disable adopting the original endpoint.
 b.run("addEquipment('TR')");assert.equal(b.elements.get('equipmentRouteNKU').disabled,false);assert.equal(b.elements.get('equipmentRouteNKU').onclick(),true,b.elements.get('equipmentStatus').textContent);
 assert.equal(b.run('state.equipment.length'),2);assert.equal(b.run('state.routeBindings.end'),'e2');assert.equal(b.run('state.routePorts.end'),'c1');assert.equal(b.run('boundRouteGap()'),null);
 assert.deepEqual(json(b,'[originTop(),endPoint()]'),ends);assert.deepEqual(json(b,'state.segs'),segs);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot()).annos'),annos);
 const model=json(b,'collectCadDrawing()');assert.equal(new Set(model.lines.filter(e=>e.meta.equipmentId==='e2'&&e.meta.type==='EQUIPMENT').map(e=>e.group)).size,1);
 assert.equal(b.elements.get('equipmentRouteNKU').onclick(),true);assert.equal(b.run('state.equipment.length'),2);
 const reload=browser({storage:b.storage});reload.boot();assert.equal(reload.run('boundRouteGap()'),null);assert.deepEqual(json(reload,'state.segs'),segs);
});
check('an already placed matching NKU column is reused with stable IDs and no extra object',()=>{
 const b=fixture();b.run("addEquipment('NKU');const e=endPoint();updateEquipment('e1',{position:{x:e[0]-300,y:e[1]-300,z:e[2]-2200},size:{w:1400,d:600,h:2200},columns:[{id:'c1',name:'Ввод',width:600},{id:'c2',name:'Соседняя',width:800}]})");
 const before=json(b,'state.equipment'),ends=json(b,'[originTop(),endPoint()]');assert.equal(b.elements.get('equipmentRouteNKU').onclick(),true);assert.deepEqual(json(b,'state.equipment'),before);assert.deepEqual(json(b,'[originTop(),endPoint()]'),ends);assert.equal(b.run('state.routePorts.end'),'c1');assert.equal(b.run('boundRouteGap()'),null);
});
check('adding columns of different widths aligns sidewalls and keeps the original feed centre',()=>{
 const b=fixture();b.elements.get('equipmentRouteNKU').onclick();const ends=json(b,'[originTop(),endPoint()]'),original=json(b,'equipmentById("e1").position');
 // Form reading is covered in the real browser; this harness has no querySelectorAll DOM.
 b.run("readEquipmentForm=()=>JSON.parse(JSON.stringify(({name:equipmentById(state.selectedEquipmentId).name,position:equipmentById(state.selectedEquipmentId).position,size:equipmentById(state.selectedEquipmentId).size,columns:equipmentById(state.selectedEquipmentId).columns})))");
 for(let i=0;i<4;i++)assert.equal(b.elements.get('equipmentColumnAdd').onclick(),true);
 b.run("const item=equipmentById('e1'),columns=item.columns.map((c,i)=>({...c,width:[600,800,400,1000,600][i]}));updateEquipment('e1',{columns,size:{...item.size,w:3400}})");
 const parts=json(b,'nkuColumnGeometry(equipmentById("e1"))');assert.equal(parts.length,5);
 for(let i=1;i<parts.length;i++){assert.equal(parts[i].position.x,parts[i-1].position.x+parts[i-1].size.w);assert.equal(parts[i].position.y,original.y);assert.equal(parts[i].position.z,original.z);}
 assert.deepEqual(json(b,'[originTop(),endPoint()]'),ends);assert.deepEqual(json(b,'equipmentById("e1").position'),original);assert.equal(b.run('boundRouteGap()'),null);assert.equal(b.run('state.routePorts.end'),'c1');
});
check('side snapping aligns either side exactly and leaves other objects and altitude untouched',()=>{
 const b=fixture();b.run("addEquipment('NKU');updateEquipment('e1',{position:{x:1000,y:2000,z:200}});addEquipment('NKU');scale=.2");
 const before=json(b,'state.equipment'),right=json(b,'snapNKUSide(equipmentById("e2"),{x:1660,y:2040,z:200})'),left=json(b,'snapNKUSide(equipmentById("e2"),{x:380,y:1970,z:200})');
 assert.deepEqual(right,{position:{x:1600,y:2000,z:200},snapped:true});assert.deepEqual(left,{position:{x:400,y:2000,z:200},snapped:true});assert.deepEqual(json(b,'state.equipment'),before);
});
check('snapping is limited, reversible with Alt and does not align incompatible sizes or levels',()=>{
 const b=fixture();b.run("addEquipment('NKU');updateEquipment('e1',{position:{x:1000,y:2000,z:200}});addEquipment('NKU');scale=.2");
 for(const pos of [{x:2000,y:2040,z:200},{x:1660,y:2040,z:0}]){b.sandbox.pos=pos;assert.equal(b.run('snapNKUSide(equipmentById("e2"),pos).snapped'),false);}
 assert.equal(b.run('snapNKUSide(equipmentById("e2"),{x:1660,y:2040,z:200},{disabled:true}).snapped'),false);
 b.run("updateEquipment('e2',{size:{w:600,d:800,h:2200}})");assert.equal(b.run('snapNKUSide(equipmentById("e2"),{x:1660,y:2040,z:200}).snapped'),false);
});
check('failed adoption saves neither a new cabinet nor a changed manual path',()=>{
 const b=fixture(),before=json(b,'validateProjectSnapshot(projectSnapshot())');b.sandbox.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};assert.equal(b.elements.get('equipmentRouteNKU').onclick(),false);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);assert.equal(b.run('state.equipment.length'),0);
});
check('equipment labels are absent from screen and CAD while component identity remains in attributes',()=>{
 const b=fixture();b.elements.get('equipmentRouteNKU').onclick();b.run("let drawnLabels=[];drawText3=(p,text)=>drawnLabels.push(text);setProjection('TOP')");
 const name=b.run('equipmentById("e1").name');assert.equal(json(b,'drawnLabels').includes(name),false);const model=json(b,'collectCadDrawing()');assert.equal(model.annotations.some(a=>a.text===name),false);assert.equal(model.labels.length,0);
 const cab=model.lines.find(e=>e.meta.type==='EQUIPMENT');assert.equal(cab.meta.equipmentName,name);assert.equal(cab.meta.columnId,'c1');assert.match(b.run('buildCadDXF(collectCadDrawing())'),/EQUIPMENT_NAME\n/);
});
console.log(`${count} NKU snap checks passed`);
