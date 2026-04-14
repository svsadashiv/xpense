function setSettleAmt(v) {
  var el = document.getElementById('settle-person-amt');
  if (el) el.value = v;
}

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
let pinBuffer = '';
let pinSetup  = false;
let pinConfirm = '';

function initAuth() {
  // Replace each button with a fresh clone to remove any existing listeners,
  // then attach new ones. This is safe to call multiple times (e.g. on each lock).
  document.querySelectorAll('.num-btn[data-num]').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => appendPin(fresh.dataset.num));
  });
  const delBtn = document.getElementById('del-btn');
  const freshDel = delBtn.cloneNode(true);
  delBtn.parentNode.replaceChild(freshDel, delBtn);
  freshDel.addEventListener('click', deletePin);
}

function appendPin(d) {
  if (pinBuffer.length >= 6) return;
  pinBuffer += d;
  updatePinDots();
  if (pinBuffer.length === 6) setTimeout(handlePinComplete, 150);
}

function deletePin() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots span');
  dots.forEach((dot, i) => dot.classList.toggle('filled', i < pinBuffer.length));
}

function handlePinComplete() {
  const label = document.getElementById('pin-label');
  if (pinSetup) {
    if (!pinConfirm) {
      pinConfirm = pinBuffer;
      pinBuffer = '';
      updatePinDots();
      label.textContent = 'Confirm your PIN';
    } else {
      if (pinBuffer === pinConfirm) {
        DB.setPin(pinBuffer);
        showApp();
      } else {
        label.textContent = "PINs don't match. Try again.";
        label.classList.add('error');
        setTimeout(() => label.classList.remove('error'), 500);
        pinBuffer = ''; pinConfirm = '';
        updatePinDots();
      }
    }
  } else {
    if (DB.verifyPin(pinBuffer)) {
      showApp();
    } else {
      label.textContent = 'Incorrect PIN. Try again.';
      label.classList.add('error');
      setTimeout(() => { label.classList.remove('error'); label.textContent = 'Enter PIN to continue'; }, 1000);
      pinBuffer = '';
      updatePinDots();
    }
  }
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  renderTab(currentTab);
}

// ── Navigation ─────────────────────────────────────────────────────────
function openMobileNav() {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebar-backdrop').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileNav() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-backdrop').classList.remove('active');
  document.body.style.overflow = '';
}

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      closeMobileNav();
    });
  });
  document.getElementById('lock-btn').addEventListener('click', () => {
    closeMobileNav();
    lockApp();
  });
  document.getElementById('menu-btn').addEventListener('click', () => {
    const isOpen = document.getElementById('sidebar').classList.contains('mobile-open');
    isOpen ? closeMobileNav() : openMobileNav();
  });
  document.getElementById('add-btn-top').addEventListener('click', () => openAddTransaction());
  // Close sidebar when backdrop is clicked
  document.getElementById('sidebar-backdrop').addEventListener('click', closeMobileNav);
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTab(tab);
}

function lockApp() {
  if (!DB.hasPin()) {
    showToast('Set a PIN in Settings first to lock the app');
    return;
  }
  pinBuffer = '';
  updatePinDots();
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  // Re-attach numpad listeners every time we show the lock screen
  // (initAuth only ran at startup; buttons need listeners wired again)
  initAuth();
}

// ── Tab Renderer ───────────────────────────────────────────────────────
function renderTab(tab) {
  const content = document.getElementById('content');
  // Destroy old charts
  Object.values(charts).forEach(c => c.destroy());
  charts = {};

  switch(tab) {
    case 'dashboard':    content.innerHTML = renderDashboard();    afterDashboard();    break;
    case 'transactions': content.innerHTML = renderTransactions(); afterTransactions(); break;
    case 'loans':        content.innerHTML = renderLoans();        afterLoans();        break;
    case 'cards':        content.innerHTML = renderCards();        afterCards();        break;
    case 'budget':       content.innerHTML = renderBudget();       afterBudget();       break;
    case 'goals':        content.innerHTML = renderGoals();        break;
    case 'summary':      content.innerHTML = renderSummary();      afterSummary();      break;
    case 'settings':     content.innerHTML = renderSettings();     afterSettings();     break;
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────
function renderDashboard() {
  const txns  = DB.getTransactions();
  const now   = new Date();
  const m     = now.getMonth(), y = now.getFullYear();
  const thisMonth = txns.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === m && d.getFullYear() === y;
  });
  // Settlements (income with lentTo) are NOT real income — they cancel lent outflow
  const income       = thisMonth.filter(t => t.type==='income' && !t.lentTo).reduce((s,t) => s+t.amount, 0);
  const expenses     = thisMonth.filter(t => t.type==='expense' || t.type==='transfer').reduce((s,t) => s+t.amount, 0);
  const lentGiven    = thisMonth.filter(t => t.type==='lent').reduce((s,t) => s+t.amount, 0);
  const lentRecovered= thisMonth.filter(t => t.type==='income' && t.lentTo).reduce((s,t) => s+t.amount, 0);
  const netLentPending = Math.max(0, lentGiven - lentRecovered);
  const expense      = expenses; // alias kept for display
  const net          = income - expenses - netLentPending;
  const catTotals = DB.catTotals(thisMonth);
  const recent  = [...txns].sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
  const cats    = DB.getCategories();

  // Pending = sum(lent for person) − sum(income tagged to person). No flags needed.
  const allTxns2 = DB.getTransactions();
  const pendingByPerson = {};
  allTxns2.forEach(t => {
    if (t.type === 'lent' && t.lentTo) {
      pendingByPerson[t.lentTo] = (pendingByPerson[t.lentTo] || 0) + t.amount;
    } else if (t.type === 'income' && t.lentTo) {
      pendingByPerson[t.lentTo] = (pendingByPerson[t.lentTo] || 0) - t.amount;
    }
  });
  Object.keys(pendingByPerson).forEach(k => { if (pendingByPerson[k] <= 0) delete pendingByPerson[k]; });

  let pendingHTML = '';
  if (Object.keys(pendingByPerson).length) {
    const personRows = Object.entries(pendingByPerson).map(([name, amt]) => {
      const safeName = name.replace(/\\/g,'').replace(/'/g,'\\x27');
      return '<div class="lent-row">' +
        '<span style="font-weight:600">👤 ' + name + '</span>' +
        '<span style="font-size:12px;color:#92400E">Pending</span>' +
        '<span style="font-weight:700;color:#D97706">' + DB.fmtINR(amt) + '</span>' +
        '<button class="btn btn-sm btn-success" onclick="openSettleByPerson(\'' + safeName + '\')">Settle</button>' +
        '</div>';
    }).join('');
    const pendingTotal = Object.values(pendingByPerson).reduce((a,b)=>a+b,0);
    pendingHTML = '<div class="lent-card mt-24">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<span style="font-weight:700;color:#B45309">🤝 Pending to Recover</span>' +
        '<span style="font-weight:700;color:#B45309">' + DB.fmtINR(pendingTotal) + '</span>' +
      '</div>' + personRows + '</div>';
  }

  let catBars = '';
  if (catTotals.length) {
    const max = catTotals[0].total;
    catBars = catTotals.slice(0,5).map(({cat, total}) => `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:32px;height:32px;border-radius:8px;background:${cat.color}22;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${cat.icon}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${cat.name}</div>
          <div style="height:5px;background:var(--bg);border-radius:3px;overflow:hidden">
            <div style="height:100%;background:${cat.color};border-radius:3px;width:${(total/max*100).toFixed(1)}%"></div>
          </div>
        </div>
        <span style="font-size:13px;font-weight:700;color:var(--red);white-space:nowrap">${DB.fmtINR(total)}</span>
      </div>`).join('');
  }

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
      <div class="hero-stat"><div class="hero-stat-label">↑ Outflow</div><div class="hero-stat-value">${DB.fmtINR(expenses + netLentPending)}</div></div>
      ${netLentPending > 0 ? `<div class="hero-stat"><div class="hero-stat-label">🤝 Lent</div><div class="hero-stat-value">${DB.fmtINR(netLentPending)}</div></div>` : ''}
    </div>
  </div>

  ${pendingHTML}

  <div class="chart-grid">
    <div class="card">
      <div class="card-title">6-Month Trend</div>
      <div class="chart-wrap"><canvas id="trend-chart"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">By Category</div>
      ${catBars || '<p class="text-muted" style="padding:20px 0;text-align:center;font-size:14px">No outflow this month</p>'}
    </div>
  </div>

  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div class="card-title" style="margin:0">Recent Transactions</div>
      <button class="btn btn-secondary btn-sm" onclick="switchTab('transactions')">See All →</button>
    </div>
    ${recent.length ? recent.map(t => txnRowHTML(t, cats)).join('') : '<div class="empty-state"><div class="empty-icon">💸</div><p>No transactions yet</p></div>'}
  </div>`;
}

function afterDashboard() {
  const data = DB.monthlyTotals(6);
  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;
  charts.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label:'Income',  data: data.map(d=>d.income),  backgroundColor:'rgba(18,183,106,.8)', borderRadius:5 },
        { label:'Expense', data: data.map(d=>d.expense), backgroundColor:'rgba(240,68,56,.8)',  borderRadius:5 },
      ]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}, scales:{x:{grid:{display:false}},y:{grid:{color:'#f0f0f0'},ticks:{callback:v=>DB.fmtINR(v)}}} }
  });
}

// ── Transactions ───────────────────────────────────────────────────────
function renderTransactions() {
  const cats = DB.getCategories();
  let txns   = DB.getTransactions();

  if (txnFilter !== 'all') txns = txns.filter(t => t.type === txnFilter);
  if (txnSearch) {
    const s = txnSearch.toLowerCase();
    txns = txns.filter(t => (t.description||'').toLowerCase().includes(s) || (t.lentTo||'').toLowerCase().includes(s) || (t.transferTo||'').toLowerCase().includes(s) || (cats.find(c => c.id === t.categoryId)?.name||'').toLowerCase().includes(s));
  }
  if (txnYear)    txns = txns.filter(t => new Date(t.date).getFullYear() === txnYear);
  if (txnMonth)   txns = txns.filter(t => new Date(t.date).getMonth() + 1 === txnMonth);
  if (txnPayment) txns = txns.filter(t => t.payment === txnPayment);
  txns.sort((a,b) => b.date.localeCompare(a.date));

  // Settlements (income with lentTo) cancel lent outflow — not counted as income
  const income        = txns.filter(t => t.type === 'income' && !t.lentTo).reduce((s,t) => s+t.amount, 0);
  const expense       = txns.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  const transfer      = txns.filter(t => t.type === 'transfer').reduce((s,t) => s+t.amount, 0);
  const lentGiven     = txns.filter(t => t.type === 'lent').reduce((s,t) => s+t.amount, 0);
  const lentRecovered = txns.filter(t => t.type === 'income' && t.lentTo).reduce((s,t) => s+t.amount, 0);
  const lent          = Math.max(0, lentGiven - lentRecovered);
  const net           = income - expense - transfer - lent;
  // All-time pending: always computed from full transaction list regardless of filter
  const allTxns = DB.getTransactions();
  const allTimeLentGiven     = allTxns.filter(t => t.type === 'lent').reduce((s,t) => s+t.amount, 0);
  const allTimeLentRecovered = allTxns.filter(t => t.type === 'income' && t.lentTo).reduce((s,t) => s+t.amount, 0);
  const allTimePending       = Math.max(0, allTimeLentGiven - allTimeLentRecovered);

  const groups = {};
  txns.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  const sortedDates = Object.keys(groups).sort((a,b) => b.localeCompare(a));

  const allYears = [...new Set(DB.getTransactions().map(t => new Date(t.date).getFullYear()))].sort((a,b) => b-a);
  const payments = ['cash','debit-card','credit-card','upi','net-banking','cheque','wallet'];
  const mNames   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const yearOpts  = allYears.map(y => '<option value="'+y+'"'+(txnYear===y?' selected':'')+'>'+y+'</option>').join('');
  const monthOpts = mNames.map((m,i) => '<option value="'+(i+1)+'"'+(txnMonth===i+1?' selected':'')+'>'+m+'</option>').join('');
  const payOpts   = payments.map(p => '<option value="'+p+'"'+(txnPayment===p?' selected':'')+'>'+p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())+'</option>').join('');
  const typeChips = ['all','expense','income','transfer','lent'].map(f =>
    '<button class="filter-chip'+(txnFilter===f?' active':'')+'" onclick="txnFilter=\''+f+'\';renderTab(\'transactions\')">'+(f==='all'?'All Types':f.charAt(0).toUpperCase()+f.slice(1))+'</button>'
  ).join('');

  const txnRows = sortedDates.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🔍</div><p>No transactions found</p></div>'
    : sortedDates.map(date =>
        '<div class="section-date">'+formatDateHeader(date)+'</div>' +
        '<div class="txn-list">'+groups[date].map(t => txnRowHTML(t, cats, true)).join('')+'</div>'
      ).join('');

  const lentBadge     = lent > 0 ? '<div class="badge badge-orange" style="padding:6px 12px">🤝 Lent (period) '+DB.fmtINR(lent)+'</div>' : '';
  const pendingBadge  = allTimePending > 0 ? '<div class="badge badge-orange" style="padding:6px 12px;background:#FEF3C7;color:#B45309">⏳ Pending (all time) '+DB.fmtINR(allTimePending)+'</div>' : '';

  return '<div class="page-header">' +
    '<div><div class="page-title">Transactions</div><div class="page-subtitle">'+txns.length+' transactions</div></div>' +
    '<button class="btn btn-primary" onclick="openAddTransaction()">+ Add</button></div>' +

    '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">' +
      '<input class="search-input" id="txn-search-input" placeholder="Search…" value="'+txnSearch+'" />' +
      '<select class="form-select" style="width:auto" onchange="txnYear=this.value?+this.value:null;txnMonth=null;renderTab(\'transactions\')">' +
        '<option value="">All Years</option>'+yearOpts+'</select>' +
      '<select class="form-select" style="width:auto" onchange="txnMonth=this.value?+this.value:null;renderTab(\'transactions\')">' +
        '<option value="">All Months</option>'+monthOpts+'</select>' +
      '<select class="form-select" style="width:auto" onchange="txnPayment=this.value||null;renderTab(\'transactions\')">' +
        '<option value="">All Payments</option>'+payOpts+'</select>' +
      '<button class="btn btn-secondary btn-sm" onclick="txnYear=null;txnMonth=null;txnPayment=null;txnSearch=\'\';txnFilter=\'all\';renderTab(\'transactions\')">Reset</button>' +
    '</div>' +

    '<div class="filter-bar">'+typeChips+'</div>' +

    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      '<div class="badge badge-green" style="padding:6px 12px">↓ Income '+DB.fmtINR(income)+'</div>' +
      '<div class="badge badge-red" style="padding:6px 12px">↑ Outflow '+DB.fmtINR(expense+transfer+lent)+'</div>' +
      '<div class="badge badge-blue" style="padding:6px 12px">Net '+DB.fmtINR(net)+'</div>' +
      lentBadge +
      pendingBadge +
    '</div>' +

    '<div id="txn-rows-container">' + txnRows + '</div>';
}



function txnRowHTML(t, cats, showActions = false) {
  const cat = cats.find(c => c.id === t.categoryId);
  const isIncome = t.type === 'income';
  const isLent   = t.type === 'lent';
  const isTransfer = t.type === 'transfer';
  const amtColor = isIncome ? 'var(--green)' : isLent ? 'var(--orange)' : 'var(--red)';
  const amtPrefix = isIncome ? '+' : isLent ? '🤝 ' : '−';
  const subtitle = [
    DB.fmtDate(t.date),
    t.payment ? t.payment.replace(/-/g,' ') : '',
    t.lentTo ? `→ ${t.lentTo}` : '',
    t.transferTo ? `→ ${t.transferTo}` : '',
    '',
  ].filter(Boolean).join(' · ');

  return `
  <div class="txn-row" id="txn-${t.id}">
    <div class="txn-icon" style="background:${cat?.color||'#8E8E93'}22">${cat?.icon||'💳'}</div>
    <div class="txn-info">
      <div class="txn-name">${t.description || cat?.name || 'Transaction'}</div>
      <div class="txn-meta">${subtitle}</div>
    </div>
    <div class="txn-amount" style="color:${amtColor}">${amtPrefix}${DB.fmtINR(t.amount)}</div>
    ${showActions ? `<div class="txn-actions">
      <button class="icon-btn icon-btn-edit" onclick="openEditTransaction('${t.id}')" title="Edit">✏️</button>
      <button class="icon-btn icon-btn-del" onclick="deleteTransaction('${t.id}')" title="Delete">🗑️</button>
    </div>` : ''}
  </div>`;
}

function afterTransactions() {
  const searchInput = document.getElementById('txn-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      txnSearch = this.value;
      // Re-render only the transaction rows, not the whole tab (preserves focus)
      const cats = DB.getCategories();
      let txns = DB.getTransactions();
      if (txnFilter !== 'all') txns = txns.filter(t => t.type === txnFilter);
      if (txnSearch) {
        const s = txnSearch.toLowerCase();
        txns = txns.filter(t => (t.description||'').toLowerCase().includes(s) || (t.lentTo||'').toLowerCase().includes(s) || (t.transferTo||'').toLowerCase().includes(s) || (cats.find(c => c.id === t.categoryId)?.name||'').toLowerCase().includes(s));
      }
      if (txnYear)    txns = txns.filter(t => new Date(t.date).getFullYear() === txnYear);
      if (txnMonth)   txns = txns.filter(t => new Date(t.date).getMonth() + 1 === txnMonth);
      if (txnPayment) txns = txns.filter(t => t.payment === txnPayment);
      txns.sort((a,b) => b.date.localeCompare(a.date));
      const groups = {};
      txns.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
      const sortedDates = Object.keys(groups).sort((a,b) => b.localeCompare(a));
      const rowsHTML = sortedDates.length === 0
        ? '<div class="empty-state"><div class="empty-icon">🔍</div><p>No transactions found</p></div>'
        : sortedDates.map(date =>
            '<div class="section-date">'+formatDateHeader(date)+'</div>' +
            '<div class="txn-list">'+groups[date].map(t => txnRowHTML(t, cats, true)).join('')+'</div>'
          ).join('');
      const rowsContainer = document.getElementById('txn-rows-container');
      if (rowsContainer) rowsContainer.innerHTML = rowsHTML;
    });
  }
}

function formatDateHeader(iso) {
  const d = new Date(iso + 'T12:00:00');
  const today = new Date(); today.setHours(12,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {weekday:'long', day:'2-digit', month:'short'});
}

// ── Loans ──────────────────────────────────────────────────────────────
function renderLoans() {
  const loans = DB.getLoans();
  const txns = DB.getTransactions();
  const totalPrincipal = loans.reduce((s,l)=>s+l.principal,0);
  // Only sum EMI for loans that are not fully repaid
  const totalEMI = loans.reduce((s,l)=>{
    const paid = getLoanPaidEmiNumbers(l, txns);
    const isFullyRepaid = paid.length >= l.months;
    return isFullyRepaid ? s : s + DB.calcEMI(l.principal, l.rate, l.months);
  }, 0);

  return `
  <div class="page-header">
    <div><div class="page-title">Loan EMIs</div></div>
    <button class="btn btn-primary" onclick="openAddLoan()">+ Add Loan</button>
  </div>

  ${loans.length ? `
  <div class="kpi-grid" style="margin-bottom:24px">
    <div class="kpi-card"><div class="kpi-icon" style="background:#EEF2FF">🏦</div><div class="kpi-label">Total Principal</div><div class="kpi-value">${DB.fmtINR(totalPrincipal)}</div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:#FEE4E2">📅</div><div class="kpi-label">Monthly EMI</div><div class="kpi-value text-red">${DB.fmtINR(totalEMI)}</div></div>
  </div>` : ''}

  ${loans.length === 0 ? `<div class="empty-state"><div class="empty-icon">🏦</div><p>No active loans. Add your first loan to track EMIs.</p></div>` :
    loans.map(l => loanCardHTML(l, txns)).join('')}`;
}

function loanCardHTML(l, txns) {
  const emi = DB.calcEMI(l.principal, l.rate, l.months);
  const totalPayable = emi * l.months;
  const totalInterest = totalPayable - l.principal;
  const paid = getLoanPaidEmiNumbers(l, txns);
  const pct  = Math.min((paid.length / l.months) * 100, 100);
  const schedule = DB.amortSchedule(l.principal, l.rate, l.months, l.startDate);
  const nextEMI  = schedule.find(s => !paid.includes(s.n));
  const paidInterest = paid.reduce((s, n) => { const e = schedule.find(x=>x.n===n); return s + (e?.interest||0); }, 0);
  const remaining = nextEMI ? schedule.find(s=>s.n===paid.length)?.balance || l.principal : 0;

  return `
  <div class="card loan-card" id="loan-${l.id}">
    <div class="loan-header">
      <div>
        <div class="loan-title">${l.name}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:3px">🏦 ${l.lender} · ${l.rate}% p.a.</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="loan-type-badge">${l.type}</span>
        <button class="icon-btn icon-btn-del" onclick="deleteLoan('${l.id}')">🗑️</button>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:4px">
      <span>Repaid ${pct.toFixed(1)}%</span>
      <span>${paid.length} / ${l.months} EMIs</span>
    </div>
    <div class="loan-progress"><div class="loan-fill" style="width:${pct}%"></div></div>
    <div class="loan-stats">
      <div class="loan-stat"><div class="loan-stat-label">EMI</div><div class="loan-stat-value text-blue">${DB.fmtINR(emi)}</div></div>
      <div class="loan-stat"><div class="loan-stat-label">Remaining</div><div class="loan-stat-value text-red">${DB.fmtINR(remaining)}</div></div>
      <div class="loan-stat"><div class="loan-stat-label">Interest Paid</div><div class="loan-stat-value">${DB.fmtINR(paidInterest)}</div></div>
      <div class="loan-stat"><div class="loan-stat-label">Total Interest</div><div class="loan-stat-value text-orange">${DB.fmtINR(totalInterest)}</div></div>
    </div>
    ${nextEMI ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding:10px 14px;background:var(--blue-light);border-radius:8px">
      <div>
        <div style="font-size:12px;color:var(--blue);font-weight:600">Next EMI #${nextEMI.n}</div>
        <div style="font-size:13px;color:var(--text2)">${DB.fmtDate(nextEMI.date)} · ${DB.fmtINR(emi)}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="markEMIPaid('${l.id}',${nextEMI.n})">Mark Paid ✓</button>
    </div>` : '<div style="margin-top:12px;padding:10px;background:var(--green-light);border-radius:8px;text-align:center;color:var(--green);font-weight:600">✓ Loan Fully Repaid!</div>'}
    <button class="btn btn-secondary btn-sm mt-16" style="width:100%" onclick="toggleAmort('${l.id}')">📋 View Amortization Schedule</button>
    <div id="amort-${l.id}" style="display:none;margin-top:12px">
      <div class="amort-scroll">
        <table class="amort-table">
          <thead><tr><th>#</th><th>Date</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>
          <tbody>
            ${schedule.map(s => `
            <tr class="${paid.includes(s.n)?'paid':''}">
              <td>${s.n}</td><td>${DB.fmtDate(s.date)}</td>
              <td>${DB.fmtINR(s.emi)}</td><td>${DB.fmtINR(s.principal)}</td>
              <td>${DB.fmtINR(s.interest)}</td><td>${DB.fmtINR(s.balance)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function afterLoans() {}

// ── Cards ──────────────────────────────────────────────────────────────
function renderCards() {
  const cats = DB.getCategories();
  const cards = cardsWithDue(DB.getCards(), DB.getTransactions(), cats);
  const totalDue = cards.reduce((s,c) => s + (c.dueBalance||0), 0);
  const totalLimit = cards.reduce((s,c) => s + (c.limit||0), 0);
  const overdueCards = cards.filter(c => new Date(c.dueDate) < new Date() && (c.dueBalance||0) > 0);
  const totalUtil = totalLimit > 0 ? Math.min((totalDue / totalLimit) * 100, 100) : 0;
  return `
  <div class="page-header">
    <div><div class="page-title">Credit Cards</div></div>
    <button class="btn btn-primary" onclick="openAddCard()">+ Add Card</button>
  </div>
  ${cards.length ? `
  <div class="kpi-grid" style="margin-bottom:24px">
    <div class="kpi-card"><div class="kpi-icon" style="background:#EEF2FF">💳</div><div class="kpi-label">Total Cards</div><div class="kpi-value">${cards.length}</div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:#FEE4E2">💸</div><div class="kpi-label">Total Due</div><div class="kpi-value text-red">${DB.fmtINR(totalDue)}</div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:#FFF3E0">📊</div><div class="kpi-label">Avg Utilization</div><div class="kpi-value text-orange">${totalUtil.toFixed(1)}%</div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:#E8F5E9">🏦</div><div class="kpi-label">Total Limit</div><div class="kpi-value text-green">${DB.fmtINR(totalLimit)}</div></div>
    ${overdueCards.length ? `<div class="kpi-card"><div class="kpi-icon" style="background:#FFF3E0">⚠️</div><div class="kpi-label">Overdue Cards</div><div class="kpi-value text-orange">${overdueCards.length}</div></div>` : ''}
  </div>` : ''}
  ${cards.length === 0 ? `<div class="empty-state"><div class="empty-icon">💳</div><p>No credit cards added yet.</p></div>` :
    cards.map(c => creditCardHTML(c)).join('')}`;
}

function creditCardHTML(c) {
  const due = c.dueBalance || 0;
  const util = Math.min((due / c.limit) * 100, 100);
  const utilColor = util < 30 ? 'var(--green)' : util < 70 ? 'var(--orange)' : 'var(--red)';
  const isOpen = expandedCards.has(c.id);
  const overdue = new Date(c.dueDate) < new Date() && due > 0;

  const detail = isOpen ? `
    <div style="padding:16px;border-top:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">
        <div><div class="card-stat-label">Balance</div><div class="card-stat-value text-red">${DB.fmtFull(due)}</div></div>
        <div><div class="card-stat-label">Limit</div><div class="card-stat-value">${DB.fmtFull(c.limit)}</div></div>
        <div><div class="card-stat-label">Available</div><div class="card-stat-value text-green">${DB.fmtFull(c.limit - due)}</div></div>
      </div>
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:4px">
          <span>Utilization</span><span style="color:${utilColor};font-weight:700">${util.toFixed(1)}%</span>
        </div>
        <div class="util-bar"><div class="util-fill" style="width:${util}%;background:${utilColor}"></div></div>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px">
        📅 Due ${DB.fmtDate(c.dueDate)} &nbsp;·&nbsp; Min ${DB.fmtFull(c.minPayment||0)} &nbsp;·&nbsp; ${c.rate||36}% p.a.
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="openSettleCard('${c.id}')">💳 Pay Now</button>
        <button class="btn btn-secondary" onclick="openEditCard('${c.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCard('${c.id}')">🗑️</button>
      </div>
    </div>` : '';

  return `
  <div style="margin-bottom:16px;border-radius:14px;overflow:hidden;box-shadow:var(--shadow)">
    <div onclick="toggleCard('${c.id}')" style="background:linear-gradient(135deg,${c.color},${c.color}bb);padding:20px;color:white;cursor:pointer;position:relative;overflow:hidden">
      <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08)"></div>
      <div style="position:relative">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:14px;font-weight:600;opacity:.9">${c.bank}</div>
            <div style="font-family:'DM Mono',monospace;font-size:15px;margin-top:8px;letter-spacing:2px">•••• •••• •••• ${c.last4}</div>
            <div style="font-size:13px;opacity:.75;margin-top:3px">${c.name}</div>
          </div>
          <div style="text-align:right">
            ${overdue ? '<div style="background:rgba(255,200,0,.3);padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;margin-bottom:6px">⚠ OVERDUE</div>' : ''}
            <div style="font-size:11px;opacity:.7">Due Balance</div>
            <div style="font-size:18px;font-weight:700">${DB.fmtINR(due)}</div>
          </div>
        </div>
        <div style="display:flex;gap:16px;font-size:12px;margin-bottom:8px">
          <span><span style="opacity:.7">Limit </span><strong>${DB.fmtINR(c.limit)}</strong></span>
          <span><span style="opacity:.7">Available </span><strong>${DB.fmtINR(c.limit - due)}</strong></span>
          <span><span style="opacity:.7">Due </span><strong>${DB.fmtDate(c.dueDate)}</strong></span>
        </div>
        <div style="height:4px;background:rgba(255,255,255,.25);border-radius:2px;overflow:hidden">
          <div style="height:100%;background:white;width:${util.toFixed(1)}%;border-radius:2px;opacity:.85"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
          <div style="font-size:11px;opacity:.6">${isOpen ? '▲ Less' : '▼ Details'}</div>
          ${due > 0 ? `<button onclick="event.stopPropagation();openSettleCard('${c.id}')" style="background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.5);color:white;padding:5px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">💳 Pay Now</button>` : ''}
        </div>
      </div>
    </div>
    ${detail}
  </div>`;
}


function afterCards() {}

// ── Budget ─────────────────────────────────────────────────────────────
function renderBudget() {
  const budgets = DB.getBudgets().filter(b => b.month === budgetMonth && b.year === budgetYear);
  const cats    = DB.getCategories();
  const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const totalBudget = budgets.reduce((s,b)=>s+b.limit,0);
  const totalSpent  = budgets.reduce((s,b)=>s+DB.spentInCategory(b.categoryId,b.month,b.year),0);

  return `
  <div class="page-header">
    <div><div class="page-title">Budget</div></div>
    <button class="btn btn-primary" onclick="openAddBudget()">+ Budget</button>
  </div>

  <div style="display:flex;gap:8px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
    <button onclick="changeBudgetMonth(-1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:16px">‹</button>
    <span style="font-weight:600;font-size:15px">${months[budgetMonth-1]} ${budgetYear}</span>
    <button onclick="changeBudgetMonth(1)" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:16px">›</button>
    <button class="btn btn-secondary btn-sm" onclick="openReplicateBudget()">📋 Replicate Month</button>
  </div>

  ${budgets.length ? `
  <div class="card" style="margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div><div style="font-size:13px;color:var(--text3)">Total Budget</div><div style="font-size:22px;font-weight:700">${DB.fmtFull(totalBudget)}</div></div>
      <div style="text-align:right">
        <div style="font-size:13px;color:var(--text3)">Remaining</div>
        <div style="font-size:22px;font-weight:700;color:${totalSpent>totalBudget?'var(--red)':'var(--green)'}">${DB.fmtFull(totalBudget-totalSpent)}</div>
      </div>
    </div>
    <div class="util-bar" style="height:10px"><div class="util-fill" style="width:${Math.min(totalSpent/totalBudget*100,100).toFixed(1)}%;background:${totalSpent>totalBudget?'var(--red)':'var(--blue)'}"></div></div>
    <div style="font-size:12px;color:var(--text3);margin-top:6px">Spent ${DB.fmtINR(totalSpent)} of ${DB.fmtINR(totalBudget)}</div>
  </div>
  ${budgets.map(b => budgetRowHTML(b, cats)).join('')}` :
  `<div class="empty-state"><div class="empty-icon">📊</div><p>No budgets for this month.<br>Add one or replicate from a previous month.</p></div>`}
  `;
}


function budgetRowHTML(b, cats) {
  const cat = cats.find(c => c.id === b.categoryId);
  const spent = DB.spentInCategory(b.categoryId, b.month, b.year);
  const pct   = b.limit > 0 ? Math.min((spent/b.limit)*100, 100) : 0;
  const over  = spent > b.limit;
  const barColor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--orange)' : 'var(--green)';
  return `
  <div class="budget-row">
    <div class="txn-icon" style="background:${cat?.color||'#888'}22;flex-shrink:0">${cat?.icon||'💰'}</div>
    <div class="budget-cat">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="budget-cat-name">${cat?.name||'Unknown'}</span>
        ${over?`<span class="over-badge">OVER</span>`:''}
      </div>
      <div class="budget-bar-wrap"><div class="budget-bar" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="budget-amounts">${DB.fmtINR(spent)} of ${DB.fmtINR(b.limit)}</div>
    </div>
    <div class="budget-pct" style="color:${barColor}">${pct.toFixed(0)}%</div>
    <div style="display:flex;gap:6px">
      <button class="icon-btn icon-btn-edit" onclick="openEditBudget('${b.id}')">✏️</button>
      <button class="icon-btn icon-btn-del" onclick="deleteBudget('${b.id}')">🗑️</button>
    </div>
  </div>`;
}

function goalCardHTML(g, currentSaved) {
  const pct = Math.min((currentSaved / g.target) * 100, 100);
  return `
  <div class="card goal-card">
    <div class="goal-header">
      <div class="goal-icon" style="background:${g.color}22">${g.icon}</div>
      <div>
        <div class="goal-title">${g.name}</div>
        <div class="goal-target">Target: ${DB.fmtDate(g.targetDate)}</div>
      </div>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="icon-btn icon-btn-edit" onclick="openEditGoal('${g.id}')">✏️</button>
        <button class="icon-btn icon-btn-del" onclick="deleteGoal('${g.id}')">🗑️</button>
      </div>
    </div>
    <div class="goal-progress-row">
      <div class="goal-progress-bar"><div class="goal-fill" style="width:${pct}%;background:${g.color}"></div></div>
      <div class="goal-pct" style="color:${g.color}">${pct.toFixed(1)}%</div>
    </div>
    <div class="goal-amounts"><span>${DB.fmtINR(currentSaved)} saved</span><span>${DB.fmtINR(g.target - currentSaved)} remaining</span></div>
    <button class="btn btn-secondary btn-sm mt-16" style="width:100%" onclick="openAddToGoal('${g.id}')">+ Add Funds</button>
  </div>`;
}

function afterBudget() {}

// ── Goals ──────────────────────────────────────────────────────────────
function renderGoals() {
  const goals = DB.getGoals();
  const txns = DB.getTransactions();
  const header = '<div class="page-header"><div><div class="page-title">Savings Goals</div></div><button class="btn btn-primary" onclick="openAddGoal()">+ New Goal</button></div>';
  const body = goals.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🎯</div><p>No savings goals yet.<br>Set a target and track your progress.</p></div>'
    : goals.map(g => goalCardHTML(g, getGoalCurrentFromTransactions(g, txns))).join('');
  return header + body;
}

// ── Summary ────────────────────────────────────────────────────────────
function renderSummary() {
  const now = new Date();
  let txns = DB.getTransactions();

  if (summaryPeriod === 'month') {
    txns = txns.filter(t => { const d=new Date(t.date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
  } else if (summaryPeriod === '3m') {
    const since = new Date(now); since.setMonth(since.getMonth()-3);
    txns = txns.filter(t => new Date(t.date) >= since);
  } else if (summaryPeriod === '6m') {
    const since = new Date(now); since.setMonth(since.getMonth()-6);
    txns = txns.filter(t => new Date(t.date) >= since);
  } else if (summaryPeriod === 'year') {
    txns = txns.filter(t => new Date(t.date).getFullYear()===now.getFullYear());
  }

  // Settlements (income with lentTo) cancel lent outflow — not counted as income
  const income         = txns.filter(t=>t.type==='income'&&!t.lentTo).reduce((s,t)=>s+t.amount,0);
  const expenseOnly    = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const transfer       = txns.filter(t=>t.type==='transfer').reduce((s,t)=>s+t.amount,0);
  const lentGivenAll   = txns.filter(t=>t.type==='lent').reduce((s,t)=>s+t.amount,0);
  const lentRecoveredAll = txns.filter(t=>t.type==='income'&&t.lentTo).reduce((s,t)=>s+t.amount,0);
  const lentOut        = Math.max(0, lentGivenAll - lentRecoveredAll);
  const expense        = expenseOnly + transfer;
  const pending        = lentOut;
  const net            = income - expense - lentOut;
  const rate           = income > 0 ? (net/income*100) : 0;
  // All-time pending: always computed from full transaction list regardless of period filter
  const allTxnsFull        = DB.getTransactions();
  const allTimeLentGivenSum     = allTxnsFull.filter(t=>t.type==='lent').reduce((s,t)=>s+t.amount,0);
  const allTimeLentRecoveredSum = allTxnsFull.filter(t=>t.type==='income'&&t.lentTo).reduce((s,t)=>s+t.amount,0);
  const allTimePendingSum       = Math.max(0, allTimeLentGivenSum - allTimeLentRecoveredSum);
  const catData = DB.catTotals(txns);

  return `
  <div class="page-header">
    <div><div class="page-title">Summary</div></div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="period-selector">
        ${[['month','This Month'],['3m','3 Months'],['6m','6 Months'],['year','This Year'],['all','All Time']].map(([v,l])=>`
        <button class="period-btn ${summaryPeriod===v?'active':''}" onclick="summaryPeriod='${v}';renderTab('summary')">${l}</button>`).join('')}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="DB.exportPDF(summaryPeriod)">📄 Export PDF</button>
    </div>
  </div>

  <div class="summary-grid">
    ${kpiHTML('Income',DB.fmtFull(income),'↓','#D1FAE5','var(--green)')}
    ${kpiHTML('Expenses',DB.fmtFull(expense),'↑','#FEE4E2','var(--red)')}
    ${kpiHTML('Net Savings',DB.fmtFull(net),'💰', net>=0?'#D1FAE5':'#FEE4E2', net>=0?'var(--green)':'var(--red)')}
    ${kpiHTML('Savings Rate',rate.toFixed(1)+'%','%','#EEF2FF','var(--blue)')}
    ${lentOut>0?kpiHTML('Lent (period)',DB.fmtFull(lentOut),'🤝','#FEF3C7','var(--orange)'):''}
    ${allTimePendingSum>0?kpiHTML('Pending (all time)',DB.fmtFull(allTimePendingSum),'⏳','#FFF7ED','#C2410C'):''}
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
      <div class="card-title">Expenses by Category</div>
      <div class="chart-wrap" style="height:200px"><canvas id="sum-pie"></canvas></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Category Breakdown</div>
    ${catData.length === 0 ? '<p class="text-muted" style="font-size:14px;padding:12px 0">No outflow data</p>' :
      catData.map(({cat,total}) => `
      <div class="cat-drill ${drillCat===cat.id?'open':''}" onclick="toggleDrill('${cat.id}')">
        <div class="cat-drill-header">
          <div class="cat-drill-icon" style="background:${cat.color}22">${cat.icon}</div>
          <div class="cat-drill-name">${cat.name}</div>
          <div class="cat-drill-amount">${DB.fmtINR(total)}</div>
          <span style="color:var(--text3)">${drillCat===cat.id?'▲':'▼'}</span>
        </div>
        <div class="cat-drill-body">
          ${txns.filter(t=>t.categoryId===cat.id&&t.type==='expense').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(t=>`
          <div class="cat-drill-txn"><span>${t.description||'No description'}</span><span style="font-weight:600;color:var(--red)">${DB.fmtINR(t.amount)}</span></div>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function kpiHTML(label, value, icon, bg, color) {
  return `<div class="kpi-card"><div class="kpi-icon" style="background:${bg};font-size:16px">${icon}</div><div class="kpi-label">${label}</div><div class="kpi-value" style="color:${color}">${value}</div></div>`;
}

function afterSummary() {
  const data = DB.monthlyTotals(6);
  const ctx1 = document.getElementById('sum-trend');
  const ctx2 = document.getElementById('sum-pie');
  if (ctx1) {
    charts.sumTrend = new Chart(ctx1, {
      type: 'bar',
      data: { labels: data.map(d=>d.label), datasets:[
        { label:'Income',  data:data.map(d=>d.income),  backgroundColor:'rgba(18,183,106,.8)', borderRadius:4 },
        { label:'Expense', data:data.map(d=>d.expense), backgroundColor:'rgba(240,68,56,.8)',  borderRadius:4 },
      ]},
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>DB.fmtINR(v)}}} }
    });
  }
  const now = new Date();
  let txns = DB.getTransactions();
  if (summaryPeriod==='month') txns = txns.filter(t=>{const d=new Date(t.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
  const catData = DB.catTotals(txns).slice(0,6);
  if (ctx2 && catData.length) {
    charts.pie = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels: catData.map(x=>x.cat.name), datasets:[{ data:catData.map(x=>x.total), backgroundColor:catData.map(x=>x.cat.color), borderWidth:2, borderColor:'#fff' }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}} }
    });
  }
}

// ── Settings ───────────────────────────────────────────────────────────
function renderSettings() {
  const s = DB.getSettings();
  return `
  <div class="page-header"><div class="page-title">Settings</div></div>
  <div class="settings-section">
    <div class="settings-section-title">Security</div>
    <div class="settings-row">
      <div><div class="settings-row-label">PIN Lock</div><div class="settings-row-sub">${DB.hasPin()?'PIN is set':'No PIN configured'}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="${DB.hasPin()?'changePin()':'setPin()'}">${DB.hasPin()?'Change PIN':'Set PIN'}</button>
        ${DB.hasPin()?'<button class=\"btn btn-danger btn-sm\" onclick=\"removePin()\">Remove</button>':''}
      </div>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">Data Management</div>
    <div class="settings-row"><div class="settings-row-label">Export Transactions CSV</div><button class="btn btn-secondary btn-sm" onclick="DB.exportCSV()">Export</button></div>
    <div class="settings-row"><div class="settings-row-label">Export Full Backup JSON</div><button class="btn btn-secondary btn-sm" onclick="DB.exportJSON()">Export</button></div>
    <div class="settings-row">
      <div><div class="settings-row-label">Import Transactions CSV</div><div class="settings-row-sub">Only imports transactions</div></div>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('imp-csv').click()">Import</button>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Import Full Backup JSON</div><div class="settings-row-sub">Restores all data</div></div>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('imp-json').click()">Import</button>
    </div>
    <input type="file" id="imp-csv"  accept=".csv"  style="display:none" onchange="handleImportCSV(this)" />
    <input type="file" id="imp-json" accept=".json" style="display:none" onchange="handleImportJSON(this)" />
  </div>
  <div class="settings-section">
    <div class="settings-section-title">Danger Zone</div>
    <div class="settings-row">
      <div><div class="settings-row-label" style="color:var(--red)">Clear All Data</div><div class="settings-row-sub">Permanently deletes everything</div></div>
      <button class="btn btn-danger btn-sm" onclick="clearAllData()">Clear</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">Categories</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Manage Categories</div><div class="settings-row-sub">Add custom expense & income categories</div></div>
      <button class="btn btn-secondary btn-sm" onclick="openManageCategories()">Manage</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-title">About</div>
    <div class="settings-row"><div class="settings-row-label">Version</div><span class="text-muted">1.0.0</span></div>
    <div class="settings-row"><div class="settings-row-label">Currency</div><span class="text-muted">INR (₹)</span></div>
  </div>`;
}

function afterSettings() {}

function openManageCategories() {
  const cats = DB.getCategories();
  const custom = cats.filter(c => c.custom);
  const rows = custom.length === 0
    ? '<p style="color:var(--text3);font-size:14px;padding:8px 0">No custom categories yet.</p>'
    : custom.map(c =>
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:20px">'+c.icon+'</span>' +
        '<span style="flex:1;font-size:14px;font-weight:500">'+c.name+'</span>' +
        '<span class="badge '+(c.type==='income'?'badge-green':'badge-red')+'">'+c.type+'</span>' +
        '<button class="icon-btn icon-btn-del" onclick="deleteCategory(\''+c.id+'\')">🗑️</button></div>'
      ).join('');

  openModal('Manage Categories',
    '<div style="margin-bottom:16px">' +
    '<div style="font-weight:600;font-size:14px;margin-bottom:10px">Custom Categories</div>' +
    rows + '</div>' +
    '<div style="border-top:1px solid var(--border);padding-top:16px">' +
    '<div style="font-weight:600;font-size:14px;margin-bottom:10px">Add New Category</div>' +
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Name</label>' +
        '<input class="form-input" id="cat-new-name" placeholder="e.g. Gym, Petrol" /></div>' +
      '<div class="form-group"><label class="form-label">Type</label>' +
        '<select class="form-select" id="cat-new-type">' +
          '<option value="expense">Expense</option>' +
          '<option value="income">Income</option>' +
        '</select></div>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Icon (emoji)</label>' +
        '<input class="form-input" id="cat-new-icon" placeholder="🏋️" maxlength="4" /></div>' +
      '<div class="form-group"><label class="form-label">Color</label>' +
        '<input type="color" id="cat-new-color" value="#007AFF" style="width:100%;height:40px;border-radius:8px;border:1px solid var(--border);cursor:pointer" /></div>' +
    '</div></div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-secondary" onclick="closeModal()">Close</button>' +
      '<button class="btn btn-primary" onclick="addCategory()">Add Category</button>' +
    '</div>'
  );
}

function addCategory() {
  const name  = document.getElementById('cat-new-name').value.trim();
  const type  = document.getElementById('cat-new-type').value;
  const icon  = document.getElementById('cat-new-icon').value.trim() || '📌';
  const color = document.getElementById('cat-new-color').value;
  if (!name) { showToast('Enter a category name', 'error'); return; }
  const cats = DB.getCategories();
  if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Category already exists', 'error'); return;
  }
  cats.push({ id: DB.uuid(), name, icon, color, type, custom: true });
  DB.saveCategories(cats);
  showToast('Category added: ' + name, 'success');
  openManageCategories();
}

function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  const cats = DB.getCategories().filter(c => c.id !== id);
  DB.saveCategories(cats);
  showToast('Category deleted', 'error');
  openManageCategories();
}

// ── Modals ─────────────────────────────────────────────────────────────
function openModal(title, bodyHTML, onSave) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('open');
  window._modalSave = onSave;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  window._modalSave = null;
}

function initModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) closeModal(); });
}

// ── Credit card: charge vs pay-down (from bank/UPI etc.) ───────────────
function getCreditCardCategoryId(cats) {
  return cats.find(c => c.id === 'c18' || c.name === 'Credit Card')?.id;
}
function roundMoney(n) {
  // Simple 2dp rounding - no epsilon, no paise conversion
  const v = parseFloat(n);
  return isNaN(v) ? 0 : Math.round(v * 100) / 100;
}
function toPaise(n) { return Math.round(parseFloat(n) * 100) || 0; }
function fromPaise(p) { return Math.round(p) / 100; }
function isCreditCardCharge(t) {
  return !!(t && t.payment === 'credit-card' && t.creditCardId);
}
function isCreditCardPaydown(t, cats) {
  const cc = getCreditCardCategoryId(cats);
  return !!(t && t.type === 'expense' && t.creditCardId && t.payment !== 'credit-card' && cc && t.categoryId === cc);
}
function cardDueFromTransactions(card, txns, cats) {
  const opening = toPaise(card.balance || 0);
  const charged = txns.filter(t => isCreditCardCharge(t) && t.creditCardId === card.id).reduce((s,t)=>s+toPaise(t.amount), 0);
  const paid = txns.filter(t => isCreditCardPaydown(t, cats) && t.creditCardId === card.id).reduce((s,t)=>s+toPaise(t.amount), 0);
  return fromPaise(Math.max(0, opening + charged - paid));
}
function cardsWithDue(cards, txns, cats) {
  return cards.map(c => ({ ...c, dueBalance: cardDueFromTransactions(c, txns, cats) }));
}
function normText(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function autoLinkTransaction(t, ctx) {
  const out = { ...t };
  const desc = String(out.description || '').trim();
  const descNorm = normText(desc);
  const ccCatId = getCreditCardCategoryId(ctx.cats);
  const savingsCatId = ctx.cats.find(c => c.id === 'c19' || c.name === 'Savings Goal')?.id;

  const savingsMatch = desc.match(/^Savings:\s*(.+)$/i);
  if (savingsMatch) {
    const goalName = normText(savingsMatch[1]);
    const goal = ctx.goals.find(g => normText(g.name) === goalName);
    if (goal) {
      out.goalId = goal.id;
      out.txnKind = 'goal-add';
      if (out.type === 'expense' && savingsCatId) out.categoryId = savingsCatId;
    }
  }

  const emiMatch = desc.match(/^EMI\s*-\s*(.+)$/i);
  if (emiMatch) {
    const loanName = normText(emiMatch[1]);
    const loan = ctx.loans.find(l => normText(l.name) === loanName);
    if (loan) {
      out.loanId = loan.id;
      out.txnKind = 'loan-emi';
      if (!Number.isFinite(+out.emiNo)) {
        const count = ctx.txns.filter(x => x.id !== out.id && x.txnKind === 'loan-emi' && x.loanId === loan.id).length;
        out.emiNo = count + 1;
      }
    }
  }

  const isCardPayment = out.type === 'expense' && out.payment !== 'credit-card' && ccCatId && out.categoryId === ccCatId;
  if (isCardPayment && !out.creditCardId) {
    const card = ctx.cards.find(c => {
      const last4 = String(c.last4 || '').trim();
      return (last4 && descNorm.includes(last4)) || descNorm.includes(normText(c.name)) || descNorm.includes(normText(c.bank));
    });
    if (card) out.creditCardId = card.id;
  }

  return out;
}
function backfillTransactionLinks() {
  const txns = DB.getTransactions();
  if (!txns.length) return;
  const ctx = { goals: DB.getGoals(), loans: DB.getLoans(), cards: DB.getCards(), cats: DB.getCategories(), txns };
  let changed = false;
  const next = txns.map(t => {
    const linked = autoLinkTransaction(t, ctx);
    if (JSON.stringify(linked) !== JSON.stringify(t)) changed = true;
    return linked;
  });
  if (changed) DB.saveTransactions(next);
}
function getLoanPaidEmiNumbers(loan, txns) {
  const linked = txns
    .filter(t => t.txnKind === 'loan-emi' && t.loanId === loan.id && Number.isFinite(+t.emiNo))
    .map(t => +t.emiNo);
  if (linked.length) return [...new Set(linked)].sort((a,b)=>a-b);
  if ((loan.paidEMIs || []).length) return [...new Set(loan.paidEMIs)].sort((a,b)=>a-b);
  const legacyCount = txns.filter(t => t.type === 'expense' && (t.description || '') === ('EMI - ' + loan.name)).length;
  return Array.from({ length: legacyCount }, (_, i) => i + 1);
}
function getGoalCurrentFromTransactions(goal, txns) {
  const base = +(goal.baseCurrent ?? goal.current ?? 0);
  const linkedAdds = txns
    .filter(t => t.txnKind === 'goal-add' && t.goalId === goal.id)
    .reduce((s,t) => s + (+t.amount || 0), 0);
  return +(base + linkedAdds).toFixed(2);
}
function syncPaydownCardGroup() {
  const el = document.getElementById('txn-paydown-card-group');
  const pay = document.getElementById('txn-payment');
  const typ = document.getElementById('txn-type');
  const cat = document.getElementById('txn-cat');
  if (!el || !pay || !typ || !cat) return;
  const ccCatId = getCreditCardCategoryId(DB.getCategories());
  const show = typ.value === 'expense' && pay.value !== 'credit-card' && ccCatId && cat.value === ccCatId;
  el.style.display = show ? '' : 'none';
}

// ── Add/Edit Transaction ───────────────────────────────────────────────
function openAddTransaction(editId = null) {
  const cats  = DB.getCategories();
  const cards = cardsWithDue(DB.getCards(), DB.getTransactions(), cats);
  const edit  = editId ? DB.getTransactions().find(t => t.id === editId) : null;
  const type  = edit ? edit.type : 'expense';
  const lentSub = edit ? (edit.lentSub || 'lend') : 'lend';
  const catsByType = t => cats.filter(c => c.type === t);
  const paydownSelected = edit && isCreditCardPaydown(edit, cats) ? edit.creditCardId : '';

  const ccVisible = edit && edit.payment === 'credit-card';
  const ccOpts = cards.length === 0
    ? '<p style="color:var(--orange);font-size:13px">No cards added yet.</p>'
    : '<select class="form-select" id="txn-card">' +
        cards.map((c,i) => '<option value="'+c.id+'"'+(edit && edit.payment === 'credit-card' && edit.creditCardId===c.id ? ' selected' : (!edit && i===0 ? ' selected':''))+'>'+c.bank+' \u00b7\u00b7\u00b7\u00b7 '+c.last4+' (Avail: '+DB.fmtINR(c.limit-c.dueBalance)+')</option>').join('') +
      '</select>';
  const paydownOpts = cards.length === 0
    ? '<p style="color:var(--orange);font-size:13px">No cards added yet.</p>'
    : '<select class="form-select" id="txn-paydown-card">' +
        '<option value="">— Not paying toward a card —</option>' +
        cards.map(c => '<option value="'+c.id+'"'+(paydownSelected===c.id?' selected':'')+'>'+c.bank+' \u00b7\u00b7\u00b7\u00b7 '+c.last4+'</option>').join('') +
      '</select>';

  const body =
    '<div class="type-tabs">' +
      ['expense','income','transfer','lent'].map(t =>
        '<button class="type-tab'+(type===t?' active-'+t:'')+'" onclick="switchTxnType(\''+t+'\')">'+(t==='lent'?'Lend 🤝':t.charAt(0).toUpperCase()+t.slice(1))+'</button>'
      ).join('') +
    '</div>' +

    '<input type="hidden" id="txn-lent-sub" value="lend" />' +

    '<div class="form-group">' +
      '<label class="form-label">Amount (₹)</label>' +
      '<input class="form-input" id="txn-amount" type="number" placeholder="0.00" value="'+(edit && edit.amount != null ? parseFloat(edit.amount).toFixed(2) : '')+'" step="0.01" />' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">Description</label>' +
      '<input class="form-input" id="txn-desc" type="text" placeholder="What was this for?" value="'+(edit?edit.description||'':'')+'" />' +
      '<div style="margin-top:6px;font-size:12px;color:var(--text3)">' +
        'Tip: use <strong>Savings: Goal Name</strong> or <strong>EMI - Loan Name</strong> for auto-linking.' +
      '</div>' +
    '</div>' +

    '<div id="txn-cat-group" class="form-group" style="'+(type==='transfer'||type==='lent'?'display:none':'')+'">' +
      '<label class="form-label">Category</label>' +
      '<div class="cat-chips" id="cat-chips">' +
        catsByType(type).map(c =>
          '<div class="cat-chip'+(edit && edit.categoryId===c.id?' selected':'')+'" onclick="selectCat(\''+c.id+'\',this)"><div class="chip-icon">'+c.icon+'</div><div class="chip-name">'+c.name.split(' ')[0]+'</div></div>'
        ).join('') +
      '</div>' +
    '</div>' +

    '<div id="txn-lent-group" class="form-group" style="'+(type==='lent'?'':'display:none')+'">' +
      '<label class="form-label" id="lent-person-label">Person\'s Name</label>' +
      '<input class="form-input" id="txn-lent-to" type="text" placeholder="Person\'s name" value="'+(edit?edit.lentTo||'':'')+'" />' +
      '<div id="lent-suggestions" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"></div>' +
    '</div>' +

    '<div id="txn-transfer-group" class="form-group" style="'+(type==='transfer'?'':'display:none')+'">' +
      '<label class="form-label">Transfer To</label>' +
      '<input class="form-input" id="txn-transfer-to" type="text" placeholder="Account or person" value="'+(edit?edit.transferTo||'':'')+'" />' +
    '</div>' +

    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Date</label>' +
        '<input class="form-input" id="txn-date" type="date" value="'+(edit?edit.date:DB.today())+'" /></div>' +
      '<div class="form-group"><label class="form-label">Payment Method</label>' +
        '<select class="form-select" id="txn-payment" onchange="onPaymentChange(this.value)">' +
          ['cash','debit-card','credit-card','upi','net-banking','cheque','wallet'].map(p =>
            '<option value="'+p+'"'+(edit && edit.payment===p?' selected':'')+'>'+p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())+'</option>'
          ).join('') +
        '</select></div>' +
    '</div>' +

    '<div id="cc-select-group" class="form-group" style="'+(ccVisible?'':'display:none')+'">' +
      '<label class="form-label">Select Credit Card</label>' +
      ccOpts +
    '</div>' +

    '<div id="txn-paydown-card-group" class="form-group" style="display:none">' +
      '<label class="form-label">Pay toward card (reduces card balance)</label>' +
      paydownOpts +
    '</div>' +

    '<input type="hidden" id="txn-type" value="'+type+'" />' +
    '<input type="hidden" id="txn-cat" value="'+(edit?edit.categoryId||'':'')+'" />' +
    '<input type="hidden" id="txn-id" value="'+(edit?edit.id||'':'')+'" />' +
    '<div class="modal-footer">' +
      '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveTxn()">'+(edit?'Update':'Save')+' Transaction</button>' +
    '</div>';

  openModal(edit ? 'Edit Transaction' : 'Add Transaction', body);

  // Auto-select first category
  if (!edit && type !== 'transfer' && type !== 'lent') {
    const first = catsByType(type)[0];
    if (first) {
      document.getElementById('txn-cat').value = first.id;
      document.querySelector('.cat-chip')?.classList.add('selected');
    }
  }

  // Populate lent name suggestions
  if (type === 'lent') populateLentSuggestions();
  syncPaydownCardGroup();
}


function populateLentSuggestions(sub) {
  const container = document.getElementById('lent-suggestions');
  if (!container) return;
  const txns = DB.getTransactions();
  // Unique names of people with pending lent (for settle) or all lent people
  const people = [...new Set(
    txns.filter(t => t.type === 'lent' && t.lentTo)
        .map(t => t.lentTo)
  )];
  container.innerHTML = people.map(name =>
    '<button class="filter-chip" style="font-size:12px" onclick="document.getElementById(\'txn-lent-to\').value=\''+name+'\'">'+name+'</button>'
  ).join('');
}


function openEditTransaction(id) { openAddTransaction(id); }

function onPaymentChange(val) {
  const g = document.getElementById('cc-select-group');
  if (g) g.style.display = val === 'credit-card' ? '' : 'none';
  syncPaydownCardGroup();
}

function switchTxnType(type) {
  document.getElementById('txn-type').value = type;
  document.querySelectorAll('.type-tab').forEach(b => {
    const t = b.textContent.toLowerCase().replace(' / settle','').replace(' / ','').replace('settle','settle');
    const match = b.textContent.toLowerCase().includes(type) || b.textContent.toLowerCase() === type;
    b.className = 'type-tab' + (match ? ' active-' + type : '');
  });
  document.getElementById('txn-cat-group').style.display   = (type==='transfer'||type==='lent') ? 'none' : '';
  document.getElementById('txn-lent-group').style.display   = type==='lent' ? '' : 'none';
  document.getElementById('txn-transfer-group').style.display = type==='transfer' ? '' : 'none';

  if (type === 'lent') populateLentSuggestions();

  if (type !== 'transfer' && type !== 'lent') {
    const cats = DB.getCategories().filter(c => c.type === type);
    const chips = document.getElementById('cat-chips');
    if (chips) {
      chips.innerHTML = cats.map(c =>
        '<div class="cat-chip" onclick="selectCat(\'' + c.id + '\',this)"><div class="chip-icon">' + c.icon + '</div><div class="chip-name">' + c.name.split(' ')[0] + '</div></div>'
      ).join('');
      if (cats[0]) {
        document.getElementById('txn-cat').value = cats[0].id;
        chips.querySelector('.cat-chip')?.classList.add('selected');
      }
    }
  }
  syncPaydownCardGroup();
}

function selectCat(id, el) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('txn-cat').value = id;
  syncPaydownCardGroup();
}

function saveTxn() {
  const amount  = parseFloat(document.getElementById('txn-amount').value);
  const type    = document.getElementById('txn-type').value;
  if (!amount || amount <= 0) { showToast('Enter a valid amount','error'); return; }

  const cats    = DB.getCategories();
  const payment = document.getElementById('txn-payment').value;
  const lentSub = document.getElementById('txn-lent-sub')?.value || 'lend';
  const lentTo  = document.getElementById('txn-lent-to')?.value.trim() || '';

  let catId = document.getElementById('txn-cat').value;
  if (type === 'transfer') catId = cats.find(c=>c.type==='transfer')?.id || catId;
  if (type === 'lent')     catId = cats.find(c=>c.type==='lent')?.id || catId;

  const id = document.getElementById('txn-id').value;
  const existing = id ? DB.getTransactions().find(x => x.id === id) : null;
  const ccCatId = getCreditCardCategoryId(cats);

  let creditCardId = payment === 'credit-card'
    ? (document.getElementById('txn-card')?.value || '') : '';
  if (type === 'expense' && payment !== 'credit-card' && ccCatId && catId === ccCatId) {
    const pd = document.getElementById('txn-paydown-card')?.value?.trim() || '';
    creditCardId = pd || (existing && isCreditCardPaydown(existing, cats) ? existing.creditCardId : '') || '';
  }

  // Settlement is done via the Settle button on the dashboard only.

  const t = {
    ...(existing || {}),
    id:           id || DB.uuid(),
    type,
    amount:       Math.round(amount * 100) / 100,
    categoryId:   catId,
    description:  document.getElementById('txn-desc').value,
    date:         document.getElementById('txn-date').value,
    payment,
    creditCardId,
    lentTo,
    lentSub:      '',
    transferTo:   document.getElementById('txn-transfer-to')?.value || '',
    createdAt:    existing?.createdAt || new Date().toISOString(),
  };
  let txns = DB.getTransactions();
  const ctx = { goals: DB.getGoals(), loans: DB.getLoans(), cards: DB.getCards(), cats, txns };
  const linkedTxn = autoLinkTransaction(t, ctx);
  if (id) {
    // pending is computed from transactions — no lentSettled flag needed
    txns = txns.map(x => x.id === id ? linkedTxn : x);
  } else {
    txns.unshift(linkedTxn);
  }
  DB.saveTransactions(txns);
  closeModal();
  renderTab(currentTab);
  showToast(id ? 'Transaction updated' : 'Transaction added', 'success');
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  DB.saveTransactions(DB.getTransactions().filter(t => t.id !== id));
  renderTab(currentTab);
  showToast('Deleted', 'error');
}

function settleLent(id) { openSettleByPerson(null, id); }

// Global for settle modal (avoids quote-in-onclick issues)
let _currentSettlePerson = '';

function openSettleByPerson(personName, specificId) {
  const txns = DB.getTransactions();
  if (specificId) {
    const t = txns.find(x => x.id === specificId);
    personName = t ? (t.lentTo || 'Unknown') : personName;
  }
  _currentSettlePerson = personName || '';
  const lentTotal      = txns.filter(t => t.type === 'lent' && (t.lentTo||'').toLowerCase() === (personName||'').toLowerCase()).reduce((s,t) => s+t.amount, 0);
  const recoveredTotal = txns.filter(t => t.type === 'income' && (t.lentTo||'').toLowerCase() === (personName||'').toLowerCase()).reduce((s,t) => s+t.amount, 0);
  const pending        = Math.max(0, lentTotal - recoveredTotal);

  document.getElementById('modal-title').textContent = 'Settle — ' + personName;
  document.getElementById('modal-body').innerHTML =
    '<div style="text-align:center;margin-bottom:16px">' +
      '<div style="font-size:13px;color:var(--text3)">Pending from <strong>' + personName + '</strong></div>' +
      '<div style="font-size:28px;font-weight:700;color:var(--orange)">' + DB.fmtFull(pending) + '</div>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Amount Recovered (₹)</label>' +
      '<input class="form-input" id="settle-person-amt" type="number" value="' + pending + '" />' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:8px">' +
      '<button class="btn btn-secondary btn-sm" onclick="setSettleAmt(' + pending + ')">Full Amount</button>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Recovery Date</label>' +
      '<input class="form-input" id="settle-person-date" type="date" value="' + DB.today() + '" />' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="confirmSettleByPerson()">Record Recovery</button>' +
    '</div>';
  document.getElementById('modal-overlay').classList.add('open');
}

function confirmSettleByPerson() {
  const personName = _currentSettlePerson;
  const amt  = parseFloat(document.getElementById('settle-person-amt').value);
  const date = document.getElementById('settle-person-date').value;
  if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }

  // Record settlement as an income transaction tagged with lentTo.
  // Pending = sum(lent) − sum(income tagged to person). No mutation of existing transactions.
  const cats = DB.getCategories();
  let txns = DB.getTransactions();
  txns.unshift({
    id: DB.uuid(), type: 'income', amount: amt,
    categoryId: cats.find(c=>c.name==='Other Income')?.id || 'c14',
    description: 'Recovered from ' + personName,
    date, payment: 'cash', creditCardId: '', lentTo: personName,
    transferTo: '', createdAt: new Date().toISOString(),
  });
  DB.saveTransactions(txns);
  closeModal();
  renderTab(currentTab);
  showToast('Recovery of ' + DB.fmtINR(amt) + ' from ' + personName + ' recorded ✓', 'success');
}

// ── Add Loan ───────────────────────────────────────────────────────────
function openAddLoan() {
  const body = `
  <div class="form-row">
    <div class="form-group"><label class="form-label">Loan Name</label><input class="form-input" id="l-name" placeholder="e.g. Home Loan - SBI" /></div>
    <div class="form-group"><label class="form-label">Lender</label><input class="form-input" id="l-lender" placeholder="Bank name" /></div>
  </div>
  <div class="form-group"><label class="form-label">Loan Type</label>
    <select class="form-select" id="l-type">
      ${['Home Loan','Car Loan','Personal Loan','Education Loan','Business Loan','Other'].map(t=>`<option>${t}</option>`).join('')}
    </select>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Principal (₹)</label><input class="form-input" id="l-principal" type="number" placeholder="500000" /></div>
    <div class="form-group"><label class="form-label">Annual Rate (%)</label><input class="form-input" id="l-rate" type="number" step="0.01" placeholder="8.5" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Tenure (months)</label><input class="form-input" id="l-months" type="number" placeholder="120" /></div>
    <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" id="l-start" type="date" value="${DB.today()}" /></div>
  </div>
  <div id="emi-preview" style="background:var(--blue-light);border-radius:8px;padding:12px;margin-top:4px;display:none">
    <div style="font-size:13px;color:var(--blue)">Calculated EMI: <strong id="emi-val"></strong></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveLoan()">Add Loan</button>
  </div>`;
  openModal('Add Loan', body);
  ['l-principal','l-rate','l-months'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', previewEMI);
  });
}

function previewEMI() {
  const p = parseFloat(document.getElementById('l-principal').value);
  const r = parseFloat(document.getElementById('l-rate').value);
  const m = parseInt(document.getElementById('l-months').value);
  if (p && r && m) {
    const emi = DB.calcEMI(p, r, m);
    document.getElementById('emi-val').textContent = DB.fmtFull(emi) + '/month';
    document.getElementById('emi-preview').style.display = 'block';
  }
}

function saveLoan() {
  const name = document.getElementById('l-name').value;
  const principal = parseFloat(document.getElementById('l-principal').value);
  const rate = parseFloat(document.getElementById('l-rate').value);
  const months = parseInt(document.getElementById('l-months').value);
  if (!name || !principal || !rate || !months) { showToast('Fill all required fields', 'error'); return; }
  const loans = DB.getLoans();
  loans.push({ id:DB.uuid(), name, lender:document.getElementById('l-lender').value, type:document.getElementById('l-type').value, principal, rate, months, startDate:document.getElementById('l-start').value, paidEMIs:[] });
  DB.saveLoans(loans);
  closeModal();
  renderTab('loans');
  showToast('Loan added ✓', 'success');
}

function markEMIPaid(loanId, n) {
  const loans = DB.getLoans();
  const loan = loans.find(l => l.id === loanId);
  if (!loan) return;

  const txns = DB.getTransactions();
  if (txns.some(t => t.txnKind === 'loan-emi' && t.loanId === loanId && +t.emiNo === +n)) {
    showToast('This EMI is already recorded', 'error');
    return;
  }
  const emi = DB.calcEMI(loan.principal, loan.rate, loan.months);
  txns.unshift({ id:DB.uuid(), type:'expense', amount:emi, categoryId:DB.getCategories().find(c=>c.id==='c17'||c.name==='Loan EMI')?.id||'c17', description:`EMI - ${loan.name}`, date:DB.today(), payment:'net-banking', loanId, emiNo:n, txnKind:'loan-emi', lentTo:'', transferTo:'', lentSettled:false, isSystem:true, createdAt:new Date().toISOString() });
  DB.saveTransactions(txns);
  renderTab('loans');
  showToast('EMI marked as paid ✓', 'success');
}

function deleteLoan(id) {
  if (!confirm('Delete this loan?')) return;
  DB.saveLoans(DB.getLoans().filter(l => l.id !== id));
  renderTab('loans');
  showToast('Loan deleted', 'error');
}

function toggleAmort(id) {
  const el = document.getElementById(`amort-${id}`);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── Add Card ───────────────────────────────────────────────────────────
function openAddCard(editId = null) {
  const edit = editId ? DB.getCards().find(c => c.id === editId) : null;
  const colors = ['#007AFF','#FF3B30','#34C759','#FF9500','#AF52DE','#FF2D55','#00C7BE','#5856D6'];
  const body = `
  <div class="form-row">
    <div class="form-group"><label class="form-label">Card Name</label><input class="form-input" id="cc-name" placeholder="HDFC Rewards" value="${edit?.name||''}" /></div>
    <div class="form-group"><label class="form-label">Bank</label><input class="form-input" id="cc-bank" placeholder="HDFC Bank" value="${edit?.bank||''}" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Last 4 Digits</label><input class="form-input" id="cc-last4" maxlength="4" placeholder="1234" value="${edit?.last4||''}" /></div>
    <div class="form-group"><label class="form-label">Credit Limit (₹)</label><input class="form-input" id="cc-limit" type="number" placeholder="100000" value="${edit?.limit||''}" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Current Balance (₹)</label><input class="form-input" id="cc-balance" type="number" placeholder="0" value="${edit?.balance||0}" /></div>
    <div class="form-group"><label class="form-label">Min Payment (₹)</label><input class="form-input" id="cc-min" type="number" placeholder="500" value="${edit?.minPayment||''}" /></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Interest Rate (% p.a.)</label><input class="form-input" id="cc-rate" type="number" step="0.1" placeholder="36" value="${edit?.rate||''}" /></div>
    <div class="form-group"><label class="form-label">Due Date</label><input class="form-input" id="cc-due" type="date" value="${edit?.dueDate||DB.today()}" /></div>
  </div>
  <div class="form-group"><label class="form-label">Card Color</label>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${colors.map(col=>`<div onclick="selectCardColor('${col}',this)" style="width:32px;height:32px;border-radius:50%;background:${col};cursor:pointer;border:3px solid ${(edit?.color||colors[0])===col?'white':'transparent'};box-shadow:${(edit?.color||colors[0])===col?'0 0 0 2px '+col:'none'}"></div>`).join('')}
    </div>
  </div>
  <input type="hidden" id="cc-color" value="${edit?.color||colors[0]}" />
  <input type="hidden" id="cc-id" value="${edit?.id||''}" />
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveCard()">${edit?'Update':'Add'} Card</button>
  </div>`;
  openModal(edit ? 'Edit Card' : 'Add Credit Card', body);
}

function openEditCard(id) { openAddCard(id); }

function selectCardColor(col, el) {
  document.querySelectorAll('[onclick*="selectCardColor"]').forEach(e => { e.style.borderColor='transparent'; e.style.boxShadow='none'; });
  el.style.borderColor = 'white';
  el.style.boxShadow = `0 0 0 2px ${col}`;
  document.getElementById('cc-color').value = col;
}

function saveCard() {
  const name = document.getElementById('cc-name').value;
  const limit = parseFloat(document.getElementById('cc-limit').value);
  if (!name || !limit) { showToast('Fill required fields', 'error'); return; }
  const id = document.getElementById('cc-id').value;
  const card = {
    id: id || DB.uuid(), name, bank: document.getElementById('cc-bank').value,
    last4: document.getElementById('cc-last4').value, limit,
    balance: fromPaise(toPaise(parseFloat(document.getElementById('cc-balance').value)||0)),
    minPayment: parseFloat(document.getElementById('cc-min').value)||0,
    rate: parseFloat(document.getElementById('cc-rate').value)||36,
    dueDate: document.getElementById('cc-due').value,
    color: document.getElementById('cc-color').value,
  };
  let cards = DB.getCards();
  if (id) cards = cards.map(c => c.id===id ? card : c);
  else cards.push(card);
  DB.saveCards(cards);
  closeModal();
  renderTab('cards');
  showToast(id ? 'Card updated ✓' : 'Card added ✓', 'success');
}

function openSettleCard(id) {
  const cats = DB.getCategories();
  const txns = DB.getTransactions();
  const card = cardsWithDue(DB.getCards(), txns, cats).find(c => c.id === id);
  if (!card) return;
  const due = card.dueBalance || 0;
  // Build a meaningful default description so it's clear which card was paid
  const cardLabel = card.bank + ' ···· ' + card.last4 + ' (' + card.name + ')';
  const body = `
  <div style="background:linear-gradient(135deg,${card.color},${card.color}bb);border-radius:12px;padding:14px 18px;color:white;margin-bottom:16px">
    <div style="font-size:13px;opacity:.8">${card.bank} ···· ${card.last4}</div>
    <div style="font-size:16px;font-weight:700;margin-top:2px">${card.name}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px">
      <div><div style="font-size:11px;opacity:.7">Outstanding Due</div><div style="font-size:26px;font-weight:800">${DB.fmtFull(due)}</div></div>
      <div style="text-align:right"><div style="font-size:11px;opacity:.7">Min Payment</div><div style="font-size:15px;font-weight:600">${DB.fmtFull(card.minPayment||0)}</div></div>
    </div>
  </div>
  <div class="form-group"><label class="form-label">Payment Amount (₹)</label>
    <input class="form-input" id="settle-amt" type="number" placeholder="${due}" value="${due}" step="0.01" />
  </div>
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('settle-amt').value='${due}'">Full Balance</button>
    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('settle-amt').value='${card.minPayment||0}'">Minimum</button>
  </div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Payment Date</label>
      <input class="form-input" id="settle-date" type="date" value="${DB.today()}" />
    </div>
    <div class="form-group"><label class="form-label">Payment Method</label>
      <select class="form-select" id="settle-method">
        ${['net-banking','upi','neft','imps','cheque','cash'].map(p=>'<option value="'+p+'">'+p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())+'</option>').join('')}
      </select>
    </div>
  </div>
  <div class="form-group"><label class="form-label">Description</label>
    <input class="form-input" id="settle-desc" type="text" value="CC Payment — ${cardLabel}" />
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="settleCard('${id}')">Confirm Payment</button>
  </div>`;
  openModal('Pay ' + card.name, body);
}

function settleCard(id) {
  const amt  = parseFloat(document.getElementById('settle-amt').value);
  if (!amt || amt <= 0) { showToast('Enter valid amount', 'error'); return; }
  const date   = document.getElementById('settle-date')?.value   || DB.today();
  const method = document.getElementById('settle-method')?.value || 'net-banking';
  const desc   = document.getElementById('settle-desc')?.value?.trim();

  // Find card to build fallback description
  const card = DB.getCards().find(c => c.id === id);
  const cardLabel = card ? card.bank + ' ···· ' + card.last4 + ' (' + card.name + ')' : id;
  const finalDesc = desc || ('CC Payment — ' + cardLabel);

  const txns = DB.getTransactions();
  txns.unshift({
    id: DB.uuid(), type: 'expense',
    amount: roundMoney(amt),
    categoryId: DB.getCategories().find(c=>c.id==='c18'||c.name==='Credit Card')?.id || 'c18',
    description: finalDesc,
    date, payment: method,
    creditCardId: id,        // links to the exact card — used by cardDueFromTransactions
    lentTo: '', transferTo: '', lentSettled: false, isSystem: true,
    createdAt: new Date().toISOString(),
  });
  DB.saveTransactions(txns);
  closeModal();
  renderTab('cards');
  showToast('Payment recorded for ' + cardLabel + ' ✓', 'success');
}

function deleteCard(id) {
  if (!confirm('Delete this card?')) return;
  DB.saveCards(DB.getCards().filter(c => c.id !== id));
  renderTab('cards');
  showToast('Card deleted', 'error');
}

function toggleCard(id) {
  if (expandedCards.has(id)) expandedCards.delete(id); else expandedCards.add(id);
  renderTab('cards');
}

// ── Budget & Goals ─────────────────────────────────────────────────────
function openAddBudget(editId = null) {
  const cats = DB.getCategories().filter(c => c.type === 'expense');
  const edit = editId ? DB.getBudgets().find(b => b.id === editId) : null;
  const body = `
  <div class="form-group"><label class="form-label">Category</label>
    <select class="form-select" id="b-cat">
      ${cats.map(c=>`<option value="${c.id}" ${edit?.categoryId===c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}
    </select>
  </div>
  <div class="form-group"><label class="form-label">Monthly Limit (₹)</label><input class="form-input" id="b-limit" type="number" placeholder="5000" value="${edit?.limit||''}" /></div>
  <input type="hidden" id="b-id" value="${edit?.id||''}" />
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveBudget()">${edit?'Update':'Save'} Budget</button>
  </div>`;
  openModal(edit ? 'Edit Budget' : 'Set Budget', body);
}

function openEditBudget(id) { openAddBudget(id); }

function saveBudget() {
  const catId = document.getElementById('b-cat').value;
  const limit = parseFloat(document.getElementById('b-limit').value);
  if (!limit) { showToast('Enter a limit', 'error'); return; }
  const id = document.getElementById('b-id').value;
  const b = { id: id||DB.uuid(), categoryId:catId, limit, month:budgetMonth, year:budgetYear };
  DB.upsertBudget(b);
  closeModal();
  renderTab('budget');
  showToast('Budget saved ✓', 'success');
}

function deleteBudget(id) {
  DB.saveBudgets(DB.getBudgets().filter(b => b.id !== id));
  renderTab('budget');
  showToast('Budget deleted', 'error');
}

function changeBudgetMonth(d) {
  budgetMonth += d;
  if (budgetMonth > 12) { budgetMonth = 1; budgetYear++; }
  if (budgetMonth < 1)  { budgetMonth = 12; budgetYear--; }
  renderTab('budget');
}

function openReplicateBudget() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let fromMonth = budgetMonth > 1 ? budgetMonth - 1 : 12;
  let fromYear  = budgetMonth > 1 ? budgetYear : budgetYear - 1;
  const body = `
  <p style="color:var(--text2);font-size:14px;margin-bottom:16px">Copy budgets from a source month to <strong>${months[budgetMonth-1]} ${budgetYear}</strong></p>
  <div class="form-row">
    <div class="form-group"><label class="form-label">From Month</label>
      <select class="form-select" id="rep-month">
        ${months.map((m,i)=>`<option value="${i+1}" ${fromMonth===i+1?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">From Year</label>
      <input class="form-input" id="rep-year" type="number" value="${fromYear}" />
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="replicateBudget()">Replicate</button>
  </div>`;
  openModal('Replicate Budgets', body);
}

function replicateBudget() {
  const fromMonth = parseInt(document.getElementById('rep-month').value);
  const fromYear  = parseInt(document.getElementById('rep-year').value);
  const source = DB.getBudgets().filter(b => b.month===fromMonth && b.year===fromYear);
  if (!source.length) { showToast('No budgets found for that month', 'error'); return; }
  const existing = DB.getBudgets().filter(b => b.month===budgetMonth && b.year===budgetYear);
  if (existing.length && !confirm(`${months[budgetMonth-1]} ${budgetYear} already has budgets. Overwrite?`)) return;
  source.forEach(b => DB.upsertBudget({ ...b, id:DB.uuid(), month:budgetMonth, year:budgetYear }));
  closeModal();
  renderTab('budget');
  showToast(`Replicated ${source.length} budgets ✓`, 'success');
}

function openAddGoal(editId = null) {
  const edit = editId ? DB.getGoals().find(g => g.id === editId) : null;
  const icons = ['⭐','🏠','🚗','✈️','🎓','❤️','🎁','💻','📷','🎮','💎','🌴'];
  const colors = ['#34C759','#007AFF','#FF9500','#FF3B30','#AF52DE','#00C7BE'];
  const body = `
  <div class="form-group"><label class="form-label">Goal Name</label><input class="form-input" id="g-name" placeholder="e.g. New Car" value="${edit?.name||''}" /></div>
  <div class="form-row">
    <div class="form-group"><label class="form-label">Target Amount (₹)</label><input class="form-input" id="g-target" type="number" placeholder="100000" value="${edit?.target||''}" /></div>
    <div class="form-group"><label class="form-label">Already Saved (₹)</label><input class="form-input" id="g-current" type="number" placeholder="0" value="${edit?.current||0}" /></div>
  </div>
  <div class="form-group"><label class="form-label">Target Date</label><input class="form-input" id="g-date" type="date" value="${edit?.targetDate||''}" /></div>
  <div class="form-group"><label class="form-label">Icon</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${icons.map(ic=>`<div onclick="selectGoalIcon('${ic}',this)" style="width:36px;height:36px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;border:2px solid ${(edit?.icon||'⭐')===ic?'var(--blue)':'transparent'}">${ic}</div>`).join('')}
    </div>
  </div>
  <input type="hidden" id="g-icon" value="${edit?.icon||'⭐'}" />
  <div class="form-group"><label class="form-label">Color</label>
    <div style="display:flex;gap:8px">
      ${colors.map(c=>`<div onclick="selectGoalColor('${c}',this)" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${(edit?.color||colors[0])===c?'white':'transparent'};box-shadow:${(edit?.color||colors[0])===c?'0 0 0 2px '+c:'none'}"></div>`).join('')}
    </div>
  </div>
  <input type="hidden" id="g-color" value="${edit?.color||colors[0]}" />
  <input type="hidden" id="g-id" value="${edit?.id||''}" />
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveGoal()">${edit?'Update':'Save'} Goal</button>
  </div>`;
  openModal(edit ? 'Edit Goal' : 'New Savings Goal', body);
}

function openEditGoal(id) { openAddGoal(id); }

function selectGoalIcon(ic, el) {
  document.querySelectorAll('[onclick*="selectGoalIcon"]').forEach(e => e.style.borderColor='transparent');
  el.style.borderColor = 'var(--blue)';
  document.getElementById('g-icon').value = ic;
}

function selectGoalColor(c, el) {
  document.querySelectorAll('[onclick*="selectGoalColor"]').forEach(e => { e.style.borderColor='transparent'; e.style.boxShadow='none'; });
  el.style.borderColor='white'; el.style.boxShadow=`0 0 0 2px ${c}`;
  document.getElementById('g-color').value = c;
}

function saveGoal() {
  const name = document.getElementById('g-name').value;
  const target = parseFloat(document.getElementById('g-target').value);
  if (!name || !target) { showToast('Fill required fields', 'error'); return; }
  const id = document.getElementById('g-id').value;
  const baseCurrent = parseFloat(document.getElementById('g-current').value)||0;
  const g = { id:id||DB.uuid(), name, target, current:baseCurrent, baseCurrent, targetDate:document.getElementById('g-date').value, icon:document.getElementById('g-icon').value, color:document.getElementById('g-color').value };
  let goals = DB.getGoals();
  if (id) goals = goals.map(x => x.id===id ? g : x); else goals.push(g);
  DB.saveGoals(goals);
  closeModal();
  renderTab('goals');
  showToast(id?'Goal updated ✓':'Goal added ✓','success');
}

function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  DB.saveGoals(DB.getGoals().filter(g => g.id !== id));
  renderTab('goals');
  showToast('Goal deleted','error');
}

function openAddToGoal(id) {
  const goal = DB.getGoals().find(g => g.id === id);
  if (!goal) return;
  const body = `
  <p style="color:var(--text2);margin-bottom:12px">Add funds to <strong>${goal.name}</strong></p>
  <div class="form-group"><label class="form-label">Amount (₹)</label><input class="form-input" id="add-amt" type="number" placeholder="1000" /></div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="addToGoal('${id}')">Add Funds</button>
  </div>`;
  openModal('Add Funds', body);
}

function addToGoal(id) {
  const amt = parseFloat(document.getElementById('add-amt').value);
  if (!amt || amt <= 0) { showToast('Enter valid amount', 'error'); return; }
  const g = DB.getGoals().find(x => x.id === id);
  if (!g) { showToast('Goal not found', 'error'); return; }
  // Add transaction
  const txns = DB.getTransactions();
  txns.unshift({ id:DB.uuid(), type:'expense', amount:roundMoney(amt), categoryId:DB.getCategories().find(c=>c.id==='c19'||c.name==='Savings Goal')?.id||'c19', description:'Savings: '+g.name, date:DB.today(), payment:'net-banking', goalId:id, txnKind:'goal-add', lentTo:'', transferTo:'', lentSettled:false, isSystem:true, createdAt:new Date().toISOString() });
  DB.saveTransactions(txns);
  closeModal();
  renderTab('goals');
  showToast('Funds added ✓', 'success');
}

// ── Settings Actions ───────────────────────────────────────────────────
function setPin() {
  const body = `
  <div class="form-group"><label class="form-label">New 6-digit PIN</label><input class="form-input" id="new-pin" type="password" maxlength="6" inputmode="numeric" /></div>
  <div class="form-group"><label class="form-label">Confirm PIN</label><input class="form-input" id="confirm-pin" type="password" maxlength="6" inputmode="numeric" /></div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="savePin()">Set PIN</button>
  </div>`;
  openModal('Set PIN', body);
}

function changePin() { setPin(); }

function removePin() {
  if (!confirm('Remove PIN? App will open without a lock screen.')) return;
  DB.clearPin();
  showToast('PIN removed');
  renderTab('settings');
}

function savePin() {
  const p1 = document.getElementById('new-pin').value;
  const p2 = document.getElementById('confirm-pin').value;
  if (p1.length < 4) { showToast('PIN must be at least 4 digits','error'); return; }
  if (p1 !== p2) { showToast("PINs don't match",'error'); return; }
  DB.setPin(p1);
  closeModal();
  showToast('PIN set ✓','success');
  renderTab('settings');
}

function handleImportJSON(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      DB.importJSON(e.target.result);
      renderTab(currentTab);
      showToast('Backup restored ✓','success');
    } catch(err) {
      showToast('Import failed: invalid JSON','error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function handleImportCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const count = DB.importTransactionsCSV(e.target.result);
      renderTab(currentTab);
      showToast('Imported ' + count + ' transactions ✓','success');
    } catch(err) {
      showToast('CSV import failed: ' + err.message,'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function clearAllData() {
  if (!confirm('This will permanently delete ALL your data. Are you absolutely sure?')) return;
  if (!confirm('Last chance — this cannot be undone!')) return;
  Object.values(DB.KEYS).forEach(k => localStorage.removeItem(k));
  showToast('All data cleared','error');
  renderTab(currentTab);
}

function switchSumChart(type) {
  if (charts.sumTrend) charts.sumTrend.destroy();
  const data = DB.monthlyTotals(6);
  const ctx = document.getElementById('sum-trend');
  if (!ctx) return;
  const isLine = type === 'line';
  document.getElementById('chart-bar-btn')?.classList.toggle('active', !isLine);
  document.getElementById('chart-line-btn')?.classList.toggle('active', isLine);
  charts.sumTrend = new Chart(ctx, {
    type: isLine ? 'line' : 'bar',
    data: { labels:data.map(d=>d.label), datasets:[
      { label:'Income',  data:data.map(d=>d.income),  borderColor:'#12B76A', backgroundColor:isLine?'rgba(18,183,106,.1)':'rgba(18,183,106,.8)', borderWidth:2, fill:isLine, tension:.4, borderRadius:4 },
      { label:'Expense', data:data.map(d=>d.expense), borderColor:'#F04438', backgroundColor:isLine?'rgba(240,68,56,.1)':'rgba(240,68,56,.8)',  borderWidth:2, fill:isLine, tension:.4, borderRadius:4 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>DB.fmtINR(v)}}} }
  });
}

function toggleDrill(id) {
  drillCat = drillCat === id ? null : id;
  renderTab('summary');
}

// ── Toast ──────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  backfillTransactionLinks();
  initNav();
  initModal();
  if (DB.hasPin()) {
    // PIN exists — show auth screen and wire up numpad
    initAuth();
    document.getElementById('auth-screen').style.display = 'flex';
  } else {
    // No PIN — go straight to app
    document.getElementById('main-app').style.display = 'flex';
    renderTab('dashboard');
  }
});
