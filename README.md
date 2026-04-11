# Xpense — Personal Finance Web App

A privacy-first, offline personal finance tracker built with vanilla HTML, CSS, and JavaScript. No accounts, no servers, no cloud — all your data lives in your browser.

---

## Features

### 🔐 PIN Lock
Protect your financial data with a 6-digit PIN. Set, change, or remove your PIN at any time from Settings. The app locks automatically and requires the PIN to re-enter.

### 📊 Dashboard
Get a snapshot of your current month at a glance — income, expenses, pending lent amounts, and net balance. View spending by category and your most recent transactions.

### 💸 Transactions
Log and manage all your financial activity:
- **Types supported:** Expense, Income, Transfer, Lent (money given to someone)
- **Filter** by type, payment method, month, or year
- **Search** transactions by description or category
- Edit or delete any transaction

### 🏦 Loans
Track active loans with EMI schedules. View outstanding balance, next due date, and repayment progress for each loan.

### 💳 Cards
Manage credit cards — track balances, credit limits, and log charges or payments against each card.

### 📅 Budget
Set monthly spending budgets per category. Visual progress bars show how much of each budget has been used, with configurable alert thresholds.

### 🎯 Goals
Create and track savings goals. Add contributions over time and monitor progress toward your target amount.

### 📈 Summary
View income vs. expense trends over a selected period with charts. Export your summary as a PDF.

### ⚙️ Settings
- **PIN Security** — set, change, or remove your PIN lock
- **Custom Categories** — add your own expense and income categories with a custom icon and colour
- **Export** — download transactions as CSV, or export a full backup as JSON
- **Import** — restore a CSV of transactions or a full JSON backup
- **Clear All Data** — permanently wipe everything from local storage

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, responsive layout) |
| Logic | Vanilla JavaScript (ES6+) |
| Charts | [Chart.js 4.4.1](https://www.chartjs.org/) |
| Fonts | DM Sans & DM Mono (Google Fonts) |
| Storage | Browser `localStorage` |
| Currency | INR (₹) |

---

## Getting Started

No build step or installation required.

1. Download or clone this repository.
2. Open `index.html` in any modern browser.
3. On first launch, set a PIN or skip to go straight to the app.

```
XpenseWeb/
├── index.html   # App shell & layout
├── app.js       # All UI rendering and interaction logic
├── data.js      # Data layer (localStorage CRUD, export/import helpers)
└── style.css    # All styles
```

> **Note:** Because data is stored in `localStorage`, it is tied to the browser and device you use. Clearing browser data or using a different browser will result in an empty app — use the JSON export/import feature to back up and restore your data.

---

## Data & Privacy

- All data is stored locally in your browser's `localStorage`. Nothing is sent to any server.
- The PIN is stored as a simple hash (not a cryptographic hash) — it is a convenience lock, not a security guarantee.
- Use **Export Full Backup JSON** regularly to avoid data loss.

---
