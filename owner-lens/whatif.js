/* Owner Lens v1.4: optional what-if controls and comparison snapshots.
 * The shared forecast engine and imported assumptions remain authoritative.
 * Monetary inputs use oku (100m JPY) only in JPY mode, otherwise millions.
 */
(function () {
  'use strict';
  const C = window.OwnerCalc, $ = id => document.getElementById(id);
  if (!C || !window.OwnerLensState || !$('simple-panel')) return;
  const state = () => window.OwnerLensState;
  const fmt = (v, d=1) => C.number(v) ? v.toLocaleString('ja-JP', {maximumFractionDigits:d}) : '—';
  const pct = v => C.number(v) ? fmt(v*100,2)+'%' : '—';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currency = () => state().data.meta.currency === 'JPY' ? '円' : state().data.meta.currency;
  const scale = () => state().data.meta.currency === 'JPY' ? 100 : 1;
  const amountUnit = () => state().data.meta.currency === 'JPY' ? '億円' : '百万'+currency();
  let baseline = null, lastData = null, snapshots = [];
  const style = document.createElement('style');
  style.textContent = `
    .wi-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:15px}
    .wi-tools span{font-size:12px;color:var(--muted)}
    .wi-panel{margin:0 0 18px}.wi-panel>summary{font-size:14px}
    .wi-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding-bottom:10px}
    .wi-field{padding:14px;background:#f4f8f8;border-radius:12px;min-width:0}
    .wi-field label{font-size:13px;font-weight:700;display:block}
    .wi-num{display:flex;align-items:baseline;gap:8px;margin-top:7px}.wi-num input{width:100%;min-width:0;color:var(--blue);font-size:24px;padding:6px}
    .wi-field input[type=range]{width:100%;accent-color:var(--teal);margin-top:12px}
    .wi-field p,.wi-note{font-size:12px;line-height:1.7;color:var(--muted);margin:8px 0}
    .wi-note{padding-bottom:10px}.wi-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px}
    .wi-actions .selected{border-color:var(--teal);background:#edf7f3;color:var(--teal)}
    .wi-breakdown{font-size:12px;color:var(--muted);padding:12px 0 0;line-height:1.8}
    .wi-dividend{border-top:1px solid var(--line);margin-top:16px;padding-top:14px}
    .wi-dividend .wi-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .wi-pair span{display:block;font-size:11px;color:var(--muted)}.wi-pair strong{display:block;font-size:21px;margin-top:4px;color:var(--ink)}
    .wi-dividend p{font-size:11px;line-height:1.7;color:var(--muted);margin:8px 0 0}
    .wi-compare{margin:20px 0}.wi-compare .wi-actions{margin:0;padding-bottom:12px}
    .wi-table{min-width:570px}.wi-table th,.wi-table td{padding:9px 12px;font-size:12px}.wi-table small{font-weight:400;display:block;margin-top:5px;color:var(--muted)}
    .wi-table .wi-value{font-size:18px;font-weight:700;color:var(--teal)}
    .wi-empty{font-size:13px;color:var(--muted);padding:8px 0 20px}
    @media(max-width:700px){.wi-grid{grid-template-columns:1fr}.wi-tools button{font-size:12px}.wi-tools span{flex-basis:100%}.wi-num input{font-size:22px}.wi-pair strong{font-size:19px}}
  `;
  document.head.append(style);
  document.querySelector('.topbar .version').textContent = 'v1.4';
  const tools = document.createElement('div');tools.className = 'wi-tools';
  tools.innerHTML = '<span>成長投資の採算で試す</span><button type="button" class="small" id="wi-at-cost">割引率と同じ</button><button type="button" class="small" data-wi-q="10">採算10%</button><button type="button" class="small" data-wi-q="15">採算15%</button><button type="button" class="small" id="wi-more">もし条件を変えたら</button>';
  $('simple-panel').append(tools);
  const panel = document.createElement('details');panel.id='wi-panel';panel.className='simple-detail wi-panel';
  panel.innerHTML = `<summary>もし条件を変えたら｜期間・維持投資・余剰資産</summary>
    <div class="wi-actions"><button class="small" data-wi-years="5">5年で考える</button><button class="small" data-wi-years="10">10年で考える</button><button class="small" id="wi-restore">この企業の読込時に戻す</button></div>
    <div class="wi-grid">
      <div class="wi-field"><label for="wi-maintenance">毎年の維持投資</label><div class="wi-num"><input id="wi-maintenance" type="number" min="0" step="1" inputmode="decimal"><span class="wi-unit"></span></div><input id="wi-maintenance-range" type="range" min="0" max="500" step="1" aria-label="毎年の維持投資"><p>増やすほど、事業を維持した後のお金が減ります。</p></div>
      <div class="wi-field"><label for="wi-assets">余剰資産などの加算額</label><div class="wi-num"><input id="wi-assets" type="number" step="1" inputmode="decimal"><span class="wi-unit"></span></div><input id="wi-assets-range" type="range" min="-1000" max="2000" step="10" aria-label="余剰資産などの加算額"><p>税・帰属・拘束性などを調整した株主帰属額。</p></div>
      <div class="wi-field"><label for="wi-adjustment">年間利益の調整額</label><div class="wi-num"><input id="wi-adjustment" type="number" step="0.1" inputmode="decimal"><span class="wi-unit"></span></div><p>資産を別途加算する場合、その資産の税引後収益をマイナスで入力。既存の一過性調整等も含む合計額。</p></div>
      <div class="wi-field"><label for="wi-dividend-input">1株あたり年間配当</label><div class="wi-num"><input id="wi-dividend-input" type="number" min="0" step="0.1" inputmode="decimal" placeholder="入力する"><span id="wi-dividend-unit"></span></div><p id="wi-dividend-source"></p></div>
    </div><p class="wi-note">余剰資産は現在の評価額を加算。再投資は毎年のオーナー利益から支出。配当入力は受取額の比較に使い、DCFは分配可能キャッシュで計算します。</p>
    <div class="wi-actions"><button type="button" class="small" id="wi-original-settings">成熟期・株価などを調整</button></div>`;
  $('simple-panel').after(panel);
  const split = document.createElement('div');split.id='wi-value-breakdown';split.className='wi-breakdown';
  $('metric-value').closest('.card').append(split);
  const dividend = document.createElement('div');dividend.className='wi-dividend';
  dividend.innerHTML='<div class="wi-pair"><div><span>入力配当の利回り</span><strong id="wi-dividend-yield">—</strong></div><div><span>初年度の分配可能利回り</span><strong id="wi-available-yield">—</strong></div></div><p id="wi-dividend-note"></p>';
  $('allocation-insight').after(dividend);
  const compare=document.createElement('section');compare.className='card wi-compare';
  compare.innerHTML='<div class="section-heading"><div><h2>条件を残して、比べる</h2><p>最大3ケース。変える前の条件を保存して比較。</p></div></div><div class="wi-actions"><button type="button" class="primary" id="wi-save">今の条件を比較に保存</button><button type="button" class="small" id="wi-export">比較CSV</button><button type="button" class="small" id="wi-clear">比較をクリア</button></div><div id="wi-compare-table" class="table-scroll"></div><p id="wi-status" class="wi-note" role="status" aria-live="polite"></p>';
  document.querySelector('.simple-main-grid').after(compare);
  function send(id,value){const el=$(id);if(!el)return;el.value=C.number(value)?String(value):'';el.dispatchEvent(new Event('input',{bubbles:true}));}
  function status(text){$('wi-status').textContent=text;}
  function note(path,text){const d=state().data;d.evidence=d.evidence||[];let e=d.evidence.find(e=>e.path===path);if(!e){e={path,kind:'analyst_assumption',source_ids:[]};d.evidence.push(e);}e.kind='analyst_assumption';e.source_ids=[];e.note=text;}
  function setQ(q){const b=state().data.assumptions.reinvestment_rate;if(!(C.number(b)&&b>0)){status('②「成長に回す割合」を先に入力してください。');$('simple-reinvest').focus();return;}send('simple-growth',b*q);status('成長投資の採算を'+fmt(q,2)+'%と置き、①の成長率を更新しました。');}
  tools.querySelectorAll('[data-wi-q]').forEach(el=>el.addEventListener('click',()=>setQ(Number(el.dataset.wiQ))));
  $('wi-at-cost').addEventListener('click',()=>{const r=state().data.assumptions.cost_of_equity;if(C.number(r))setQ(r*100);});
  $('wi-more').addEventListener('click',()=>{panel.open=!panel.open;if(panel.open)panel.scrollIntoView({behavior:'smooth',block:'nearest'});});
  $('wi-original-settings').addEventListener('click',()=>$('simple-settings').click());
  panel.querySelectorAll('[data-wi-years]').forEach(el=>el.addEventListener('click',()=>send('param-horizon_years',Number(el.dataset.wiYears))));
  const bindings=[['maintenance','field-base-maintenance_capex'],['assets','field-assumptions-equity_value_adjustment'],['adjustment','field-base-other_adjustments']];
  bindings.forEach(([k,target])=>{
    $('wi-'+k).addEventListener('input',()=>{const el=$('wi-'+k);send(target,el.value.trim()===''?null:el.valueAsNumber*scale());});
    const range=$('wi-'+k+'-range');if(range)range.addEventListener('input',()=>send('wi-'+k,Number(range.value)));
  });
  function initUI(d){
    if(!d.whatif || typeof d.whatif!=='object' || Array.isArray(d.whatif))d.whatif={};
    d.sources=d.sources||[];d.evidence=d.evidence||[];
    if(!Object.prototype.hasOwnProperty.call(d.whatif,'dividend_per_share')){
      const isRinnai=String(d.meta.ticker)==='5947'&&d.meta.currency==='JPY';
      d.whatif.dividend_per_share=isRinnai?106:null;
      d.whatif.dividend_note=isRinnai?'2027/03会社予想：106円／株（2026-09-28確認）':'';
      d.whatif.dividend_source=isRinnai?'https://www.rinnai.co.jp/ir/dividend/':'';
      if(isRinnai){
        if(!d.sources.some(s=>s.id==='WI_DIV'))d.sources.push({id:'WI_DIV',title:'リンナイ 配当情報',url:d.whatif.dividend_source,published_at:'',locator:'2027年3月期（予想）106円。確認日2026-09-28。'});
        if(!d.evidence.some(e=>e.path==='whatif.dividend_per_share'))d.evidence.push({path:'whatif.dividend_per_share',kind:'company_forecast',source_ids:['WI_DIV'],note:d.whatif.dividend_note});
      }
    }
  }
  $('wi-dividend-input').addEventListener('input',()=>{
    const d=state().data,el=$('wi-dividend-input'),v=el.value.trim()===''?null:el.valueAsNumber;
    if(v!==null&&(!C.number(v)||v<0)){status('年間配当は0以上で入力してください。');return;}
    d.whatif.dividend_per_share=v;d.whatif.dividend_note='ユーザー入力';d.whatif.dividend_source='';note('whatif.dividend_per_share','画面で入力した年間配当。');
    // Trigger the shared render and dirty marker without changing the cash model.
    send('field-base-other_adjustments',d.base.other_adjustments);sync();
  });
  function importSnapshot(d){$('json-input').value=JSON.stringify(d);$('import-text').click();}
  $('wi-restore').addEventListener('click',()=>{if(baseline)importSnapshot(C.clone(baseline));status('企業データの読込時の条件に戻しました。');});
  function compareRender(){
    if(!snapshots.length){$('wi-compare-table').innerHTML='<div class="wi-empty">条件を設定して保存すると、ここに比較結果が並びます。</div>';return;}
    const rows=[['成長率',s=>pct(s.f.growth)],['再投資割合',s=>pct(s.d.assumptions.reinvestment_rate)],['投資の採算',s=>pct(s.d.assumptions.incremental_cash_return)],['割引率',s=>pct(s.d.assumptions.cost_of_equity)],['明示予測',s=>s.d.assumptions.horizon_years+'年'],['成熟期の成長率',s=>pct(s.d.assumptions.terminal_growth_rate)],['維持投資',s=>fmt(s.d.base.maintenance_capex/s.scale,1)+s.unit],['余剰資産等の加算',s=>fmt(s.d.assumptions.equity_value_adjustment/s.scale,1)+s.unit],['年間利益の調整',s=>fmt(s.d.base.other_adjustments/s.scale,1)+s.unit],['入力配当利回り',s=>pct(s.divYield)],['分配可能利回り',s=>pct(s.f.firstDistributionYield)],['モデルの1株価値',s=>fmt(s.f.perShare,0)+s.cur],['必要な成長率',s=>s.rev.status==='ok'?pct(s.rev.growth):'—']];
    let h='<table class="wi-table"><thead><tr><th>項目</th>'+snapshots.map((s,i)=>'<th>ケース'+(i+1)+'<small>'+esc(s.d.meta.company_name)+'</small><button class="small" data-wi-apply="'+i+'">この条件に戻す</button></th>').join('')+'</tr></thead><tbody>';
    rows.forEach(([name,fn])=>{h+='<tr><td>'+name+'</td>'+snapshots.map(s=>'<td'+(name==='モデルの1株価値'?' class="wi-value"':'')+'>'+esc(fn(s))+'</td>').join('')+'</tr>';});
    $('wi-compare-table').innerHTML=h+'</tbody></table>';
    $('wi-compare-table').querySelectorAll('[data-wi-apply]').forEach(b=>b.addEventListener('click',()=>{importSnapshot(C.clone(snapshots[Number(b.dataset.wiApply)].d));status('保存した条件を読み込みました。');}));
  }
  $('wi-save').addEventListener('click',()=>{
    const d=C.clone(state().data),f=C.forecast(d);if(!f.valid){status('①〜③の条件を設定すると保存できます。');return;}
    if(snapshots.length>=3){status('3ケースを保存済みです。「比較をクリア」で新しく比較できます。');return;}
    snapshots.push({d,f,rev:C.reverse(d),scale:scale(),unit:amountUnit(),cur:currency(),divYield:C.number(d.whatif.dividend_per_share)&&d.market.price>0?d.whatif.dividend_per_share/d.market.price:null});
    compareRender();status('条件を保存しました。比較はこのページ内で保持。持ち出す場合は比較CSVまたはJSON保存。');
  });
  $('wi-clear').addEventListener('click',()=>{snapshots=[];compareRender();status('比較をクリアしました。現在の入力は保持しています。');});
  $('wi-export').addEventListener('click',()=>{
    if(!snapshots.length){status('比較ケースを保存してから書き出してください。');return;}
    const rows=[['ケース','企業','株価基準日','成長率','再投資率','投資採算','割引率','予測年数','永久成長率','維持CAPEX(百万通貨)','株主価値調整(百万通貨)','その他利益調整(百万通貨)','配当/株','配当利回り','分配可能利回り','DCF価値/株','必要成長率']];
    snapshots.forEach((s,i)=>{const a=s.d.assumptions;rows.push([i+1,s.d.meta.company_name,s.d.meta.price_as_of,s.f.growth,a.reinvestment_rate,a.incremental_cash_return,a.cost_of_equity,a.horizon_years,a.terminal_growth_rate,s.d.base.maintenance_capex,a.equity_value_adjustment,s.d.base.other_adjustments,s.d.whatif.dividend_per_share,s.divYield,s.f.firstDistributionYield,s.f.perShare,s.rev.status==='ok'?s.rev.growth:'']);});
    const cell=v=>'"'+String(v??'').replace(/^[=+@\t\r]/,"'$&").replace(/"/g,'""')+'"';
    const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='owner_lens_scenarios.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  function sync(){
    const {data:d,forecast:f}=state();if(d!==lastData){initUI(d);if(!baseline||d.meta.ticker!==baseline.meta.ticker||d.meta.currency!==baseline.meta.currency)baseline=C.clone(d);lastData=d;}
    document.querySelector('.topbar .version').textContent='v1.4';
    const values={maintenance:d.base.maintenance_capex,assets:d.assumptions.equity_value_adjustment,adjustment:d.base.other_adjustments};
    Object.entries(values).forEach(([k,v])=>{const el=$('wi-'+k),shown=C.number(v)?v/scale():null;if(document.activeElement!==el)el.value=C.number(shown)?String(Math.round(shown*1e6)/1e6):'';const range=$('wi-'+k+'-range');if(range){range.min=String(k==='maintenance'?0:Math.min(-1000,shown||0));range.max=String(Math.max(k==='maintenance'?500:2000,shown||0));range.value=C.number(shown)?shown:0;}});
    panel.querySelectorAll('.wi-unit').forEach(e=>e.textContent=amountUnit());$('wi-dividend-unit').textContent=currency()+'/株';
    if(document.activeElement!==$('wi-dividend-input'))$('wi-dividend-input').value=C.number(d.whatif.dividend_per_share)?d.whatif.dividend_per_share:'';
    $('wi-dividend-source').textContent=d.whatif.dividend_note||'年間配当を入力すると、受取配当の利回りを確認できます。';
    panel.querySelectorAll('[data-wi-years]').forEach(e=>{const selected=Number(e.dataset.wiYears)===d.assumptions.horizon_years;e.classList.toggle('selected',selected);e.setAttribute('aria-pressed',String(selected));});
    const div=d.whatif.dividend_per_share,dy=C.number(div)&&d.market.price>0?div/d.market.price:null;
    $('wi-dividend-yield').textContent=pct(dy);$('wi-available-yield').textContent=f.valid?pct(f.firstDistributionYield):'—';
    const dp=f.valid?f.bm.toShare(f.rows[0].fcfe):null;
    $('wi-dividend-note').textContent='配当：'+(C.number(div)?fmt(div,1)+currency()+'/株':'未入力')+'。分配可能額の使い道は配当・自社株買い・現金保有。'+(C.number(dp)&&C.number(div)&&div>dp?' 配当入力が分配可能額を上回るため、追加原資を確認。':'');
    let display=f;if(!f.valid&&d.assumptions.reinvestment_rate===null&&d.assumptions.incremental_cash_return===null)display=C.forecast(d,{reinvestment_rate:0,incremental_cash_return:0,terminal_growth_rate:0});
    $('wi-value-breakdown').textContent=display.valid?'CFの価値 '+fmt(display.bm.toShare(display.businessTotal),0)+currency()+' ＋ 資産等の加算 '+fmt(display.bm.toShare(display.a.equity_value_adjustment),0)+currency()+' ／ 株':'①〜③の条件から再計算します。';
  }
  new MutationObserver(sync).observe($('company-name'),{childList:true});
  compareRender();sync();
})();
