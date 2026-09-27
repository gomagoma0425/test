/* Owner Lens v1.3: three-input view over the unchanged v1 calculation model.
 * Growth is an input; incremental return q=g/b is derived, NOT ROE/ROIC.
 * Original controls remain mounted for validation, import, export and audit.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), C = window.OwnerCalc;
  if (!C || !window.OwnerLensState) return;
  const style = document.createElement('style');
  style.textContent = `
    .simple-panel{margin:18px 0 20px;border-top:3px solid var(--teal)}
    .simple-head{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .simple-head h2{margin:0;font-size:20px}.simple-head p{margin:6px 0 0;color:var(--muted);font-size:12px}
    .simple-inputs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0 14px}
    .simple-input{background:#f4f8f8;border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0}
    .simple-input label{display:block;font-size:13px;font-weight:700}.simple-input p{font-size:11px;line-height:1.6;margin:8px 0 0;color:var(--muted)}
    .simple-value{display:flex;align-items:baseline;gap:5px;margin:8px 0}
    .simple-value input{width:100%;min-width:0;border:0;border-bottom:1px solid #b8cdcd;background:transparent;color:var(--blue);font-size:29px;font-weight:700;border-radius:0;padding:3px 0;box-shadow:none}
    .simple-value span{font-size:15px;color:var(--muted)}
    .simple-input input[type=range]{width:100%;accent-color:var(--teal)}
    .simple-summary{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
    .simple-q{font-size:12px;margin:12px 0 0;line-height:1.7;color:var(--muted)}
    .simple-status{display:block;margin-top:12px;font-size:12px;line-height:1.7}
    .simple-detail{margin:18px 0;background:white;border:1px solid var(--line);border-radius:14px;padding:0 20px}
    .simple-detail>summary{cursor:pointer;list-style:none;padding:18px 0;font-size:14px;font-weight:700;display:flex;gap:12px;justify-content:space-between;align-items:center}
    .simple-detail>summary::-webkit-details-marker{display:none}.simple-detail>summary:after{content:'＋';color:var(--teal);font-size:20px}.simple-detail[open]>summary:after{content:'−'}
    .simple-detail>.card{border:0;box-shadow:none;padding:16px 0;margin-top:0}.simple-detail .section-heading .section-number{display:none}
    .simple-detail>.chart-grid,.simple-detail>.reverse-grid{margin-top:0}.simple-detail .preset-row{display:none}
    .simple-hidden-control{display:none!important}.simple-panel button{min-height:36px}
    #page-analysis .metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
    .simple-main-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
    .simple-main-grid .section-number{display:none}.simple-main-grid .section-heading h2{font-size:17px}
    .simple-caution{font-size:12px;color:#805b25;background:#fff8eb;border-radius:10px;padding:12px 15px;line-height:1.7;margin-top:12px}
    #calculation-errors.simple-info{background:#eef6f5;border-color:#d3e7e3;color:var(--ink)}
    .simple-details-foot{font-size:12px;color:var(--muted);line-height:1.8;padding:0 0 18px;margin:0}
    .simple-main-grid .empty-chart{padding:26px 12px}
    @media(max-width:700px){
      .simple-inputs{grid-template-columns:1fr;gap:9px;margin-top:15px}
      .simple-input{display:grid;grid-template-columns:minmax(0,1fr) 95px;column-gap:12px;padding:12px 14px;align-items:center}
      .simple-input label{font-size:13px}.simple-input .simple-value{margin:0;grid-column:2;grid-row:1/3}
      .simple-input p{grid-column:1;margin:3px 0 0}.simple-input input[type=range]{grid-column:1/-1;margin:9px 0 0}
      .simple-value input{font-size:26px}.simple-head h2{font-size:18px}.simple-main-grid{grid-template-columns:1fr;gap:14px}
      #page-analysis .metrics{grid-template-columns:1fr 1fr;gap:10px}
      #page-analysis .metrics .featured{grid-column:1/-1}
      .simple-detail{padding:0 14px}.simple-panel{padding:18px!important}.simple-summary{font-size:11px}
      .simple-main-grid .notice{font-size:11px}.simple-caution{font-size:11px}
    }
    @media print{.simple-panel{display:none}.simple-detail{break-inside:avoid}}
  `;
  document.head.appendChild(style);
  const num = (v, digits = 1) => C.number(v) ? v.toLocaleString('ja-JP', {maximumFractionDigits:digits}) : '—';
  const perc = v => C.number(v) ? num(v * 100, 2) + '%' : '未設定';
  const state = () => window.OwnerLensState;
  const unit = () => state().data.meta.currency === 'JPY' ? '円' : state().data.meta.currency;
  const intro = document.querySelector('.intro');
  intro.querySelector('h1').textContent = '稼ぐ力から、株の価値へ。';
  intro.querySelector('p').textContent = '3つの前提で、キャッシュの使い道と価値を比べる。';
  document.querySelector('.version').textContent = 'v1.3';
  const oldIntro = $('example-zero').closest('section');
  oldIntro.hidden = true;
  const panel = document.createElement('section');
  panel.className = 'card simple-panel no-print'; panel.id = 'simple-panel';
  panel.setAttribute('aria-label', '3つのシンプルな前提');
  panel.innerHTML = `
    <div class="simple-head"><div><h2>動かすのは、この3つ。</h2><p>成長率・再投資割合・割引率を設定します。</p></div><span class="pill blue" id="simple-mode">シンプル</span></div>
    <div class="simple-inputs">
      <div class="simple-input"><label for="simple-growth">① 利益は毎年、何%増える？</label><div class="simple-value"><input id="simple-growth" type="number" min="0" max="100" step="0.1" inputmode="decimal" placeholder="未設定"><span>%</span></div><p>オーナー利益の年間成長率。</p><input id="simple-growth-range" type="range" min="0" max="20" step="0.1" aria-label="オーナー利益の年間成長率"></div>
      <div class="simple-input"><label for="simple-reinvest">② 成長のために、何%使う？</label><div class="simple-value"><input id="simple-reinvest" type="number" min="0" max="100" step="1" inputmode="decimal" placeholder="未設定"><span>%</span></div><p>維持後のキャッシュを成長に回す割合。</p><input id="simple-reinvest-range" type="range" min="0" max="100" step="1" aria-label="成長に回す割合"></div>
      <div class="simple-input"><label for="simple-return">③ 年何%の利回りを求める？</label><div class="simple-value"><input id="simple-return" type="number" min="0.01" max="100" step="0.1" inputmode="decimal" placeholder="未設定"><span>%</span></div><p>将来のキャッシュを現在価値に換算する割引率。</p><input id="simple-return-range" type="range" min="1" max="20" step="0.1" aria-label="求める年率リターン"></div>
    </div>
    <div class="simple-summary"><div class="button-row"><button id="simple-zero" class="small">成長なしで比較</button><button id="simple-reset" class="small">読込時に戻す</button></div><button id="simple-settings" class="small">期間・維持投資などの詳細</button></div>
    <div id="simple-fixed" class="simple-status"></div>
    <p id="simple-q" class="simple-q"></p>
    <div id="simple-caution" class="simple-caution" hidden></div>`;
  $('data-banner').after(panel);
  const controls = $('base-fields').closest('section');
  function fold(id, title, nodes, anchor) {
    const d = document.createElement('details');d.id = id;d.className = 'simple-detail';
    const s = document.createElement('summary');s.textContent = title;d.append(s);
    anchor.before(d);nodes.forEach(n => d.append(n));return d;
  }
  const settings = fold('simple-advanced', '詳細設定｜維持投資・予測期間など', [controls], controls);
  controls.querySelector('h2').textContent = 'データと、長期の前提';
  controls.querySelector('.section-heading p').textContent = '計算の基準となるデータと長期の前提。';
  const foot = document.createElement('p');foot.className = 'simple-details-foot';
  foot.textContent = '成長率は1年目の基準額から、各年末の投資で翌年に反映します。10年設定では1〜10年目を明示予測し、10年目の投資効果は11年目に反映。その先は成熟期の成長率に切り替わります。';
  settings.append(foot);
  const metrics = document.querySelector('.metrics');
  const terminalCard = $('metric-terminal').closest('.card');
  const annualGrid = $('annual-chart').closest('.chart-grid');
  const detailCharts = fold('simple-charts', '年ごとのキャッシュとDCFの内訳を見る', [annualGrid, terminalCard], annualGrid);
  const bridgeGrid = $('bridge-chart').closest('.bridge-grid');
  const allocation = $('allocation-total').closest('section');
  const bridge = $('bridge-chart').closest('section');
  const reverseGrid = $('reverse-output').closest('.reverse-grid');
  const reverse = $('reverse-output').closest('section');
  const sensitivity = $('sensitivity').closest('section');
  const mainGrid = document.createElement('div');mainGrid.className = 'simple-main-grid';
  metrics.after(mainGrid);mainGrid.append(allocation, reverse);
  fold('simple-accounting', 'オーナー利益をどう計算したかを見る', [bridge], bridgeGrid);
  bridgeGrid.remove();
  fold('simple-sensitivity', '前提を変えた場合の比較表を見る', [sensitivity], reverseGrid);reverseGrid.remove();
  const history = $('history-table').closest('section');
  fold('simple-history', '過去の決算・ROEを見る', [history], history);
  const forecastTable = $('forecast-table').closest('section');
  fold('simple-year-table', '年次計算・使用した式を見る', [forecastTable], forecastTable);
  const warnings = $('warnings').closest('section');
  fold('simple-warnings', '計算前提・調整状況を見る', [warnings], warnings);
  allocation.querySelector('h2').textContent = '維持後に残るお金を、どう使う？';
  reverse.querySelector('h2').textContent = '今の株価を説明する成長率は？';
  reverse.querySelector('.section-heading p').textContent = '再投資割合と割引率などを固定した逆DCF。';
  $('metric-price').closest('.card').querySelector('.label').textContent = '基準日の株価 / PER';
  const valueLabel = $('metric-value').closest('.card').querySelector('.label');
  const valueText = document.createElement('span');valueText.id = 'simple-value-label';
  valueLabel.childNodes[0].replaceWith(valueText);
  let draft = null, lastData = null, lastBQ = '', ownUpdate = false;
  function inputValue(id) { const e = $(id);return e.value.trim() === '' ? null : e.valueAsNumber; }
  function send(key, val) {
    const el = $('param-' + key);el.value = C.number(val) ? String(val) : '';
    el.dispatchEvent(new Event('input', {bubbles:true}));
  }
  function edit() {
    const g = inputValue('simple-growth'), b = inputValue('simple-reinvest'), r = inputValue('simple-return');
    draft = {g,b,r};ownUpdate = true;
    const q = C.number(g) && C.number(b) ? (b > 0 ? g / b : b === 0 && g === 0 ? 0 : null) : null;
    send('reinvestment_rate', b);send('incremental_cash_return', C.number(q) ? q * 100 : null);send('cost_of_equity', r);
    state().data.assumptions.notes = 'シンプル画面のユーザー仮定：年成長率 '+num(g,4)+'%、成長に回す割合 '+num(b,4)+'%、要求リターン '+num(r,4)+'%。投資採算はユーザー入力の成長率÷再投資割合で逆算。期間・成熟期・資産調整等は詳細設定を使用。';
    const evidence = (state().data.evidence || []).find(e => e.path === 'assumptions.incremental_cash_return');
    if (evidence) { evidence.source_ids = [];evidence.note = '[手動変更] シンプル画面の成長率 '+num(g,4)+'% ÷ 再投資率 '+num(b,4)+'% から計算。ユーザー入力に基づく成長投資の採算。'; }
  }
  ['growth','reinvest','return'].forEach(k => {
    $('simple-'+k).addEventListener('input',edit);
    $('simple-'+k+'-range').addEventListener('input', e => { $('simple-'+k).value = e.target.value;edit(); });
  });
  $('simple-zero').addEventListener('click', () => {draft = null;ownUpdate = false;$('example-zero').click();});
  $('simple-reset').addEventListener('click', () => {draft = null;ownUpdate = false;$('preset-base').click();});
  $('simple-settings').addEventListener('click', () => {settings.open = true;settings.scrollIntoView({behavior:'smooth',block:'start'});});

  // Keep the shared detailed view's explanations concise after each render.
  // Match known UI copy only; never change source data or calculation results.
  const uiCopy = [
    ['成長への再投資後に株主へ分配できる現金を、株主資本コストで現在価値に割り引いた値です。入力した仮定に依存し、将来株価の予言ではありません。', '成長投資後の分配可能キャッシュから計算した1株価値。'],
    ['正規化オーナー利益÷時価総額。まだ成長投資は引いていません。実際の配当利回り・投資リターンではなく、インフレ調整後の「実質利回り」でもありません。', '成長投資前のオーナー利益 ÷ 時価総額（名目ベース）。'],
    ['強弱の例示であり、発生確率ではありません。', '比較用シナリオ'],
    ['平均化ボタンは純利益と減価償却だけを変更します。維持投資・運転資本の前提は別途確認してください。減価償却＝維持投資は確定的な関係ではありません。', '平均化の対象：純利益・減価償却。維持投資と運転資本は個別に設定。'],
    ['「追加投資の収益率」はROE・ROICではありません。成長に使った1円が、翌年以降の維持後キャッシュを毎年何円増やすか、というこのモデルの仮定です。', '追加投資の収益率：成長に使う1円が増やす、翌年以降の年間キャッシュ。'],
    ['市場が実際にこの成長を予想しているという意味ではありません。割引率、維持投資、成熟期の前提を変えると答えも変わります。', '設定した前提に基づく必要成長率。'],
    ['各セルは1株価値。枠線は現在設定。濃淡は計算値の大小であり、売買シグナルではありません。', '各セル：1株価値 ／ 枠線：現在設定 ／ 濃淡：計算値の大小'],
    ['観測増分ROE＝純利益の変化÷平均自己資本の変化。自社株買い、増資、為替、買収、景気などの影響を含みます。新規投資だけの採算ではなく、将来モデルの投資収益率には自動転用しません。', '観測増分ROE＝純利益の変化÷平均自己資本の変化。資本政策・為替・買収・景気などの影響を含む参考指標。'],
    ['このアプリの単純化したキャッシュ再投資モデルは、これらの資料そのものの再現ではありません。', 'このアプリではキャッシュ再投資を簡易モデルで計算します。'],
    ['成長CAPEX・成長運転資本など、成長に必要な投資の合計÷維持後キャッシュ。利益の配当性向の裏返しではありません。', '成長CAPEX・成長運転資本などの投資合計 ÷ 維持後キャッシュ。'],
    ['株主向けの分配可能キャッシュを割り引く要求リターン。WACCではありません。名目のキャッシュには名目の割引率を対応させます。', '株主向けキャッシュに適用する名目の要求リターン。'],
    ['数値を使う前の、確認事項', '計算前提と調整状況'],
    ['このモデルが扱わないリスクも、隠さず表示します。', '採用した仮定と、追加調整が必要な項目。'],
    ['PDFを直接取り込むのではなく、プロンプトで整理したJSONを読み込みます。', '調査プロンプトで整理したJSONを読み込みます。'],
    ['AIが出した適正株価を表示するだけではありません。JSON内の元データと仮定を使い、ブラウザ側で独立に再計算します。出典の真偽や維持CAPEXの妥当性は人による確認が必要です。', 'JSON内の元データと仮定から、ブラウザで再計算します。数値の根拠は「データ・出典」で確認できます。']
  ];
  function refreshCopy() {
    ['page-analysis', 'page-data'].forEach(id => {
      const root = $(id);if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('script,style,textarea,pre,svg,#warnings,#evidence-table,#source-list')) continue;
        let value = node.nodeValue;
        uiCopy.forEach(([from,to]) => {if (value.includes(from)) value = value.split(from).join(to);});
        if (value !== node.nodeValue) node.nodeValue = value;
      }
    });
  }
  function sync() {
    const {data:d, forecast:f} = state(), a = d.assumptions, bm = C.baseMetrics(d);
    const bq = JSON.stringify([a.reinvestment_rate,a.incremental_cash_return]);
    if (d !== lastData || (!ownUpdate && bq !== lastBQ)) draft = null;
    if (!draft) draft = {g:C.number(a.reinvestment_rate) && C.number(a.incremental_cash_return) ? a.reinvestment_rate * a.incremental_cash_return * 100 : null,b:C.number(a.reinvestment_rate) ? a.reinvestment_rate * 100 : null,r:C.number(a.cost_of_equity) ? a.cost_of_equity * 100 : null};
    if (!ownUpdate) draft.r = C.number(a.cost_of_equity) ? a.cost_of_equity * 100 : null;
    lastData = d;lastBQ = bq;ownUpdate = false;
    const {g,b,r} = draft;
    [['growth',g],['reinvest',b],['return',r]].forEach(([k,v]) => {
      if (document.activeElement !== $('simple-'+k)) $('simple-'+k).value = C.number(v) ? String(Math.round(v*1e6)/1e6) : '';
      const range = $('simple-'+k+'-range');range.disabled = false;
      range.max = k === 'reinvest' ? '100' : String(Math.max(20,C.number(v)?v:0));range.value = C.number(v) ? String(v) : range.min;
    });
    ['reinvestment_rate','incremental_cash_return','cost_of_equity'].forEach(k => $('param-'+k).closest('.slider-row').classList.add('simple-hidden-control'));
    $('data-banner').innerHTML = '';
    const bannerText = document.createElement('span');bannerText.textContent = (d.meta.is_demo ? 'サンプルデータ' : '基準日の株価・決算データを使用')+' ｜ 端末内で計算 ｜ JSONで保存';$('data-banner').append(bannerText);
    const capex = d.meta.currency === 'JPY' ? num(d.base.maintenance_capex/100,1)+'億円' : num(d.base.maintenance_capex,1)+'百万'+d.meta.currency;
    $('simple-fixed').textContent = 'シナリオ用の前提：明示予測 '+num(a.horizon_years,0)+'年 ｜ 成熟期の成長率 '+perc(a.terminal_growth_rate)+' ｜ 維持投資 '+capex+'（入力・推定値）';
    const ch = d.checks || {}, issues = [];
    if (!['adjusted','not_material'].includes(ch.non_controlling_interests)) issues.push('非支配持分');
    if (!['adjusted','not_material'].includes(ch.leases)) issues.push('リース');
    if (ch.cash_flow_scope !== 'confirmed') issues.push('利益とCFの帰属');
    $('simple-caution').hidden = !issues.length;
    $('simple-caution').textContent = issues.join('・')+'：調整待ち。内訳は「計算前提・調整状況」へ。';
    let inputError = '';
    if (C.number(g) && (g < 0 || g > 100)) inputError = '成長率は0〜100%で入力してください。縮小事業はこの簡易モデルの対象外です。';
    else if (C.number(b) && (b < 0 || b > 100)) inputError = '成長に回す割合は0〜100%で入力してください。';
    else if (g > 0 && b === 0) inputError = '成長率を0%にするか、成長に回す割合を0%より大きく設定してください。';
    else if (b > 0 && g / b > 1) inputError = 'この組合せは追加投資の収益率が年100%超になり、モデルの範囲外です。成長率を下げるか、再投資割合を見直してください。';
    const missingGrowth = !C.number(g) || !C.number(b);
    const actualErrors = (f.errors || []).filter(e => !['未入力：assumptions.reinvestment_rate','未入力：assumptions.incremental_cash_return'].includes(e));
    const errorBox = $('calculation-errors');errorBox.classList.remove('simple-info');
    if (inputError || actualErrors.length) {errorBox.hidden = false;errorBox.textContent = inputError || actualErrors.join('\n');}
    else if (missingGrowth) {errorBox.hidden = false;errorBox.classList.add('simple-info');errorBox.textContent = '「成長なしで比較」を選ぶか、①成長率と②成長に回す割合を入力してください。';}
    else errorBox.hidden = f.valid;
    const blank = g === null && b === null;
    const benchmark = blank && !inputError && !actualErrors.length ? C.forecast(d,{reinvestment_rate:0,incremental_cash_return:0,terminal_growth_rate:0}) : null;
    valueText.textContent = benchmark?.valid ? '成長ゼロの参考価値' : 'この前提での1株価値';
    if (benchmark?.valid) {
      $('metric-value').textContent = num(benchmark.perShare,0)+' '+unit();
      $('metric-gap').textContent = '成長0%・再投資0%・割引率 '+perc(a.cost_of_equity)+'。';
    }
    $('simple-mode').textContent = f.valid ? (g === 0 && b === 0 && a.terminal_growth_rate === 0 ? '成長なしで比較' : '仮定で比較中') : '成長は未設定';
    if (inputError || actualErrors.length) $('simple-mode').textContent = '前提を確認';
    $('simple-q').textContent = C.number(g) && b > 0 ? '追加投資の収益率は自動計算：'+num(g,2)+'% ÷ '+num(b,2)+'% = '+num(g/b*100,2)+'%／年。' : g === 0 && b === 0 ? '追加の成長投資なし。現状維持の支出はオーナー利益の計算ですでに差し引いています。' : '「追加投資の収益率」は入力不要。①の成長率と②の再投資割合から逆算します。';
    if (C.number(b) && b >= 0 && b <= 100 && bm.owner > 0 && bm.marketCap > 0) {
      $('allocation-grow-value').textContent = num(bm.per100(bm.owner*b/100),2)+' '+unit();
      $('allocation-pay-value').textContent = num(bm.per100(bm.owner*(1-b/100)),2)+' '+unit();
      $('allocation-insight').textContent = '維持後のキャッシュ100のうち、成長に '+num(b,1)+'、分配可能 '+num(100-b,1)+'。分配可能額の使い道：配当・自社株買い・現金保有。';
    } else {$('allocation-insight').textContent = '②を入力すると、成長投資と分配可能額に分かれます。現状維持費はすでに控除済みです。';}
    if (f.valid) {
      const rev = C.reverse(d);
      if (rev.status === 'ok') {
        const box = $('reverse-output'), big = box.querySelector('.sub');
        if (big) big.textContent = 'モデル上必要なオーナー利益の成長率（年率）';
        const right = box.querySelector('.right');if (right) right.textContent = '明示予測 '+num(a.horizon_years,0)+'年のモデル。成長に回す割合 '+num(b,1)+'% を固定。';
      } else if (b === 0) $('reverse-output').textContent = '成長投資0%では成長率も0%です。②を入力すると、今の株価を説明する成長率を逆算できます。';
    } else $('reverse-output').textContent = '①〜③を設定すると、同じ前提で現在株価を説明する成長率を逆算します。';
    refreshCopy();
  }
  // The original app replaces company-name on every render, then publishes state.
  // Observing this single node avoids polling and feedback from this view's DOM.
  new MutationObserver(sync).observe($('company-name'), {childList:true});
  sync();
})();