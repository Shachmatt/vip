// ── Constants ────────────────────────────────────────────────────────────────
let daysBefore      = 200;
// ── Portfolio & trading state ─────────────────────────────────────────────────
let portfolioBalance = 10000;
// One trade slot per company (index matches COMPANIES order)
const trades = [0,1,2,3].map(() => ({
  hasBought:      false,
  buyPrice:       0,
  buyShares:      0,
  buyInvested:    0,
  sellTarget:     0,
  intrinsicAtBuy: 0
}));
// Last completed sale per company (shown in portfolio cards after closing)
const lastSales = [null, null, null, null];
let histDays        = 200;
let valueImp        = 0.01;   // mean-reversion strength
const VOL_BASE      = 0.05;   // base volatility (scaled by intrinsic per company)
let fcfVolatility   = 0.1;

// Shared mutable state used by value() / changeComp() / reverseComp()
let company = { value: 200, growth: 1.002 };

// ── Company definitions ──────────────────────────────────────────────────────
// All monetary values in millions; scaled ×1e6 inside runSimulation.
const COMPANIES = [
  {
    name:        "Investigo a.s.",
    description: "Czech financial holding specialising in private equity, alternative investments, and wealth management. Generates steady cash flows and rewards shareholders with a growing dividend. Best valued using the Gordon Growth Model.",
    type:        3,           // Gordon growth model
    stockNum:    1.5,
    FCF:         [30, 33, 36],
    YoY:         0.10,
    growth:      0.04,
    assets:      150,
    debts:       20,
    EBITDA:      55,
    field:       3,
    cash:        4,
    dividend:    10,
    divGrowth:   0.02,
    startPrice:  100
  },
  {
    name:        "TechGrow s.r.o.",
    description: "High-growth Central European SaaS and cloud-services firm targeting SME clients. Reinvests all earnings into R&D and expansion — pays no dividend. Intrinsic value is best captured by discounting projected free cash flows (DCF).",
    type:        2,           // DCF — high-growth tech
    stockNum:    2,
    FCF:         [15, 22, 32],
    YoY:         0.25,
    growth:      0.08,
    assets:      80,
    debts:       30,
    EBITDA:      25,
    field:       12,
    cash:        20,
    dividend:    0,
    divGrowth:   0,
    startPrice:  60
  },
  {
    name:        "ValueCorp a.s.",
    description: "Diversified asset-holding company owning industrial real estate, logistics infrastructure, and minority stakes in listed businesses. Value is driven by the balance sheet rather than near-term earnings — NAV is the standard approach.",
    type:        1,           // NAV — asset-heavy holding
    stockNum:    3,
    FCF:         [20, 21, 22],
    YoY:         0.04,
    growth:      0.02,
    assets:      600,
    debts:       150,
    EBITDA:      45,
    field:       6,
    cash:        30,
    dividend:    3,
    divGrowth:   0.01,
    startPrice:  150
  },
  {
    name:        "Industrial a.s.",
    description: "Traditional Czech manufacturer of precision components for automotive and aerospace clients. Stable EBITDA margins and predictable capex make the EV/EBITDA market-multiple approach the industry standard for this sector.",
    type:        4,           // Market multiple — manufacturing
    stockNum:    2,
    FCF:         [35, 37, 39],
    YoY:         0.06,
    growth:      0.02,
    assets:      350,
    debts:       100,
    EBITDA:      80,
    field:       6,
    cash:        25,
    dividend:    4,
    divGrowth:   0.02,
    startPrice:  200
  }
];

// ── EV/EBITDA reference multiples by sector ───────────────────────────────────
const INDUSTRY_MULTIPLES = [
  { sector: 'Technology / SaaS',   low: 15, high: 30 },
  { sector: 'Healthcare',           low: 12, high: 20 },
  { sector: 'Consumer Staples',     low: 10, high: 16 },
  { sector: 'Financials',           low:  8, high: 15 },
  { sector: 'Industrials / Mfg.',   low:  5, high: 12 },
  { sector: 'Utilities',            low:  7, high: 12 },
  { sector: 'Energy',               low:  4, high:  9 },
  { sector: 'Real Estate',          low: 14, high: 22 },
];

// ── Valuation helpers ────────────────────────────────────────────────────────
function value(compan) {
  if      (compan.type === 1) company.value = nav(compan.assets, compan.debts, compan.stockNum);
  else if (compan.type === 2) company.value = DCF(compan.YoY, compan.FCF, compan.growth, compan.cash, compan.debts, compan.stockNum);
  else if (compan.type === 3) company.value = gordon(compan.dividend, compan.divGrowth, compan.YoY);
  else                        company.value = market(compan.EBITDA, compan.field, compan.cash, compan.debts, compan.stockNum);
  return company.value;
}

function nav(assets, debts, shares)            { return (assets - debts) / shares; }
function gordon(dividend, divGrowth, YoY)      { return dividend / (YoY - divGrowth); }
function market(EBITDA, field, cash, debts, shares) { return ((EBITDA * field) - debts + cash) / shares; }

function DCF(discountRate, cashFlows, terminalGrowthRate, cash, debts, shares) {
  if (cashFlows.length !== 3) throw new Error("cashFlows must have exactly 3 values.");
  if (discountRate <= terminalGrowthRate) throw new Error("Discount rate must exceed terminal growth rate.");
  let pv = 0;
  for (let i = 0; i < 3; i++) pv += cashFlows[i] / Math.pow(1 + discountRate, i + 1);
  let tv  = (cashFlows[2] * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
  let pvt = tv / Math.pow(1 + discountRate, 3);
  return nav(pv + pvt + cash, debts, shares);
}

function changeComp(trade, komp) {
  let dg = (1 + komp.YoY) ** (1 / 365);
  komp.assets   *= dg;
  komp.EBITDA   *= dg;
  komp.cash     *= dg;
  komp.dividend *= (1 + komp.divGrowth) ** (1 / 365);
  for (let i = 0; i < komp.FCF.length; i++) komp.FCF[i] *= dg;
  company.value  = value(komp);
  return (company.value - trade) * valueImp;
}

function reverseComp(komp) {
  let dg = (1 + komp.YoY) ** (1 / 365);
  komp.assets   /= dg;
  komp.EBITDA   /= dg;
  komp.cash     /= dg;
  komp.dividend /= (1 + komp.divGrowth) ** (1 / 365);
  for (let i = 0; i < komp.FCF.length; i++) komp.FCF[i] /= dg;
  return value(komp);
}

function logistical(x) { return 3.99999 * x * (1 - x); }

function minusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

// ── Core simulation ──────────────────────────────────────────────────────────
function runSimulation(cfg) {
  // Scale a deep copy of the config (all monetary values ×1e6)
  let lComp = {
    ...cfg,
    stockNum: cfg.stockNum * 1e6,
    assets:   cfg.assets   * 1e6,
    debts:    cfg.debts    * 1e6,
    EBITDA:   cfg.EBITDA   * 1e6,
    cash:     cfg.cash     * 1e6,
    FCF:      cfg.FCF.map(v => v * 1e6)
  };
  let lCompStart = JSON.parse(JSON.stringify(lComp));

  // Independent random seeds per company
  let lt = Math.random(), lQr = Math.random();
  let ltH = Math.random(), lQrH = Math.random();

  let intrinsic0 = value(lComp);
  let lVol = VOL_BASE * intrinsic0;

  // ── Forward (present → future) ───────────────────────────────────────────
  let lxee = [], lyee = [], lsnaps = [];
  let lCV = cfg.startPrice;
  let snap = s => ({ intrinsic: company.value, fcf: lComp.FCF[0],
                     ebitda: lComp.EBITDA, assets: lComp.assets,
                     debts: lComp.debts, cash: lComp.cash, dividend: lComp.dividend });

  // Day 0 — record startPrice exactly, noise begins from day 1
  lxee.push(minusDays(daysBefore - 1));
  lyee.push(lCV);
  company.value = intrinsic0;
  lsnaps.push(snap());

  let le = 1, cQ = 0;
  for (let i = 0; i < daysBefore - 1; i++) {
    cQ++;
    le   = logistical(lt);
    lCV += (lt * lVol * 2) - lVol;
    lCV += changeComp(lCV, lComp);

    if (cQ === 91) {
      let qg = Math.pow(1 + lComp.YoY, 0.25);
      for (let j = 0; j < lComp.FCF.length; j++) {
        lComp.FCF[j] *= qg * (1 + (lQr * 2 - 1) * fcfVolatility);
        lQr = logistical(lQr);
      }
      cQ = 0;
    }

    lyee.push(lCV);
    lsnaps.push(snap());
    lt = le;
    lxee.push(minusDays(daysBefore - i - 2));
  }

  // ── Backward (present → past) ────────────────────────────────────────────
  let lCompH = JSON.parse(JSON.stringify(lCompStart));
  let hPrices = [], hDates = [], hSnaps = [];
  let pH = lyee[0], cQH = 0;

  for (let i = 0; i < histDays; i++) {
    cQH++;
    if (cQH === 91) {
      let qg = Math.pow(1 + lCompH.YoY, 0.25);
      for (let j = 0; j < lCompH.FCF.length; j++) {
        lCompH.FCF[j] /= qg * (1 + (lQrH * 2 - 1) * fcfVolatility);
        lQrH = logistical(lQrH);
      }
      cQH = 0;
    }

    let intr  = reverseComp(lCompH);
    let eH    = logistical(ltH);
    let noise = (ltH * lVol * 2) - lVol;
    ltH = eH;

    pH += noise + (intr - pH) * valueImp;
    pH = Math.max(pH, 1);

    hPrices.push(pH);
    hDates.push(minusDays(daysBefore + i));
    hSnaps.push({ intrinsic: intr, fcf: lCompH.FCF[0],
                  ebitda: lCompH.EBITDA, assets: lCompH.assets,
                  debts: lCompH.debts, cash: lCompH.cash, dividend: lCompH.dividend });
  }

  hPrices.reverse(); hDates.reverse(); hSnaps.reverse();

  return {
    name:      cfg.name,
    stockNum:  lComp.stockNum,  // scaled (for Market Cap calc)
    xee:       hDates.concat(lxee),
    yee:       hPrices.concat(lyee),
    snapshots: hSnaps.concat(lsnaps)
  };
}

// Pre-simulate every company once at load time
const allSimData = COMPANIES.map(runSimulation);

// ── Active data pointers ─────────────────────────────────────────────────────
let activeIdx = 0;
let xee = allSimData[0].xee;
let yee = allSimData[0].yee;
let snapshots = allSimData[0].snapshots;

// ── Chart ────────────────────────────────────────────────────────────────────
let chart = new Chart("first", {
  type: "line",
  data: {
    labels:   xee.slice(0, 100),
    datasets: [{
      fill:            false,
      tension:         0,
      backgroundColor: "#850F8D",
      borderColor:     "#850F8D",
      data:            yee.slice(0, 100)
    }]
  },
  options: {
    animation: false,
    plugins: {
      title: {
        display: true,
        text:    COMPANIES[0].name,
        color:   "#850f8d",
        font:    { size: 30 }
      },
      legend: { display: false }
    },
    scales: {
      y: { ticks: { color: "#850F8D" }, grid: { color: "#850f8d48" } },
      x: { ticks: { color: "#850F8D" }, grid: { display: false } }
    }
  }
});

// ── Animation / playback ─────────────────────────────────────────────────────
let windowSize   = 100;
let windowStart  = 0;
let animInterval = null;
const ANIM_SPEED = 40;

function showWindow() {
  let end = windowStart + windowSize;
  chart.data.labels.splice(0, chart.data.labels.length,
    ...xee.slice(windowStart, end));
  chart.data.datasets[0].data.splice(0, chart.data.datasets[0].data.length,
    ...yee.slice(windowStart, end));
  chart.update();
  updateTable();
  updateTradingDisplay();
  updatePortfolioCharts();
}

function jumpToView(n) {
  stopAnim();
  let rightEdge = windowStart + windowSize;   // preserve current "now"
  windowStart   = Math.max(0, rightEdge - n);
  windowSize    = rightEdge - windowStart;    // may be < n early in history — right edge never moves
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn' + n).classList.add('active');
  showWindow();
}

function playForward() {
  if (!trades.some(t => t.hasBought)) return;
  stopAnim();
  ['btnPlay','portBtnPlay'].forEach(id => {
    let el = document.getElementById(id); if (el) el.classList.add('active');
  });
  animInterval = setInterval(() => {
    if (windowStart + windowSize >= xee.length) { stopAnim(); return; }
    windowStart++;
    showWindow();
    // Check auto-sell for every company that has an open position
    let idx = windowStart + windowSize - 1;
    trades.forEach((t, ci) => {
      if (t.hasBought && allSimData[ci].yee[idx] >= t.sellTarget) sellStock(true, ci);
    });
  }, ANIM_SPEED);
}

function playBackward() {
  stopAnim();
  ['btnBack','portBtnBack'].forEach(id => {
    let el = document.getElementById(id); if (el) el.classList.add('active');
  });
  animInterval = setInterval(() => {
    if (windowStart <= 0) { stopAnim(); return; }
    windowStart--;
    showWindow();
  }, ANIM_SPEED);
}

function stopAnim() {
  if (animInterval) { clearInterval(animInterval); animInterval = null; }
  ['btnPlay','btnBack','portBtnPlay','portBtnBack'].forEach(id => {
    let el = document.getElementById(id); if (el) el.classList.remove('active');
  });
}

// ── Company switching ────────────────────────────────────────────────────────
function switchCompany(idx) {
  stopAnim();
  activeIdx  = idx;
  xee        = allSimData[idx].xee;
  yee        = allSimData[idx].yee;
  snapshots  = allSimData[idx].snapshots;
  // windowStart / windowSize are preserved — time is shared across all companies

  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', i === idx));
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));

  chart.options.plugins.title.text = allSimData[idx].name;
  updateDescription(idx);
  updateTradePanelForCompany(idx);
  showWindow();
}

// ── Info table ───────────────────────────────────────────────────────────────
function updateTable() {
  let idx   = windowStart + windowSize - 1;
  let snap  = snapshots[idx];
  let price = yee[idx];
  if (!snap || price == null) return;

  // Top valuation card
  let premium = (price - snap.intrinsic) / snap.intrinsic * 100;
  document.getElementById('tDate').textContent      = xee[idx];
  document.getElementById('tPrice').textContent     = price.toFixed(2);
  document.getElementById('tIntrinsic').textContent = snap.intrinsic.toFixed(2);
  let premEl = document.getElementById('tPremium');
  premEl.textContent = (premium >= 0 ? '+' : '') + premium.toFixed(1) + '%';
  premEl.style.color = premium >= 0 ? '#c0392b' : '#27ae60';
  document.getElementById('tFCF').textContent = (snap.fcf / 1e6).toFixed(1) + ' M';

  // Key statistics
  const M = v => (v / 1e6).toFixed(1) + ' M';
  document.getElementById('sEBITDA').textContent    = M(snap.ebitda);
  document.getElementById('sAssets').textContent    = M(snap.assets);
  document.getElementById('sDebts').textContent     = M(snap.debts);
  document.getElementById('sCash').textContent      = M(snap.cash);
  document.getElementById('sDividend').textContent  = snap.dividend.toFixed(2);
  document.getElementById('sShares').textContent    = (allSimData[activeIdx].stockNum / 1e6).toFixed(2) + ' M';
  document.getElementById('sMarketCap').textContent = M(price * allSimData[activeIdx].stockNum);

  // Historical FCF + Dividend (91-day lookback per quarter)
  [0, 91, 182, 273].forEach((offset, i) => {
    let pi = idx - offset;
    let ok = pi >= 0 && snapshots[pi];
    document.getElementById('fcq' + i).textContent = ok ? M(snapshots[pi].fcf) : '—';
    let dEl = document.getElementById('dq' + i);
    if (dEl) dEl.textContent = ok ? snapshots[pi].dividend.toFixed(2) : '—';
  });
}

// ── Trading ───────────────────────────────────────────────────────────────────

// Live share estimate while typing amount
function updateShareEstimate() {
  let idx   = windowStart + windowSize - 1;
  let price = yee[idx];
  let amt   = parseFloat(document.getElementById('tradeInvest').value);
  let el    = document.getElementById('shareEstimate');
  if (!el) return;
  el.textContent = (!isNaN(amt) && amt > 0 && price)
    ? '≈ ' + (amt / price).toFixed(4) + ' shares at current price'
    : '';
}

function buyStock() {
  let idx   = windowStart + windowSize - 1;
  let price = yee[idx];
  if (price == null) return;

  let t = trades[activeIdx];
  if (t.hasBought) { alert('You already hold a position in this company.'); return; }

  let amount = parseFloat(document.getElementById('tradeInvest').value);
  let target = parseFloat(document.getElementById('tradeSellTarget').value);
  if (isNaN(amount) || amount <= 0) { alert('Enter a valid investment amount.'); return; }
  if (isNaN(target) || target <= 0) { alert('Enter a valid sell target price.'); return; }
  if (amount > portfolioBalance)    { alert('Insufficient funds. Available: ' + portfolioBalance.toFixed(2)); return; }

  portfolioBalance -= amount;
  t.hasBought   = true;
  t.buyPrice    = price;
  t.buyShares   = amount / price;
  t.buyInvested = amount;
  t.sellTarget  = target;

  lastSales[activeIdx] = null;
  t.intrinsicAtBuy = snapshots[windowStart + windowSize - 1].intrinsic;
  ['btnPlay','portBtnPlay'].forEach(id => {
    let el = document.getElementById(id); if (el) el.disabled = false;
  });
  document.getElementById('btnBuy').disabled           = true;
  document.getElementById('btnSellNow').disabled       = false;
  document.getElementById('tradeInvest').disabled      = true;
  document.getElementById('tradeSellTarget').disabled  = true;
  document.getElementById('tradeResult').innerHTML     = '';
  document.getElementById('shareEstimate').textContent = '';
  updateBalanceDisplay();
  updateTradingDisplay();
}

function sellStock(auto, compIdx) {
  if (compIdx === undefined) compIdx = activeIdx;
  let t = trades[compIdx];
  if (!t.hasBought) return;

  let idx      = windowStart + windowSize - 1;
  let price    = allSimData[compIdx].yee[idx];
  let proceeds = price * t.buyShares;
  let pnl      = proceeds - t.buyInvested;
  let pct      = (price - t.buyPrice) / t.buyPrice * 100;
  let sign     = pnl >= 0;

  portfolioBalance += proceeds;

  // Record the sale so the portfolio card can display it afterwards
  lastSales[compIdx] = {
    soldPrice: price, shares: t.buyShares, invested: t.buyInvested,
    buyPrice: t.buyPrice, pnl, pct, sign,
    intrinsicAtBuy: t.intrinsicAtBuy,
    sellTarget: t.sellTarget
  };

  // Update the trade panel only when this is the company currently on screen
  if (compIdx === activeIdx) {
    document.getElementById('tradeResult').innerHTML =
      `<span class="tr-label">Trade closed ${auto ? '(auto-sell at target)' : '(manual sell)'}</span><br>` +
      `${COMPANIES[compIdx].name} &mdash; Invested&nbsp;<b>${t.buyInvested.toFixed(2)}</b>&nbsp;` +
      `(${t.buyShares.toFixed(4)}&nbsp;shares&nbsp;@&nbsp;${t.buyPrice.toFixed(2)})<br>` +
      `Sold&nbsp;@&nbsp;<b>${price.toFixed(2)}</b>&emsp;` +
      `P&amp;L:&nbsp;<b class="${sign?'pnl-pos':'pnl-neg'}">${sign?'+':''}${pnl.toFixed(2)}&nbsp;(${sign?'+':''}${pct.toFixed(1)}%)</b>` +
      `&emsp;Portfolio:&nbsp;<b>${portfolioBalance.toFixed(2)}</b>`;
    document.getElementById('tradeLive').innerHTML      = '';
    document.getElementById('btnBuy').disabled          = false;
    document.getElementById('btnSellNow').disabled      = true;
    document.getElementById('tradeInvest').disabled     = false;
    document.getElementById('tradeSellTarget').disabled = false;
  }

  // Clear this company's position
  t.hasBought = false; t.buyPrice = 0; t.buyShares = 0;
  t.buyInvested = 0;   t.sellTarget = 0;

  // If no positions remain, disable Forward and stop animation
  if (!trades.some(t => t.hasBought)) {
    stopAnim();
    ['btnPlay','portBtnPlay'].forEach(id => {
      let el = document.getElementById(id); if (el) el.disabled = true;
    });
  }

  updateBalanceDisplay();
  updatePortfolioCharts();   // always refresh cards so sold/held state shows immediately
}

function updateBalanceDisplay() {
  let el = document.getElementById('balanceAmt');
  if (!el) return;
  el.textContent = portfolioBalance.toLocaleString('cs-CZ',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let totalInvested = trades.reduce((s, t) => s + (t.hasBought ? t.buyInvested : 0), 0);
  let invEl = document.getElementById('balanceInvested');
  if (invEl) invEl.textContent = totalInvested > 0
    ? 'invested: ' + totalInvested.toFixed(2) : '';
}

function updateDescription(idx) {
  let el = document.getElementById('companyDesc');
  if (el) el.textContent = COMPANIES[idx].description;
}

// Called when switching company: sync buy/sell buttons to that company's trade state
function updateTradePanelForCompany(idx) {
  let t = trades[idx];
  document.getElementById('btnBuy').disabled           = t.hasBought;
  document.getElementById('btnSellNow').disabled       = !t.hasBought;
  document.getElementById('tradeInvest').disabled      = t.hasBought;
  document.getElementById('tradeSellTarget').disabled  = t.hasBought;
  document.getElementById('tradeLive').innerHTML       = '';
  document.getElementById('tradeResult').innerHTML     = '';
  updateTradingDisplay();
}

function updateTradingDisplay() {
  let t = trades[activeIdx];
  if (!t.hasBought) return;

  let idx   = windowStart + windowSize - 1;
  let price = yee[idx];
  if (price == null) return;

  let pnl  = (price - t.buyPrice) * t.buyShares;
  let pct  = (price - t.buyPrice) / t.buyPrice * 100;
  let sign = pnl >= 0;

  let openCount = trades.filter(t => t.hasBought).length;
  let badge = openCount > 1
    ? `&nbsp;<span class="held-badge">${openCount} positions open</span>` : '';

  document.getElementById('tradeLive').innerHTML =
    `Invested&nbsp;<b>${t.buyInvested.toFixed(2)}</b>&nbsp;` +
    `(${t.buyShares.toFixed(4)}&nbsp;shares&nbsp;@&nbsp;${t.buyPrice.toFixed(2)}) &mdash; ` +
    `Now:&nbsp;<b>${price.toFixed(2)}</b>&nbsp;|&nbsp;` +
    `P&amp;L:&nbsp;<b class="${sign?'pnl-pos':'pnl-neg'}">${sign?'+':''}${pnl.toFixed(2)}&nbsp;` +
    `(${sign?'+':''}${pct.toFixed(1)}%)</b>&nbsp;|&nbsp;` +
    `Target:&nbsp;<b>${t.sellTarget.toFixed(2)}</b>${badge}`;
}

// ── End-investing summary ─────────────────────────────────────────────────────
function endInvesting() {
  stopAnim();
  // Close every open position at the current price
  trades.forEach((t, ci) => { if (t.hasBought) sellStock(false, ci); });
  showSummaryPage();
}

function showSummaryPage() {
  const START    = 10000;
  const finalBal = portfolioBalance;
  const totalPnl = finalBal - START;
  const totalPct = totalPnl / START * 100;
  const tSign    = totalPnl >= 0;

  // ── trade cards ──────────────────────────────────────────────────────────
  let cards = '';
  let tradedCount = 0;

  COMPANIES.forEach((comp, i) => {
    let ls = lastSales[i];
    if (!ls) return;
    tradedCount++;

    // How far below/above intrinsic the user bought
    let vsIntrinsic   = ls.intrinsicAtBuy > 0
      ? (ls.buyPrice - ls.intrinsicAtBuy) / ls.intrinsicAtBuy * 100 : 0;
    let boughtBelow   = vsIntrinsic <= 0;
    let vsLabel       = boughtBelow
      ? `<span class="pnl-pos">${Math.abs(vsIntrinsic).toFixed(1)}% below intrinsic</span>`
      : `<span class="pnl-neg">${Math.abs(vsIntrinsic).toFixed(1)}% above intrinsic</span>`;

    // How the sell target compared to intrinsic at buy
    let tgtVsIntr     = ls.intrinsicAtBuy > 0
      ? (ls.sellTarget - ls.intrinsicAtBuy) / ls.intrinsicAtBuy * 100 : 0;
    let tgtAbove      = tgtVsIntr >= 0;
    let tgtLabel      = tgtAbove
      ? `<span class="pnl-pos">${Math.abs(tgtVsIntr).toFixed(1)}% above intrinsic</span> — aimed for a premium`
      : `<span class="pnl-neg">${Math.abs(tgtVsIntr).toFixed(1)}% below intrinsic</span> — exited before fair value`;

    cards += `
      <div class="sum-card">
        <div class="sum-card-header">
          <span class="sum-comp-name" style="color:${COMP_COLORS[i]}">${comp.name}</span>
          <span class="sum-pnl ${ls.sign?'pnl-pos':'pnl-neg'}">${ls.sign?'+':''}${ls.pnl.toFixed(2)}&nbsp;(${ls.sign?'+':''}${ls.pct.toFixed(1)}%)</span>
        </div>
        <div class="sum-row">
          <div class="sum-cell">
            <div class="sum-cell-label">Invested</div>
            <div class="sum-cell-value">${ls.invested.toFixed(2)}</div>
            <div class="sum-cell-sub">${ls.shares.toFixed(4)} shares @ ${ls.buyPrice.toFixed(2)}</div>
          </div>
          <div class="sum-cell">
            <div class="sum-cell-label">Sold at</div>
            <div class="sum-cell-value">${ls.soldPrice.toFixed(2)}</div>
            <div class="sum-cell-sub">proceeds&nbsp;${(ls.soldPrice * ls.shares).toFixed(2)}</div>
          </div>
          <div class="sum-cell">
            <div class="sum-cell-label">Intrinsic at buy</div>
            <div class="sum-cell-value">${ls.intrinsicAtBuy.toFixed(2)}</div>
            <div class="sum-cell-sub">you bought ${vsLabel}</div>
          </div>
          <div class="sum-cell">
            <div class="sum-cell-label">Your sell target</div>
            <div class="sum-cell-value">${ls.sellTarget.toFixed(2)}</div>
            <div class="sum-cell-sub">${tgtLabel}</div>
          </div>
        </div>
      </div>`;
  });

  if (tradedCount === 0) {
    cards = `<div class="sum-no-trades">No trades were made during this session.</div>`;
  }

  // ── untouched companies ───────────────────────────────────────────────────
  let untouched = COMPANIES
    .map((c, i) => lastSales[i] ? null :
      `<span style="color:${COMP_COLORS[i]}">${c.name}</span>`)
    .filter(Boolean).join(' &nbsp;·&nbsp; ');
  let untouchedHtml = untouched
    ? `<div class="sum-untouched"><span class="sum-cell-label">Not traded:</span> ${untouched}</div>`
    : '';

  // ── inject ────────────────────────────────────────────────────────────────
  document.getElementById('summaryPage').innerHTML = `
    <div class="sum-container">
      <h1 class="sum-title">Investment Summary</h1>

      <div class="sum-overview">
        <div class="sum-ov-cell">
          <div class="sum-ov-label">Starting capital</div>
          <div class="sum-ov-value">${START.toLocaleString('cs-CZ', {minimumFractionDigits:2})}</div>
        </div>
        <div class="sum-ov-cell">
          <div class="sum-ov-label">Final balance</div>
          <div class="sum-ov-value">${finalBal.toLocaleString('cs-CZ', {minimumFractionDigits:2})}</div>
        </div>
        <div class="sum-ov-cell">
          <div class="sum-ov-label">Total return</div>
          <div class="sum-ov-value ${tSign?'pnl-pos':'pnl-neg'}">${tSign?'+':''}${totalPnl.toFixed(2)}</div>
          <div class="sum-ov-pct  ${tSign?'pnl-pos':'pnl-neg'}">${tSign?'+':''}${totalPct.toFixed(1)}%</div>
        </div>
      </div>

      <h2 class="sum-section-title">Your Trades</h2>
      ${cards}
      ${untouchedHtml}

      <div class="sum-footer">
        <button class="flexer sum-restart-btn" onclick="location.reload()">&#8635;&nbsp;Play Again</button>
      </div>
    </div>`;

  document.getElementById('summaryPage').style.display = 'flex';
}

// ── Portfolio overview ────────────────────────────────────────────────────────
let portfolioCharts    = [];
let portfolioViewActive = false;

// Distinct border colours for each company when not holding
const COMP_COLORS = ['#850F8D', '#0F6D8D', '#8D6B0F', '#0F8D4A'];

function togglePortfolioView() {
  portfolioViewActive = !portfolioViewActive;
  document.getElementById('portfolioView').style.display = portfolioViewActive ? 'block' : 'none';
  document.getElementById('btnPortfolio').classList.toggle('active', portfolioViewActive);
  if (portfolioViewActive) {
    initPortfolioCharts();
    updatePortfolioCharts();
  }
}

function initPortfolioCharts() {
  if (portfolioCharts.length > 0) return;   // already built
  COMPANIES.forEach((comp, i) => {
    let ctx = document.getElementById('portCanvas' + i);
    portfolioCharts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {                                   // price line
            fill: false, tension: 0,
            borderColor: COMP_COLORS[i],
            borderWidth: 1.5, pointRadius: 0,
            data: []
          },
          {                                   // buy-price reference (dashed)
            fill: false, tension: 0,
            borderColor: '#f8f9d760',
            borderWidth: 1, borderDash: [5, 4],
            pointRadius: 0, data: []
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: false } },
        scales: {
          y: { ticks: { color: COMP_COLORS[i], font: { size: 10 }, maxTicksLimit: 4 },
               grid: { color: COMP_COLORS[i] + '30' } },
          x: { ticks: { color: COMP_COLORS[i], font: { size: 9 },  maxTicksLimit: 5 },
               grid: { display: false } }
        }
      }
    }));
  });
}

function buildPortCardInfo(i, curPrice) {
  let t  = trades[i];
  let ls = lastSales[i];
  let c  = COMP_COLORS[i];
  let n  = COMPANIES[i].name;

  if (t.hasBought && curPrice != null) {
    let pnl  = (curPrice - t.buyPrice) * t.buyShares;
    let pct  = (curPrice - t.buyPrice) / t.buyPrice * 100;
    let sign = pnl >= 0;
    return `<div class="port-header">
      <span class="port-name" style="color:${c}">${n}</span>
      <span class="port-price-wrap">Price&nbsp;<b>${curPrice.toFixed(2)}</b></span>
      <span class="port-pnl ${sign?'pnl-pos':'pnl-neg'}">${sign?'+':''}${pnl.toFixed(2)}&nbsp;(${sign?'+':''}${pct.toFixed(1)}%)</span>
      <button class="port-sell-btn" onclick="sellStock(false,${i})">Sell</button>
    </div>
    <div class="port-holding-info">
      <b>${t.buyShares.toFixed(4)}</b>&nbsp;shares &nbsp;&middot;&nbsp;
      Invested&nbsp;<b>${t.buyInvested.toFixed(2)}</b> &nbsp;&middot;&nbsp;
      Target&nbsp;<b>${t.sellTarget.toFixed(2)}</b>
    </div>`;
  }

  if (ls) {
    return `<div class="port-header">
      <span class="port-name" style="color:${c}">${n}</span>
      <span class="port-price-wrap">Price&nbsp;<b>${curPrice != null ? curPrice.toFixed(2) : '—'}</b></span>
      <span class="port-sold-badge">&#10003;&nbsp;SOLD</span>
    </div>
    <div class="port-sold-info">
      Sold&nbsp;<b>${ls.shares.toFixed(4)}</b>&nbsp;shares&nbsp;@&nbsp;<b>${ls.soldPrice.toFixed(2)}</b>
      &nbsp;&middot;&nbsp;
      Invested&nbsp;<b>${ls.invested.toFixed(2)}</b>
      &nbsp;&middot;&nbsp;
      P&L:&nbsp;<b class="${ls.sign?'pnl-pos':'pnl-neg'}">${ls.sign?'+':''}${ls.pnl.toFixed(2)}&nbsp;(${ls.sign?'+':''}${ls.pct.toFixed(1)}%)</b>
    </div>`;
  }

  return `<div class="port-header">
    <span class="port-name" style="color:${c}">${n}</span>
    <span class="port-price-wrap">Price&nbsp;<b>${curPrice != null ? curPrice.toFixed(2) : '—'}</b></span>
  </div>`;
}

function updatePortfolioCharts() {
  if (!portfolioViewActive || portfolioCharts.length === 0) return;
  let end = windowStart + windowSize;

  COMPANIES.forEach((comp, i) => {
    let pc       = portfolioCharts[i];
    let data     = allSimData[i];
    let t        = trades[i];
    let curPrice = data.yee[end - 1];

    // Price line data
    pc.data.labels.splice(0, pc.data.labels.length, ...data.xee.slice(windowStart, end));
    pc.data.datasets[0].data.splice(0, pc.data.datasets[0].data.length,
      ...data.yee.slice(windowStart, end));

    // Colour + optional buy-price dashed reference
    if (t.hasBought) {
      pc.data.datasets[0].borderColor = curPrice >= t.buyPrice ? '#27ae60' : '#c0392b';
      let ref = new Array(Math.min(windowSize, end - windowStart)).fill(t.buyPrice);
      pc.data.datasets[1].data.splice(0, pc.data.datasets[1].data.length, ...ref);
    } else {
      pc.data.datasets[0].borderColor = COMP_COLORS[i];
      pc.data.datasets[1].data.splice(0, pc.data.datasets[1].data.length);
    }
    pc.update();

    // Dynamic card info (header + holding/sold row)
    let infoEl = document.getElementById('portInfo' + i);
    if (infoEl) infoEl.innerHTML = buildPortCardInfo(i, curPrice);

    // Card border
    let cardEl = document.getElementById('portCard' + i);
    if (cardEl) {
      cardEl.classList.toggle('port-card-held', t.hasBought);
      cardEl.classList.toggle('port-card-sold', !t.hasBought && lastSales[i] !== null);
    }
  });
}

// ── Valuation calculator ──────────────────────────────────────────────────────
const CALC_FIELDS = {
  nav:    [['Assets (M)',          'cAssets'],  ['Debts (M)',         'cDebts'],   ['Shares (M)',        'cShares']],
  dcf:    [['FCF Year 1 (M)',      'cFCF1'],    ['FCF Year 2 (M)',    'cFCF2'],    ['FCF Year 3 (M)',    'cFCF3'],
           ['Discount Rate (e.g. 0.10)', 'cDisc'], ['Terminal Growth (e.g. 0.03)', 'cTerm'],
           ['Cash (M)',            'cCash'],    ['Debts (M)',         'cDebts2'],  ['Shares (M)',        'cShares2']],
  gordon: [['Dividend / share',    'cDiv'],     ['Discount Rate',    'cDisc2'],   ['Div Growth Rate',   'cDivG']],
  market: [['EBITDA (M)',          'cEBITDA'],  ['EV/EBITDA Multiple','cMult'],   ['Cash (M)',          'cCash2'],
           ['Debts (M)',           'cDebts3'],  ['Shares (M)',        'cShares3']]
};

function updateCalcFields() {
  let type   = document.getElementById('calcType').value;
  let fields = CALC_FIELDS[type];
  let html   = '';
  fields.forEach(([label, id]) => {
    html += `<div class="calc-field">` +
            `<label class="cell-label">${label}</label>` +
            `<input type="number" id="${id}" class="calc-input" step="any">` +
            `</div>`;
  });
  document.getElementById('calcFields').innerHTML = html;
  document.getElementById('calcResult').textContent = '';

  // Show / hide EV/EBITDA reference table
  let refEl = document.getElementById('industryRef');
  if (!refEl) return;
  if (type !== 'market') { refEl.style.display = 'none'; return; }

  let rows = INDUSTRY_MULTIPLES.map(r =>
    `<tr><td class="sl">${r.sector}</td><td class="sv">${r.low} – ${r.high}×</td></tr>`
  ).join('');
  refEl.innerHTML =
    `<div class="table-title ref-title">EV / EBITDA Reference Multiples</div>` +
    `<table class="stats-table"><thead>` +
    `<tr><th class="sl">Sector</th><th class="sv">Typical Range</th></tr>` +
    `</thead><tbody>${rows}</tbody></table>`;
  refEl.style.display = 'block';
}

function calculateValuation() {
  let type = document.getElementById('calcType').value;
  let result;
  try {
    if (type === 'nav') {
      let a = +document.getElementById('cAssets').value  * 1e6;
      let d = +document.getElementById('cDebts').value   * 1e6;
      let s = +document.getElementById('cShares').value  * 1e6;
      result = nav(a, d, s);
    } else if (type === 'dcf') {
      let f1   = +document.getElementById('cFCF1').value   * 1e6;
      let f2   = +document.getElementById('cFCF2').value   * 1e6;
      let f3   = +document.getElementById('cFCF3').value   * 1e6;
      let disc = +document.getElementById('cDisc').value;
      let term = +document.getElementById('cTerm').value;
      let cash = +document.getElementById('cCash').value   * 1e6;
      let debt = +document.getElementById('cDebts2').value * 1e6;
      let sh   = +document.getElementById('cShares2').value* 1e6;
      result = DCF(disc, [f1, f2, f3], term, cash, debt, sh);
    } else if (type === 'gordon') {
      let div  = +document.getElementById('cDiv').value;
      let disc = +document.getElementById('cDisc2').value;
      let dg   = +document.getElementById('cDivG').value;
      result = gordon(div, dg, disc);
    } else {
      let eb = +document.getElementById('cEBITDA').value  * 1e6;
      let ml = +document.getElementById('cMult').value;
      let ca = +document.getElementById('cCash2').value   * 1e6;
      let db = +document.getElementById('cDebts3').value  * 1e6;
      let sh = +document.getElementById('cShares3').value * 1e6;
      result = market(eb, ml, ca, db, sh);
    }
    if (!isFinite(result)) throw new Error('Check inputs — result is infinite or undefined.');
    let el = document.getElementById('calcResult');
    el.textContent = 'Intrinsic Value: ' + result.toFixed(2) + ' per share';
    el.className = 'calc-result calc-ok';
  } catch(e) {
    let el = document.getElementById('calcResult');
    el.textContent = 'Error: ' + e.message;
    el.className = 'calc-result calc-err';
  }
}

// Start at the beginning of history
showWindow();
updateCalcFields();
updateBalanceDisplay();
updateDescription(0);
updateTradePanelForCompany(0);
