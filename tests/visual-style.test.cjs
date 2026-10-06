const assert=require('node:assert/strict');
const {browser}=require('./startup.test.cjs');
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
const json=(b,source)=>JSON.parse(b.run('JSON.stringify('+source+')'));
function fixture(){
  const b=browser();b.boot();
  b.run("$('startType').value='TR';$('startW').value=2000;$('startD').value=1400;$('startH').value=1700;$('endType').value='NKU';$('mat').value='CU';fillRatings(false);$('rating').value=3200;state.routeOffset={x:-900,y:1200,z:0};state.segs=[{dir:'+Z',len:2000},{dir:'+Y',len:2000},{dir:'+X',len:6000},{dir:'-Z',len:1500}];state.calc=true;importEquipmentFromRoutes();const cabinet=equipmentById(state.routeBindings.end);updateEquipment(cabinet.id,{columns:[...cabinet.columns,{id:'c2',name:'Колонна 2',width:700}],size:{...cabinet.size,w:1300}});saveState();fit()");
  return b;
}
check('two style buttons switch appearance without rewriting the project, camera or undo',()=>{
  const b=fixture(),before=json(b,'projectSnapshot()'),storage=new Map(b.storage),camera=json(b,'[scale,panX,panY]');
  b.elements.get('styleBeautiful').onclick();assert.equal(b.run('visualStyle'),'BEAUTIFUL');assert.ok(b.run('visualFrame.lastFaces.length')>0);
  assert.deepEqual(json(b,'projectSnapshot()'),before);assert.deepEqual(json(b,'[scale,panX,panY]'),camera);
  for(const [key,value]of storage)assert.equal(b.storage.get(key),value,key);
  assert.equal(b.storage.get('BUS_VISUAL_STYLE_V1'),'BEAUTIFUL');
  b.elements.get('styleTechnical').onclick();assert.equal(b.run('visualFrame.lastFaces.length'),0);assert.deepEqual(json(b,'projectSnapshot()'),before);
});
check('appearance restores independently on reload and bad preferences fall back to the original',()=>{
  const b=fixture();b.run("setVisualStyle('BEAUTIFUL')");const before=json(b,'projectSnapshot()'),reload=browser({storage:b.storage});reload.boot();
  assert.equal(reload.run('visualStyle'),'BEAUTIFUL');assert.deepEqual(json(reload,'projectSnapshot()'),before);
  b.storage.set('BUS_VISUAL_STYLE_V1','UNKNOWN');const bad=browser({storage:b.storage});bad.boot();assert.equal(bad.run('visualStyle'),'TECHNICAL');assert.deepEqual(json(bad,'projectSnapshot()'),before);
});
check('CAD entities and attributes match exactly in both styles for all six projections',()=>{
  const b=fixture();b.run("state.annos=[{id:1,num:1,text:'Подключение',pos:{ISO:{ax:100,ay:200,bx:300,by:400}}}]");
  for(const view of ['ISO','TOP','FRONT','BACK','LEFT','RIGHT']){
    b.run(`setProjection('${view}');setVisualStyle('TECHNICAL')`);const original=json(b,'collectCadDrawing()');
    b.run("setVisualStyle('BEAUTIFUL')");assert.deepEqual(json(b,'collectCadDrawing()'),original,view);assert.equal(b.run('DXF_COLLECT'),false);assert.ok(b.run('visualFrame.lastFaces.length')>0,view+' CAD restores presentation');
    b.run('draw()');assert.ok(b.run('visualFrame.lastFaces.length')>0,view);
  }
});
check('BOM, cut lengths, joint positions, enclosure columns and world geometry match across styles',()=>{
  const b=fixture();
  for(const orientation of ['FLAT','EDGE'])for(const ip of ['IP55','IP65']){
    b.run(`$('orientation').value='${orientation}';$('ip').value='${ip}';setVisualStyle('TECHNICAL')`);
    const before=json(b,'({project:projectSnapshot(),spec:specForScope(),joints:connectionLayout(),bounds:sceneProjectedBounds()})');
    b.run("setVisualStyle('BEAUTIFUL')");assert.deepEqual(json(b,'({project:projectSnapshot(),spec:specForScope(),joints:connectionLayout(),bounds:sceneProjectedBounds()})'),before);
  }
});
check('beautiful scene keeps exact module boxes, all three elbows, connection blocks and varied NKU columns',()=>{
  const b=fixture();b.run("setVisualStyle('BEAUTIFUL')");
  const meshes=json(b,'visualFrame.meshes.map(m=>({layer:m.layer,kind:m.kind,vertices:m.vertices}))');
  assert.equal(meshes.filter(m=>m.layer==='ELBOW').length,3);assert.equal(meshes.filter(m=>m.layer==='JOINT').length,b.run('connectionLayout().length'));
  assert.equal(meshes.filter(m=>m.kind==='NKU').length,2);assert.equal(meshes.filter(m=>m.kind==='TR').length,1);
  const widths=meshes.filter(m=>m.kind==='NKU').map(m=>Math.max(...m.vertices.map(v=>v[0]))-Math.min(...m.vertices.map(v=>v[0])));assert.deepEqual(widths,[600,700]);
  const expected=b.run('state.segs.reduce((n,s,i)=>n+straightLayout(i).parts.length,0)');assert.equal(meshes.filter(m=>m.layer==='BUS').length,expected);
  assert.ok(meshes.every(m=>m.vertices.every(v=>v.length===3&&v.every(Number.isFinite))));
});
check('hidden faces are culled and the original floor remains identical',()=>{
  const b=fixture();b.run("setVisualStyle('BEAUTIFUL');beginVisualFrame();queueVisualBox([[0,0,0],[500,0,0],[500,300,0],[0,300,0],[0,0,900],[500,0,900],[500,300,900],[0,300,900]],'CAB','NKU')");
  for(const [view,expected]of [['ISO',3],['TOP',1],['FRONT',1],['BACK',1],['LEFT',1],['RIGHT',1]]){b.run(`viewMode='${view}'`);assert.equal(b.run('visibleVisualFaces().length'),expected);}
  b.run("visualFrame.active=false;setProjection('ISO');globalThis.floorCalls=[];globalThis.realLine=line3;globalThis.realPoly=fillPoly3;line3=(...a)=>floorCalls.push(a);fillPoly3=(...a)=>floorCalls.push(a);setVisualStyle('TECHNICAL',{redraw:false});drawFloorBounded()");const floor=json(b,'floorCalls');
  b.run("floorCalls=[];setVisualStyle('BEAUTIFUL',{redraw:false});drawFloorBounded()");assert.deepEqual(json(b,'floorCalls'),floor);b.run('line3=realLine;fillPoly3=realPoly');
});
check('style cannot contaminate other route contexts or combined specification',()=>{
  const b=fixture();b.run("addRoute('TR_NKU',true);state.showAllRoutes=true;state.showAllDimensions=true;state.specScope='all';commitActiveRoute();setVisualStyle('TECHNICAL')");const before=json(b,'({project:projectSnapshot(),spec:specForScope()})');
  for(const view of ['ISO','TOP','FRONT']){b.run(`setVisualStyle('BEAUTIFUL');setProjection('${view}');draw()`);assert.deepEqual(json(b,'({project:projectSnapshot(),spec:specForScope()})'),before);assert.equal(b.run('routeContextDepth'),0);assert.equal(b.run('visualFrame.active'),false);}
});
check('fit and dimension labels leave room for both style and projection controls',()=>{
  const b=fixture();b.run("setVisualStyle('BEAUTIFUL');fit()");
  const ext=json(b,'boundsProjected()'),[scale,x,y]=json(b,'[scale,panX,panY]');assert.ok(ext.minY*scale+y>=b.run('viewerTopInset()')-1e-6);
  b.run('dimensionPosition(19,{x:400,y:-999},"L ось = 6000 мм")');const label=json(b,'dimensionBoxes.at(-1)');assert.ok(label.y-label.h/2>=b.run('viewerTopInset()'));
});
console.log(`${count} visual style checks passed`);
