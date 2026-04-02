// ── Xpense Web App ──────────────────────────────────────────────────
'use strict';

// ── State ─────────────────────────────────────────────────────────────
let currentTab    = 'dashboard';
let summaryPeriod = 'month';
let txnFilter     = 'all';
let txnSearch     = '';
let txnYear       = new Date().getFullYear();
let txnMonth      = new Date().getMonth() + 1;
let txnPayment    = null;
let budgetMonth   = new Date().getMonth() + 1;
let budgetYear    = new Date().getFullYear();
let expandedCards = new Set();
let drillCat      = null;
let charts        = {};

// ── Auth ──────────────────────────────────────────────────────────────
let pinBuffer = '', pinSetup = false, pinConfirm = '';

function initAuth() {
  if (!DB.hasPin()) { pinSetup = true; document.getElementById('pin-label').textContent = 'Create a 6-digit PIN'; }
  document.querySelectorAll('.num-btn[data-num]').forEach(b => b.addEventListener('click', () => appendPin(b.dataset.num)));
  document.getElementById('del-btn').addEventListener('click', () => { pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); });
}

function appendPin(d) {
  if (pinBuffer.length >= 6) return;
  pinBuffer += d;
  updatePinDots();
  if (pinBuffer.length === 6) setTimeout(handlePinComplete, 150);
}

function updatePinDots() {
  document.querySelectorAll('#pin-dots span').forEach((dot, i) => dot.classList.toggle('filled', i < pinBuffer.length));
}

function handlePinComplete() {
  const label = document.getElementById('pin-label');
  if (pinSetup) {
    if (!pinConfirm) { pinConfirm = pinBuffer; pinBuffer = ''; updatePinDots(); label.textContent = 'Confirm your PIN'; }
    else if (pinBuffer === pinConfirm) { DB.setPin(pinBuffer); showApp(); }
    else {
      label.textContent = "PINs don't match. Try again."; label.classList.add('error');
      setTimeout(() => label.classList.remove('error'), 500);
      pinBuffer = ''; pinConfirm = ''; updatePinDots();
    }
  } else {
    if (DB.verifyPin(pinBuffer)) { showApp(); }
    else {
      label.textContent = 'Incorrect PIN. Try again.'; label.classList.add('error');
      setTimeout(() => { label.classList.remove('error'); label.textContent = 'Enter PIN to continue'; }, 1000);
      pinBuffer = ''; updatePinDots();
    }
  }
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  renderTab(currentTab);
}

// ── Navigation ─────────────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => { switchTab(btn.dataset.tab); document.getElementById('sidebar').classList.remove('mobile-open'); });
  });
  document.getElementById('lock-btn').addEventListener('click', lockApp);
  document.getElementById('menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('mobile-open'));
  document.getElementById('add-btn-top').addEventListener('click', openAddTransaction);
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTab(tab);
}

function lockApp() {
  pinBuffer = '';
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  updatePinDots();
}

// ── Tab Router ─────────────────────────────────────────────────────────
function renderTab(tab) {
  const content = document.getElementById('content');
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
  charts = {};
  const map = {
    dashboard:    [renderDashboard,    afterDashboard],
    transactions: [renderTransactions, () => {}],
    loans:        [renderLoans,        () => {}],
    cards:        [renderCards,        () => {}],
    budget:       [renderBudget,       () => {}],
    goals:        [renderGoals,        () => {}],
    summary:      [renderSummary,      afterSummary],
    settings:     [renderSettings,     () => {}],
  };
  const [render, after] = map[tab] || [() => '<p>Tab not found</p>', () => {}];
  content.innerHTML = render();
  after();
}

// ── Dashboard ──────────────────────────────────────────────────────────
function renderDashboard() {
  const txns  = DB.getTransactions();
  const now   = new Date();
  const m = now.getMonth(), y = now.getFullYear();
  const thisMonth = txns.filter(t => { const d=new Date(t.date); return d.getMonth()===m && d.getFullYear()===y; });
  const income  = thisMonth.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const outflow = thisMonth.filter(t=>t.type==='expense'||t.type==='lent'||t.type==='transfer').reduce((s,t)=>s+t.amount,0);
  const net     = income - outflow;
  const pending = txns.filter(t=>t.type==='lent'&&!t.lentSettled).reduce((s,t)=>s+t.amount,0);
  const catTotals = DB.catTotals(thisMonth);
  const recent  = [...txns].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  const cats    = DB.getCategories();

  const pendingTxns = txns.filter(t=>t.type==='lent'&&!t.lentSettled);
  const pendingHTML = pendingTxns.length ? `
    <div class="lent-card mt-24">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-weight:700;color:#B45309">🤝 Pending to Recover</span>
        <span style="font-weight:700;color:#B45309">${DB.fmtINR(pending)}</span>
      </div>
      ${pendingTxns.map(t=>`
      <div class="lent-row">
        <span style="font-weight:600">${t.lentTo||'Unknown'}</span>
        <span style="font-size:12px;color:#92400E">${DB.fmtDate(t.date)}</span>
        <span style="font-weight:700;color:#D97706">${DB.fmtINR(t.amount)}</span>
        <button class="btn btn-sm btn-success" onclick="settleLent('${t.id}')">Settled ✓</button>
      </div>`).join('')}
    </div>` : '';

  const maxCat = catTotals[0]?.total || 1;
  const catBars = catTotals.slice(0,5).map(({cat,total})=>`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <div style="width:32px;height:32px;border-radius:8px;background:${cat.color}22;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${cat.icon}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${cat.name}</div>
        <div style="height:5px;background:var(--bg);border-radius:3px;overflow:hidden">
          <div style="height:100%;background:${cat.color};border-radius:3px;width:${(total/maxCat*100).toFixed(1)}%"></div>
        </div>
      </div>
      <span style="font-size:13px;font-weight:700;color:var(--red);white-space:nowrap">${DB.fmtINR(total)}</span>
    </div>`).join('') || '<p class="text-muted" style="padding:20px 0;text-align:center;font-size:14px">No expenses this month</p>';

  return `
  <div class="page-header">
    <div><div class="page-title">Dashboard</div><div class="page-subtitle">${now.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</div></div>
    <button class="btn btn-primary" onclick="openAddTransaction()">+ Add Transaction</button>
  </div>
  <div class="hero-card">
    <div class="hero-label">Net Balance</div>
    <div class="hero-amount">${DB.fmtFull(net)}</div>
    <div class="hero-row">
      <div class="hero-stat"><div class="hero-stat-label">↓ Income</div><div class="hero-stat-value">${DB.fmtINR(income)}</div></div>
      <div class="hero-stat"><div class="hero-stat-label">↑ Outflow</div><div class="hero-stat-value">${DB.fmtINR(outflow)}</div></div>
      ${pending>0?`<div class="hero-stat"><div class="hero-stat-label">🤝 Pending</div><div class="hero-stat-value">${DB.fmtINR(pending)}</div></div>`:''}
    </div>
  </div>
  ${pendingHTML}
  <div class="chart-grid">
    <div class="card"><div class="card-title">6-Month Trend</div><div class="chart-wrap"><canvas id="trend-chart"></canvas></div></div>
    <div class="card"><div class="card-title">Top Categories</div>${catBars}</div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div class="card-title" style="margin:0">Recent Transactions</div>
      <button class="btn btn-secondary btn-sm" onclick="switchTab('transactions')">See All →</button>
    </div>
    ${recent.length ? recent.map(t=>txnRowHTML(t,cats)).join('') : '<div class="empty-state"><div class="empty-icon">💸</div><p>No transactions yet</p></div>'}
  </div>`;
}

function afterDashboard() {
  const data = DB.monthlyTotals(6);
  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;
  charts.trend = new Chart(ctx, {
    type:'bar',
    data:{ labels:data.map(d=>d.label), datasets:[
      { label:'Income',  data:data.map(d=>d.income),  backgroundColor:'rgba(18,183,106,.8)', borderRadius:5 },
      { label:'Expense', data:data.map(d=>d.expense), backgroundColor:'rgba(240,68,56,.8)',  borderRadius:5 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}, scales:{x:{grid:{display:false}},y:{grid:{color:'#f0f0f0'},ticks:{callback:v=>DB.fmtINR(v)}}} }
  });
}

// ── Transactions ───────────────────────────────────────────────────────
function renderTransactions() {
  const cats = DB.getCategories();
  let txns = DB.getTransactions();

  // Apply filters
  if (txnFilter !== 'all') txns = txns.filter(t => t.type === txnFilter);
  if (txnSearch) {
    const s = txnSearch.toLowerCase();
    txns = txns.filter(t => (t.description||'').toLowerCase().includes(s) || (t.lentTo||'').toLowerCase().includes(s) || (t.transferTo||'').toLowerCase().includes(s));
  }
  if (txnYear) {
    txns = txns.filter(t => new Date(t.date).getFullYear() === txnYear);
  }
  if (txnMonth) {
    // If no year selected, filter by month across all years
    txns = txns.filter(t => new Date(t.date).getMonth()+1 === txnMonth);
  }
  if (txnPayment) txns = txns.filter(t => t.payment === txnPayment);
  txns.sort((a,b)=>b.date.localeCompare(a.date));

  // Net balance = income - expense - lent (unsettled) - transfer
  const income  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const lent    = txns.filter(t=>t.type==='lent'&&!t.lentSettled).reduce((s,t)=>s+t.amount,0);
  const transfer= txns.filter(t=>t.type==='transfer').reduce((s,t)=>s+t.amount,0);
  const net     = income - expense - lent - transfer;

  // Group by date
  const groups = {};
  txns.forEach(t => (groups[t.date]=groups[t.date]||[]).push(t));
  const sortedDates = Object.keys(groups).sort((a,b)=>b.localeCompare(a));

  const years = [...new Set(DB.getTransactions().map(t=>new Date(t.date).getFullYear()))].sort((a,b)=>b-a);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const payments = ['cash','debit-card','credit-card','upi','net-banking','cheque','wallet'];

  return `
  <div class="page-header">
    <div><div class="page-title">Transactions</div><div class="page-subtitle">${txns.length} transactions</div></div>
    <button class="btn btn-primary" onclick="openAddTransaction()">+ Add</button>
  </div>

  <!-- Search + filters row -->
  <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <input class="search-input" id="txn-search" placeholder="Search…" value="${txnSearch}" oninput="txnSearch=this.value;renderTab('transactions')" />
    <select class="form-select" style="width:auto;min-width:110px" onchange="txnYear=this.value?+this.value:null;txnMonth=null;renderTab('transactions')">
      <option value="">All Years</option>
      ${years.map(y=>`<option value="${y}" ${txnYear===y?'selected':''}>${y}</option>`).join('')}
    </select>
    <select class="form-select" style="width:auto;min-width:110px" onchange="txnMonth=this.value?+this.value:null;renderTab('transactions')">
      <option value="">All Months</option>
      ${months.map((m,i)=>`<option value="${i+1}" ${txnMonth===i+1?'selected':''}>${m}</option>`).join('')}
    </select>
    <select class="form-select" style="width:auto;min-width:130px" onchange="txnPayment=this.value||null;renderTab('transactions')">
      <option value="">All Payments</option>
      ${payments.map(p=>`<option value="${p}" ${txnPayment===p?'selected':''}>${p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join('')}
    </select>
    <button class="btn btn-secondary btn-sm" onclick="txnYear=null;txnMonth=null;txnPayment=null;txnSearch='';txnFilter='all';renderTab('transactions')">Reset</button>
  </div>

  <!-- Type filter chips -->
  <div class="filter-bar">
    ${['all','expense','income','transfer','lent'].map(f=>`
    <button class="filter-chip ${txnFilter===f?'active':''}" onclick="txnFilter='${f}';renderTab('transactions')">${f==='all'?'All Types':f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}
  </div>

  <!-- Summary badges — net includes transfer & lent -->
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <div class="badge badge-green" style="padding:6px 12px">↓ ${DB.fmtINR(income)}</div>
    <div class="badge badge-red"   style="padding:6px 12px">↑ ${DB.fmtINR(expense+lent+transfer)}</div>
    <div class="badge badge-blue"  style="padding:6px 12px">Net ${DB.fmtINR(net)}</div>
    ${lent>0?`<div class="badge badge-orange" style="padding:6px 12px">🤝 ${DB.fmtINR(lent)}</div>`:''}
  </div>

  ${sortedDates.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>No transactions found</p></div>`
    : sortedDates.map(date=>`
      <div class="section-date">${formatDateHeader(date)}</div>
      <div class="txn-list">${groups[date].map(t=>txnRowHTML(t,cats,true)).join('')}</div>`).join('')}`;
}

function txnRowHTML(t, cats, showActions=false) {
  const cat = cats.find(c=>c.id===t.categoryId);
  const isIncome = t.type==='income';
  const isLent   = t.type==='lent';
  const amtColor = isIncome?'var(--green)':isLent?'var(--orange)':'var(--red)';
  const amtPrefix= isIncome?'+':'−';
  const subtitle = [
    DB.fmtDate(t.date),
    t.payment?t.payment.replace(/-/g,' '):'',
    t.lentTo?`→ ${t.lentTo}`:'',
    t.transferTo?`→ ${t.transferTo}`:'',
    isLent?(t.lentSettled?'✓ Settled':'⏳ Pending'):'',
  ].filter(Boolean).join(' · ');
  return `
  <div class="txn-row" id="txn-${t.id}">
    <div class="txn-icon" style="background:${cat?.color||'#8E8E93'}22">${cat?.icon||'💳'}</div>
    <div class="txn-info">
      <div class="txn-name">${t.description||cat?.name||'Transaction'}</div>
      <div class="txn-meta">${subtitle}</div>
    </div>
    <div class="txn-amount" style="color:${amtColor}">${amtPrefix}${DB.fmtINR(t.amount)}</div>
    ${showActions?`<div class="txn-actions">
      <button class="icon-btn icon-btn-edit" onclick="openEditTransaction('${t.id}')" title="Edit">✏️</button>
      <button class="icon-btn icon-btn-del"  onclick="deleteTransaction('${t.id}')"    title="Delete">🗑️</button>
    </div>`:''}
  </div>`;
}

function formatDateHeader(iso) {
  const d = new Date(iso+'T12:00:00');
  const today = new Date(); today.setHours(12,0,0,0);
  const yest  = new Date(today); yest.setDate(yest.getDate()-1);
  if (d.toDateString()===today.toDateString()) return 'Today';
  if (d.toDateString()===yest.toDateString())  return 'Yesterday';
  return d.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'short'});
}

// ── Loans ──────────────────────────────────────────────────────────────
function renderLoans() {
  const loans = DB.getLoans();
  const totalEMI = loans.reduce((s,l)=>s+DB.calcEMI(l.principal,l.rate,l.months),0);
  return `
  <div class="page-header">
    <div><div class="page-title">Loan EMIs</div></div>
    <button class="btn btn-primary" onclick="openAddLoan()">+ Add Loan</button>
  </div>
  ${loans.length?`<div class="kpi-grid" style="margin-bottom:24px">
    <div class="kpi-card"><div class="kpi-icon" style="background:#EEF2FF">🏦</div><div class="kpi-label">Total Principal</div><div class="kpi-value">${DB.fmtINR(loans.reduce((s,l)=>s+l.principal,0))}</div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:#FEE4E2">📅</div><div class="kpi-label">Monthly EMI</div><div class="kpi-value text-red">${DB.fmtINR(totalEMI)}</div></div>
  </div>`:''}
  ${loans.length===0?`<div class="empty-state"><div class="empty-icon">🏦</div><p>No active loans.</p></div>`:loans.map(loanCardHTML).join('')}`;
}

function loanCardHTML(l) {
  const emi = DB.calcEMI(l.principal,l.rate,l.months);
  const totalInt = emi*l.months - l.principal;
  const paid = l.paidEMIs||[];
  const pct  = Math.min((paid.length/l.months)*100,100);
  const schedule = DB.amortSchedule(l.principal,l.rate,l.months,l.startDate);
  const nextEMI  = schedule.find(s=>!paid.includes(s.n));
  const paidInt  = paid.reduce((s,n)=>{const e=schedule.find(x=>x.n===n);return s+(e?.interest||0);},0);
  const remaining= nextEMI?(schedule.find(s=>s.n===paid.length)||{balance:l.principal}).balance:0;
  return `
  <div class="card loan-card" id="loan-${l.id}">
    <div class="loan-header">
      <div><div class="loan-title">${l.name}</div><div style="font-size:13px;color:var(--text3);margin-top:3px">🏦 ${l.lender} · ${l.rate}% p.a.</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="loan-type-badge">${l.type}</span>
        <button class="icon-btn icon-btn-del" onclick="deleteLoan('${l.id}')">🗑️</button>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:4px"><span>Repaid ${pct.toFixed(1)}%</span><span>${paid.length}/${l.months} EMIs</span></div>
    <div class="loan-progress"><div class="loan-fill" style="width:${pct}%"></div></div>
    <div class="loan-stats">
      <div class="loan-stat"><div class="loan-stat-label">EMI</div><div class="loan-stat-value text-blue">${DB.fmtINR(emi)}</div></div>
      <div class="loan-stat"><div class="loan-stat-label">Remaining</div><div class="loan-stat-value text-red">${DB.fmtINR(remaining)}</div></div>
      <div class="loan-stat"><div class="loan-stat-label">Int. Paid</div><div class="loan-stat-value">${DB.fmtINR(paidInt)}</div></div>
      <div class="loan-stat"><div class="loan-stat-label">Total Int.</div><div class="loan-stat-value text-orange">${DB.fmtINR(totalInt)}</div></div>
    </div>
    ${nextEMI?`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding:10px 14px;background:var(--blue-light);border-radius:8px">
      <div><div style="font-size:12px;color:var(--blue);font-weight:600">Next EMI #${nextEMI.n}</div><div style="font-size:13px;color:var(--text2)">${DB.fmtDate(nextEMI.date)} · ${DB.fmtINR(emi)}</div></div>
      <button class="btn btn-primary btn-sm" onclick="markEMIPaid('${l.id}',${nextEMI.n})">Mark Paid ✓</button>
    </div>`:`<div style="margin-top:12px;padding:10px;background:var(--green-light);border-radius:8px;text-align:center;color:var(--green);font-weight:600">✓ Loan Fully Repaid!</div>`}
    <button class="btn btn-secondary btn-sm mt-16" style="width:100%" onclick="toggleAmort('${l.id}')">📋 View Amortization Schedule</button>
    <div id="amort-${l.id}" style="display:none;margin-top:12px">
      <div class="amort-scroll">
        <table class="amort-table">
          <thead><tr><th>#</th><th>Date</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>
          <tbody>${schedule.map(s=>`<tr class="${paid.includes(s.n)?'paid':''}"><td>${s.n}</td><td>${DB.fmtDate(s.date)}</td><td>${DB.fmtINR(s.emi)}</td><td>${DB.fmtINR(s.principal)}</td><td>${DB.fmtINR(s.interest)}</td><td>${DB.fmtINR(s.balance)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// ── Cards — FIXED: unified card element, no separate floating panels ───
function renderCards() {
  const cards = DB.getCards();
  return `
  <div class="page-header">
    <div><div class="page-title">Credit Cards</div></div>
    <button class="btn btn-primary" onclick="openAddCard()">+ Add Card</button>
  </div>
  ${cards.length===0?`<div class="empty-state"><div class="empty-icon">💳</div><p>No credit cards added yet.</p></div>`:
    cards.map(c=>creditCardHTML(c)).join('')}`;
}

function creditCardHTML(c) {
  const util = Math.min((c.balance/c.limit)*100, 100);
  const utilColor = util<30?'var(--green)':util<70?'var(--orange)':'var(--red)';
  const isOpen = expandedCards.has(c.id);
  const overdue = new Date(c.dueDate)<new Date() && c.balance>0;

  // Card visual header (always visible)
  const header = `
  <div class="card-visual-header" onclick="toggleCard('${c.id}')" style="background:linear-gradient(135deg,${c.color},${c.color}bb);padding:22px;color:white;cursor:pointer;position:relative;overflow:hidden">
    <div style="position:absolute;top:-30px;right:-30px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.08)"></div>
    <div style="position:absolute;bottom:-40px;right:40px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.05)"></div>
    <div style="position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-size:14px;font-weight:600;opacity:.9">${c.bank}</div>
          <div style="font-family:'DM Mono',monospace;font-size:15px;margin-top:10px;letter-spacing:2px">•••• •••• •••• ${c.last4}</div>
          <div style="font-size:13px;opacity:.75;margin-top:4px">${c.name}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          ${overdue?'<span style="background:rgba(255,200,0,.3);padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">⚠ OVERDUE</span>':''}
          <div style="text-align:right">
            <div style="font-size:11px;opacity:.7">Due Balance</div>
            <div style="font-size:18px;font-weight:700">${DB.fmtINR(c.balance)}</div>
          </div>
          <div style="font-size:16px;opacity:.7">${isOpen?'▲':'▼'}</div>
        </div>
      </div>
      <!-- Compact stats always visible -->
      <div style="display:flex;gap:16px;font-size:12px">
        <div><span style="opacity:.7">Limit </span><strong>${DB.fmtINR(c.limit)}</strong></div>
        <div><span style="opacity:.7">Available </span><strong>${DB.fmtINR(c.limit-c.balance)}</strong></div>
        <div><span style="opacity:.7">Due </span><strong>${DB.fmtDate(c.dueDate)}</strong></div>
      </div>
      <!-- Mini utilisation bar always visible -->
      <div style="margin-top:10px;height:4px;background:rgba(255,255,255,.25);border-radius:2px;overflow:hidden">
        <div style="height:100%;background:white;width:${util.toFixed(1)}%;border-radius:2px;opacity:.9"></div>
      </div>
    </div>
  </div>`;

  // Expanded detail panel — inside the same wrapper div, seamless connection
  const detail = isOpen ? `
  <div style="background:var(--surface);padding:16px;border-top:1px solid var(--border)">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
      <div><div class="card-stat-label">Balance</div><div class="card-stat-value text-red">${DB.fmtFull(c.balance)}</div></div>
      <div><div class="card-stat-label">Credit Limit</div><div class="card-stat-value">${DB.fmtFull(c.limit)}</div></div>
      <div><div class="card-stat-label">Available</div><div class="card-stat-value text-green">${DB.fmtFull(c.limit-c.balance)}</div></div>
    </div>
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:5px">
        <span>Utilization</span><span style="color:${utilColor};font-weight:700">${util.toFixed(1)}%</span>
      </div>
      <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden">
        <div style="height:100%;background:${utilColor};width:${util.toFixed(1)}%;border-radius:4px;transition:width .3s"></div>
      </div>
    </div>
    <div style="display:flex;gap:16px;font-size:13px;color:var(--text2);padding:10px 0;border-bottom:1px solid var(--border)">
      <span>📅 Due ${DB.fmtDate(c.dueDate)}</span>
      <span>· Min ₹${(c.minPayment||0).toLocaleString('en-IN')}</span>
      <span>· ${c.rate||36}% p.a.</span>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn btn-primary" style="flex:1" onclick="openSettleCard('${c.id}')">💳 Pay Now</button>
      <button class="btn btn-secondary" onclick="openEditCard('${c.id}')">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteCard('${c.id}')">🗑️</button>
    </div>
  </div>` : '';

  return `<div style="margin-bottom:16px;border-radius:14px;overflow:hidden;border:1px solid var(--border);box-shadow:0 1px 4px rgba(15,22,41,.06),0 4px 16px rgba(15,22,41,.08)">${header}${detail}</div>`;
}

// ── Budget (standalone tab) ────────────────────────────────────────────
function renderBudget() {
  const budgets = DB.getBudgets().filter(b=>b.month===budgetMonth&&b.year===budgetYear);
  const cats    = DB.getCategories();
  const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const totalBudget = budgets.reduce((s,b)=>s+b.limit,0);
  const totalSpent  = budgets.reduce((s,b)=>s+DB.spentInCategory(b.categoryId,b.month,b.year),0);
  return `
  <div class="page-header">
    <div><div class="page-title">Budget</div></div>
    <button class="btn btn-primary" onclick="openAddBudget()">+ Add Budget</button>
  </div>
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
    <button onclick="changeBudgetMonth(-1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:16px">‹</button>
    <span style="font-weight:600;font-size:15px">${months[budgetMonth-1]} ${budgetYear}</span>
    <button onclick="changeBudgetMonth(1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:16px">›</button>
    <button class="btn btn-secondary btn-sm" onclick="openReplicateBudget()">📋 Replicate</button>
  </div>
  ${budgets.length?`
  <div class="card" style="margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;margin-bottom:14px">
      <div><div style="font-size:13px;color:var(--text3)">Total Budget</div><div style="font-size:22px;font-weight:700">${DB.fmtFull(totalBudget)}</div></div>
      <div style="text-align:right"><div style="font-size:13px;color:var(--text3)">Remaining</div><div style="font-size:22px;font-weight:700;color:${totalSpent>totalBudget?'var(--red)':'var(--green)'}">${DB.fmtFull(totalBudget-totalSpent)}</div></div>
    </div>
    <div class="util-bar" style="height:10px"><div class="util-fill" style="width:${Math.min(totalSpent/totalBudget*100,100).toFixed(1)}%;background:${totalSpent>totalBudget?'var(--red)':'var(--blue)'}"></div></div>
    <div style="font-size:12px;color:var(--text3);margin-top:6px">Spent ${DB.fmtINR(totalSpent)} of ${DB.fmtINR(totalBudget)}</div>
  </div>
  ${budgets.map(b=>budgetRowHTML(b,cats)).join('')}`:
  `<div class="empty-state"><div class="empty-icon">📊</div><p>No budgets for this month.<br>Add one or replicate from a previous month.</p></div>`}`;
}

function budgetRowHTML(b, cats) {
  const cat  = cats.find(c=>c.id===b.categoryId);
  const spent= DB.spentInCategory(b.categoryId,b.month,b.year);
  const pct  = b.limit>0?Math.min((spent/b.limit)*100,100):0;
  const over = spent>b.limit;
  const bar  = pct>90?'var(--red)':pct>70?'var(--orange)':'var(--green)';
  return `
  <div class="budget-row">
    <div class="txn-icon" style="background:${cat?.color||'#888'}22;flex-shrink:0">${cat?.icon||'💰'}</div>
    <div class="budget-cat">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="budget-cat-name">${cat?.name||'Unknown'}</span>
        ${over?`<span class="over-badge">OVER</span>`:''}
      </div>
      <div class="budget-bar-wrap"><div class="budget-bar" style="width:${pct}%;background:${bar}"></div></div>
      <div class="budget-amounts">${DB.fmtINR(spent)} of ${DB.fmtINR(b.limit)}</div>
    </div>
    <div class="budget-pct" style="color:${bar}">${pct.toFixed(0)}%</div>
    <div style="display:flex;gap:6px">
      <button class="icon-btn icon-btn-edit" onclick="openEditBudget('${b.id}')">✏️</button>
      <button class="icon-btn icon-btn-del"  onclick="deleteBudget('${b.id}')">🗑️</button>
    </div>
  </div>`;
}

// ── Goals (standalone tab) ─────────────────────────────────────────────
function renderGoals() {
  const goals = DB.getGoals();
  return `
  <div class="page-header">
    <div><div class="page-title">Savings Goals</div></div>
    <button class="btn btn-primary" onclick="openAddGoal()">+ Add Goal</button>
  </div>
  ${goals.length===0?`<div class="empty-state"><div class="empty-icon">🎯</div><p>No savings goals yet. Set a goal and track your progress.</p></div>`:
    goals.map(goalCardHTML).join('')}`;
}

function goalCardHTML(g) {
  const pct = Math.min((g.current/g.target)*100,100);
  return `
  <div class="card goal-card">
    <div class="goal-header">
      <div class="goal-icon" style="background:${g.color}22">${g.icon}</div>
      <div><div class="goal-title">${g.name}</div><div class="goal-target">Target: ${DB.fmtDate(g.targetDate)}</div></div>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="icon-btn icon-btn-edit" onclick="openEditGoal('${g.id}')">✏️</button>
        <button class="icon-btn icon-btn-del"  onclick="deleteGoal('${g.id}')">🗑️</button>
      </div>
    </div>
    <div class="goal-progress-row">
      <div class="goal-progress-bar"><div class="goal-fill" style="width:${pct}%;background:${g.color}"></div></div>
      <div class="goal-pct" style="color:${g.color}">${pct.toFixed(1)}%</div>
    </div>
    <div class="goal-amounts"><span>${DB.fmtINR(g.current)} saved</span><span>${DB.fmtINR(g.target-g.current)} remaining</span></div>
    <button class="btn btn-secondary btn-sm mt-16" style="width:100%" onclick="openAddToGoal('${g.id}')">+ Add Funds</button>
  </div>`;
}

// ── Summary ────────────────────────────────────────────────────────────
function renderSummary() {
  const now = new Date();
  let txns = DB.getTransactions();
  const periodMap = {
    month:  t=>{ const d=new Date(t.date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); },
    '3m':   t=>new Date(t.date)>=new Date(now.getFullYear(),now.getMonth()-3,1),
    '6m':   t=>new Date(t.date)>=new Date(now.getFullYear(),now.getMonth()-6,1),
    year:   t=>new Date(t.date).getFullYear()===now.getFullYear(),
    all:    _=>true,
  };
  txns = txns.filter(periodMap[summaryPeriod]||periodMap.all);
  const income  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const pending = txns.filter(t=>t.type==='lent'&&!t.lentSettled).reduce((s,t)=>s+t.amount,0);
  const net = income-expense;
  const rate= income>0?(net/income*100):0;
  const catData = DB.catTotals(txns);
  const periodLabel = {month:'This Month','3m':'3 Months','6m':'6 Months',year:'This Year',all:'All Time'}[summaryPeriod];

  return `
  <div class="page-header">
    <div><div class="page-title">Summary</div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="period-selector">
        ${[['month','Month'],['3m','3M'],['6m','6M'],['year','Year'],['all','All']].map(([v,l])=>`
        <button class="period-btn ${summaryPeriod===v?'active':''}" onclick="summaryPeriod='${v}';renderTab('summary')">${l}</button>`).join('')}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="DB.exportPDF(null,null,'${periodLabel}')">📄 Export PDF</button>
    </div>
  </div>
  <div class="summary-grid">
    ${kpiHTML('Income',DB.fmtFull(income),'↓','#D1FAE5','var(--green)')}
    ${kpiHTML('Expenses',DB.fmtFull(expense),'↑','#FEE4E2','var(--red)')}
    ${kpiHTML('Net Savings',DB.fmtFull(net),'💰',net>=0?'#D1FAE5':'#FEE4E2',net>=0?'var(--green)':'var(--red)')}
    ${kpiHTML('Savings Rate',rate.toFixed(1)+'%','%','#EEF2FF','var(--blue)')}
    ${pending>0?kpiHTML('Pending Lent',DB.fmtFull(pending),'🤝','#FEF3C7','var(--orange)'):''}
  </div>
  <div class="chart-grid" style="margin-bottom:24px">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="card-title" style="margin:0">Trend</div>
        <div style="display:flex;gap:4px">
          <button class="period-btn active" id="chart-bar-btn" onclick="switchSumChart('bar')" style="padding:4px 10px;font-size:12px">Bar</button>
          <button class="period-btn" id="chart-line-btn" onclick="switchSumChart('line')" style="padding:4px 10px;font-size:12px">Line</button>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="sum-trend"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">By Category</div>
      <div class="chart-wrap" style="height:200px"><canvas id="sum-pie"></canvas></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Category Drill-Down</div>
    ${catData.length===0?'<p class="text-muted" style="font-size:14px;padding:12px 0">No expense data</p>':
      catData.map(({cat,total})=>`
      <div class="cat-drill ${drillCat===cat.id?'open':''}" onclick="toggleDrill('${cat.id}')">
        <div class="cat-drill-header">
          <div class="cat-drill-icon" style="background:${cat.color}22">${cat.icon}</div>
          <div class="cat-drill-name">${cat.name}</div>
          <div class="cat-drill-amount">${DB.fmtINR(total)}</div>
          <span style="color:var(--text3)">${drillCat===cat.id?'▲':'▼'}</span>
        </div>
        <div class="cat-drill-body">
          ${txns.filter(t=>t.categoryId===cat.id&&t.type==='expense').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(t=>`
          <div class="cat-drill-txn"><span>${t.description||'No description'} <span style="font-size:11px;color:var(--text3)">${DB.fmtDate(t.date)}</span></span><span style="font-weight:600;color:var(--red)">${DB.fmtINR(t.amount)}</span></div>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function kpiHTML(label, value, icon, bg, color) {
  return `<div class="kpi-card"><div class="kpi-icon" style="background:${bg};font-size:16px">${icon}</div><div class="kpi-label">${label}</div><div class="kpi-value" style="color:${color};font-size:18px">${value}</div></div>`;
}

function afterSummary() {
  const data = DB.monthlyTotals(6);
  const ctx1 = document.getElementById('sum-trend');
  if (ctx1) {
    charts.sumTrend = new Chart(ctx1, {
      type:'bar',
      data:{ labels:data.map(d=>d.label), datasets:[
        { label:'Income', data:data.map(d=>d.income), backgroundColor:'rgba(18,183,106,.8)', borderRadius:4 },
        { label:'Expense',data:data.map(d=>d.expense),backgroundColor:'rgba(240,68,56,.8)',  borderRadius:4 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>DB.fmtINR(v)}}} }
    });
  }
  const now=new Date(); let txns=DB.getTransactions();
  const pf={month:t=>{const d=new Date(t.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();},'3m':t=>new Date(t.date)>=new Date(now.getFullYear(),now.getMonth()-3,1),'6m':t=>new Date(t.date)>=new Date(now.getFullYear(),now.getMonth()-6,1),year:t=>new Date(t.date).getFullYear()===now.getFullYear(),all:_=>true};
  txns=txns.filter(pf[summaryPeriod]||pf.all);
  const catData=DB.catTotals(txns).slice(0,6);
  const ctx2=document.getElementById('sum-pie');
  if (ctx2&&catData.length) {
    charts.pie=new Chart(ctx2,{ type:'doughnut', data:{ labels:catData.map(x=>x.cat.name), datasets:[{ data:catData.map(x=>x.total), backgroundColor:catData.map(x=>x.cat.color), borderWidth:2, borderColor:'#fff' }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}} } });
  }
}

// ── Settings ───────────────────────────────────────────────────────────
function renderSettings() {
  return `
  <div class="page-header"><div class="page-title">Settings</div></div>
  <div class="settings-section">
    <div class="settings-section-title">Security</div>
    <div class="settings-row">
      <div><div class="settings-row-label">PIN Lock</div><div class="settings-row-sub">${DB.hasPin()?'PIN is set':'No PIN configured'}</div></div>
      <button class="btn btn-secondary btn-sm" onclick="${DB.hasPin()?'changePin()':'setPin()'}">${DB.hasPin()?'Change':'Set PIN'}</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">Data Management</div>
    <div class="settings-row"><div class="settings-row-label">Export Transactions CSV</div><button class="btn btn-secondary btn-sm" onclick="DB.exportCSV()">Export</button></div>
    <div class="settings-row"><div class="settings-row-label">Export Summary PDF</div><button class="btn btn-secondary btn-sm" onclick="DB.exportPDF()">Export</button></div>
    <div class="settings-row"><div class="settings-row-label">Export Full Backup JSON</div><button class="btn btn-secondary btn-sm" onclick="DB.exportJSON()">Export</button></div>
    <div class="settings-row">
      <div><div class="settings-row-label">Import Transactions CSV</div><div class="settings-row-sub">Only imports transactions, not other data</div></div>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-csv').click()">Import</button>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Import Full Backup JSON</div><div class="settings-row-sub">Restores all data</div></div>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-json').click()">Import</button>
    </div>
    <input type="file" id="import-csv"  accept=".csv"  style="display:none" onchange="handleImportCSV(this)" />
    <input type="file" id="import-json" accept=".json" style="display:none" onchange="handleImportJSON(this)" />
  </div>
  <div class="settings-section">
    <div class="settings-section-title">Danger Zone</div>
    <div class="settings-row">
      <div><div class="settings-row-label" style="color:var(--red)">Clear All Data</div><div class="settings-row-sub">Permanently deletes everything</div></div>
      <button class="btn btn-danger btn-sm" onclick="clearAllData()">Clear</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">About</div>
    <div class="settings-row"><div class="settings-row-label">Version</div><span class="text-muted">1.0.0</span></div>
    <div class="settings-row"><div class="settings-row-label">Currency</div><span class="text-muted">INR (₹)</span></div>
  </div>`;
}

// ── Modals ─────────────────────────────────────────────────────────────
function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
function initModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => { if(e.target===document.getElementById('modal-overlay')) closeModal(); });
}

// ── Add/Edit Transaction ───────────────────────────────────────────────
function openAddTransaction(editId=null) {
  const cats  = DB.getCategories();
  const cards = DB.getCards();
  const edit  = editId ? DB.getTransactions().find(t=>t.id===editId) : null;
  const type  = edit?.type||'expense';

  const catsByType = t => cats.filter(c=>c.type===t);
  // Show card selector if: editing with credit-card payment, OR new expense (will show when user picks credit-card)
  const defaultShowCC = edit?.payment === 'credit-card';
  const cardOptions = cards.length ? `
    <div class="form-group" id="cc-select-group" style="${defaultShowCC ? '' : 'display:none'}">
      <label class="form-label">Select Credit Card</label>
      <select class="form-select" id="txn-card">
        ${cards.map((c,i)=>`<option value="${c.id}" ${(edit?.creditCardId===c.id || (!edit?.creditCardId && i===0)) ? 'selected' : ''}>${c.bank} •••• ${c.last4} — Available: ${DB.fmtINR(c.limit-c.balance)}</option>`).join('')}
      </select>
    </div>` : `
    <div class="form-group" id="cc-select-group" style="display:none">
      <p style="color:var(--orange);font-size:13px">⚠ No credit cards added yet. <a href="#" onclick="closeModal();switchTab('cards')">Add a card first.</a></p>
    </div>`;

  const body = `
  <div class="type-tabs">
    ${['expense','income','transfer','lent'].map(t=>`<button class="type-tab ${type===t?`active-${t}`:''}" onclick="switchTxnType('${t}')">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}
  </div>
  <div class="form-group">
    <label class="form-label">Amount (₹)</label>
    <input class="form-input" id="txn-amount" type="number" placeholder="0.00" value="${edit?.amount||''}" step="0.01" />
  </div>
  <div class="form-group">
    <label class="form-label">Description</label>
    <input class="form-input" id="txn-desc" type="text" placeholder="What was this for?" value="${edit?.description||''}" />
  </div>
  <div id="txn-cat-group" class="form-group" style="${type==='transfer'||type==='lent'?'display:none':''}">
    <label class="form-label">Category</label>
    <div class="cat-chips" id="cat-chips">
      ${catsByType(type).map(c=>`<div class="cat-chip ${edit?.categoryId===c.id?'selected':''}" onclick="selectCat('${c.id}',this)"><div class="chip-icon">${c.icon}</div><div class="chip-name">${c.name.split(' ')[0]}</div></div>`).join('')}
    </div>
  </div>
  <div id="txn-lent-group" class="form-group" style="${type!=='lent'?'display:none':''}">
    <label class="form-label">Lent To</label>
    <input class="form-input" id="txn-lent-to" type="text" placeholder="Person's name" value="${edit?.lentTo||''}" />
  </div>
  <div id="txn-transfer-group" class="form-group" style="${type!=='transfer'?'display:none':''}">
    <label class="form-label">Transfer To</label>
    <input class="form-input" id="txn-transfer-to" type="text" placeholder="Account or person" value="${edit?.transferTo||''}" />
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">Date</label>
      <input class="form-input" id="txn-date" type="date" value="${edit?.date||DB.today()}" />
    </div>
    <div class="form-group">
      <label class="form-label">Payment Method</label>
      <select class="form-select" id="txn-payment" onchange="onPaymentChange(this.value)">
        ${['cash','debit-card','credit-card','upi','net-banking','cheque','wallet'].map(p=>`<option value="${p}" ${edit?.payment===p?'selected':''}>${p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join('')}
      </select>
    </div>
  </div>
  ${cardOptions}
  <input type="hidden" id="txn-type" value="${type}" />
  <input type="hidden" id="txn-cat"  value="${edit?.categoryId||''}" />
  <input type="hidden" id="txn-id"   value="${edit?.id||''}" />
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveTxn()">${edit?'Update':'Save'} Transaction</button>
  </div>`;

  openModal(edit?'Edit Transaction':'Add Transaction', body);

  // Auto-select first category
  if (!edit) {
    const first = catsByType(type)[0];
    if (first) {
      document.getElementById('txn-cat').value = first.id;
      document.querySelector('.cat-chip')?.classList.add('selected');
    }
  }

  // If editing with credit-card, show card selector
  if (edit?.payment==='credit-card') {
    const g = document.getElementById('cc-select-group');
    if (g) g.style.display = '';
  }
}

function openEditTransaction(id) { openAddTransaction(id); }

function onPaymentChange(val) {
  const group = document.getElementById('cc-select-group');
  if (group) group.style.display = val === 'credit-card' ? '' : 'none';
}

function switchTxnType(type) {
  document.getElementById('txn-type').value = type;
  document.querySelectorAll('.type-tab').forEach(b => {
    const t = b.textContent.toLowerCase();
    b.className = `type-tab${t===type?' active-'+type:''}`;
  });
  document.getElementById('txn-cat-group').style.display = (type==='transfer'||type==='lent')?'none':'';
  document.getElementById('txn-lent-group').style.display = type==='lent'?'':'none';
  document.getElementById('txn-transfer-group').style.display = type==='transfer'?'':'none';

  // Re-check if current payment is credit-card
  const payment = document.getElementById('txn-payment')?.value;
  const ccGroup = document.getElementById('cc-select-group');
  if (ccGroup) ccGroup.style.display = payment === 'credit-card' ? '' : 'none';

  if (type!=='transfer'&&type!=='lent') {
    const cats = DB.getCategories().filter(c=>c.type===type);
    const chips = document.getElementById('cat-chips');
    chips.innerHTML = cats.map(c=>`<div class="cat-chip" onclick="selectCat('${c.id}',this)"><div class="chip-icon">${c.icon}</div><div class="chip-name">${c.name.split(' ')[0]}</div></div>`).join('');
    if (cats[0]) { document.getElementById('txn-cat').value = cats[0].id; chips.querySelector('.cat-chip')?.classList.add('selected'); }
  }
}

function selectCat(id, el) {
  document.querySelectorAll('.cat-chip').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('txn-cat').value = id;
}

function saveTxn() {
  const amount = parseFloat(document.getElementById('txn-amount').value);
  const type   = document.getElementById('txn-type').value;
  if (!amount||amount<=0) { showToast('Enter a valid amount','error'); return; }
  const cats = DB.getCategories();
  let catId = document.getElementById('txn-cat').value;
  if (type==='transfer') catId = cats.find(c=>c.type==='transfer')?.id||catId;
  if (type==='lent')     catId = cats.find(c=>c.type==='lent')?.id||catId;

  const id = document.getElementById('txn-id').value;
  const payment = document.getElementById('txn-payment').value;
  const creditCardId = payment==='credit-card' ? document.getElementById('txn-card')?.value||null : null;

  const t = {
    id: id||DB.uuid(), type, amount, categoryId:catId,
    description: document.getElementById('txn-desc').value,
    date:    document.getElementById('txn-date').value,
    payment,
    creditCardId,
    lentTo:     document.getElementById('txn-lent-to')?.value||'',
    transferTo: document.getElementById('txn-transfer-to')?.value||'',
    lentSettled: false, createdAt: new Date().toISOString(),
  };

  let txns = DB.getTransactions();
  if (id) { const ex=txns.find(x=>x.id===id); t.lentSettled=ex?.lentSettled||false; txns=txns.map(x=>x.id===id?t:x); }
  else {
    txns.unshift(t);
    // Update card balance if paid by credit card
    if (creditCardId) {
      let cards = DB.getCards();
      cards = cards.map(c=>c.id===creditCardId?{...c,balance:c.balance+amount}:c);
      DB.saveCards(cards);
    }
  }
  DB.saveTransactions(txns);
  closeModal();
  renderTab(currentTab);
  showToast(id?'Transaction updated ✓':'Transaction added ✓','success');
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  DB.saveTransactions(DB.getTransactions().filter(t=>t.id!==id));
  renderTab(currentTab);
  showToast('Deleted','error');
}

function settleLent(id) {
  DB.saveTransactions(DB.getTransactions().map(t=>t.id===id?{...t,lentSettled:true}:t));
  renderTab(currentTab);
  showToast('Marked as settled ✓','success');
}

// ── Loans ──────────────────────────────────────────────────────────────
function openAddLoan() {
  const body = `
  <div class="form-row">
    <div class="form-group"><label class="form-label">Loan Name</label><input class="form-input" id="l-name" placeholder="Home Loan - SBI" /></div>
    <div class="form-group"><label class="form-label">Lender</label><input class="form-input" id="l-lender" placeholder="Bank name" /></div>
  </div>
  <div class="form-group"><label class="form-label">Loan Type</label>
    <select class="form-select" id="l-type">${['Home Loan','Car Loan','Personal Loan','Education Loan','Business Loan','Other'].map(t=>`<option>${t}</option>`).join('')}</select>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Principal (₹)</label><input class="form-input" id="l-principal" type="number" placeholder="500000" /></div>
    <div class="form-group"><label class="form-label">Annual Rate (%)</label><input class="form-input" id="l-rate" type="number" step="0.01" placeholder="8.5" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Tenure (months)</label><input class="form-input" id="l-months" type="number" placeholder="120" /></div>
    <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" id="l-start" type="date" value="${DB.today()}" /></div>
  </div>
  <div id="emi-preview" style="background:var(--blue-light);border-radius:8px;padding:12px;display:none">
    <div style="font-size:13px;color:var(--blue)">Monthly EMI: <strong id="emi-val"></strong> · Total Interest: <strong id="int-val"></strong></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveLoan()">Add Loan</button>
  </div>`;
  openModal('Add Loan', body);
  ['l-principal','l-rate','l-months'].forEach(id=>document.getElementById(id)?.addEventListener('input', previewEMI));
}

function previewEMI() {
  const p=parseFloat(document.getElementById('l-principal').value);
  const r=parseFloat(document.getElementById('l-rate').value);
  const m=parseInt(document.getElementById('l-months').value);
  if (p&&r&&m) {
    const emi=DB.calcEMI(p,r,m);
    document.getElementById('emi-val').textContent=DB.fmtFull(emi)+'/month';
    document.getElementById('int-val').textContent=DB.fmtFull(emi*m-p);
    document.getElementById('emi-preview').style.display='block';
  }
}

function saveLoan() {
  const name=document.getElementById('l-name').value;
  const p=parseFloat(document.getElementById('l-principal').value);
  const r=parseFloat(document.getElementById('l-rate').value);
  const m=parseInt(document.getElementById('l-months').value);
  if (!name||!p||!r||!m) { showToast('Fill all fields','error'); return; }
  const loans=DB.getLoans();
  loans.push({ id:DB.uuid(), name, lender:document.getElementById('l-lender').value, type:document.getElementById('l-type').value, principal:p, rate:r, months:m, startDate:document.getElementById('l-start').value, paidEMIs:[] });
  DB.saveLoans(loans);
  closeModal(); renderTab('loans'); showToast('Loan added ✓','success');
}

function markEMIPaid(loanId, n) {
  const loans=DB.getLoans(); const loan=loans.find(l=>l.id===loanId); if (!loan) return;
  if (!loan.paidEMIs) loan.paidEMIs=[];
  if (!loan.paidEMIs.includes(n)) loan.paidEMIs.push(n);
  DB.saveLoans(loans);
  const emi=DB.calcEMI(loan.principal,loan.rate,loan.months);
  const txns=DB.getTransactions();
  txns.unshift({ id:DB.uuid(), type:'expense', amount:emi, categoryId:DB.getCategories().find(c=>c.name==='Rent')?.id||'c08', description:`EMI - ${loan.name}`, date:DB.today(), payment:'net-banking', lentTo:'', transferTo:'', lentSettled:false, isSystem:true, createdAt:new Date().toISOString() });
  DB.saveTransactions(txns);
  renderTab('loans'); showToast('EMI marked paid ✓','success');
}

function deleteLoan(id) {
  if (!confirm('Delete this loan?')) return;
  DB.saveLoans(DB.getLoans().filter(l=>l.id!==id));
  renderTab('loans'); showToast('Loan deleted','error');
}

function toggleAmort(id) {
  const el=document.getElementById(`amort-${id}`);
  el.style.display=el.style.display==='none'?'block':'none';
}

// ── Cards ──────────────────────────────────────────────────────────────
function openAddCard(editId=null) {
  const edit=editId?DB.getCards().find(c=>c.id===editId):null;
  const colors=['#007AFF','#FF3B30','#34C759','#FF9500','#AF52DE','#FF2D55','#00C7BE','#5856D6'];
  const body=`
  <div class="form-row">
    <div class="form-group"><label class="form-label">Card Name</label><input class="form-input" id="cc-name" placeholder="HDFC Rewards" value="${edit?.name||''}" /></div>
    <div class="form-group"><label class="form-label">Bank</label><input class="form-input" id="cc-bank" placeholder="HDFC Bank" value="${edit?.bank||''}" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Last 4 Digits</label><input class="form-input" id="cc-last4" maxlength="4" placeholder="1234" value="${edit?.last4||''}" /></div>
    <div class="form-group"><label class="form-label">Credit Limit (₹)</label><input class="form-input" id="cc-limit" type="number" placeholder="100000" value="${edit?.limit||''}" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Current Balance (₹)</label><input class="form-input" id="cc-balance" type="number" value="${edit?.balance||0}" /></div>
    <div class="form-group"><label class="form-label">Min Payment (₹)</label><input class="form-input" id="cc-min" type="number" placeholder="500" value="${edit?.minPayment||''}" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Interest Rate (% p.a.)</label><input class="form-input" id="cc-rate" type="number" step="0.1" value="${edit?.rate||36}" /></div>
    <div class="form-group"><label class="form-label">Due Date</label><input class="form-input" id="cc-due" type="date" value="${edit?.dueDate||DB.today()}" /></div>
  </div>
  <div class="form-group"><label class="form-label">Card Color</label>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${colors.map(col=>`<div onclick="selCardColor('${col}',this)" style="width:32px;height:32px;border-radius:50%;background:${col};cursor:pointer;border:3px solid ${(edit?.color||colors[0])===col?'white':'transparent'};box-shadow:${(edit?.color||colors[0])===col?'0 0 0 2px '+col:'none'}"></div>`).join('')}
    </div>
  </div>
  <input type="hidden" id="cc-color" value="${edit?.color||colors[0]}" />
  <input type="hidden" id="cc-id" value="${edit?.id||''}" />
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveCard()">${edit?'Update':'Add'} Card</button>
  </div>`;
  openModal(edit?'Edit Card':'Add Credit Card', body);
}

function openEditCard(id) { openAddCard(id); }

function selCardColor(col, el) {
  document.querySelectorAll('[onclick*="selCardColor"]').forEach(e=>{e.style.borderColor='transparent';e.style.boxShadow='none';});
  el.style.borderColor='white'; el.style.boxShadow=`0 0 0 2px ${col}`;
  document.getElementById('cc-color').value=col;
}

function saveCard() {
  const name=document.getElementById('cc-name').value;
  const limit=parseFloat(document.getElementById('cc-limit').value);
  if (!name||!limit) { showToast('Fill required fields','error'); return; }
  const id=document.getElementById('cc-id').value;
  const card={ id:id||DB.uuid(), name, bank:document.getElementById('cc-bank').value, last4:document.getElementById('cc-last4').value, limit, balance:parseFloat(document.getElementById('cc-balance').value)||0, minPayment:parseFloat(document.getElementById('cc-min').value)||0, rate:parseFloat(document.getElementById('cc-rate').value)||36, dueDate:document.getElementById('cc-due').value, color:document.getElementById('cc-color').value };
  let cards=DB.getCards();
  if (id) cards=cards.map(c=>c.id===id?card:c); else cards.push(card);
  DB.saveCards(cards); closeModal(); renderTab('cards'); showToast(id?'Card updated ✓':'Card added ✓','success');
}

function openSettleCard(id) {
  const card=DB.getCards().find(c=>c.id===id); if (!card) return;
  const body=`
  <div style="text-align:center;margin-bottom:16px">
    <div style="font-size:13px;color:var(--text3)">Outstanding Balance</div>
    <div style="font-size:32px;font-weight:700;color:var(--red)">${DB.fmtFull(card.balance)}</div>
  </div>
  <div class="form-group"><label class="form-label">Payment Amount (₹)</label><input class="form-input" id="settle-amt" type="number" value="${card.balance}" /></div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('settle-amt').value='${card.balance}'">Full Balance</button>
    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('settle-amt').value='${card.minPayment||0}'">Minimum</button>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="settleCard('${id}')">Confirm Payment</button>
  </div>`;
  openModal('Pay '+card.name, body);
}

function settleCard(id) {
  const amt=parseFloat(document.getElementById('settle-amt').value);
  if (!amt||amt<=0) { showToast('Enter valid amount','error'); return; }
  DB.saveCards(DB.getCards().map(c=>c.id===id?{...c,balance:Math.max(c.balance-amt,0)}:c));
  const txns=DB.getTransactions();
  txns.unshift({ id:DB.uuid(), type:'expense', amount:amt, categoryId:DB.getCategories().find(c=>c.name==='Utilities')?.id||'c04', description:'Credit Card Payment', date:DB.today(), payment:'net-banking', lentTo:'', transferTo:'', lentSettled:false, isSystem:true, createdAt:new Date().toISOString() });
  DB.saveTransactions(txns);
  closeModal(); renderTab('cards'); showToast('Payment recorded ✓','success');
}

function deleteCard(id) {
  if (!confirm('Delete this card?')) return;
  DB.saveCards(DB.getCards().filter(c=>c.id!==id));
  renderTab('cards'); showToast('Card deleted','error');
}

function toggleCard(id) {
  if (expandedCards.has(id)) expandedCards.delete(id); else expandedCards.add(id);
  renderTab('cards');
}

// ── Budget ──────────────────────────────────────────────────────────────
function openAddBudget(editId=null) {
  const cats=DB.getCategories().filter(c=>c.type==='expense');
  const edit=editId?DB.getBudgets().find(b=>b.id===editId):null;
  const body=`
  <div class="form-group"><label class="form-label">Category</label>
    <select class="form-select" id="b-cat">${cats.map(c=>`<option value="${c.id}" ${edit?.categoryId===c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}</select>
  </div>
  <div class="form-group"><label class="form-label">Monthly Limit (₹)</label><input class="form-input" id="b-limit" type="number" placeholder="5000" value="${edit?.limit||''}" /></div>
  <input type="hidden" id="b-id" value="${edit?.id||''}" />
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveBudget()">${edit?'Update':'Save'} Budget</button>
  </div>`;
  openModal(edit?'Edit Budget':'Set Budget', body);
}

function openEditBudget(id) { openAddBudget(id); }

function saveBudget() {
  const catId=document.getElementById('b-cat').value;
  const limit=parseFloat(document.getElementById('b-limit').value);
  if (!limit) { showToast('Enter a limit','error'); return; }
  const id=document.getElementById('b-id').value;
  DB.upsertBudget({ id:id||DB.uuid(), categoryId:catId, limit, month:budgetMonth, year:budgetYear });
  closeModal(); renderTab('budget'); showToast('Budget saved ✓','success');
}

function deleteBudget(id) {
  DB.saveBudgets(DB.getBudgets().filter(b=>b.id!==id));
  renderTab('budget'); showToast('Budget deleted','error');
}

function changeBudgetMonth(d) {
  budgetMonth+=d;
  if (budgetMonth>12){budgetMonth=1;budgetYear++;}
  if (budgetMonth<1){budgetMonth=12;budgetYear--;}
  renderTab('budget');
}

function openReplicateBudget() {
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fm=budgetMonth>1?budgetMonth-1:12, fy=budgetMonth>1?budgetYear:budgetYear-1;
  const body=`
  <p style="color:var(--text2);font-size:14px;margin-bottom:16px">Copy budgets to <strong>${months[budgetMonth-1]} ${budgetYear}</strong></p>
  <div class="form-row">
    <div class="form-group"><label class="form-label">From Month</label>
      <select class="form-select" id="rep-m">${months.map((m,i)=>`<option value="${i+1}" ${fm===i+1?'selected':''}>${m}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label class="form-label">From Year</label><input class="form-input" id="rep-y" type="number" value="${fy}" /></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="replicateBudget()">Replicate</button>
  </div>`;
  openModal('Replicate Budgets', body);
}

function replicateBudget() {
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fm=parseInt(document.getElementById('rep-m').value);
  const fy=parseInt(document.getElementById('rep-y').value);
  const src=DB.getBudgets().filter(b=>b.month===fm&&b.year===fy);
  if (!src.length) { showToast('No budgets found for that month','error'); return; }
  const existing=DB.getBudgets().filter(b=>b.month===budgetMonth&&b.year===budgetYear);
  if (existing.length&&!confirm(`${months[budgetMonth-1]} ${budgetYear} already has budgets. Overwrite?`)) return;
  src.forEach(b=>DB.upsertBudget({...b,id:DB.uuid(),month:budgetMonth,year:budgetYear}));
  closeModal(); renderTab('budget'); showToast(`Replicated ${src.length} budgets ✓`,'success');
}

// ── Goals ──────────────────────────────────────────────────────────────
function openAddGoal(editId=null) {
  const edit=editId?DB.getGoals().find(g=>g.id===editId):null;
  const icons=['⭐','🏠','🚗','✈️','🎓','❤️','🎁','💻','📷','🎮','💎','🌴'];
  const colors=['#34C759','#007AFF','#FF9500','#FF3B30','#AF52DE','#00C7BE'];
  const body=`
  <div class="form-group"><label class="form-label">Goal Name</label><input class="form-input" id="g-name" placeholder="New Car" value="${edit?.name||''}" /></div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Target (₹)</label><input class="form-input" id="g-target" type="number" placeholder="100000" value="${edit?.target||''}" /></div>
    <div class="form-group"><label class="form-label">Already Saved (₹)</label><input class="form-input" id="g-current" type="number" placeholder="0" value="${edit?.current||0}" /></div>
  </div>
  <div class="form-group"><label class="form-label">Target Date</label><input class="form-input" id="g-date" type="date" value="${edit?.targetDate||''}" /></div>
  <div class="form-group"><label class="form-label">Icon</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${icons.map(ic=>`<div onclick="selGoalIcon('${ic}',this)" style="width:36px;height:36px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;border:2px solid ${(edit?.icon||'⭐')===ic?'var(--blue)':'transparent'}">${ic}</div>`).join('')}
    </div>
  </div>
  <input type="hidden" id="g-icon" value="${edit?.icon||'⭐'}" />
  <div class="form-group"><label class="form-label">Color</label>
    <div style="display:flex;gap:8px">${colors.map(c=>`<div onclick="selGoalColor('${c}',this)" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${(edit?.color||colors[0])===c?'white':'transparent'};box-shadow:${(edit?.color||colors[0])===c?'0 0 0 2px '+c:'none'}"></div>`).join('')}</div>
  </div>
  <input type="hidden" id="g-color" value="${edit?.color||colors[0]}" />
  <input type="hidden" id="g-id" value="${edit?.id||''}" />
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveGoal()">${edit?'Update':'Save'} Goal</button>
  </div>`;
  openModal(edit?'Edit Goal':'New Goal', body);
}

function openEditGoal(id) { openAddGoal(id); }

function selGoalIcon(ic, el) {
  document.querySelectorAll('[onclick*="selGoalIcon"]').forEach(e=>e.style.borderColor='transparent');
  el.style.borderColor='var(--blue)'; document.getElementById('g-icon').value=ic;
}

function selGoalColor(c, el) {
  document.querySelectorAll('[onclick*="selGoalColor"]').forEach(e=>{e.style.borderColor='transparent';e.style.boxShadow='none';});
  el.style.borderColor='white'; el.style.boxShadow=`0 0 0 2px ${c}`; document.getElementById('g-color').value=c;
}

function saveGoal() {
  const name=document.getElementById('g-name').value;
  const target=parseFloat(document.getElementById('g-target').value);
  if (!name||!target) { showToast('Fill required fields','error'); return; }
  const id=document.getElementById('g-id').value;
  const g={ id:id||DB.uuid(), name, target, current:parseFloat(document.getElementById('g-current').value)||0, targetDate:document.getElementById('g-date').value, icon:document.getElementById('g-icon').value, color:document.getElementById('g-color').value };
  let goals=DB.getGoals();
  if (id) goals=goals.map(x=>x.id===id?g:x); else goals.push(g);
  DB.saveGoals(goals); closeModal(); renderTab('goals'); showToast(id?'Goal updated ✓':'Goal added ✓','success');
}

function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  DB.saveGoals(DB.getGoals().filter(g=>g.id!==id)); renderTab('goals'); showToast('Goal deleted','error');
}

function openAddToGoal(id) {
  const goal=DB.getGoals().find(g=>g.id===id); if (!goal) return;
  const body=`
  <p style="color:var(--text2);margin-bottom:12px">Add funds to <strong>${goal.name}</strong></p>
  <div class="form-group"><label class="form-label">Amount (₹)</label><input class="form-input" id="add-amt" type="number" placeholder="1000" /></div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="addToGoal('${id}')">Add Funds</button>
  </div>`;
  openModal('Add Funds', body);
}

function addToGoal(id) {
  const amt=parseFloat(document.getElementById('add-amt').value);
  if (!amt||amt<=0) { showToast('Enter valid amount','error'); return; }
  let goals=DB.getGoals(); const g=goals.find(x=>x.id===id); if (g) g.current+=amt;
  DB.saveGoals(goals);
  const txns=DB.getTransactions();
  txns.unshift({ id:DB.uuid(), type:'expense', amount:amt, categoryId:DB.getCategories().find(c=>c.name==='Other Income')?.id||'c14', description:`Savings: ${g.name}`, date:DB.today(), payment:'net-banking', lentTo:'', transferTo:'', lentSettled:false, isSystem:true, createdAt:new Date().toISOString() });
  DB.saveTransactions(txns);
  closeModal(); renderTab('goals'); showToast('Funds added ✓','success');
}

// ── Settings Actions ───────────────────────────────────────────────────
function setPin() {
  openModal('Set PIN',`
  <div class="form-group"><label class="form-label">New PIN (min 4 digits)</label><input class="form-input" id="new-pin" type="password" maxlength="6" inputmode="numeric" /></div>
  <div class="form-group"><label class="form-label">Confirm PIN</label><input class="form-input" id="confirm-pin" type="password" maxlength="6" inputmode="numeric" /></div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="savePin()">Set PIN</button></div>`);
}

function changePin() { setPin(); }

function savePin() {
  const p1=document.getElementById('new-pin').value;
  const p2=document.getElementById('confirm-pin').value;
  if (p1.length<4) { showToast('PIN must be at least 4 digits','error'); return; }
  if (p1!==p2) { showToast("PINs don't match",'error'); return; }
  DB.setPin(p1); closeModal(); showToast('PIN set ✓','success'); renderTab('settings');
}

function handleImportJSON(input) {
  const file=input.files[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=e=>{ try { DB.importJSON(e.target.result); renderTab(currentTab); showToast('Import successful ✓','success'); } catch(err) { showToast('Import failed: invalid JSON file','error'); } };
  reader.readAsText(file); input.value='';
}

function handleImportCSV(input) {
  const file=input.files[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const res=DB.importTransactionsCSV(e.target.result);
      renderTab(currentTab);
      showToast(`Imported ${res.imported} transactions${res.skipped?` (${res.skipped} skipped)`:''}  ✓`,'success');
    } catch(err) { showToast('Import failed: invalid CSV file','error'); }
  };
  reader.readAsText(file); input.value='';
}

function clearAllData() {
  if (!confirm('Permanently delete ALL data?')) return;
  if (!confirm('Last chance — cannot be undone!')) return;
  Object.values(DB.KEYS).forEach(k=>localStorage.removeItem(k));
  showToast('All data cleared','error'); renderTab(currentTab);
}

function switchSumChart(type) {
  if (charts.sumTrend) { try{charts.sumTrend.destroy();}catch(e){} delete charts.sumTrend; }
  const data=DB.monthlyTotals(6);
  const ctx=document.getElementById('sum-trend'); if (!ctx) return;
  const isLine=type==='line';
  document.getElementById('chart-bar-btn')?.classList.toggle('active',!isLine);
  document.getElementById('chart-line-btn')?.classList.toggle('active',isLine);
  charts.sumTrend=new Chart(ctx,{ type:isLine?'line':'bar', data:{ labels:data.map(d=>d.label), datasets:[
    { label:'Income', data:data.map(d=>d.income), borderColor:'#12B76A', backgroundColor:isLine?'rgba(18,183,106,.1)':'rgba(18,183,106,.8)', borderWidth:2, fill:isLine, tension:.4, borderRadius:4 },
    { label:'Expense',data:data.map(d=>d.expense),borderColor:'#F04438', backgroundColor:isLine?'rgba(240,68,56,.1)':'rgba(240,68,56,.8)', borderWidth:2, fill:isLine, tension:.4, borderRadius:4 },
  ]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>DB.fmtINR(v)}}} } });
}

function toggleDrill(id) { drillCat=drillCat===id?null:id; renderTab('summary'); }

// ── Toast ──────────────────────────────────────────────────────────────
function showToast(msg, type='') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),2800);
}

// ── Init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth(); initNav(); initModal();
  if (!DB.hasPin()) {
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('main-app').style.display='flex';
    renderTab('dashboard');
  }
});
