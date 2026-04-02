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
  getTransactions() { return this.load(this.KEYS.transactions); },
  getCategories()   {
    const saved = this.load(this.KEYS.categories, null);
    return saved || this.DEFAULT_CATEGORIES;
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
  hashPIN(pin) {
    // Simple hash for web (not crypto-grade, use as convenience lock only)
    let h = 0;
    for (let i = 0; i < pin.length; i++) {
      h = Math.imul(31, h) + pin.charCodeAt(i) | 0;
    }
    return h.toString(36);
  },
  setPin(pin)       { localStorage.setItem(this.KEYS.pin, this.hashPIN(pin)); },
  getPin()          { return localStorage.getItem(this.KEYS.pin); },
  verifyPin(pin)    { return this.getPin() === this.hashPIN(pin); },
  hasPin()          { return !!this.getPin(); },
  clearPin()        { localStorage.removeItem(this.KEYS.pin); },

  // ── Helpers ────────────────────────────────────────────────────────
  uuid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); },
  today() { return new Date().toISOString().slice(0, 10); },

  fmtINR(n) {
    const abs = Math.abs(n);
    let str;
    if (abs >= 1e7) str = '₹' + (n / 1e7).toFixed(2) + 'Cr';
    else if (abs >= 1e5) str = '₹' + (n / 1e5).toFixed(2) + 'L';
    else str = new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits: 0 }).format(n);
    return str;
  },

  fmtFull(n) {
    return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR' }).format(n);
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
    if (!annualRate) return principal / months;
    const r = annualRate / 12 / 100;
    return principal * r * Math.pow(1+r, months) / (Math.pow(1+r, months) - 1);
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
        income: filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: filtered.filter(t => t.type === 'expense' || t.type === 'lent' || t.type === 'transfer').reduce((s, t) => s + t.amount, 0),
      });
    }
    return result;
  },

  catTotals(txns) {
    const cats = this.getCategories();
    const map = {};
    txns.filter(t => t.type === 'expense').forEach(t => {
      map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([id, total]) => ({ cat: cats.find(c => c.id === id), total }))
      .filter(x => x.cat)
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
    if (data.transactions) {
      const existing = this.getTransactions();
      const existingIds = new Set(existing.map(t => t.id));
      const merged = [...existing, ...data.transactions.filter(t => !existingIds.has(t.id))];
      this.saveTransactions(merged);
    }
    if (data.cards) {
      const existing = this.getCards();
      const eIds = new Set(existing.map(c => c.id));
      this.saveCards([...existing, ...data.cards.filter(c => !eIds.has(c.id))]);
    }
    if (data.loans) {
      const existing = this.getLoans();
      const eIds = new Set(existing.map(l => l.id));
      this.saveLoans([...existing, ...data.loans.filter(l => !eIds.has(l.id))]);
    }
    if (data.budgets) data.budgets.forEach(b => this.upsertBudget(b));
    if (data.goals) {
      const existing = this.getGoals();
      const eIds = new Set(existing.map(g => g.id));
      this.saveGoals([...existing, ...data.goals.filter(g => !eIds.has(g.id))]);
    }
  },

  upsertBudget(b) {
    const budgets = this.getBudgets();
    const idx = budgets.findIndex(x => x.categoryId === b.categoryId && x.month === b.month && x.year === b.year);
    if (idx >= 0) budgets[idx] = b; else budgets.push(b);
    this.saveBudgets(budgets);
  },

  spentInCategory(catId, month, year) {
    return this.getTransactions()
      .filter(t => {
        const d = new Date(t.date);
        return t.categoryId === catId && t.type === 'expense' &&
               d.getMonth() + 1 === month && d.getFullYear() === year;
      })
      .reduce((s, t) => s + t.amount, 0);
  },
};

  // ── PDF Export (print dialog) ────────────────────────────────────
  exportPDF(txns, cats, period) {
    const rows = (txns || this.getTransactions()).sort((a,b)=>b.date.localeCompare(a.date)).map(t => {
      const cat = (cats || this.getCategories()).find(c => c.id === t.categoryId);
      const color = t.type==='income'?'#12B76A':t.type==='lent'?'#F79009':'#F04438';
      return `<tr>
        <td>${this.fmtDate(t.date)}</td>
        <td><span style="background:${color}22;color:${color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${t.type}</span></td>
        <td>${cat?.icon||''} ${cat?.name||'Unknown'}</td>
        <td style="font-weight:700;color:${color}">${t.type==='income'?'+':'−'}${this.fmtFull(t.amount)}</td>
        <td>${(t.payment||'').replace(/-/g,' ')}</td>
        <td>${t.description||''}</td>
        <td>${t.lentTo||t.transferTo||''}</td>
      </tr>`;
    }).join('');

    const allTxns = txns || this.getTransactions();
    const income  = allTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expense = allTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const lent    = allTxns.filter(t=>t.type==='lent'&&!t.lentSettled).reduce((s,t)=>s+t.amount,0);
    const catTotals = this.catTotals(allTxns).slice(0,8).map(({cat,total})=>
      `<tr><td>${cat.icon} ${cat.name}</td><td style="font-weight:700;color:#F04438">${this.fmtFull(total)}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Xpense Report</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;margin:0;padding:40px;color:#0F1629}
      h1{font-size:32px;font-weight:800;color:#0D75F8;margin-bottom:4px}
      .sub{color:#5A6278;font-size:14px;margin-bottom:32px}
      .kpis{display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap}
      .kpi{background:#F7F8FC;border-radius:12px;padding:16px 24px;min-width:140px}
      .kpi-l{font-size:12px;color:#5A6278;text-transform:uppercase;letter-spacing:.5px}
      .kpi-v{font-size:22px;font-weight:800;margin-top:4px}
      h2{font-size:18px;font-weight:700;margin:24px 0 12px;color:#0F1629}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#0D75F8;color:white;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
      td{padding:9px 12px;border-bottom:1px solid #E4E7EF}
      tr:nth-child(even) td{background:#F7F8FC}
      @media print{body{padding:20px}}
    </style></head><body>
    <h1>₹ Xpense Report</h1>
    <div class="sub">Generated on ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}${period?' · '+period:''}</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-l">Total Income</div><div class="kpi-v" style="color:#12B76A">${this.fmtFull(income)}</div></div>
      <div class="kpi"><div class="kpi-l">Total Expenses</div><div class="kpi-v" style="color:#F04438">${this.fmtFull(expense)}</div></div>
      <div class="kpi"><div class="kpi-l">Net Savings</div><div class="kpi-v" style="color:${income-expense>=0?'#12B76A':'#F04438'}">${this.fmtFull(income-expense)}</div></div>
      ${lent>0?`<div class="kpi"><div class="kpi-l">Pending Lent</div><div class="kpi-v" style="color:#F79009">${this.fmtFull(lent)}</div></div>`:''}
    </div>
    <h2>Top Spending Categories</h2>
    <table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${catTotals}</tbody></table>
    <h2>All Transactions (${allTxns.length})</h2>
    <table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Payment</th><th>Description</th><th>Person</th></tr></thead>
    <tbody>${rows}</tbody></table>
    </body></html>`;

    const win = window.open('','_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  },

  // ── Import Transactions from CSV ─────────────────────────────────
  importTransactionsCSV(text) {
    const cats = this.getCategories();
    const lines = text.trim().split('\n');
    // Skip header row
    const dataLines = lines[0].toLowerCase().includes('date') ? lines.slice(1) : lines;
    let imported = 0, skipped = 0;
    const existing = this.getTransactions();
    const newTxns = [...existing];

    dataLines.forEach(line => {
      if (!line.trim()) return;
      // Parse CSV properly (handle quoted fields)
      const cols = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch==='"') { inQ=!inQ; }
        else if (ch===',' && !inQ) { cols.push(cur.trim()); cur=''; }
        else cur+=ch;
      }
      cols.push(cur.trim());

      const date      = cols[0]?.replace(/"/g,'').trim();
      const typeRaw   = cols[1]?.replace(/"/g,'').trim().toLowerCase();
      const catName   = cols[2]?.replace(/"/g,'').trim();
      // Support both 4-col (no catID) and 5-col (with catID) CSV formats
      let amountStr   = cols[3]?.replace(/"/g,'').trim();
      let paymentStr  = cols[4]?.replace(/"/g,'').trim() || '';
      let descStr     = cols[5]?.replace(/"/g,'').trim() || '';
      let lentTo      = cols[7]?.replace(/"/g,'').trim() || '';
      let transferTo  = cols[8]?.replace(/"/g,'').trim() || '';

      // If col3 looks like a UUID, it's catID from our own export — shift
      if (cols[3] && cols[3].length > 20 && cols[3].includes('-')) {
        amountStr  = cols[4]?.replace(/"/g,'').trim();
        paymentStr = cols[5]?.replace(/"/g,'').trim() || '';
        descStr    = cols[6]?.replace(/"/g,'').trim() || '';
        lentTo     = cols[8]?.replace(/"/g,'').trim() || '';
        transferTo = cols[9]?.replace(/"/g,'').trim() || '';
      }

      const amount = parseFloat(amountStr);
      if (!date || isNaN(amount) || amount <= 0) { skipped++; return; }

      const typeMap = { expense:'expense', income:'income', transfer:'transfer', lent:'lent' };
      const type = typeMap[typeRaw] || 'expense';

      // Match category by name
      const cat = cats.find(c => c.name.toLowerCase() === catName?.toLowerCase()) ||
                  cats.find(c => c.type === type) ||
                  cats[0];

      newTxns.unshift({
        id: this.uuid(),
        type, amount,
        categoryId: cat?.id || '',
        description: descStr,
        date: this.normalizeDate(date),
        payment: paymentStr || 'cash',
        lentTo: lentTo || '',
        transferTo: transferTo || '',
        lentSettled: false,
        createdAt: new Date().toISOString(),
      });
      imported++;
    });

    this.saveTransactions(newTxns);
    return { imported, skipped };
  },

  normalizeDate(str) {
    // Handle dd/MM/yyyy, dd-MM-yyyy, yyyy-MM-dd, MM/dd/yyyy
    if (!str) return this.today();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[\/\-\.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return str; // already yyyy-mm-dd
      if (parseInt(parts[2]) > 31) {
        // MM/DD/YYYY or DD/MM/YYYY — assume DD/MM/YYYY for Indian format
        return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      }
      return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return this.today();
  },
};
