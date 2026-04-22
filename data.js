// ── Data Layer ──────────────────────────────────────────────────────
'use strict';

const DB = {
  // ── Keys ──────────────────────────────────────────────────────────
  KEYS: {
    transactions: 'xpense_txns',
    categories:   'xpense_cats',
    cards:        'xpense_cards',
    loans:        'xpense_loans',
    budgets:      'xpense_budgets',
    goals:        'xpense_goals',
    settings:     'xpense_settings',
    pin:          'xpense_pin',
  },

  // ── Default categories ────────────────────────────────────────────
  DEFAULT_CATEGORIES: [
    { id:'c01', name:'Food & Dining',  icon:'🍽️', color:'#FF6B6B', type:'expense' },
    { id:'c02', name:'Transport',      icon:'🚗', color:'#4ECDC4', type:'expense' },
    { id:'c03', name:'Shopping',       icon:'🛍️', color:'#45B7D1', type:'expense' },
    { id:'c04', name:'Utilities',      icon:'⚡', color:'#FFA07A', type:'expense' },
    { id:'c05', name:'Health',         icon:'❤️', color:'#FF69B4', type:'expense' },
    { id:'c06', name:'Entertainment',  icon:'🎬', color:'#9B59B6', type:'expense' },
    { id:'c07', name:'Education',      icon:'📚', color:'#3498DB', type:'expense' },
    { id:'c08', name:'Rent',           icon:'🏠', color:'#E67E22', type:'expense' },
    { id:'c09', name:'Groceries',      icon:'🛒', color:'#27AE60', type:'expense' },
    { id:'c10', name:'Insurance',      icon:'🛡️', color:'#7F8C8D', type:'expense' },
    { id:'c11', name:'Salary',         icon:'💰', color:'#2ECC71', type:'income'  },
    { id:'c12', name:'Freelance',      icon:'💻', color:'#1ABC9C', type:'income'  },
    { id:'c13', name:'Investment',     icon:'📈', color:'#F39C12', type:'income'  },
    { id:'c14', name:'Other Income',   icon:'➕', color:'#16A085', type:'income'  },
    { id:'c15', name:'Transfer',       icon:'↔️', color:'#5856D6', type:'transfer'},
    { id:'c16', name:'Lent',           icon:'🤝', color:'#FF9500', type:'lent'   },
    { id:'c17', name:'Loan EMI',       icon:'🏦', color:'#6C5CE7', type:'expense' },
    { id:'c18', name:'Credit Card',    icon:'💳', color:'#0984E3', type:'expense' },
    { id:'c19', name:'Savings Goal',    icon:'🎯', color:'#00B894', type:'expense' },
  ],

  // ── Load / Save ────────────────────────────────────────────────────
  load(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },

  save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  // ── Getters ────────────────────────────────────────────────────────
  getTransactions() {
    const txns = this.load(this.KEYS.transactions);
    // Clean floating-point drifted amounts on every read
    return txns.map(t => ({ ...t, amount: Math.round(parseFloat(t.amount) * 100) / 100 }));
  },
  getCategories()   {
    const saved = this.load(this.KEYS.categories, null);
    if (!saved) return this.DEFAULT_CATEGORIES;
    // Always ensure system default categories exist (merge missing ones by id)
    const savedIds = new Set(saved.map(c => c.id));
    const missing  = this.DEFAULT_CATEGORIES.filter(c => !savedIds.has(c.id));
    return missing.length ? [...saved, ...missing] : saved;
  },
  getCards()    { return this.load(this.KEYS.cards); },
  getLoans()    { return this.load(this.KEYS.loans); },
  getBudgets()  { return this.load(this.KEYS.budgets); },
  getGoals()    { return this.load(this.KEYS.goals); },
  getSettings() {
    return this.load(this.KEYS.settings, {
      requirePIN: false, pinHash: '', notificationsEnabled: true,
      budgetAlertPercent: 80, advancedLoanView: true,
      multipleCardsEnabled: true, autoBackupEnabled: false,
      autoBackupHour: 2, autoBackupMinute: 0,
    });
  },

  // ── Setters ────────────────────────────────────────────────────────
  saveTransactions(d) { this.save(this.KEYS.transactions, d); },
  saveCategories(d)   { this.save(this.KEYS.categories, d); },
  saveCards(d)        { this.save(this.KEYS.cards, d); },
  saveLoans(d)        { this.save(this.KEYS.loans, d); },
  saveBudgets(d)      { this.save(this.KEYS.budgets, d); },
  saveGoals(d)        { this.save(this.KEYS.goals, d); },
  saveSettings(d)     { this.save(this.KEYS.settings, d); },

  // ── PIN ────────────────────────────────────────────────────────────
  // Uses SHA-256 via the Web Crypto API (available in all modern browsers).
  // setPin / verifyPin are async; callers must await them.
  async hashPIN(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async setPin(pin)    { localStorage.setItem(this.KEYS.pin, await this.hashPIN(pin)); },
  getPin()             { return localStorage.getItem(this.KEYS.pin); },
  async verifyPin(pin) { return this.getPin() === await this.hashPIN(pin); },
  hasPin()             { return !!this.getPin(); },
  clearPin()           { localStorage.removeItem(this.KEYS.pin); },

  // ── Helpers ────────────────────────────────────────────────────────
  uuid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); },
  today() { return new Date().toISOString().slice(0, 10); },

  fmtINR(n) {
    const abs = Math.abs(n);
    const inr2 = { style:'currency', currency:'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 };
    let str;
    if (abs >= 1e7) str = '₹' + (n / 1e7).toFixed(2) + 'Cr';
    else if (abs >= 1e5) str = '₹' + (n / 1e5).toFixed(2) + 'L';
    else str = new Intl.NumberFormat('en-IN', inr2).format(n);
    return str;
  },

  fmtFull(n) {
    return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  },

  fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  },

  monthName(m) {
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m];
  },

  // ── Loan calculator ────────────────────────────────────────────────
  calcEMI(principal, annualRate, months) {
    let emi;
    if (!annualRate) emi = principal / months;
    else {
      const r = annualRate / 12 / 100;
      emi = principal * r * Math.pow(1+r, months) / (Math.pow(1+r, months) - 1);
    }
    return +(emi.toFixed(2));
  },

  amortSchedule(principal, annualRate, months, startDate) {
    const entries = [];
    const r = annualRate / 12 / 100;
    const emi = this.calcEMI(principal, annualRate, months);
    let balance = principal;
    const start = new Date(startDate);
    for (let i = 1; i <= months; i++) {
      const interest = balance * r;
      const princ = emi - interest;
      balance = Math.max(balance - princ, 0);
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      entries.push({ n: i, date: d.toISOString().slice(0,10), emi, principal: princ, interest, balance });
    }
    return entries;
  },

  // ── Analytics ─────────────────────────────────────────────────────
  monthlyTotals(months = 6) {
    const txns = this.getTransactions();
    const result = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth(), y = d.getFullYear();
      const filtered = txns.filter(t => {
        const td = new Date(t.date);
        return td.getMonth() === m && td.getFullYear() === y;
      });
      result.push({
        label: this.monthName(m),
        income: filtered.filter(t => t.type === 'income' && !t.lentTo).reduce((s, t) => s + t.amount, 0),
        expense: filtered.filter(t => t.type === 'expense' || t.type === 'transfer').reduce((s, t) => s + t.amount, 0) + Math.max(0, filtered.filter(t=>t.type==='lent').reduce((s,t)=>s+t.amount,0) - filtered.filter(t=>t.type==='income'&&t.lentTo).reduce((s,t)=>s+t.amount,0)),
      });
    }
    return result;
  },

  catTotals(txns) {
    const cats = this.getCategories();
    const map = {};
    // Include expense, transfer, and lent (net of recoveries) in category breakdown
    txns.filter(t => t.type === 'expense' || t.type === 'transfer').forEach(t => {
      map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
    });
    // Lent: use net pending per lentTo person, bucketed under the Lent category
    const lentCat = cats.find(c => c.type === 'lent');
    if (lentCat) {
      const lentGiven     = txns.filter(t => t.type === 'lent').reduce((s,t) => s+t.amount, 0);
      const lentRecovered = txns.filter(t => t.type === 'income' && t.lentTo).reduce((s,t) => s+t.amount, 0);
      const netLent = lentGiven - lentRecovered;
      if (netLent > 0) map[lentCat.id] = (map[lentCat.id] || 0) + netLent;
    }
    return Object.entries(map)
      .map(([id, total]) => ({ cat: cats.find(c => c.id === id), total }))
      .filter(x => x.cat && x.total > 0)
      .sort((a, b) => b.total - a.total);
  },

  // ── Export ────────────────────────────────────────────────────────
  exportJSON() {
    const data = {
      transactions: this.getTransactions(),
      categories:   this.getCategories().filter(c => c.custom),
      cards:        this.getCards(),
      loans:        this.getLoans(),
      budgets:      this.getBudgets(),
      goals:        this.getGoals(),
      exportedAt:   new Date().toISOString(),
      version:      '1.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xpense_backup_${this.today()}.json`;
    a.click();
  },

  exportCSV() {
    const txns = this.getTransactions();
    const cats = this.getCategories();
    let csv = 'Date,Type,Category,Amount,Payment,Description,Lent To,Transfer To\n';
    txns.sort((a,b) => b.date.localeCompare(a.date)).forEach(t => {
      const cat = cats.find(c => c.id === t.categoryId);
      csv += `${t.date},${t.type},${cat?.name||''},${t.amount},${t.payment||''},"${t.description||''}",${t.lentTo||''},${t.transferTo||''}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xpense_transactions_${this.today()}.csv`;
    a.click();
  },

  importJSON(text) {
    const data = JSON.parse(text);
    // Validate top-level shape — must be a plain object, not an array or primitive
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid backup format');
    }
    if (data.transactions) {
      if (!Array.isArray(data.transactions)) throw new Error('Invalid transactions data');
      const existing = this.getTransactions();
      const existingIds = new Set(existing.map(t => t.id));
      const merged = [...existing, ...data.transactions.filter(t => t && typeof t === 'object' && !existingIds.has(t.id))];
      this.saveTransactions(merged);
    }
    if (data.categories && data.categories.length) {
      if (!Array.isArray(data.categories)) throw new Error('Invalid categories data');
      // Merge imported custom categories with current list
      const current = this.getCategories();
      const currentIds = new Set(current.map(c => c.id));
      const toAdd = data.categories.filter(c => c && typeof c === 'object' && c.custom && !currentIds.has(c.id));
      if (toAdd.length) this.saveCategories([...current, ...toAdd]);
    }
    if (data.cards) {
      if (!Array.isArray(data.cards)) throw new Error('Invalid cards data');
      const existing = this.getCards();
      const eIds = new Set(existing.map(c => c.id));
      this.saveCards([...existing, ...data.cards.filter(c => c && typeof c === 'object' && !eIds.has(c.id))]);
    }
    if (data.loans) {
      if (!Array.isArray(data.loans)) throw new Error('Invalid loans data');
      const existing = this.getLoans();
      const eIds = new Set(existing.map(l => l.id));
      this.saveLoans([...existing, ...data.loans.filter(l => l && typeof l === 'object' && !eIds.has(l.id))]);
    }
    if (data.budgets) data.budgets.forEach(b => this.upsertBudget(b));
    if (data.goals) {
      if (!Array.isArray(data.goals)) throw new Error('Invalid goals data');
      const existing = this.getGoals();
      const eIds = new Set(existing.map(g => g.id));
      this.saveGoals([...existing, ...data.goals.filter(g => g && typeof g === 'object' && !eIds.has(g.id))]);
    }
  },

  upsertBudget(b) {
    const budgets = this.getBudgets();
    const idx = budgets.findIndex(x => x.categoryId === b.categoryId && x.month === b.month && x.year === b.year);
    if (idx >= 0) budgets[idx] = b; else budgets.push(b);
    this.saveBudgets(budgets);
  },


  exportCSV() {
    const txns = this.getTransactions().sort((a,b) => b.date.localeCompare(a.date));
    const cats = this.getCategories();
    let csv = 'Date,Type,Category,Amount,Payment,Description,Lent To,Transfer To\n';
    txns.forEach(t => {
      const cat = cats.find(c => c.id === t.categoryId);
      const desc = (t.description||'').replace(/"/g,'""');
      csv += `"${t.date}","${t.type}","${cat?.name||''}","${t.amount}","${t.payment||''}","${desc}","${t.lentTo||''}","${t.transferTo||''}"\n`;
    });
    this._download(new Blob([csv],{type:'text/csv'}), `xpense_transactions_${this.today()}.csv`);
  },

  exportJSON() {
    const data = {
      transactions: this.getTransactions(),
      categories:   this.getCategories().filter(c => c.custom),
      cards:        this.getCards(),
      loans:        this.getLoans(),
      budgets:      this.getBudgets(),
      goals:        this.getGoals(),
      exportedAt:   new Date().toISOString(),
      version:      '1.0',
    };
    this._download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), `xpense_backup_${this.today()}.json`);
  },

  exportPDF(period) {
    const now = new Date();
    const allTxns = this.getTransactions();   // full history — for all-time pending
    let txns = allTxns.slice();               // period-filtered copy
    if (period === 'month') {
      txns = txns.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (period === '3m') {
      const since = new Date(now); since.setMonth(since.getMonth() - 3);
      txns = txns.filter(t => new Date(t.date) >= since);
    } else if (period === '6m') {
      const since = new Date(now); since.setMonth(since.getMonth() - 6);
      txns = txns.filter(t => new Date(t.date) >= since);
    } else if (period === 'year') {
      txns = txns.filter(t => new Date(t.date).getFullYear() === now.getFullYear());
    }

    const cats = this.getCategories();

    // ── Period metrics ────────────────────────────────────────────────
    const income       = txns.filter(t=>t.type==='income'&&!t.lentTo).reduce((s,t)=>s+t.amount,0);
    const expenseOnly  = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const transfer     = txns.filter(t=>t.type==='transfer').reduce((s,t)=>s+t.amount,0);
    const expense      = expenseOnly + transfer;
    const lentGiven    = txns.filter(t=>t.type==='lent').reduce((s,t)=>s+t.amount,0);
    const lentRecovered= txns.filter(t=>t.type==='income'&&t.lentTo).reduce((s,t)=>s+t.amount,0);
    const lentNet      = Math.max(0, lentGiven - lentRecovered); // period net lent
    const net          = income - expense - lentNet;

    // ── All-time pending — person-wise breakdown ──────────────────────
    const personMap = {};
    allTxns.forEach(t => {
      const name = (t.lentTo || '').trim();
      if (!name) return;
      if (t.type === 'lent') {
        personMap[name] = (personMap[name] || 0) + t.amount;
      } else if (t.type === 'income' && t.lentTo) {
        personMap[name] = (personMap[name] || 0) - t.amount;
      }
    });
    const allTimePending = Math.max(0, Object.values(personMap).reduce((s,v)=>s+v,0));
    const pendingPersonRows = Object.entries(personMap)
      .filter(([,v]) => v > 0)
      .sort((a,b) => b[1]-a[1])
      .map(([name,amt]) =>
        `<tr><td>👤 ${name}</td><td style="font-weight:700;color:#F79009;text-align:right">${this.fmtFull(amt)}</td></tr>`
      ).join('');

    const catTotals = this.catTotals(txns).slice(0,10)
      .map(({cat,total}) => `<tr><td>${cat.icon} ${cat.name}</td><td style="font-weight:700;color:#F04438;text-align:right">${this.fmtFull(total)}</td></tr>`).join('');

    const rows = [...txns].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,200).map(t => {
      const cat = cats.find(c=>c.id===t.categoryId);
      const color = t.type==='income'?'#12B76A':t.type==='lent'?'#F79009':'#F04438';
      const isSettlement = t.type==='income' && t.lentTo;
      const typeLabel = isSettlement ? 'settle' : t.type;
      const amtColor  = isSettlement ? '#12B76A' : color;
      return `<tr>
        <td>${this.fmtDate(t.date)}</td>
        <td><span style="background:${color}22;color:${color};padding:2px 7px;border-radius:8px;font-size:11px;font-weight:600">${typeLabel}</span></td>
        <td>${cat?.icon||''} ${cat?.name||''}</td>
        <td style="font-weight:700;color:${amtColor};text-align:right">${t.type==='income'?'+':'−'}${this.fmtFull(t.amount)}</td>
        <td>${(t.payment||'').replace(/-/g,' ')}</td>
        <td>${t.description||''}</td>
        <td>${t.lentTo||t.transferTo||''}</td>
      </tr>`;
    }).join('');

    const periodLabel = {month:'This Month','3m':'Last 3 Months','6m':'Last 6 Months',year:'This Year',all:'All Time'}[period] || period || 'All Time';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Xpense Report</title>
    <style>
      *{box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;margin:0;padding:32px;color:#0F1629}
      h1{font-size:28px;font-weight:800;color:#0D75F8;margin-bottom:4px}
      .sub{color:#5A6278;font-size:13px;margin-bottom:28px}
      .section-label{font-size:11px;font-weight:700;color:#5A6278;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}
      .kpis{display:flex;gap:14px;margin-bottom:8px;flex-wrap:wrap}
      .kpi{background:#F7F8FC;border-radius:12px;padding:16px 20px;min-width:140px}
      .kpi-l{font-size:11px;color:#5A6278;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
      .kpi-v{font-size:22px;font-weight:800}
      .kpi-note{font-size:10px;color:#9AA3B8;margin-top:3px}
      h2{font-size:16px;font-weight:700;margin:24px 0 10px;color:#0F1629;border-bottom:2px solid #E4E7EF;padding-bottom:6px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#0D75F8;color:white;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
      td{padding:7px 10px;border-bottom:1px solid #E4E7EF;vertical-align:middle}
      tr:nth-child(even) td{background:#F7F8FC}
      .lent-table th{background:#F79009}
      @media print{body{padding:16px}h2{page-break-before:auto}}
    </style></head><body>
    <h1>₹ Xpense Report</h1>
    <div class="sub">Generated ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})} · Period: ${periodLabel}</div>

    <div class="section-label">Period Summary — ${periodLabel}</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-l">Income</div><div class="kpi-v" style="color:#12B76A">${this.fmtFull(income)}</div></div>
      <div class="kpi"><div class="kpi-l">Expenses</div><div class="kpi-v" style="color:#F04438">${this.fmtFull(expense)}</div><div class="kpi-note">incl. transfers</div></div>
      <div class="kpi"><div class="kpi-l">Net Savings</div><div class="kpi-v" style="color:${net>=0?'#12B76A':'#F04438'}">${this.fmtFull(net)}</div></div>
      ${lentGiven>0?`<div class="kpi"><div class="kpi-l">Lent (period)</div><div class="kpi-v" style="color:#F79009">${this.fmtFull(lentGiven)}</div><div class="kpi-note">given in period</div></div>`:''}
      ${lentRecovered>0?`<div class="kpi"><div class="kpi-l">Recovered (period)</div><div class="kpi-v" style="color:#12B76A">${this.fmtFull(lentRecovered)}</div><div class="kpi-note">settled in period</div></div>`:''}
      ${lentNet>0?`<div class="kpi"><div class="kpi-l">Net Lent (period)</div><div class="kpi-v" style="color:#F79009">${this.fmtFull(lentNet)}</div><div class="kpi-note">given minus settled</div></div>`:''}
    </div>

    ${allTimePending > 0 ? `
    <div style="margin-top:20px">
      <div class="section-label">All-Time Pending Lent — Total Outstanding</div>
      <div class="kpis">
        <div class="kpi" style="background:#FEF3C7;border:1.5px solid #F79009">
          <div class="kpi-l" style="color:#B45309">Total Pending (all time)</div>
          <div class="kpi-v" style="color:#D97706">${this.fmtFull(allTimePending)}</div>
          <div class="kpi-note" style="color:#B45309">across all persons, since inception</div>
        </div>
      </div>
      ${pendingPersonRows ? `
      <h2 style="color:#B45309;border-bottom-color:#F79009">Pending by Person (All Time)</h2>
      <table class="lent-table"><thead><tr><th>Person</th><th style="text-align:right">Pending Amount</th></tr></thead>
      <tbody>${pendingPersonRows}</tbody></table>` : ''}
    </div>` : ''}

    <h2>Top Spending Categories</h2>
    <table><thead><tr><th>Category</th><th style="text-align:right">Amount</th></tr></thead><tbody>${catTotals}</tbody></table>

    <h2>Transactions — ${periodLabel} (${txns.length})</h2>
    <table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th style="text-align:right">Amount</th><th>Payment</th><th>Description</th><th>Person</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    const w = window.open('','_blank');
    if (!w) { alert('Please allow popups to export PDF'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },

  importTransactionsCSV(text) {
    const cats = this.getCategories();
    const lines = text.trim().split('\n');
    const dataLines = lines[0].toLowerCase().includes('date') ? lines.slice(1) : lines;
    let added = 0;
    const existing = this.getTransactions();
    const txns = [...existing];
    dataLines.forEach(line => {
      if (!line.trim()) return;
      // Handle quoted CSV
      const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
      const clean = s => (s||'').replace(/^"|"$/g,'').trim();
      const dateStr = clean(cols[0]);
      const typeRaw = clean(cols[1]).toLowerCase();
      const catName = clean(cols[2]).slice(0, 100);
      const amount  = parseFloat(clean(cols[3]).replace(/[^0-9.]/g,''));
      // Validate date is a real ISO date (YYYY-MM-DD) to prevent injection
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(new Date(dateStr).getTime())) return;
      if (isNaN(amount) || amount <= 0) return;
      const type = ['expense','income','transfer','lent'].includes(typeRaw) ? typeRaw : 'expense';
      const cat  = cats.find(c => c.name.toLowerCase() === catName.toLowerCase()) || cats.find(c => c.type === type) || cats[0];
      txns.push({
        id: this.uuid(), type, amount,
        categoryId:  cat?.id || '',
        date:        dateStr,
        payment:     (clean(cols[4]) || 'cash').slice(0, 50),
        description: clean(cols[5]).slice(0, 200) || '',
        lentTo:      clean(cols[6]).slice(0, 100) || '',
        transferTo:  clean(cols[7]).slice(0, 100) || '',
        lentSettled: false,
        createdAt:   new Date().toISOString(),
      });
      added++;
    });
    this.saveTransactions(txns);
    return added;
  },

  _download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  spentInCategory(catId, month, year) {
    return this.getTransactions()
      .filter(t => {
        // Parse as local noon to avoid UTC date-shift at month boundaries.
        const d = new Date(t.date);
        return t.categoryId === catId && t.type === 'expense' &&
               d.getMonth() + 1 === month && d.getFullYear() === year;
      })
      .reduce((s, t) => s + t.amount, 0);
  },
};
