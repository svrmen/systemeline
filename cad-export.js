/* Portable 2D CAD drawing. Geometry is projected at model scale, never screen scale.
   ASCII DXF uses Unicode escapes for Russian text; component dimensions remain schematic. */
function buildCadDXF(model){
  const pair=(code,value)=>`${code}\n${value}\n`;
  const text=value=>String(value??'').replace(/[\r\n]/g,' ').replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));
  const point=(p,code=10)=>pair(code,p[0])+pair(code+10,p[1])+pair(code+20,0);
  const line=(a,b,layer)=>pair(0,'LINE')+pair(8,layer)+point(a)+point(b,11);
  const label=(value,p,layer,height=60)=>pair(0,'TEXT')+pair(8,layer)+point(p)+pair(40,height)+pair(1,text(value))+pair(7,'STANDARD');
  const layers=['BUS','ELBOW','JOINT','MOUNT','CAB','ENDCAP','ANNOT','DIMENSIONS'];
  const groups=new Map();
  for(const e of model.lines){
    const key=`${e.layer}_${e.group}`;
    if(!groups.has(key))groups.set(key,{layer:e.layer,meta:e.meta||{},lines:[],seen:new Set()});
    const g=groups.get(key),snap=n=>Math.round(n*1e6)/1e6;
    let a=[snap(e.a[0]),snap(-e.a[1])],b=[snap(e.b[0]),snap(-e.b[1])];
    if(a[0]>b[0]||(a[0]===b[0]&&a[1]>b[1]))[a,b]=[b,a];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)continue;
    const ka=a.map(n=>n.toFixed(6)).join(','),kb=b.map(n=>n.toFixed(6)).join(','),edge=[ka,kb].sort().join('|');
    if(!g.seen.has(edge)){g.seen.add(edge);g.lines.push({a,b});}
  }
  let blocks='',entities='',number=0;
  for(const g of groups.values()){
    if(!g.lines.length)continue;
    g.lines.sort((u,v)=>u.a[0]-v.a[0]||u.a[1]-v.a[1]||u.b[0]-v.b[0]||u.b[1]-v.b[1]);
    const name=`SLB_${g.layer}_${++number}`,base=g.lines[0].a;
    blocks+=pair(0,'BLOCK')+pair(8,g.layer)+pair(2,name)+pair(70,0)+point([0,0])+pair(3,name)+pair(1,'');
    const local=p=>[p[0]-base[0],p[1]-base[1]];
    for(const e of g.lines)blocks+=line(local(e.a),local(e.b),'0');
    const type=g.meta.type||(g.layer==='ENDCAP'?'EC':g.layer==='MOUNT'?'MOUNT':g.layer);
    const reference=['ST','EL','JPK','EC'].includes(type)?model.ref(type):'';
    const attributes={POSITION:`P${number}`,ROUTE:'T1',TYPE:type,REFERENCE:reference,LENGTH_MM:g.meta.length??'',RATING_A:model.rating,IP:model.ip,MATERIAL:model.material,CONDUCTORS:model.conductors||'3L+N+PE (корпус)'};
    for(const [tag,value]of Object.entries(attributes))blocks+=pair(0,'ATTDEF')+pair(8,'0')+point([0,0])+pair(40,50)+pair(1,text(value))+pair(3,tag)+pair(2,tag)+pair(70,1)+pair(7,'STANDARD');
    blocks+=pair(0,'ENDBLK')+pair(8,g.layer);
    entities+=pair(0,'INSERT')+pair(8,g.layer)+pair(2,name)+pair(66,1)+point(base);
    for(const [tag,value]of Object.entries(attributes))entities+=pair(0,'ATTRIB')+pair(8,g.layer)+point(base)+pair(40,50)+pair(1,text(value))+pair(2,tag)+pair(70,1)+pair(7,'STANDARD');
    entities+=pair(0,'SEQEND')+pair(8,g.layer);
  }
  // DIMENSION includes a graphics block so CAD can display it without a regeneration step.
  let dimensionNumber=0;
  for(const d of model.dimensions){
    const dx=d.b[0]-d.a[0],dy=d.b[1]-d.a[1],distance=Math.hypot(dx,dy);
    if(distance<1e-6)continue;
    const normal=[-dy/distance,dx/distance],offset=180;
    const a=[d.a[0]+normal[0]*offset,d.a[1]+normal[1]*offset],b=[d.b[0]+normal[0]*offset,d.b[1]+normal[1]*offset],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const name=`*D${++dimensionNumber}`,display=`${d.value} mm (axis)`;
    blocks+=pair(0,'BLOCK')+pair(8,'DIMENSIONS')+pair(2,name)+pair(70,1)+point([0,0])+pair(3,name)+pair(1,'');
    blocks+=line(d.a,a,'0')+line(d.b,b,'0')+line(a,b,'0')+label(display,mid,'0',50)+pair(0,'ENDBLK')+pair(8,'DIMENSIONS');
    entities+=pair(0,'DIMENSION')+pair(8,'DIMENSIONS')+pair(2,name)+point(b)+point(mid,11)+pair(70,33)+pair(1,display)+pair(3,'STANDARD')+point(d.a,13)+point(d.b,14);
  }
  for(const a of model.annotations)entities+=line(a.anchor,a.point,'ANNOT')+label(a.text,a.point,'ANNOT');
  const bounds=[...groups.values()].flatMap(g=>g.lines.flatMap(e=>[e.a,e.b]));
  const footerX=bounds.length?Math.min(...bounds.map(p=>p[0])):0,footerY=bounds.length?Math.min(...bounds.map(p=>p[1]))-300:-500;
  entities+=label(`SystemeLine B / ${model.view} / mm`,[footerX,footerY],'ANNOT');
  entities+=label('Projected 2D; schematic fittings',[footerX,footerY-100],'ANNOT');
  let tables=pair(0,'TABLE')+pair(2,'LTYPE')+pair(70,1)+pair(0,'LTYPE')+pair(2,'CONTINUOUS')+pair(70,0)+pair(3,'Solid line')+pair(72,65)+pair(73,0)+pair(40,0)+pair(0,'ENDTAB');
  tables+=pair(0,'TABLE')+pair(2,'LAYER')+pair(70,layers.length);
  layers.forEach((layer,i)=>tables+=pair(0,'LAYER')+pair(2,layer)+pair(70,0)+pair(62,[7,5,3,8,8,1,7,7][i])+pair(6,'CONTINUOUS'));
  tables+=pair(0,'ENDTAB')+pair(0,'TABLE')+pair(2,'STYLE')+pair(70,1)+pair(0,'STYLE')+pair(2,'STANDARD')+pair(70,0)+pair(40,0)+pair(41,1)+pair(50,0)+pair(71,0)+pair(42,50)+pair(3,'txt')+pair(4,'')+pair(0,'ENDTAB');
  const section=(name,body)=>pair(0,'SECTION')+pair(2,name)+body+pair(0,'ENDSEC');
  const header=pair(9,'$ACADVER')+pair(1,'AC1009')+pair(9,'$INSUNITS')+pair(70,4)+pair(9,'$MEASUREMENT')+pair(70,1)+pair(9,'$LUNITS')+pair(70,2);
  return section('HEADER',header)+section('TABLES',tables)+section('BLOCKS',blocks)+section('ENTITIES',entities)+pair(0,'EOF');
}
