const STORAGE_KEYS = {
  plan: 'mac-daily-budget-plan-v1',
  bills: 'mac-daily-budget-bills-v1',
  spending: 'mac-daily-budget-spending-v1',
  currency: 'mac-daily-budget-currency-v1',
};

const FALLBACK_EUR_TO_DKK = 7.46;
const RATE_ORACLES = [
  'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=DKK',
  'https://open.er-api.com/v6/latest/EUR',
];

const state = {
  currency: 'DKK',
  eurToDkk: FALLBACK_EUR_TO_DKK,
  rateDate: null,
  editingSpendingId: null,
  activePlanMonth: null,
};

const elements = {
  currencySelect: document.querySelector('#currencySelect'),
  rateValue: document.querySelector('#rateValue'),
  rateStatus: document.querySelector('#rateStatus'),
  currencyLabels: document.querySelectorAll('.currency-label'),
  tabs: document.querySelectorAll('[data-tab]'),
  panels: document.querySelectorAll('[data-tab-panel]'),
  currentBalance: document.querySelector('#currentBalance'),
  monthlyIncome: document.querySelector('#monthlyIncome'),
  savingsGoal: document.querySelector('#savingsGoal'),
  overviewMonth: document.querySelector('#overviewMonth'),
  previousMonthButton: document.querySelector('#previousMonthButton'),
  nextMonthButton: document.querySelector('#nextMonthButton'),
  forecastMonths: document.querySelector('#forecastMonths'),
  billForm: document.querySelector('#billForm'),
  billName: document.querySelector('#billName'),
  billAmount: document.querySelector('#billAmount'),
  billTiming: document.querySelector('#billTiming'),
  billMonth: document.querySelector('#billMonth'),
  billMonthLabel: document.querySelector('#billMonthLabel'),
  recurringBillTable: document.querySelector('#recurringBillTable'),
  oneOffBillTable: document.querySelector('#oneOffBillTable'),
  recurringBillEmpty: document.querySelector('#recurringBillEmpty'),
  oneOffBillEmpty: document.querySelector('#oneOffBillEmpty'),
  billTotal: document.querySelector('#billTotal'),
  spendingForm: document.querySelector('#spendingForm'),
  spendingMonth: document.querySelector('#spendingMonth'),
  previousSpendingMonthButton: document.querySelector('#previousSpendingMonthButton'),
  nextSpendingMonthButton: document.querySelector('#nextSpendingMonthButton'),
  spendingDate: document.querySelector('#spendingDate'),
  spendingAmount: document.querySelector('#spendingAmount'),
  spendingNote: document.querySelector('#spendingNote'),
  spendingSubmitButton: document.querySelector('#spendingSubmitButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  clearSpendingButton: document.querySelector('#clearSpendingButton'),
  spendingTable: document.querySelector('#spendingTable'),
  spendingEmpty: document.querySelector('#spendingEmpty'),
  resetButton: document.querySelector('#resetButton'),
  todaySpendable: document.querySelector('#todaySpendable'),
  todayStatus: document.querySelector('#todayStatus'),
  monthHeading: document.querySelector('#monthHeading'),
  monthSubheading: document.querySelector('#monthSubheading'),
  fixedBillsTotal: document.querySelector('#fixedBillsTotal'),
  monthSpent: document.querySelector('#monthSpent'),
  baseDailyBudget: document.querySelector('#baseDailyBudget'),
  adjustedDailyBudget: document.querySelector('#adjustedDailyBudget'),
  overviewCallout: document.querySelector('#overviewCallout'),
  todayBudget: document.querySelector('#todayBudget'),
  spendingMonthTotal: document.querySelector('#spendingMonthTotal'),
  monthSpendableLeft: document.querySelector('#monthSpendableLeft'),
  averageDailySpend: document.querySelector('#averageDailySpend'),
  forecastEndingBalance: document.querySelector('#forecastEndingBalance'),
  forecastTable: document.querySelector('#forecastTable'),
};

const dkkFormatter = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' });
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const dayFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return formatDate(new Date());
}

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T00:00:00`);
}

function monthKey(date = new Date()) {
  return formatDate(date).slice(0, 7);
}

function monthDate(month) {
  return dateFromKey(`${month}-01`);
}

function shiftMonth(month, offset) {
  const date = monthDate(month);
  date.setMonth(date.getMonth() + offset);
  return monthKey(date);
}

function daysInMonth(month = monthKey()) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function daysRemainingForMonth(month) {
  if (month < monthKey()) return 0;
  if (month > monthKey()) return daysInMonth(month);

  const now = new Date();
  return daysInMonth(month) - now.getDate() + 1;
}

function elapsedDaysForAverage() {
  return Math.max(1, new Date().getDate());
}

function toDisplay(dkk) {
  return state.currency === 'EUR' ? dkk / state.eurToDkk : dkk;
}

function toDkk(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return state.currency === 'EUR' ? amount * state.eurToDkk : amount;
}

function money(dkk) {
  const value = Number.isFinite(dkk) ? dkk : 0;
  return state.currency === 'EUR' ? eurFormatter.format(toDisplay(value)) : dkkFormatter.format(value);
}

function signedMoney(dkk) {
  return `${dkk >= 0 ? '+' : ''}${money(dkk)}`;
}

function roundInput(dkk) {
  return Math.round(toDisplay(dkk) * 100) / 100;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePlan(plan) {
  return {
    currentBalance: Number(plan.currentBalance) || 0,
    monthlyIncome: Number(plan.monthlyIncome) || 0,
    savingsGoal: Number(plan.savingsGoal) || 0,
    monthPlans: plan.monthPlans && typeof plan.monthPlans === 'object' ? plan.monthPlans : {},
  };
}

function readPlanFromStorage() {
  return normalizePlan(readJson(STORAGE_KEYS.plan, { currentBalance: 0, monthlyIncome: 0, savingsGoal: 0, monthPlans: {} }));
}

function getPlanForMonth(plan, month) {
  const monthPlan = plan.monthPlans?.[month] || {};
  return {
    currentBalance: plan.currentBalance,
    monthlyIncome: Number.isFinite(monthPlan.monthlyIncome) ? monthPlan.monthlyIncome : plan.monthlyIncome,
    savingsGoal: Number.isFinite(monthPlan.savingsGoal) ? monthPlan.savingsGoal : plan.savingsGoal,
  };
}

function readPlanFromInputs(month = elements.overviewMonth.value || monthKey()) {
  const plan = readPlanFromStorage();
  const monthlyIncome = toDkk(elements.monthlyIncome.value);
  const savingsGoal = toDkk(elements.savingsGoal.value);

  plan.currentBalance = toDkk(elements.currentBalance.value);
  plan.monthPlans = {
    ...plan.monthPlans,
    [month]: { monthlyIncome, savingsGoal },
  };

  if (month === monthKey() || !plan.monthlyIncome) plan.monthlyIncome = monthlyIncome;
  if (month === monthKey() || !plan.savingsGoal) plan.savingsGoal = savingsGoal;

  return plan;
}

function loadPlanInputs(month = elements.overviewMonth.value || monthKey()) {
  const plan = readPlanFromStorage();
  const monthPlan = getPlanForMonth(plan, month);
  elements.currentBalance.value = plan.currentBalance ? roundInput(plan.currentBalance) : '';
  elements.monthlyIncome.value = monthPlan.monthlyIncome ? roundInput(monthPlan.monthlyIncome) : '';
  elements.savingsGoal.value = monthPlan.savingsGoal ? roundInput(monthPlan.savingsGoal) : '';
  state.activePlanMonth = month;
}

function savePlan(plan) {
  writeJson(STORAGE_KEYS.plan, plan);
}

function readBills() {
  return readJson(STORAGE_KEYS.bills, []);
}

function saveBills(bills) {
  writeJson(STORAGE_KEYS.bills, bills);
}

function readSpending() {
  return readJson(STORAGE_KEYS.spending, []);
}

function saveSpending(entries) {
  writeJson(STORAGE_KEYS.spending, entries);
}

function billAppliesToMonth(bill, month) {
  return !bill.month || bill.month === 'all' || bill.month === month;
}

function billTotal(bills, month = null) {
  return bills
    .filter((bill) => !month || billAppliesToMonth(bill, month))
    .reduce((total, bill) => total + bill.amount, 0);
}

function monthSpending(entries, month = monthKey()) {
  return entries.filter((entry) => entry.date.startsWith(month)).reduce((total, entry) => total + entry.amount, 0);
}

function dateSpending(entries, date = todayKey()) {
  return entries.filter((entry) => entry.date === date).reduce((total, entry) => total + entry.amount, 0);
}

function averageDailySpend(entries) {
  const currentMonthEntries = entries.filter((entry) => entry.date.startsWith(monthKey()));
  if (currentMonthEntries.length) return monthSpending(currentMonthEntries) / elapsedDaysForAverage();
  if (!entries.length) return 0;

  return entries.reduce((total, entry) => total + entry.amount, 0) / new Set(entries.map((entry) => entry.date)).size;
}

function calculateMonthBudget(plan, bills, spendingEntries, month) {
  const monthPlan = getPlanForMonth(plan, month);
  const fixedBills = billTotal(bills, month);
  const spent = monthSpending(spendingEntries, month);
  const availableAfterFixed = monthPlan.monthlyIncome - fixedBills - monthPlan.savingsGoal;
  const baseDaily = availableAfterFixed / daysInMonth(month);
  const remainingVariable = availableAfterFixed - spent;
  const remainingDays = Math.max(1, daysRemainingForMonth(month));
  const adjustedDaily = month < monthKey() ? 0 : remainingVariable / remainingDays;
  const todayRemaining = month === monthKey() ? adjustedDaily - dateSpending(spendingEntries) : adjustedDaily;

  return {
    fixedBills,
    spent,
    availableAfterFixed,
    baseDaily,
    remainingVariable,
    remainingDays,
    adjustedDaily,
    todayRemaining,
  };
}

function getDailyBudgetForDate(dateKey, plan, bills, spendingEntries) {
  const month = dateKey.slice(0, 7);
  const monthPlan = getPlanForMonth(plan, month);
  const availableAfterFixed = monthPlan.monthlyIncome - billTotal(bills, month) - monthPlan.savingsGoal;
  const dayNumber = dateFromKey(dateKey).getDate();
  const spentBeforeDate = spendingEntries
    .filter((entry) => entry.date.startsWith(month) && entry.date < dateKey)
    .reduce((total, entry) => total + entry.amount, 0);
  const daysLeftFromEntry = daysInMonth(month) - dayNumber + 1;
  return (availableAfterFixed - spentBeforeDate) / Math.max(1, daysLeftFromEntry);
}

function forecastRows(plan, bills, entries) {
  const monthsAhead = Number(elements.forecastMonths.value) || 6;
  const dailyAverage = averageDailySpend(entries);
  let balance = plan.currentBalance;
  const rows = [];

  for (let index = 0; index < monthsAhead; index += 1) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + index);
    const key = monthKey(date);
    const openingBalance = balance;
    const monthPlan = getPlanForMonth(plan, key);
    const fixedBills = billTotal(bills, key);
    const actualSpending = key === monthKey() ? monthSpending(entries, key) : 0;
    const projectedSpending = Math.max(actualSpending, dailyAverage * daysInMonth(key));
    const savedThisMonth = monthPlan.monthlyIncome - fixedBills - projectedSpending;
    balance += savedThisMonth;
    rows.push({ key, date, openingBalance, income: monthPlan.monthlyIncome, fixedBills, savings: monthPlan.savingsGoal, projectedSpending, savedThisMonth, balance });
  }

  return { rows, dailyAverage, endingBalance: balance };
}

function renderCurrency() {
  elements.currencySelect.value = state.currency;
  elements.currencyLabels.forEach((label) => {
    label.textContent = state.currency;
    label.className = `currency-label ${state.currency.toLowerCase()}`;
  });
  elements.rateValue.textContent = `EUR/DKK: ${state.eurToDkk.toFixed(4)}`;
}

function renderOverview(plan, bills, spendingEntries) {
  const selectedMonth = elements.overviewMonth.value || monthKey();
  const budget = calculateMonthBudget(plan, bills, spendingEntries, selectedMonth);
  const isCurrentMonth = selectedMonth === monthKey();
  const isPastMonth = selectedMonth < monthKey();

  elements.monthHeading.textContent = monthFormatter.format(monthDate(selectedMonth));
  elements.monthSubheading.textContent = isCurrentMonth
    ? `${budget.remainingDays} day${budget.remainingDays === 1 ? '' : 's'} left including today.`
    : `${daysInMonth(selectedMonth)} days in this ${isPastMonth ? 'completed' : 'upcoming'} month.`;
  elements.fixedBillsTotal.textContent = money(budget.fixedBills);
  elements.monthSpent.textContent = money(budget.spent);
  elements.baseDailyBudget.textContent = money(budget.baseDaily);
  elements.adjustedDailyBudget.textContent = isPastMonth ? 'Completed' : money(budget.adjustedDaily);

  const currentBudget = calculateMonthBudget(plan, bills, spendingEntries, monthKey());
  const spendableToday = Math.max(0, currentBudget.todayRemaining);
  const spendableMaximum = Math.max(currentBudget.adjustedDaily, 1);
  const spendableRatio = Math.max(0, Math.min(1, spendableToday / spendableMaximum));
  const spendableHue = Math.round(5 + spendableRatio * 137);
  elements.todaySpendable.textContent = money(spendableToday);
  elements.todaySpendable.closest('.daily-card')?.style.setProperty('--spendable-hue', String(spendableHue));
  elements.todaySpendable.closest('.daily-card')?.style.setProperty('--spendable-ratio', spendableRatio.toFixed(2));
  elements.todayBudget.textContent = money(currentBudget.adjustedDaily);
  elements.spendingMonthTotal.textContent = money(currentBudget.spent);
  elements.monthSpendableLeft.textContent = money(currentBudget.remainingVariable);

  elements.overviewCallout.className = 'callout';
  if (budget.availableAfterFixed <= 0) {
    elements.todayStatus.textContent = 'Your fixed bills and savings goal are higher than your income';
    elements.overviewCallout.textContent = 'Reduce bills, reduce the savings goal, or increase income to create a positive daily spendable amount.';
    elements.overviewCallout.classList.add('bad');
  } else if (isPastMonth) {
    const monthResult = budget.availableAfterFixed - budget.spent;
    elements.overviewCallout.textContent = monthResult >= 0
      ? `${monthFormatter.format(monthDate(selectedMonth))} ended ${money(monthResult)} under the variable spending allowance.`
      : `${monthFormatter.format(monthDate(selectedMonth))} ended ${money(Math.abs(monthResult))} over the variable spending allowance.`;
    elements.overviewCallout.classList.add(monthResult >= 0 ? 'good' : 'bad');
  } else if (isCurrentMonth && currentBudget.todayRemaining < 0) {
    elements.todayStatus.textContent = `You are over today by ${money(Math.abs(currentBudget.todayRemaining))}`;
    elements.overviewCallout.textContent = `Spending has exceeded today's adjusted budget. Your current daily amount for the rest of the month is ${money(currentBudget.adjustedDaily)}.`;
    elements.overviewCallout.classList.add('bad');
  } else if (budget.adjustedDaily < budget.baseDaily * 0.75) {
    elements.todayStatus.textContent = `You can spend ${money(Math.max(0, currentBudget.todayRemaining))} more today and stay on track`;
    elements.overviewCallout.textContent = 'Spending is ahead of the base plan, so the selected month has a tighter adjusted daily amount.';
    elements.overviewCallout.classList.add('warn');
  } else {
    elements.todayStatus.textContent = `You can spend ${money(Math.max(0, currentBudget.todayRemaining))} more today and stay on track`;
    elements.overviewCallout.textContent = 'You are on track. Switch months above to review past spending or future daily allowances.';
    elements.overviewCallout.classList.add('good');
  }
}

function billRow(bill) {
  return `
    <tr>
      <td>${escapeHtml(bill.name)}</td>
      <td>${money(bill.amount)}</td>
      <td>${bill.month && bill.month !== 'all' ? monthFormatter.format(monthDate(bill.month)) : 'Every month'}</td>
      <td><button class="icon-action danger" type="button" data-remove-bill="${bill.id}" aria-label="Remove ${escapeHtml(bill.name)}">🗑️</button></td>
    </tr>
  `;
}

function renderBills(bills) {
  const recurringBills = bills.filter((bill) => !bill.month || bill.month === 'all');
  const oneOffBills = bills.filter((bill) => bill.month && bill.month !== 'all');

  elements.billTotal.textContent = money(billTotal(bills, elements.overviewMonth.value || monthKey()));
  elements.recurringBillEmpty.hidden = recurringBills.length > 0;
  elements.oneOffBillEmpty.hidden = oneOffBills.length > 0;
  elements.recurringBillTable.innerHTML = recurringBills.map(billRow).join('');
  elements.oneOffBillTable.innerHTML = oneOffBills.map(billRow).join('');
}

function renderSpending(plan, bills, entries) {
  const selectedMonth = elements.spendingMonth.value || monthKey();
  const visibleEntries = entries.filter((entry) => entry.date.startsWith(selectedMonth));
  const sorted = [...visibleEntries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const spendingBudget = calculateMonthBudget(plan, bills, entries, selectedMonth);

  elements.todayBudget.textContent = selectedMonth < monthKey() ? 'Completed' : money(spendingBudget.adjustedDaily);
  elements.spendingMonthTotal.textContent = money(spendingBudget.spent);
  elements.monthSpendableLeft.textContent = money(spendingBudget.remainingVariable);
  elements.spendingEmpty.hidden = sorted.length > 0;
  elements.spendingTable.innerHTML = sorted.map((entry) => {
    const dailyBudget = getDailyBudgetForDate(entry.date, plan, bills, entries);
    const totalForDay = dateSpending(entries, entry.date);
    const variance = dailyBudget - totalForDay;
    const status = variance >= 0 ? 'Under budget' : 'Overspent';
    return `
      <tr class="${state.editingSpendingId === entry.id ? 'editing-row' : ''}">
        <td>${dayFormatter.format(dateFromKey(entry.date))}</td>
        <td>${escapeHtml(entry.note || 'Daily spend')}</td>
        <td>${money(entry.amount)}</td>
        <td>${money(dailyBudget)}</td>
        <td class="${variance >= 0 ? 'positive' : 'negative'}">${signedMoney(variance)}</td>
        <td><span class="status-pill ${variance >= 0 ? 'good' : 'bad'}">${status}</span></td>
        <td>
          <div class="action-group">
            <button class="icon-action" type="button" data-edit-spending="${entry.id}" aria-label="Edit spending entry">✏️</button>
            <button class="icon-action danger" type="button" data-remove-spending="${entry.id}" aria-label="Remove spending entry">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderForecast(plan, bills, entries) {
  const forecast = forecastRows(plan, bills, entries);
  elements.averageDailySpend.textContent = money(forecast.dailyAverage);
  elements.forecastEndingBalance.textContent = money(forecast.endingBalance);
  elements.forecastTable.innerHTML = forecast.rows.map((row) => `
    <tr>
      <td>${monthFormatter.format(row.date)}</td>
      <td>${money(row.openingBalance)}</td>
      <td>${money(row.income)}</td>
      <td>${money(row.fixedBills)}</td>
      <td>${money(row.savings)}</td>
      <td>${money(row.projectedSpending)}</td>
      <td class="${row.savedThisMonth >= 0 ? 'positive' : 'negative'}">${signedMoney(row.savedThisMonth)}</td>
      <td>${money(row.balance)}</td>
    </tr>
  `).join('');
}

function render() {
  const selectedMonth = elements.overviewMonth.value || monthKey();
  const plan = readPlanFromInputs(selectedMonth);
  const bills = readBills();
  const spendingEntries = readSpending();

  savePlan(plan);
  renderCurrency();
  renderOverview(plan, bills, spendingEntries);
  renderBills(bills);
  renderSpending(plan, bills, spendingEntries);
  renderForecast(plan, bills, spendingEntries);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;',
  }[character]));
}

function resetSpendingForm() {
  state.editingSpendingId = null;
  elements.spendingDate.value = getDefaultDateForSpendingMonth();
  elements.spendingAmount.value = '';
  elements.spendingNote.value = '';
  elements.spendingSubmitButton.textContent = 'Add spending';
  elements.cancelEditButton.hidden = true;
}

function editSpendingEntry(id) {
  const entry = readSpending().find((item) => item.id === id);
  if (!entry) return;

  state.editingSpendingId = id;
  elements.spendingDate.value = entry.date;
  elements.spendingAmount.value = roundInput(entry.amount);
  elements.spendingNote.value = entry.note || '';
  elements.spendingSubmitButton.textContent = 'Update spending';
  elements.cancelEditButton.hidden = false;
  elements.spendingAmount.focus();
  render();
}

async function fetchRate() {
  const cached = readJson(STORAGE_KEYS.currency, {});
  state.currency = cached.currency === 'EUR' ? 'EUR' : 'DKK';
  state.eurToDkk = Number(cached.eurToDkk) || FALLBACK_EUR_TO_DKK;
  state.rateDate = cached.rateDate || null;
  renderCurrency();

  const errors = [];
  for (const url of RATE_ORACLES) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} from ${new URL(url).hostname}`);
      const data = await response.json();
      const rate = data?.rates?.DKK;
      if (!Number.isFinite(rate)) throw new Error(`Missing DKK rate from ${new URL(url).hostname}`);
      state.eurToDkk = rate;
      state.rateDate = data.date || data.time_last_update_utc || todayKey();
      writeJson(STORAGE_KEYS.currency, { currency: state.currency, eurToDkk: state.eurToDkk, rateDate: state.rateDate });
      elements.rateStatus.textContent = `Daily oracle updated ${state.rateDate}.`;
      loadPlanInputs();
      render();
      return;
    } catch (error) {
      errors.push(error.message);
    }
  }

  elements.rateStatus.textContent = `Live oracle unavailable; using saved/fallback rate. ${errors.join(' | ')}`;
  render();
}

function activateTab(tabName) {
  elements.tabs.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  elements.panels.forEach((panel) => {
    const active = panel.dataset.tabPanel === tabName;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
}



function getDefaultDateForSpendingMonth(month = elements.spendingMonth.value || monthKey()) {
  return month === monthKey() ? todayKey() : `${month}-01`;
}

function switchOverviewMonth(month) {
  elements.overviewMonth.value = month;
  loadPlanInputs(month);
  render();
}

function switchSpendingMonth(month) {
  elements.spendingMonth.value = month;
  resetSpendingForm();
  render();
}

function updateBillMonthControls() {
  const isOneOff = elements.billTiming.value === 'one-off';
  elements.billMonth.disabled = !isOneOff;
  elements.billMonthLabel.classList.toggle('disabled-field', !isOneOff);
  if (isOneOff && !elements.billMonth.value) elements.billMonth.value = elements.overviewMonth.value || monthKey();
}

function setupEvents() {
  [elements.currentBalance, elements.monthlyIncome, elements.savingsGoal, elements.forecastMonths].forEach((input) => {
    input.addEventListener('input', render);
  });

  elements.overviewMonth.addEventListener('input', () => {
    switchOverviewMonth(elements.overviewMonth.value || monthKey());
  });

  elements.previousMonthButton.addEventListener('click', () => {
    switchOverviewMonth(shiftMonth(elements.overviewMonth.value || monthKey(), -1));
  });

  elements.nextMonthButton.addEventListener('click', () => {
    switchOverviewMonth(shiftMonth(elements.overviewMonth.value || monthKey(), 1));
  });

  elements.spendingMonth.addEventListener('input', () => {
    switchSpendingMonth(elements.spendingMonth.value || monthKey());
  });

  elements.previousSpendingMonthButton.addEventListener('click', () => {
    switchSpendingMonth(shiftMonth(elements.spendingMonth.value || monthKey(), -1));
  });

  elements.nextSpendingMonthButton.addEventListener('click', () => {
    switchSpendingMonth(shiftMonth(elements.spendingMonth.value || monthKey(), 1));
  });

  elements.billTiming.addEventListener('change', updateBillMonthControls);

  elements.tabs.forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));

  elements.currencySelect.addEventListener('change', () => {
    savePlan(readPlanFromInputs(elements.overviewMonth.value || monthKey()));
    state.currency = elements.currencySelect.value;
    writeJson(STORAGE_KEYS.currency, { currency: state.currency, eurToDkk: state.eurToDkk, rateDate: state.rateDate });
    loadPlanInputs();
    render();
  });

  elements.billForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = elements.billName.value.trim();
    const amount = toDkk(elements.billAmount.value);
    const month = elements.billTiming.value === 'one-off' ? elements.billMonth.value : 'all';
    if (!name || amount <= 0 || (elements.billTiming.value === 'one-off' && !month)) return;
    saveBills([...readBills(), { id: makeId(), name, amount, month }]);
    elements.billName.value = '';
    elements.billAmount.value = '';
    elements.billTiming.value = 'recurring';
    elements.billMonth.value = elements.overviewMonth.value || monthKey();
    updateBillMonthControls();
    render();
  });

  [elements.recurringBillTable, elements.oneOffBillTable].forEach((table) => {
    table.addEventListener('click', (event) => {
      const id = event.target.dataset.removeBill;
      if (!id) return;
      saveBills(readBills().filter((bill) => bill.id !== id));
      render();
    });
  });

  elements.spendingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = toDkk(elements.spendingAmount.value);
    if (elements.spendingAmount.value === '' || amount < 0 || !Number.isFinite(amount)) return;

    const entries = readSpending();
    const nextEntry = {
      id: state.editingSpendingId || makeId(),
      date: elements.spendingDate.value || getDefaultDateForSpendingMonth(),
      amount,
      note: elements.spendingNote.value.trim(),
    };
    const nextEntries = state.editingSpendingId
      ? entries.map((entry) => (entry.id === state.editingSpendingId ? nextEntry : entry))
      : [...entries, nextEntry];

    saveSpending(nextEntries);
    resetSpendingForm();
    render();
  });

  elements.spendingTable.addEventListener('click', (event) => {
    const editId = event.target.dataset.editSpending;
    const removeId = event.target.dataset.removeSpending;

    if (editId) {
      editSpendingEntry(editId);
      return;
    }

    if (!removeId) return;
    saveSpending(readSpending().filter((entry) => entry.id !== removeId));
    if (state.editingSpendingId === removeId) resetSpendingForm();
    render();
  });

  elements.cancelEditButton.addEventListener('click', () => {
    resetSpendingForm();
    render();
  });

  elements.clearSpendingButton.addEventListener('click', () => {
    const selectedMonth = elements.spendingMonth.value || monthKey();
    saveSpending(readSpending().filter((entry) => !entry.date.startsWith(selectedMonth)));
    resetSpendingForm();
    render();
  });

  elements.resetButton.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.plan);
    localStorage.removeItem(STORAGE_KEYS.bills);
    localStorage.removeItem(STORAGE_KEYS.spending);
    loadPlanInputs();
    resetSpendingForm();
    render();
  });
}

function init() {
  const cachedCurrency = readJson(STORAGE_KEYS.currency, {});
  state.currency = cachedCurrency.currency === 'EUR' ? 'EUR' : 'DKK';
  state.eurToDkk = Number(cachedCurrency.eurToDkk) || FALLBACK_EUR_TO_DKK;
  state.rateDate = cachedCurrency.rateDate || null;
  elements.overviewMonth.value = monthKey();
  elements.spendingMonth.value = monthKey();
  elements.billMonth.value = monthKey();
  updateBillMonthControls();
  elements.spendingDate.value = getDefaultDateForSpendingMonth();
  loadPlanInputs();
  setupEvents();
  render();
  fetchRate();
}

init();