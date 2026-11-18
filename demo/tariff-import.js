/* Exact-reference prices. Imports are local; source workbooks are never uploaded. */
function parseTariffWorkbook(workbook,filename,xlsx){
  const norm=v=>String(v??'').toLowerCase().replace(/[^а-яa-z0-9]/g,'');
  const candidates=[];
  const dedicated=workbook.SheetNames.filter(name=>norm(name).includes('тарифseline')||norm(name).includes('тарифsystemeline'));
  for(const name of workbook.SheetNames){
    if(dedicated.length&&!dedicated.includes(name))continue;
    const rows=xlsx.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:null});
    for(let h=0;h<Math.min(20,rows.length);h++){
      const header=rows[h].map(norm),reference=header.findIndex(v=>v==='референс'||v==='артикул');
      const price=header.findIndex(v=>(v.includes('тариф')||v.includes('цена'))&&v.includes('безндс'));
      const unit=header.findIndex(v=>v.includes('измерения')||v==='едизм');
      if(reference<0||price<0||unit<0)continue;
      const entries={},conflicts=[],invalid=[];let duplicates=0;
      for(let r=h+1;r<rows.length;r++){
        const row=rows[r],ref=String(row[reference]??'').trim().toUpperCase();
        if(!/^[A-Z0-9][A-Z0-9._\/-]*$/.test(ref))continue;
        const raw=row[price],unknown=raw==null||String(raw).trim()===''||/нетвтарифе|позапросу|подзапрос/.test(norm(raw))||String(raw).trim()==='—'||String(raw).trim()==='-';
        const value=unknown?null:typeof raw==='number'?raw:Number(String(raw).replace(/[\s\u00a0]/g,'').replace(',','.'));
        const u=norm(row[unit]),basis=u.includes('метр')||u==='м'?'m':u.includes('штук')||u==='шт'?'piece':null;
        if((value!==null&&(!Number.isFinite(value)||value<0))||!basis){invalid.push(r+1);continue;}
        const entry={price:value,unit:basis,row:r+1};
        if(entries[ref]){if(entries[ref].price!==value||entries[ref].unit!==basis)conflicts.push(ref);else duplicates++;}
        else entries[ref]=entry;
      }
      if(Object.keys(entries).length)candidates.push({entries,conflicts,invalid,duplicates,sheet:name,header:rows[h]});
      break;
    }
  }
  if(!candidates.length)throw new Error('Не найден тариф с колонками Референс, цена/тариф без НДС и единица измерения.');
  candidates.sort((a,b)=>Object.keys(b.entries).length-Object.keys(a.entries).length);
  const found=candidates[0];
  if(found.conflicts.length)throw new Error('Разные цены или единицы для одного артикула: '+[...new Set(found.conflicts)].slice(0,6).join(', '));
  if(found.invalid.length)throw new Error('Некорректная цена или единица в строках: '+found.invalid.slice(0,10).join(', '));
  const date=(found.header.join(' ').match(/\d{2}\.\d{2}\.\d{4}/)||found.sheet.match(/\d{2}\.\d{2}\.\d{4}/)||[])[0]||'не указана';
  return {version:5,entries:found.entries,source:{filename,sheet:found.sheet,date,currency:'RUB',vat:'без НДС',importedAt:new Date().toISOString(),duplicates:found.duplicates,unpriced:Object.values(found.entries).filter(e=>e.price===null).length}};
}
function validateReferenceTariff(data){
  if(data.version!==5||!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries))throw new Error('Неверный формат тарифа.');
  for(const [ref,entry]of Object.entries(data.entries)){
    if(!/^[A-Z0-9][A-Z0-9._\/-]*$/.test(ref)||!entry||(entry.price!==null&&(!Number.isFinite(entry.price)||entry.price<0))||!['m','piece'].includes(entry.unit))throw new Error('Некорректная запись: '+ref);
  }
  return data;
}
