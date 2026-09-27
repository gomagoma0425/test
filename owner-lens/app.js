(function(){
'use strict';
const C=OwnerCalc, $=id=>document.getElementById(id);
let data=C.clone(DEMO), original=C.clone(DEMO), dirty=false, lastForecast=null, toastTimer=null, editTimer=null, importAudit=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(x,d=1)=>C.number(x)?x.toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const pct=(x,d=1)=>C.number(x)?n(x*100,d)+'%':'—';
const cur=()=>data.meta.currency==='JPY'?'円':data.meta.currency;
const amountUnit=()=>data.meta.currency==='JPY'?'百万円':'百万'+data.meta.currency;
const get=(o,p)=>p.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((s,k)=>s&&Object.prototype.hasOwnProperty.call(s,k)?s[k]:undefined,o);
const set=(o,p,v)=>{const [g,k]=p.split('.');o[g][k]=v;};
const money=(x,d=0)=>C.number(x)?n(x,d)+' <small>'+esc(cur())+'</small>':'—';
const kindLabel=k=>({actual:'実績',company_forecast:'会社予想',analyst_assumption:'分析者仮定',demo:'架空例'})[k]||'未分類';
const evidenceFor=path=>(data.evidence||[]).find(e=>e&&e.path===path);
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function mark(path, reason){
 data.evidence=data.evidence||[];let e=evidenceFor(path);
 if(!e){e={path,kind:'analyst_assumption',source_ids:[],note:''};data.evidence.push(e);}
 if(!(e.note||'').startsWith('[手動変更]'))e.note='[手動変更] '+(reason||'画面上で変更。')+(e.note?' 元の根拠：'+e.note:'');
 e.kind='analyst_assumption';dirty=true;
}
function showTab(name){
 document.querySelectorAll('.page').forEach(e=>e.hidden=e.id!=='page-'+name);
 document.querySelectorAll('[data-tab]').forEach(e=>{e.classList.toggle('active',e.dataset.tab===name);e.setAttribute('aria-selected',String(e.dataset.tab===name));});
 if(name==='data')renderSources();
 window.scrollTo({top:0,behavior:'auto'});
}
function download(text,name,mime){
 const blob=new Blob([text],{type:mime||'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function safeFilename(){return String(data.meta.ticker||'company').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'company';}
function exportJSON(){
 const out=C.clone(data),f=C.forecast(data);
 out.verification=f.valid?{owner_earnings:f.bm.owner,growth_rate:f.growth,first_year_fcfe:f.rows[0].fcfe,dcf_value_per_share:f.perShare,notes:'Owner Lens v1.0で再計算。元データと仮定が優先。'}:{};
 download(JSON.stringify(out,null,2),safeFilename()+'_owner_lens.json','application/json;charset=utf-8');
 toast('現在の入力・仮定・根拠をJSONに保存しました。');
}
function exportCSV(){if(!lastForecast||!lastForecast.valid){toast('必要な入力をそろえてからCSVを保存してください。');return;}download(C.csv(data,lastForecast),safeFilename()+'_dcf.csv','text/csv;charset=utf-8');}
function evidenceBadge(path){const e=evidenceFor(path);return '<span class="pill '+(e?.kind==='actual'?'blue':e?.kind==='demo'?'gray':'amber')+'">'+esc(kindLabel(e?.kind))+'</span>';}
const baseFields=[
 ['market.price','現在株価','shareprice'],['market.shares_outstanding','自己株式控除後の株数','shares'],
 ['base.net_income','純利益（正規化）','amount'],['base.depreciation_amortization','減価償却・償却','amount'],
 ['base.maintenance_capex','維持CAPEX','amount'],['base.maintenance_working_capital','維持のための運転資本増加','amount'],
 ['base.other_adjustments','その他の調整（加算は＋）','amount'],['assumptions.equity_value_adjustment','株主価値の調整額（通常0）','amount']];
const sliderFields=[
 ['reinvestment_rate','維持後キャッシュの再投資率（仮定）',0,100,1,'%','成長CAPEX・成長運転資本など、成長に必要な投資の合計÷維持後キャッシュ。利益の配当性向の裏返しではありません。'],
 ['incremental_cash_return','追加投資のキャッシュ収益率（仮定）',0,100,.1,'%','追加投資1円が、翌年以降の維持後キャッシュを毎年何円増やすか。会計ROE・ROICをそのまま入れず、明示的な仮定として扱います。'],
 ['cost_of_equity','株主資本コスト（割引率）',1,30,.1,'%','株主向けの分配可能キャッシュを割り引く要求リターン。WACCではありません。名目のキャッシュには名目の割引率を対応させます。'],
 ['horizon_years','明示的に予測する期間',1,30,1,'年','予測1年目は正規化した基準額です。毎年末に成長投資し、翌年から投資効果が出るものとします。'],
 ['terminal_growth_rate','成熟期の永久成長率',0,10,.1,'%','予測期間後に続く名目成長率。株主資本コスト未満、かつ成熟期の投資収益率以下である必要があります。縮小する事業はこの版では扱いません。'],
 ['terminal_cash_return','成熟期の投資収益率',.1,100,.1,'%','成熟後の成長投資1円が増やす年間キャッシュ。永久成長率÷この収益率だけ、成熟期にも再投資が必要です。']];
function renderControls(){
 $('input-unit').textContent='金額：'+amountUnit();
 $('base-fields').innerHTML=baseFields.map(([p,label,unit])=>{
   const id='field-'+p.replace('.','-'),v=get(data,p);
   return '<div class="field"><label for="'+id+'"><span>'+label+'</span>'+evidenceBadge(p)+'</label><div class="number-input"><input id="'+id+'" data-path="'+p+'" type="number" step="any" inputmode="decimal" value="'+(C.number(v)?v:'')+'" placeholder="未入力"><span class="unit">'+(unit==='shares'?'株':unit==='shareprice'?cur():amountUnit())+'</span></div></div>';
 }).join('');
 $('assumption-fields').innerHTML=sliderFields.map(([k,label,min,max,step,unit,help])=>{
   const val=data.assumptions[k],shown=C.number(val)?(unit==='%'?Math.round(val*100000000)/1000000:val):'';
   return '<div class="slider-row"><div class="slider-top"><label class="slider-label" for="param-'+k+'">'+label+' '+evidenceBadge('assumptions.'+k)+' <details class="help right-help"><summary aria-label="'+label+'の説明">i</summary><div class="help-pop">'+help+'</div></details></label><div class="slider-value"><input id="param-'+k+'" data-assumption="'+k+'" data-unit="'+unit+'" type="number" step="'+step+'" min="'+min+'" max="'+max+'" inputmode="decimal" value="'+shown+'" placeholder="未入力">'+unit+'</div></div><input type="range" aria-label="'+label+'のスライダー" data-range="'+k+'" data-unit="'+unit+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+(shown===''?min:shown)+'"><div class="slider-ends"><span>'+min+unit+'</span><span>'+max+unit+'</span></div></div>';
 }).join('');
 $('base-notes').textContent=data.base.notes||'採用理由が記録されていません。';
}
function queueCalculate(){clearTimeout(editTimer);editTimer=setTimeout(render,90);}
$('base-fields').addEventListener('input',e=>{
 const p=e.target.dataset.path;if(!p)return;
 set(data,p,e.target.value.trim()===''?null:e.target.valueAsNumber);mark(p);
 queueCalculate();
});
$('assumption-fields').addEventListener('input',e=>{
 const el=e.target,k=el.dataset.assumption||el.dataset.range;if(!k)return;
 const isRange=!!el.dataset.range, raw=el.value.trim()===''?null:el.valueAsNumber;
 data.assumptions[k]=C.number(raw)?(el.dataset.unit==='%'?raw/100:raw):null;mark('assumptions.'+k);
 if(isRange)$('param-'+k).value=el.value;
 else {const sibling=$('assumption-fields').querySelector('[data-range="'+k+'"]');if(sibling&&C.number(raw))sibling.value=raw;}
 queueCalculate();
});
const color={ink:'#173640',teal:'#007d73',blue:'#366ec4',orange:'#b6733b',line:'#e3ebeb',muted:'#7c9098',steel:'#8da6b4'};
function svgStart(w,h,label){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(label)+'"><title>'+esc(label)+'</title>';}
const text=(x,y,str,fill=color.muted,size=11,anchor='middle',weight=400)=>'<text x="'+x+'" y="'+y+'" fill="'+fill+'" font-size="'+size+'" text-anchor="'+anchor+'" font-weight="'+weight+'" font-family="-apple-system,BlinkMacSystemFont,Hiragino Kaku Gothic ProN,Yu Gothic,Meiryo,sans-serif">'+esc(str)+'</text>';
const line=(x1,y1,x2,y2,stroke=color.line,dash='')=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+stroke+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
function empty(el,message='必要なデータを入力すると表示します。'){$(el).innerHTML='<div class="empty-chart">'+esc(message)+'</div>';}
function renderBridge(bm){
 const b=data.base;
 if(!C.number(bm.owner)||!(bm.marketCap>0)){empty('bridge-chart');$('bridge-formula').textContent='純利益 ＋ 減価償却 ＋ その他調整 − 維持CAPEX − 維持運転資本';return;}
 const entries=[{label:['純利益',''],v:bm.per100(b.net_income),c:color.blue,total:true},{label:['減価償却','を戻す'],v:bm.per100(b.depreciation_amortization),c:color.teal},{label:['その他','の調整'],v:bm.per100(b.other_adjustments),c:color.steel},{label:['維持投資','を引く'],v:-bm.per100(b.maintenance_capex),c:color.orange},{label:['維持運転','資本を引く'],v:-bm.per100(b.maintenance_working_capital),c:color.orange},{label:['維持後の','キャッシュ'],v:bm.per100(bm.owner),c:color.teal,total:true}];
 let level=0;entries.forEach((e,i)=>{if(e.total){e.start=0;e.end=e.v;if(i===0)level=e.v;}else{e.start=level;e.end=level+e.v;level=e.end;}});
 const w=640,h=255,left=36,right=10,top=30,bottom=54,min=Math.min(0,...entries.flatMap(e=>[e.start,e.end])),max=Math.max(1,...entries.flatMap(e=>[e.start,e.end]));
 const pad=(max-min)*.16,lo=min-(min<0?pad:0),hi=max+pad;
 const y=v=>top+(hi-v)/(hi-lo)*(h-top-bottom),step=(w-left-right)/entries.length,bw=step*.57;
 let s=svgStart(w,h,'購入価格100あたりのオーナー利益の調整');
 for(let i=0;i<=3;i++){const val=lo+(hi-lo)*i/3;s+=line(left,y(val),w-right,y(val))+text(left-8,y(val)+4,n(val,1),color.muted,10,'end');}
 s+=line(left,y(0),w-right,y(0),'#bdcdcf');
 entries.forEach((e,i)=>{const x=left+step*i+(step-bw)/2;const high=Math.max(e.start,e.end),low=Math.min(e.start,e.end);const height=Math.max(2,Math.abs(y(low)-y(high)));s+='<rect x="'+x+'" y="'+y(high)+'" width="'+bw+'" height="'+height+'" rx="5" fill="'+e.c+'"/>';
   const v=(i>0&&!e.total&&e.v>0?'+':'')+n(e.v,2);s+=text(x+bw/2,y(high)-8,v,e.c,13,'middle',700);
   s+=text(x+bw/2,h-30,e.label[0],color.ink,11)+text(x+bw/2,h-13,e.label[1],color.muted,10);
   if(i<entries.length-2)s+=line(x+bw,y(e.end),x+step,y(e.end),'#acbdc1','3 3');
 });
 $('bridge-chart').innerHTML=s+'</svg>';
 $('bridge-formula').innerHTML='純利益 '+n(bm.per100(b.net_income),2)+' ＋ 償却 '+n(bm.per100(b.depreciation_amortization),2)+' ＋ 調整 '+n(bm.per100(b.other_adjustments),2)+'<br>− 維持投資 '+n(bm.per100(b.maintenance_capex),2)+' − 維持運転資本 '+n(bm.per100(b.maintenance_working_capital),2)+' ＝ <strong>'+n(bm.per100(bm.owner),2)+' '+esc(cur())+'</strong>';
}
function renderAllocation(f,bm){
 const valid=f.valid && bm.marketCap>0;
 $('allocation-total').textContent=n(bm.per100(bm.owner),2);$('allocation-unit').textContent=' '+cur();
 const b=data.assumptions.reinvestment_rate,barValid=C.number(b)&&b>=0&&b<=1&&bm.owner>0;
 $('allocation-grow').style.width=barValid?(b*100)+'%':'0%';$('allocation-pay').style.width=barValid?((1-b)*100)+'%':'0%';
 $('allocation-grow-value').textContent=valid?n(bm.per100(f.rows[0].reinvestment),2)+' '+cur():'—';
 $('allocation-pay-value').textContent=valid?n(bm.per100(f.rows[0].fcfe),2)+' '+cur():'—';
 $('allocation-grow-rate').textContent='維持後キャッシュの '+pct(b,0);
 $('allocation-insight').innerHTML=valid?'成長に回す <strong>'+n(bm.per100(f.rows[0].reinvestment),2)+esc(cur())+'</strong> × 追加投資の収益率 <strong>'+pct(f.a.incremental_cash_return,1)+'</strong><br>→ 翌年の維持後キャッシュが <strong>'+n(bm.per100(f.rows[0].nextIncrease),2)+esc(cur())+'</strong> 増える仮定（成長率 '+pct(f.growth,1)+'）。':'DCFの入力をそろえると、成長投資の効果を表示します。';
}
function renderAnnual(f){
 if(!f.valid){empty('annual-chart');empty('cumulative-chart');$('cumulative-note').textContent='';return;}
 const w=590,h=238,L=46,R=14,T=25,B=35,ys=f.rows.map(r=>f.bm.toShare(r.fcfe)),pvs=f.rows.map(r=>f.bm.toShare(r.present));
 const max=Math.max(...ys,...pvs,1)*1.15,y=v=>T+(max-v)/max*(h-T-B),x=i=>f.rows.length===1?(L+w-R)/2:L+i/(f.rows.length-1)*(w-L-R);
 let s=svgStart(w,h,'年ごとの1株あたり分配可能CFと割引後CF');
 for(let i=0;i<=3;i++){let v=max*i/3;s+=line(L,y(v),w-R,y(v))+text(L-8,y(v)+4,n(v,0),color.muted,10,'end');}
 s+=text(L,T-9,cur()+'/株',color.muted,10,'start');
 const path=vals=>vals.map((v,i)=>(i?'L':'M')+x(i)+','+y(v)).join(' ');
 s+='<path d="'+path(ys)+' L'+x(ys.length-1)+','+y(0)+' L'+x(0)+','+y(0)+' Z" fill="#edf7f3"/>';
 s+='<path d="'+path(ys)+'" fill="none" stroke="'+color.teal+'" stroke-width="2.8"/><path d="'+path(pvs)+'" fill="none" stroke="'+color.steel+'" stroke-width="2.3" stroke-dasharray="5 4"/>';
 f.rows.forEach((r,i)=>{s+='<circle cx="'+x(i)+'" cy="'+y(ys[i])+'" r="3.3" fill="'+color.teal+'"/><circle cx="'+x(i)+'" cy="'+y(pvs[i])+'" r="2.5" fill="'+color.steel+'"/>';if(f.rows.length<=12||i%3===0||i===f.rows.length-1)s+=text(x(i),h-12,r.year+'年',color.muted,10);});
 $('annual-chart').innerHTML=s+'</svg>';
 const parts=f.rows.map(r=>({label:r.year+'年',value:f.bm.toShare(r.present),c:color.steel}));
 parts.push({label:'継続価値',value:f.bm.toShare(f.terminalPresent),c:color.teal});
 if(f.a.equity_value_adjustment!==0)parts.push({label:'調整',value:f.bm.toShare(f.a.equity_value_adjustment),c:color.orange});
 let running=0;parts.forEach(p=>{p.start=running;running+=p.value;p.end=running;});parts.push({label:'合計',value:f.perShare,start:0,end:f.perShare,c:color.ink});
 const lo=Math.min(0,...parts.flatMap(p=>[p.start,p.end])),hi=Math.max(1,...parts.flatMap(p=>[p.start,p.end]))*1.13;
 const yy=v=>T+(hi-v)/(hi-lo)*(h-T-B),step=(w-L-R)/parts.length,bw=step*.63;
 let t=svgStart(w,h,'割引後CFを積み上げた1株価値');
 for(let i=0;i<=3;i++){const v=lo+(hi-lo)*i/3;t+=line(L,yy(v),w-R,yy(v))+text(L-8,yy(v)+4,n(v,0),color.muted,10,'end');}
 t+=text(L,T-9,cur()+'/株',color.muted,10,'start');
 parts.forEach((p,i)=>{const xx=L+step*i+(step-bw)/2;t+='<rect x="'+xx+'" y="'+yy(Math.max(p.start,p.end))+'" width="'+bw+'" height="'+Math.max(1,Math.abs(yy(p.start)-yy(p.end)))+'" rx="3" fill="'+p.c+'"/>';if(parts.length<=14||i%3===0||i>=f.rows.length)t+=text(xx+bw/2,h-12,p.label,color.muted,p.label.length>3?8:9);if(i===parts.length-1)t+=text(xx+bw/2,yy(p.end)-9,n(p.end,0),color.ink,12,'middle',700);});
 $('cumulative-chart').innerHTML=t+'</svg>';
 $('cumulative-note').textContent='1〜'+f.a.horizon_years+'年目 '+n(f.bm.toShare(f.forecastPresent),0)+cur()+' ＋ 継続価値 '+n(f.bm.toShare(f.terminalPresent),0)+cur()+' ＋ 株主価値調整 '+n(f.bm.toShare(f.a.equity_value_adjustment),0)+cur();
}
function renderReverse(f){
 const r=C.reverse(data);
 if(r.status==='ok')$('reverse-output').innerHTML='<div class="reverse-result"><div><div class="sub">モデル上必要な年間成長率</div><div class="big">'+n(r.growth*100,2)+'<small>%</small></div></div><div class="right">再投資率 '+pct(data.assumptions.reinvestment_rate,0)+' を固定して、<br>予測期間の成長を逆算。</div></div><div class="reverse-sub">必要な追加投資のキャッシュ収益率：<strong>'+pct(r.cashReturn,2)+'</strong></div><p class="chart-note">現在の仮定では成長 '+pct(f.growth,2)+' / 追加投資の収益率 '+pct(data.assumptions.incremental_cash_return,2)+'</p>';
 else $('reverse-output').innerHTML='<div class="empty-chart" style="padding:27px 12px">'+esc(r.message)+'</div>';
 if(!f.valid){$('sensitivity').innerHTML='<div class="empty-chart">DCFの入力をそろえると表示します。</div>';return;}
 const qs=[...new Set([-.04,-.02,0,.02,.04].map(v=>Math.round(Math.max(0,Math.min(1,f.a.incremental_cash_return+v))*1e8)/1e8))];
 const rs=[-.02,-.01,0,.01,.02].map(v=>Math.round((f.a.cost_of_equity+v)*1e8)/1e8);
 const cells=rs.map(r=>qs.map(q=>{if(r<=0)return null;const v=C.forecast(data,{cost_of_equity:r,incremental_cash_return:q});return v.valid?v.perShare:null;}));
 const values=cells.flat().filter(C.number),min=Math.min(...values),max=Math.max(...values);
 let html='<table class="heatmap"><thead><tr><th>割引率 / 採算</th>'+qs.map(q=>'<th>'+pct(q,1)+'</th>').join('')+'</tr></thead><tbody>';
 rs.forEach((r,i)=>{html+='<tr><td>'+pct(r,1)+'</td>';qs.forEach((q,j)=>{const v=cells[i][j],frac=C.number(v)?(v-min)/Math.max(1,max-min):0,light=98-frac*16,active=Math.abs(r-f.a.cost_of_equity)<1e-7&&Math.abs(q-f.a.incremental_cash_return)<1e-7;html+='<td class="'+(active?'current':'')+'" style="background:hsl(164,31%,'+light+'%)">'+n(v,0)+'</td>';});html+='</tr>';});
 $('sensitivity').innerHTML=html+'</tbody></table>';
}
function renderHistorical(){
 const hist=C.historical(data),latest=hist.rows[hist.rows.length-1];
 $('history-metrics').innerHTML='<div class="mini"><div class="label">最新期のROE</div><strong>'+pct(latest?.roe,1)+'</strong></div><div class="mini"><div class="label">観測増分ROE（参考）</div><strong>'+pct(hist.incrementalRoe,1)+'</strong></div><div class="mini"><div class="label">累計FCF / 累計純利益</div><strong>'+pct(hist.conversion,1)+'</strong></div>';
 if(!hist.rows.length){$('history-table').innerHTML='<div class="empty-chart">過去の年次データがありません。DCFは基準年データだけでも計算できます。</div>';return;}
 const heads=['決算期','売上高','純利益','営業CF','総CAPEX','参考FCF','調整後FCFE','ROE'];
 let html='<table><thead><tr>'+heads.map(t=>'<th>'+t+'</th>').join('')+'</tr></thead><tbody>';
 hist.rows.forEach(r=>html+='<tr><td>'+esc(r.fiscal_year)+'</td><td>'+n(r.revenue,0)+'</td><td>'+n(r.net_income,0)+'</td><td>'+n(r.operating_cf,0)+'</td><td>'+n(r.cash_capex,0)+'</td><td>'+n(r.fcf,0)+'</td><td>'+n(r.fcfe,0)+'</td><td>'+pct(r.roe,1)+'</td></tr>');
 $('history-table').innerHTML=html+'</tbody></table>';
}
function renderForecast(f){
 $('forecast-table-unit').textContent='会社全体は'+amountUnit()+'、1株あたりは'+cur()+'。1年目は正規化した基準額。';
 if(!f.valid){$('forecast-table').innerHTML='<div class="empty-chart">計算に必要な入力が不足、または前提が不整合です。</div>';$('formula-details').textContent='';return;}
 let html='<table><thead><tr><th>予測年</th><th>維持後キャッシュ</th><th>成長への再投資</th><th>分配可能CF</th><th>CF / 株</th><th>割引後CF / 株</th><th>現在価値の累計 / 株</th></tr></thead><tbody>';
 f.rows.forEach(r=>html+='<tr><td>'+r.year+'年目</td><td>'+n(r.owner,0)+'</td><td>'+n(r.reinvestment,0)+'</td><td>'+n(r.fcfe,0)+'</td><td>'+n(f.bm.toShare(r.fcfe),2)+'</td><td>'+n(f.bm.toShare(r.present),2)+'</td><td>'+n(f.bm.toShare(r.cumulative),2)+'</td></tr>');
 html+='<tr style="background:#edf6f3"><td>成熟期の初年（'+(f.a.horizon_years+1)+'年目）</td><td>'+n(f.terminalOwner,0)+'</td><td>'+n(f.terminalReinvestment,0)+'</td><td>'+n(f.terminalFcfe,0)+'</td><td>'+n(f.bm.toShare(f.terminalFcfe),2)+'</td><td colspan="2">継続価値のPV / 株：'+n(f.bm.toShare(f.terminalPresent),2)+'</td></tr>';
 $('forecast-table').innerHTML=html+'</tbody></table>';
 $('formula-details').innerHTML='<p>Oは維持後・成長投資前のキャッシュ、Gは成長への再投資、Cは分配可能CFです。qはこのモデルの追加キャッシュ収益率で、会計ROE・ROICとは異なります。</p><div class="math-block">O₁ = 純利益 + 減価償却 + その他調整 − 維持CAPEX − 維持運転資本\nGₜ = Oₜ × 再投資率 b\nCₜ = Oₜ − Gₜ\nOₜ₊₁ = Oₜ + Gₜ × 追加キャッシュ収益率 q\n成長率 = b × q = '+pct(f.growth,2)+'\n\n成熟期の再投資率 b∞ = g∞ / q∞ = '+pct(f.terminalReinvestmentRate,2)+'\nOₙ₊₁ = Oₙ + Gₙ × q（N年目の投資は翌年に効果）\nCₙ₊₁ = Oₙ₊₁ × (1 − b∞)\nTVₙ = Cₙ₊₁ / (株主資本コスト − 永久成長率)\n株主価値 = Σ Cₜ/(1+r)ᵗ + TVₙ/(1+r)ᴺ + 株主価値調整\n1株価値 = 株主価値 × 1,000,000 / 株数</div><p>各年末に投資し翌年から効果が出るため、N年目の投資効果はN+1年目にも反映します。N+1年目から成熟期の再投資率を適用し、その投資がN+2年目以降の永久成長を支えます。借入残高をこのFCFE型評価から機械的に差し引きません。利益に利息負担が含まれ、将来の純借入をゼロと置いているためです。</p><p>過去の参考FCF＝営業CF−総CAPEX。調整後FCFE＝参考FCF＋純借入＋株主向けCF調整。調整値が未入力ならFCFEは表示しません。</p>';
}
function renderWarnings(f){
 const labels={confirmed:'確認済',uncertain:'未確認',not_material:'軽微',adjusted:'調整済',unresolved:'未解決',stable:'安定前提',changing:'変動あり'};
 const ch=data.checks||{};
 $('checks-status').innerHTML=[['CFの帰属',ch.cash_flow_scope],['非支配持分',ch.non_controlling_interests],['リース',ch.leases],['資本構成',ch.capital_structure]].map(([l,v])=>'<span>'+l+'：<strong>'+esc(labels[v]||'未確認')+'</strong></span>').join('');
 const ws=[...C.warnings(data,f),...importAudit];
 $('warnings').innerHTML=(ws.length?ws:['入力元の根拠を確認してください。将来予測はすべて仮定に依存します。']).map(w=>'<p>'+esc(w)+'</p>').join('');
}
function renderSources(){
 $('source-meta').textContent=data.meta.company_name+' / 評価基準日 '+(data.meta.as_of||'未登録')+' / '+(data.meta.basis_notes||'');
 const sources=data.sources||[];
 $('source-list').innerHTML=sources.length?sources.map(s=>{let url='';try{const u=new URL(s.url);if(['https:','http:'].includes(u.protocol))url=u.href;}catch(e){}return '<div class="source"><span class="pill gray">'+esc(s.id)+'</span><strong style="margin-top:7px">'+esc(s.title||'資料名未入力')+'</strong><p>公開日 '+esc(s.published_at||'未登録')+' / '+esc(s.locator||'参照箇所未登録')+'</p>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">一次資料を開く ↗</a>':'<span class="sub">URLなし</span>')+'</div>';}).join(''):'<p class="status-text">出典が未登録です。</p>';
 const evidence=data.evidence||[];
 $('evidence-table').innerHTML=evidence.length?'<table class="evidence-table"><thead><tr><th>項目</th><th>現在の値</th><th>区分</th><th>出典ID</th><th>採用理由・留意点</th></tr></thead><tbody>'+evidence.map(e=>'<tr><td>'+esc(e.path)+'</td><td>'+esc(C.number(get(data,e.path))?n(get(data,e.path),4).replace(/\.0+$/,''):get(data,e.path)===null?'null':'—')+'</td><td>'+esc(kindLabel(e.kind))+'</td><td>'+esc(Array.isArray(e.source_ids)?e.source_ids.join(', '):'')+'</td><td>'+esc(e.note||'')+'</td></tr>').join('')+'</tbody></table>':'<div class="empty-chart">数値ごとの根拠が未登録です。</div>';
}
function render(){
 const f=C.forecast(data),bm=f.bm||C.baseMetrics(data);lastForecast=f;
 $('company-name').textContent=data.meta.company_name;
 $('bridge-heading').innerHTML='<span class="section-number">01</span>100'+esc(cur())+'投資したときの、お金の流れ';
 $('bridge-axis').textContent='購入価格100'+cur()+'あたり / 正規化した年間額';
 baseFields.forEach(([path])=>{const input=$('field-'+path.replace('.','-'));if(input){const badge=input.closest('.field').querySelector('.pill');if(badge)badge.outerHTML=evidenceBadge(path);}});
 $('company-meta').textContent=(data.meta.ticker||'コード未登録')+' · 株価基準日 '+(data.meta.price_as_of||'未登録')+' · 金額 '+amountUnit();
 $('dirty-label').textContent=dirty?'● 手動変更あり。閉じる前にJSON保存。':'';$('dirty-label').className='dirty-mark';
 $('data-banner').className='banner'+(data.meta.is_demo?'':' real');
 $('data-banner').innerHTML=data.meta.is_demo?'<strong>架空サンプルで表示中</strong><span>PER13倍の仕組みを試すための教材です。実在企業の数値ではありません。実データは「データ・出典」から読み込めます。</span>':'<strong>入力データによる参考計算</strong><span>決算実績と維持投資・将来採算の仮定を区別してください。基準年の利益は正規化入力で、市場表示の予想PERとは異なる場合があります。</span>';
 const errors=C.validate(data).concat(f.errors||[]);
 $('calculation-errors').hidden=!errors.length;
 $('calculation-errors').textContent=errors.length?'計算を保留しています。\n'+[...new Set(errors)].join('\n'):'';
 $('metric-value').innerHTML=f.valid?money(f.perShare,0):'—';
 $('metric-gap').textContent=f.valid&&data.market.price>0?'現在株価との差 '+(f.perShare/data.market.price>=1?'+':'')+n((f.perShare/data.market.price-1)*100,1)+'% / 仮定に基づく参考値':'必要な入力を確認してください';
 $('metric-price').innerHTML=money(data.market.price,0);
 $('metric-per').textContent='基準利益によるPER '+n(bm.per,1)+'倍 / 利益利回り '+pct(bm.earningsYield,1);
 $('metric-yield').innerHTML=C.number(bm.ownerYield)?n(bm.ownerYield*100,2)+'<small>%</small>':'—';
 $('metric-distribution').textContent='成長再投資後の分配可能利回り '+pct(f.firstDistributionYield,2);
 $('metric-terminal').innerHTML=f.valid?n(f.terminalDependency*100,1)+'<small>%</small>':'—';
 $('metric-period').textContent=f.valid?(f.a.horizon_years+1)+'年目以降の現在価値 / 資産調整を除く':'成熟期の仮定を確認';
 $('csv-btn').disabled=!f.valid;$('csv-btn-bottom').disabled=!f.valid;
 renderBridge(bm);renderAllocation(f,bm);renderAnnual(f);renderReverse(f);renderHistorical();renderForecast(f);renderWarnings(f);renderSources();
 window.OwnerLensState={data,forecast:f};
}
function applyPreset(which){
 const a=original.assumptions;if(!a)return;
 data.assumptions=C.clone(a);
 if(which!=='base'){
  const down=which==='cautious',factor=down ? 0.75 : 1.25;
  if(C.number(a.incremental_cash_return))data.assumptions.incremental_cash_return=Math.min(1,a.incremental_cash_return*factor);
  if(C.number(a.terminal_cash_return))data.assumptions.terminal_cash_return=Math.min(1,Math.max(a.terminal_growth_rate||0,a.terminal_cash_return*factor));
  if(C.number(a.cost_of_equity))data.assumptions.cost_of_equity=Math.min(1,Math.max((a.terminal_growth_rate||0)+.001,a.cost_of_equity+(down ? 0.01 : -0.01)));
 }
 C.assumptionKeys.forEach(k=>mark('assumptions.'+k,'読込時の前提に対するシナリオ操作。'));
 renderControls();render();toast(which==='base'?'将来仮定を読込時に戻しました。基準利益などは据え置きです。':'初期・成熟期の投資採算と割引率を変更しました。');
}
function normalize(which){
 const rows=which==='latest'?data.history.slice(-1):data.history.slice(-5);
 if(!rows.length){toast('年次データがありません。');return;}
 const ni=C.avg(rows.map(r=>r.net_income)),da=C.avg(rows.map(r=>r.depreciation_amortization));
 if(!C.number(ni)||!C.number(da)){toast('対象期間に欠損値があります。ゼロ埋めせず、手動で確認してください。');return;}
 data.base.net_income=ni;data.base.depreciation_amortization=da;
 ['net_income','depreciation_amortization'].forEach(k=>mark('base.'+k,which==='latest'?'最新期の実績を予測基準として仮置き。':'最新'+rows.length+'期平均を予測基準として仮置き。'));
 renderControls();render();toast('純利益・減価償却を更新。維持投資・運転資本は変更していません。');
}
function importData(text,where){
 const msg=$(where);msg.className='data-message';
 try{
  const next=C.parse(text);data=next;original=C.clone(next);dirty=false;importAudit=[];
  const f=C.forecast(data),v=data.verification||{};
  [['owner_earnings',f.bm.owner],['first_year_fcfe',f.valid?f.rows[0].fcfe:null],['dcf_value_per_share',f.valid?f.perShare:null]].forEach(([k,value])=>{if(C.number(v[k])&&C.number(value)&&Math.abs(v[k]-value)>Math.max(.01,Math.abs(value)*.001))importAudit.push('JSONの参考計算 '+k+' とソフトの再計算に差があります。元データから再計算した値を表示しています。');});
  renderControls();render();msg.classList.add('success');msg.textContent='「'+data.meta.company_name+'」を読み込みました。'+(f.valid?'再計算できました。':'不足する入力は分析画面に表示しています。');
  toast('データを読み込みました。「分析する」で結果を確認できます。');
 }catch(err){msg.classList.add('error');msg.textContent=err.message;}
}
async function readFile(file){
 if(!file)return;
 if(file.size>2*1024*1024){$('file-message').className='data-message error';$('file-message').textContent='2MB以下のJSONを選んでください。';return;}
 try{const text=await file.text();importData(text,'file-message');}catch(err){$('file-message').className='data-message error';$('file-message').textContent='ファイルを読み込めませんでした。JSON貼り付けも利用できます。';}
 $('file-input').value='';
}
async function copyPrompt(){
 const field=$('prompt-text');let ok=false;
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(RESEARCH_PROMPT);ok=true;}}catch(e){}
 if(!ok){field.focus();field.select();field.setSelectionRange(0,field.value.length);try{ok=document.execCommand('copy');}catch(e){}}
 toast(ok?'プロンプト全文をコピーしました。':'全文を選択しました。端末の「コピー」を使ってください。');
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
$('save-btn').addEventListener('click',exportJSON);$('csv-btn').addEventListener('click',exportCSV);$('csv-btn-bottom').addEventListener('click',exportCSV);
$('preset-cautious').addEventListener('click',()=>applyPreset('cautious'));$('preset-base').addEventListener('click',()=>applyPreset('base'));$('preset-up').addEventListener('click',()=>applyPreset('up'));
$('use-latest').addEventListener('click',()=>normalize('latest'));$('use-mean').addEventListener('click',()=>normalize('mean'));
$('maint-da').addEventListener('click',()=>{if(!C.number(data.base.depreciation_amortization)){toast('減価償却が未入力です。');return;}data.base.maintenance_capex=data.base.depreciation_amortization;mark('base.maintenance_capex','減価償却と同額と仮定。確定値ではない。');renderControls();render();toast('維持CAPEXを減価償却と同額に仮置きしました。');});
$('show-sources').addEventListener('click',()=>showTab('data'));
$('choose-file').addEventListener('click',()=>$('file-input').click());$('file-input').addEventListener('change',e=>readFile(e.target.files[0]));
const drop=$('drop-zone');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag');});drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');readFile(e.dataTransfer.files[0]);});
$('import-text').addEventListener('click',()=>importData($('json-input').value,'text-message'));
$('current-to-editor').addEventListener('click',()=>$('json-input').value=JSON.stringify(data,null,2));
$('load-demo').addEventListener('click',()=>{if(dirty&&!confirm('手動変更を破棄してリンナイ初期データを読み込みますか？'))return;importData(JSON.stringify(DEMO),'file-message');});
$('save-template').addEventListener('click',()=>download(JSON.stringify(BLANK,null,2),'blank_template.json','application/json;charset=utf-8'));
$('copy-prompt').addEventListener('click',copyPrompt);$('download-prompt').addEventListener('click',()=>download(RESEARCH_PROMPT,'research_prompt.txt','text/plain;charset=utf-8'));
$('prompt-text').value=RESEARCH_PROMPT;

function chooseIllustration(kind){
 const zero=kind==='zero';
 data.assumptions.reinvestment_rate=zero?0:.4;
 data.assumptions.incremental_cash_return=zero?0:.1;
 data.assumptions.terminal_growth_rate=zero?0:.015;
 ['reinvestment_rate','incremental_cash_return','terminal_growth_rate'].forEach(k=>mark('assumptions.'+k,zero?'教育用の成長ゼロ比較。企業の予測ではありません。':'教育用の40%再投資・追加収益率10%・永久成長1.5%の試算。会社開示ではありません。'));
 renderControls();render();
 toast(zero?'成長ゼロの比較用条件を入力しました。':'40%・10%は教育用の仮定です。実績ではありません。');
}
$('example-zero').addEventListener('click',()=>chooseIllustration('zero'));
$('example-forty').addEventListener('click',()=>chooseIllustration('forty'));
$('clear-growth').addEventListener('click',()=>{
 data.assumptions.reinvestment_rate=null;data.assumptions.incremental_cash_return=null;
 ['reinvestment_rate','incremental_cash_return'].forEach(k=>mark('assumptions.'+k,'根拠未確定のため入力を解除。'));
 renderControls();render();
});

// Close other inline help bubbles, and close all with Escape or an outside click.
document.addEventListener('click',e=>{document.querySelectorAll('details.help[open]').forEach(d=>{if(!d.contains(e.target))d.open=false;});});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('details.help[open]').forEach(d=>d.open=false);});
renderControls();render();
})();

