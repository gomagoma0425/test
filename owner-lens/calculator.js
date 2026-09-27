
/* Owner Lens v1.0 — dependency-free calculation kernel.
 * Forecast is an explicitly simplified, all-equity-funded growth CASH model.
 * incremental_cash_return is NOT accounting ROE or ROIC.
 */
(function (root) {
  'use strict';
  const number = x => typeof x === 'number' && Number.isFinite(x);
  const clone = o => JSON.parse(JSON.stringify(o));
  const avg = a => a.length && a.every(number) ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const sum = a => a.length && a.every(number) ? a.reduce((s, x) => s + x, 0) : null;
  const baseKeys = ['net_income','depreciation_amortization','other_adjustments','maintenance_capex','maintenance_working_capital'];
  const historyKeys = ['revenue','net_income','depreciation_amortization','operating_cf','cash_capex','working_capital_increase','equity_start','equity_end','dividends','net_borrowing','equity_cf_adjustment'];
  const assumptionKeys = ['horizon_years','reinvestment_rate','incremental_cash_return','cost_of_equity','terminal_growth_rate','terminal_cash_return','equity_value_adjustment'];
  function validate(d) {
    const errors = [];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return ['JSONの最上位はオブジェクトにしてください。'];
    if (!d.meta || d.meta.schema_version !== '1.0') errors.push('meta.schema_version は "1.0" が必要です。');
    if (!d.meta || d.meta.amount_unit !== 'million') errors.push('金額単位 meta.amount_unit は "million"（百万通貨単位）に統一してください。');
    if (!d.meta || !/^[A-Z]{3}$/.test(d.meta.currency || '')) errors.push('meta.currency は JPY / USD など3文字にしてください。');
    if (!d.meta || typeof d.meta.company_name !== 'string' || !d.meta.company_name.trim()) errors.push('meta.company_name が必要です。');
    if (!d.market || !d.base || !d.assumptions) return errors.concat('market / base / assumptions が必要です。');
    function check(v, path, lo, hi, integer) {
      if (v === null || v === undefined) return;
      if (!number(v)) { errors.push(path + ' は数値か null にしてください（文字列は不可）。'); return; }
      if (lo !== undefined && v < lo) errors.push(path + ' は ' + lo + ' 以上にしてください。');
      if (hi !== undefined && v > hi) errors.push(path + ' は ' + hi + ' 以下にしてください。');
      if (integer && !Number.isInteger(v)) errors.push(path + ' は整数にしてください。');
    }
    check(d.market.price,'market.price',0.000001,1e12);
    check(d.market.shares_outstanding,'market.shares_outstanding',1,1e16);
    baseKeys.forEach(k => check(d.base[k], 'base.' + k, ['maintenance_capex','depreciation_amortization'].includes(k) ? 0 : undefined));
    check(d.assumptions.horizon_years,'assumptions.horizon_years',1,30,true);
    check(d.assumptions.reinvestment_rate,'assumptions.reinvestment_rate',0,1);
    check(d.assumptions.incremental_cash_return,'assumptions.incremental_cash_return',0,1);
    check(d.assumptions.cost_of_equity,'assumptions.cost_of_equity',0.0001,1);
    check(d.assumptions.terminal_growth_rate,'assumptions.terminal_growth_rate',0,0.1);
    check(d.assumptions.terminal_cash_return,'assumptions.terminal_cash_return',0.0001,1);
    check(d.assumptions.equity_value_adjustment,'assumptions.equity_value_adjustment');
    if (!Array.isArray(d.history)) errors.push('history は配列にしてください。');
    else {
      if (d.history.length > 40) errors.push('history は40期までにしてください。');
      const dates = new Set();
      d.history.forEach((r,i) => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push('history['+i+'] はオブジェクトが必要です。'); return; }
        if (typeof r.fiscal_year !== 'string' || !r.fiscal_year) errors.push('history['+i+'].fiscal_year が必要です。');
        if (dates.has(r.fiscal_year)) errors.push('history に重複する fiscal_year があります。');
        dates.add(r.fiscal_year);
        historyKeys.forEach(k => check(r[k], 'history['+i+'].'+k, ['cash_capex','depreciation_amortization','dividends'].includes(k) ? 0 : undefined));
      });
    }
    if (d.sources !== undefined && !Array.isArray(d.sources)) errors.push('sources は配列にしてください。');
    if (d.evidence !== undefined && !Array.isArray(d.evidence)) errors.push('evidence は配列にしてください。');
    if (d.warnings !== undefined && (!Array.isArray(d.warnings) || !d.warnings.every(x => typeof x === 'string'))) errors.push('warnings は文字列の配列にしてください。');
    if (d.meta && typeof d.meta.is_demo !== 'boolean') errors.push('meta.is_demo は true / false にしてください。');
    if (Array.isArray(d.sources)) d.sources.forEach((s,i)=>{
      if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push('sources['+i+'] はオブジェクトが必要です。'); return; }
      ['id','title','url'].forEach(k=>{if(s[k]!==undefined && typeof s[k]!=='string')errors.push('sources['+i+'].'+k+' は文字列にしてください。');});
    });
    if (Array.isArray(d.evidence)) d.evidence.forEach((e,i)=>{
      if (!e || typeof e!=='object' || Array.isArray(e)) {errors.push('evidence['+i+'] はオブジェクトが必要です。');return;}
      if(typeof e.path!=='string') errors.push('evidence['+i+'].path は文字列が必要です。');
      if(!['actual','company_forecast','analyst_assumption','demo'].includes(e.kind))errors.push('evidence['+i+'].kind が未対応です。');
      if(e.note!==undefined && typeof e.note!=='string')errors.push('evidence['+i+'].note は文字列にしてください。');
      if(e.source_ids!==undefined && (!Array.isArray(e.source_ids)||!e.source_ids.every(x=>typeof x==='string')))errors.push('evidence['+i+'].source_ids は文字列の配列にしてください。');
    });
    return errors;
  }
  function parse(text) {
    if (text.length > 2 * 1024 * 1024) throw new Error('JSONは2MB以下にしてください。');
    let s = text.replace(/^\uFEFF/, '').trim();
    if (/^```(?:json)?\s*\n/i.test(s) && /\n```\s*$/.test(s)) s = s.replace(/^```(?:json)?\s*\n/i,'').replace(/\n```\s*$/,'');
    let d;
    try { d = JSON.parse(s); } catch (e) { throw new Error('JSONの書式を確認してください。' + e.message); }
    const errors = validate(d);
    if (errors.length) throw new Error(errors.slice(0,8).join('\n'));
    return d;
  }
  function baseMetrics(d) {
    const b = d.base;
    const marketCap = number(d.market.price) && number(d.market.shares_outstanding) ? d.market.price * d.market.shares_outstanding / 1e6 : null;
    const owner = baseKeys.every(k => number(b[k])) ? b.net_income + b.depreciation_amortization + b.other_adjustments - b.maintenance_capex - b.maintenance_working_capital : null;
    const yieldOf = x => number(x) && marketCap > 0 ? x / marketCap : null;
    return { marketCap, owner, per: marketCap > 0 && b.net_income > 0 ? marketCap/b.net_income : null,
      earningsYield: yieldOf(b.net_income), ownerYield: yieldOf(owner),
      netMaintenance: number(b.maintenance_capex) && number(b.depreciation_amortization) ? b.maintenance_capex-b.depreciation_amortization : null,
      toShare: x => number(x) && d.market.shares_outstanding > 0 ? x * 1e6/d.market.shares_outstanding : null,
      per100: x => number(x) && marketCap > 0 ? 100 * x/marketCap : null };
  }
  function historical(d) {
    const rows = d.history.map(r => {
      const equityAverage = number(r.equity_start) && number(r.equity_end) ? (r.equity_start+r.equity_end)/2 : null;
      const fcf = number(r.operating_cf) && number(r.cash_capex) ? r.operating_cf-r.cash_capex : null;
      const fcfe = number(fcf) && number(r.net_borrowing) && number(r.equity_cf_adjustment) ? fcf+r.net_borrowing+r.equity_cf_adjustment : null;
      const roe = number(r.net_income) && equityAverage > 0 ? r.net_income/equityAverage : null;
      return {...r,equityAverage,roe,fcf,fcfe};
    });
    const first = rows[0], last = rows[rows.length-1];
    let incrementalRoe = null;
    if (rows.length >= 2 && [first.equityAverage,last.equityAverage,first.net_income,last.net_income].every(number) && last.equityAverage-first.equityAverage > 0)
      incrementalRoe = (last.net_income-first.net_income)/(last.equityAverage-first.equityAverage);
    const niTotal = sum(rows.map(r=>r.net_income)), fcfTotal = sum(rows.map(r=>r.fcf));
    return {rows,incrementalRoe,niTotal,fcfTotal,conversion: niTotal>0 && number(fcfTotal) ? fcfTotal/niTotal : null,
      avgCapex:avg(rows.map(r=>r.cash_capex)), avgDa:avg(rows.map(r=>r.depreciation_amortization))};
  }
  function forecast(d, override) {
    const a = {...d.assumptions,...(override || {})};
    const bm = baseMetrics(d), errors = validate({...d, assumptions:a});
    baseKeys.forEach(k=>{ if (!number(d.base[k])) errors.push('未入力：base.'+k); });
    assumptionKeys.forEach(k=>{ if (!number(a[k])) errors.push('未入力：assumptions.'+k); });
    if (!(d.market.shares_outstanding>0)) errors.push('自己株式控除後の発行株式数が必要です。');
    if (!(bm.owner>0)) errors.push('この簡易モデルは、正のオーナー利益が続く事業向けです。');
    if (d.checks && d.checks.financial_sector === true) errors.push('銀行・保険などは、この維持CAPEXモデルの対象外です。');
    if (number(a.cost_of_equity) && number(a.terminal_growth_rate) && a.cost_of_equity <= a.terminal_growth_rate) errors.push('株主資本コストは永久成長率より大きくしてください。');
    if (number(a.terminal_growth_rate) && number(a.terminal_cash_return) && a.terminal_growth_rate > a.terminal_cash_return) errors.push('永久成長率が成熟期の投資収益率を超えています（再投資率が100%超）。');
    if (number(a.reinvestment_rate) && (a.reinvestment_rate<0 || a.reinvestment_rate>1)) errors.push('再投資率は0〜100%です。');
    if (number(a.incremental_cash_return) && (a.incremental_cash_return<0 || a.incremental_cash_return>1)) errors.push('追加投資の収益率は0〜100%です。');
    if (number(a.horizon_years) && (!Number.isInteger(a.horizon_years) || a.horizon_years<1 || a.horizon_years>30)) errors.push('予測年数は1〜30の整数です。');
    if (number(d.base.maintenance_capex) && d.base.maintenance_capex<0) errors.push('維持CAPEXは0以上にしてください。');
    if (number(d.base.depreciation_amortization) && d.base.depreciation_amortization<0) errors.push('減価償却は0以上にしてください。');
    if (number(a.terminal_cash_return) && a.terminal_cash_return<=0) errors.push('成熟期の投資収益率は0より大きくしてください。');
    if (number(a.cost_of_equity) && a.cost_of_equity<=0) errors.push('株主資本コストは0より大きくしてください。');
    if (number(a.terminal_growth_rate) && a.terminal_growth_rate<0) errors.push('永久成長率は0以上です（縮小事業は対象外）。');
    if (errors.length) return {valid:false,errors,rows:[],bm,a};
    let owner = bm.owner, cumulative = 0;
    const rows = [];
    for (let t=1;t<=a.horizon_years;t++) {
      const reinvestment=owner*a.reinvestment_rate;
      const fcfe=owner-reinvestment;
      const nextIncrease=reinvestment*a.incremental_cash_return;
      const discountFactor=1/Math.pow(1+a.cost_of_equity,t);
      const present=fcfe*discountFactor;
      cumulative+=present;
      rows.push({year:t,owner,reinvestment,fcfe,nextIncrease,discountFactor,present,cumulative});
      owner+=nextIncrease;
    }
    // Nth-year growth investment pays off in N+1. Mature allocation starts in N+1.
    // Mature reinvestment is explicitly financed, not added for free.
    const terminalReinvestmentRate=a.terminal_growth_rate/a.terminal_cash_return;
    const terminalOwner=owner;
    const terminalReinvestment=terminalOwner*terminalReinvestmentRate;
    const terminalFcfe=terminalOwner-terminalReinvestment;
    const terminalValue=terminalFcfe/(a.cost_of_equity-a.terminal_growth_rate);
    const terminalPresent=terminalValue/Math.pow(1+a.cost_of_equity,a.horizon_years);
    const total=cumulative+terminalPresent+a.equity_value_adjustment;
    const businessTotal=cumulative+terminalPresent;
    return {valid:true,errors:[],a,bm,rows,growth:a.reinvestment_rate*a.incremental_cash_return,
      forecastPresent:cumulative,terminalReinvestmentRate,terminalOwner,terminalReinvestment,terminalFcfe,
      terminalValue,terminalPresent,businessTotal,total,perShare:bm.toShare(total),
      terminalDependency:businessTotal>0?terminalPresent/businessTotal:null,
      firstDistributionYield:bm.marketCap>0?rows[0].fcfe/bm.marketCap:null};
  }
  function reverse(d) {
    const main=forecast(d);
    if (!main.valid || !(d.market.price>0)) return {status:'unavailable',message:'必要な入力をそろえると計算します。'};
    if (d.assumptions.reinvestment_rate===0) return {status:'flat',message:'再投資率0%では成長率が0%固定のため、投資収益率を逆算できません。'};
    const low=forecast(d,{incremental_cash_return:0});
    const high=forecast(d,{incremental_cash_return:1});
    const target=d.market.price;
    if (Math.abs(high.perShare-low.perShare)<1e-8) return {status:'flat',message:'この前提では投資収益率を変えても価値が変わらず、逆算できません。'};
    if (target<low.perShare-1e-7) return {status:'below',message:'現在株価は、追加投資の収益率0%でのモデル価値も下回ります。成長を負にするケースは対象外です。',low:low.perShare,high:high.perShare};
    if (target>high.perShare+1e-7) return {status:'above',message:'投資収益率0〜100%の探索範囲では現在株価に届きません。基準利益・割引率なども確認してください。',low:low.perShare,high:high.perShare};
    let lo=0,hi=1;
    for(let i=0;i<80;i++) {const m=(lo+hi)/2;const f=forecast(d,{incremental_cash_return:m}); if(f.perShare<target)lo=m;else hi=m;}
    const q=(lo+hi)/2;
    return {status:'ok',cashReturn:q,growth:q*d.assumptions.reinvestment_rate,value:forecast(d,{incremental_cash_return:q}).perShare};
  }
  function warnings(d,f) {
    const w=[...(d.warnings || [])];
    if (d.meta.is_demo) w.unshift('架空データです。実在銘柄の決算・株価ではありません。');
    if (!(d.sources || []).length && !d.meta.is_demo) w.push('出典が登録されていません。実績と仮定を確認してください。');
    if (!(d.evidence || []).length && !d.meta.is_demo) w.push('数値ごとの根拠がありません。表示値は未検証です。');
    const c=d.checks || {};
    if (c.cash_flow_scope!=='confirmed') w.push('純利益とCF項目の帰属・税金・金利の範囲が未確認です。');
    if (!['not_material','adjusted'].includes(c.non_controlling_interests)) w.push('非支配持分が未調整です。連結CFを親会社株主の利益にそのまま足さないでください。');
    if (!['not_material','adjusted'].includes(c.leases)) w.push('リースの減価償却・元本返済・金利分類を確認してください。');
    if (c.capital_structure!=='stable') w.push('将来の純借入ゼロ・株数一定を仮定しています。返済・増資計画との整合を確認してください。');
    if (f && f.valid) {
      if (f.terminalDependency>0.75) w.push('DCFの75%以上が継続価値です。成熟期の仮定への依存が大きくなっています。');
      if (f.a.equity_value_adjustment!==0) w.push('株主価値調整を使用中です。余剰資産の収益を基準利益から除き、負債を二重控除しないでください。');
      if(f.a.incremental_cash_return>0.3)w.push('追加投資の収益率が30%を超えています。再現性と投資機会の上限を確認してください。');
    }
    if(d.base.maintenance_working_capital<0)w.push('維持運転資本が現金回収を表しています。この効果を基準利益に含めて成長させてよいか確認してください。');
    return [...new Set(w)];
  }
  function csv(d,f) {
    if(!f.valid) throw new Error('DCFを計算できていません。');
    const esc=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
    const cell=x=>typeof x==='string'&&/^[=+\-@\t\r]/.test(x)?"'"+x:x;
    const rows=[['Owner Lens','1.0'],['company',d.meta.company_name],['currency',d.meta.currency],['amount_unit','million'],['as_of',d.meta.as_of],['price',d.market.price],['shares_outstanding',d.market.shares_outstanding],['basis','Forecast year 1 equals normalized owner earnings. New investments pay off next year.'],['reinvestment_rate',f.a.reinvestment_rate],['incremental_cash_return_NOT_ROE',f.a.incremental_cash_return],['cost_of_equity',f.a.cost_of_equity],['terminal_growth_rate',f.a.terminal_growth_rate],['terminal_cash_return',f.a.terminal_cash_return],[],['year','owner_before_growth','growth_reinvestment','fcfe','fcfe_per_share','discount_factor','pv_fcfe','pv_fcfe_per_share','cumulative_pv_per_share']];
    f.rows.forEach(r=>rows.push([r.year,r.owner,r.reinvestment,r.fcfe,f.bm.toShare(r.fcfe),r.discountFactor,r.present,f.bm.toShare(r.present),f.bm.toShare(r.cumulative)]));
    rows.push([],['terminal_year',f.a.horizon_years+1],['terminal_owner',f.terminalOwner],['terminal_reinvestment_rate',f.terminalReinvestmentRate],['terminal_fcfe',f.terminalFcfe],['terminal_value_at_year_N',f.terminalValue],['terminal_present_value',f.terminalPresent],['equity_value_adjustment',f.a.equity_value_adjustment],['equity_value',f.total],['value_per_share',f.perShare],['terminal_dependency_excluding_adjustment',f.terminalDependency]);
    return '\uFEFF'+rows.map(row=>row.map(x=>esc(cell(x))).join(',')).join('\r\n');
  }
  const api={number,clone,avg,sum,validate,parse,baseMetrics,historical,forecast,reverse,warnings,csv,baseKeys,historyKeys,assumptionKeys};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  root.OwnerCalc=api;
})(typeof globalThis!=='undefined'?globalThis:this);
