const PLAN_STORAGE_KEY = 'daily-budget-trajectory-plan-v2';
const SPENDING_STORAGE_KEY = 'daily-budget-trajectory-spending-v1';
const BILLS_STORAGE_KEY = 'daily-budget-trajectory-bills-v1';
const FORECAST_ITEMS_STORAGE_KEY = 'daily-budget-trajectory-forecast-items-v1';
const MONTHLY_ACTUALS_STORAGE_KEY = 'daily-budget-trajectory-monthly-actuals-v1';
const CURRENCY_STORAGE_KEY = 'daily-budget-trajectory-currency-v1';
const LEGACY_STORAGE_KEY = 'daily-budget-trajectory-v1';
const COOKIE_PREFIX = 'budget_app_';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const FALLBACK_EUR_TO_DKK_RATE = 7.46;
const RATE_API_URLS = [
  'https://fxapi.app/api/eur/dkk.json',
  'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=DKK',
];
const HIGHCHARTS_SCRIPT_URLS = [
  'https://code.highcharts.com/highcharts.js',
  'https://cdn.jsdelivr.net/npm/highcharts@11.4.8/highcharts.js',
  'https://unpkg.com/highcharts@11.4.8/highcharts.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highcharts/11.4.8/highcharts.js',
];

const dateFormatter = new Intl.DateTimeFormat('da-DK', { month: 'short', day: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('da-DK', { month: 'long', year: 'numeric' });

let selectedCurrency = 'DKK';
let eurToDkkRate = FALLBACK_EUR_TO_DKK_RATE;
let exchangeRateDate = null;
let trajectoryChart = null;
let highchartsLoadPromise = null;

function createCurrencyFormatter(currencyCode = selectedCurrency) {
  return new Intl.NumberFormat(currencyCode === 'DKK' ? 'da-DK' : 'de-DE', {
    style: 'currency',
    currency: currencyCode,
  });
}

const defaults = {
  startingBalance: 18000,
  monthlyIncome: 32000,
  savingsGoal: 3000,
  dailySpending: 250,
  projectionDays: 30,
  budgetYear: new Date().getFullYear(),
};

const defaultBills = [
  { id: 'default-rent', name: 'Rent', amount: 12000, month: 'all' },
  { id: 'default-utilities', name: 'Utilities', amount: 1800, month: 'all' },
  { id: 'default-subscriptions', name: 'Subscriptions', amount: 550, month: 'all' },
];

const fields = {
  startingBalance: document.querySelector('#startingBalance'),
  monthlyIncome: document.querySelector('#monthlyIncome'),
  monthlyBills: document.querySelector('#monthlyBills'),
  savingsGoal: document.querySelector('#savingsGoal'),
  dailySpending: document.querySelector('#dailySpending'),
  projectionDays: document.querySelector('#projectionDays'),
  budgetYear: document.querySelector('#budgetYear'),
};

const billFields = {
  billName: document.querySelector('#billName'),
  billAmount: document.querySelector('#billAmount'),
  billMonth: document.querySelector('#billMonth'),
};

const forecastItemFields = {
  forecastItemName: document.querySelector('#forecastItemName'),
  forecastItemAmount: document.querySelector('#forecastItemAmount'),
  forecastItemMonth: document.querySelector('#forecastItemMonth'),
};

const spendingFields = {
  spendingDate: document.querySelector('#spendingDate'),
  dailySpent: document.querySelector('#dailySpent'),
};

const actualFields = {
  actualMonth: document.querySelector('#actualMonth'),
  actualForecastItem: document.querySelector('#actualForecastItem'),
  actualForecastSpent: document.querySelector('#actualForecastSpent'),
};

const outputs = {
  dailyAllowance: document.querySelector('#dailyAllowance'),
  safeToSpendNote: document.querySelector('#safeToSpendNote'),
  flexMoney: document.querySelector('#flexMoney'),
  dailyTarget: document.querySelector('#dailyTarget'),
  variance: document.querySelector('#variance'),
  endingBalance: document.querySelector('#endingBalance'),
  spendingVariance: document.querySelector('#spendingVariance'),
  monthLabel: document.querySelector('#monthLabel'),
  statusCallout: document.querySelector('#statusCallout'),
  projectionTable: document.querySelector('#projectionTable'),
  spendingTable: document.querySelector('#spendingTable'),
  spendingEmpty: document.querySelector('#spendingEmpty'),
  billTable: document.querySelector('#billTable'),
  billTotal: document.querySelector('#billTotal'),
  forecastItemTable: document.querySelector('#forecastItemTable'),
  forecastItemTotal: document.querySelector('#forecastItemTotal'),
  forecastItemAccrued: document.querySelector('#forecastItemAccrued'),
  yearForecastTable: document.querySelector('#yearForecastTable'),
  yearlyIncome: document.querySelector('#yearlyIncome'),
  yearlyBills: document.querySelector('#yearlyBills'),
  yearlyPredictedSpending: document.querySelector('#yearlyPredictedSpending'),
  yearlyEndingBalance: document.querySelector('#yearlyEndingBalance'),
  predictionNote: document.querySelector('#predictionNote'),
  monthlyComparisonTable: document.querySelector('#monthlyComparisonTable'),
  monthlyComparisonEmpty: document.querySelector('#monthlyComparisonEmpty'),
  chart: document.querySelector('#trajectoryChart'),
};

const tabs = {
  buttons: document.querySelectorAll('[data-tab]'),
  panels: document.querySelectorAll('[data-tab-panel]'),
};

const currencyControls = {
  currencySelect: document.querySelector('#currencySelect'),
  rateValue: document.querySelector('#rateValue'),
  rateStatus: document.querySelector('#rateStatus'),
  labels: document.querySelectorAll('.currency-label'),
};

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateKey() {
  return formatDateKey(new Date());
}

function getCurrentMonthKey() {
  return getTodayDateKey().slice(0, 7);
}

function dateKeyToLocalDate(dateKey) {
  return new Date(`${dateKey}T00:00:00`);
}

function monthKeyToDate(monthKey) {
  return new Date(`${monthKey}-01T00:00:00`);
}

function getMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function getDaysBetween(dateKey) {
  const today = dateKeyToLocalDate(getTodayDateKey());
  const date = dateKeyToLocalDate(dateKey);
  return Math.round((date - today) / 86_400_000);
}

function getDaysInMonth(monthKey = getCurrentMonthKey()) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function getDaysRemainingInMonth() {
  const now = new Date();
  return getDaysInMonth(getCurrentMonthKey()) - now.getDate() + 1;
}

function dkkToSelected(value) {
  if (!Number.isFinite(value)) return 0;
  return selectedCurrency === 'EUR' ? value / eurToDkkRate : value;
}

function selectedToDkk(value) {
  if (!Number.isFinite(value)) return 0;
  return selectedCurrency === 'EUR' ? value * eurToDkkRate : value;
}

function displayAmount(value) {
  return Math.round(dkkToSelected(value) * 100) / 100;
}

function money(value) {
  return createCurrencyFormatter().format(dkkToSelected(Number.isFinite(value) ? value : 0));
}

function signedMoney(value) {
  return `${value >= 0 ? '+' : ''}${money(value)}`;
}

function formatInputAmount(value) {
  return Number.isFinite(value) ? displayAmount(value) : 0;
}

function getCookieName(key) {
  return `${COOKIE_PREFIX}${key}`;
}

function readCookie(key) {
  const cookieName = `${getCookieName(key)}=`;
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(cookieName));

  if (!cookie) return null;

  return decodeURIComponent(cookie.slice(cookieName.length));
}

function writeCookie(key, value) {
  document.cookie = `${getCookieName(key)}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}

function deleteCookie(key) {
  document.cookie = `${getCookieName(key)}=; max-age=0; path=/; SameSite=Lax`;
}

function readJson(key, fallback) {
  const stored = localStorage.getItem(key) || readCookie(key);
  return stored ? JSON.parse(stored) : fallback;
}

function saveJson(key, value) {
  const serialized = JSON.stringify(value);
  localStorage.setItem(key, serialized);
  writeCookie(key, serialized);
}

function removeSavedJson(key) {
  localStorage.removeItem(key);
  deleteCookie(key);
}

function readCurrencySettings() {
  const settings = readJson(CURRENCY_STORAGE_KEY, {});
  selectedCurrency = settings.selectedCurrency === 'EUR' ? 'EUR' : 'DKK';
  eurToDkkRate = Number(settings.eurToDkkRate) || FALLBACK_EUR_TO_DKK_RATE;
  exchangeRateDate = settings.exchangeRateDate || null;
}

function saveCurrencySettings() {
  saveJson(CURRENCY_STORAGE_KEY, { selectedCurrency, eurToDkkRate, exchangeRateDate });
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readPlan() {
  return {
    startingBalance: selectedToDkk(Number(fields.startingBalance.value) || 0),
    monthlyIncome: selectedToDkk(Number(fields.monthlyIncome.value) || 0),
    savingsGoal: selectedToDkk(Number(fields.savingsGoal.value) || 0),
    dailySpending: selectedToDkk(Number(fields.dailySpending.value) || 0),
    projectionDays: Number(fields.projectionDays.value) || 30,
    budgetYear: Number(fields.budgetYear.value) || new Date().getFullYear(),
  };
}

function savePlan(plan) {
  saveJson(PLAN_STORAGE_KEY, plan);
}

function readBills() {
  return readJson(BILLS_STORAGE_KEY, defaultBills).map((bill) => ({
    id: bill.id || createId(),
    name: bill.name || 'Bill',
    amount: Number(bill.amount) || 0,
    month: bill.month || 'all',
  }));
}

function saveBills(bills) {
  saveJson(BILLS_STORAGE_KEY, bills);
}

function readForecastItems() {
  return readJson(FORECAST_ITEMS_STORAGE_KEY, []).map((item) => ({
    id: item.id || createId(),
    name: item.name || 'Forecast category',
    amount: Number(item.amount) || 0,
    month: item.month || 'all',
  }));
}

function saveForecastItems(items) {
  saveJson(FORECAST_ITEMS_STORAGE_KEY, items);
}

function readSpendingEntries() {
  return readJson(SPENDING_STORAGE_KEY, [])
    .map((entry) => ({ date: entry.date, amount: Number(entry.amount) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function saveSpendingEntries(spendingEntries) {
  saveJson(SPENDING_STORAGE_KEY, spendingEntries);
}

function readMonthlyActuals() {
  return readJson(MONTHLY_ACTUALS_STORAGE_KEY, [])
    .map((entry) => ({
      month: entry.month,
      itemId: entry.itemId || '',
      amount: Number(entry.amount ?? entry.spending) || 0,
    }))
    .filter((entry) => entry.month && entry.itemId)
    .sort((a, b) => a.month.localeCompare(b.month) || a.itemId.localeCompare(b.itemId));
}

function saveMonthlyActuals(actuals) {
  saveJson(MONTHLY_ACTUALS_STORAGE_KEY, actuals);
}

function getMonthlyActualForecastTotal(monthlyActuals, monthKey) {
  return monthlyActuals
    .filter((entry) => entry.month === monthKey)
    .reduce((total, entry) => total + entry.amount, 0);
}

function getForecastItemsForMonth(forecastItems, monthKey) {
  return forecastItems.filter((item) => item.month === 'all' || item.month === monthKey);
}

function getForecastItemAccruedAmount(item, monthKey, date = new Date()) {
  const todayKey = getTodayDateKey().slice(0, 7);
  if (monthKey < todayKey) return item.amount;
  if (monthKey > todayKey) return 0;

  const daysInMonth = getDaysInMonth(monthKey);
  const elapsedDays = Math.min(date.getDate(), daysInMonth);
  return item.amount * (elapsedDays / daysInMonth);
}

function getMonthlyBillTotal(bills, monthKey) {
  return bills
    .filter((bill) => bill.month === 'all' || bill.month === monthKey)
    .reduce((total, bill) => total + bill.amount, 0);
}

function getMonthlyForecastItemTotal(forecastItems, monthKey) {
  return forecastItems
    .filter((item) => item.month === 'all' || item.month === monthKey)
    .reduce((total, item) => total + item.amount, 0);
}

function getAccruedForecastItemTotal(forecastItems, monthKey, date = new Date()) {
  const total = getMonthlyForecastItemTotal(forecastItems, monthKey);
  const daysInMonth = getDaysInMonth(monthKey);
  const monthStart = monthKeyToDate(monthKey);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), daysInMonth);
  const clampedDate = new Date(Math.min(Math.max(date, monthStart), monthEnd));
  const elapsedDays = clampedDate.getDate();
  return total * (elapsedDays / daysInMonth);
}

function getMonthSpendingTotal(spendingEntries, monthKey) {
  return spendingEntries
    .filter((entry) => entry.date.startsWith(monthKey))
    .reduce((total, entry) => total + entry.amount, 0);
}

function loadPlan() {
  const saved = readJson(PLAN_STORAGE_KEY, JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null'));
  const plan = { ...defaults, ...(saved || {}) };

  fields.startingBalance.value = formatInputAmount(plan.startingBalance);
  fields.monthlyIncome.value = formatInputAmount(plan.monthlyIncome);
  fields.savingsGoal.value = formatInputAmount(plan.savingsGoal);
  fields.dailySpending.value = formatInputAmount(plan.dailySpending);
  fields.projectionDays.value = plan.projectionDays;
  fields.budgetYear.value = plan.budgetYear || new Date().getFullYear();
  spendingFields.spendingDate.value = getTodayDateKey();
  actualFields.actualMonth.value = getCurrentMonthKey();
  billFields.billMonth.value = 'all';
  forecastItemFields.forecastItemMonth.value = 'all';
}

function calculateProjection(plan, bills, forecastItems = []) {
  const currentMonthKey = getCurrentMonthKey();
  const monthlyBills = getMonthlyBillTotal(bills, currentMonthKey);
  const monthlyForecastItems = getMonthlyForecastItemTotal(forecastItems, currentMonthKey);
  const daysRemaining = getDaysRemainingInMonth();
  const daysInMonth = getDaysInMonth(currentMonthKey);
  const flexibleMoney = plan.monthlyIncome - monthlyBills - monthlyForecastItems - plan.savingsGoal;
  const dailyTarget = flexibleMoney / daysRemaining;
  const dailyVariance = dailyTarget - plan.dailySpending;
  const dailyNet = plan.monthlyIncome / daysInMonth - monthlyBills / daysInMonth - monthlyForecastItems / daysInMonth - plan.dailySpending;

  let balance = plan.startingBalance;
  const trajectory = [];

  for (let day = 0; day <= plan.projectionDays; day += 1) {
    const date = new Date();
    date.setDate(date.getDate() + day);

    if (day > 0) {
      balance += dailyNet;
    }

    trajectory.push({
      date,
      dateKey: formatDateKey(date),
      balance,
      spending: plan.dailySpending,
      status: getStatus(balance, dailyVariance),
    });
  }

  return { flexibleMoney, dailyTarget, dailyVariance, dailyNet, monthlyBills, monthlyForecastItems, endingBalance: balance, trajectory };
}

function getTargetBalanceForDate(projection, dateKey) {
  const matchingPoint = projection.trajectory.find((point) => point.dateKey === dateKey);
  return matchingPoint ? matchingPoint.balance : projection.trajectory[0].balance + projection.dailyNet * getDaysBetween(dateKey);
}

function getCumulativeSpendingVariance(spendingEntries, projection, dateKey) {
  return spendingEntries
    .filter((entry) => entry.date <= dateKey)
    .reduce((total, entry) => total + projection.dailyTarget - entry.amount, 0);
}

function getAdjustedBalanceForSpendingEntry(entry, spendingEntries, projection) {
  return getTargetBalanceForDate(projection, entry.date) + getCumulativeSpendingVariance(spendingEntries, projection, entry.date);
}

function getStatus(balance, dailyVariance) {
  if (balance < 0 || dailyVariance < -100) {
    return { label: 'Tight', className: 'bad' };
  }

  if (balance < 2000 || dailyVariance < 0) {
    return { label: 'Watch', className: 'warn' };
  }

  return { label: 'On track', className: 'good' };
}

function getSpendingStatus(difference) {
  if (difference < -100) return { label: 'Over target', className: 'bad' };
  if (difference < 0) return { label: 'Slightly over', className: 'warn' };
  return { label: 'Under target', className: 'good' };
}

function average(values, fallback) {
  const usableValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (usableValues.length === 0) return fallback;
  return usableValues.reduce((total, value) => total + value, 0) / usableValues.length;
}

function calculateYearForecast(plan, bills, forecastItems, spendingEntries, monthlyActuals) {
  let balance = plan.startingBalance;
  const rows = [];
  const completedActuals = [];

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const monthKey = getMonthKey(plan.budgetYear, monthIndex);
    const actualSpending = getMonthlyActualForecastTotal(monthlyActuals, monthKey);
    const actual = actualSpending > 0 ? { month: monthKey, spending: actualSpending } : null;
    const priorActualSpending = completedActuals.map((entry) => entry.spending);
    const priorActualIncome = completedActuals.map((entry) => entry.income);
    const priorActualBills = completedActuals.map((entry) => entry.bills);
    const dailyEntriesTotal = getMonthSpendingTotal(spendingEntries, monthKey);
    const predictedIncome = average(priorActualIncome, plan.monthlyIncome);
    const predictedBills = average(priorActualBills, getMonthlyBillTotal(bills, monthKey));
    const predictedForecastItems = getMonthlyForecastItemTotal(forecastItems, monthKey);
    const plannedSpending = plan.dailySpending * getDaysInMonth(monthKey) + predictedForecastItems;
    const predictedSpending = average(priorActualSpending, dailyEntriesTotal || plannedSpending);
    const predictedSavings = plan.savingsGoal;
    const predictedNet = predictedIncome - predictedBills - predictedSpending - predictedSavings;

    balance += predictedNet;

    rows.push({
      monthKey,
      predictedIncome,
      predictedBills,
      predictedForecastItems,
      predictedSpending,
      predictedSavings,
      predictedNet,
      predictedEndingBalance: balance,
      actual,
    });

    if (actual) completedActuals.push(actual);
  }

  return rows;
}

function renderSummary(plan, projection, spendingEntries) {
  fields.monthlyBills.value = formatInputAmount(projection.monthlyBills);
  outputs.dailyAllowance.textContent = money(Math.max(projection.dailyTarget, 0));
  outputs.flexMoney.textContent = money(projection.flexibleMoney);
  outputs.dailyTarget.textContent = money(projection.dailyTarget);
  outputs.variance.textContent = signedMoney(projection.dailyVariance);
  outputs.endingBalance.textContent = money(projection.endingBalance);
  outputs.monthLabel.textContent = monthFormatter.format(new Date());

  const latestEntry = spendingEntries.at(-1);
  outputs.spendingVariance.textContent = latestEntry ? signedMoney(projection.dailyTarget - latestEntry.amount) : 'Add spending';

  const status = getStatus(projection.endingBalance, projection.dailyVariance);
  outputs.statusCallout.className = `status-callout ${status.className}`;

  if (status.className === 'good') {
    outputs.safeToSpendNote.textContent = `Your planned ${money(plan.dailySpending)} daily spend is inside your target.`;
    outputs.statusCallout.textContent = `You're on track. If you keep spending ${money(plan.dailySpending)} per day, your projected balance remains positive while preserving your savings goal.`;
  } else if (status.className === 'warn') {
    outputs.safeToSpendNote.textContent = 'You have a little room, but your plan is close to the edge.';
    outputs.statusCallout.textContent = `Watch this plan closely. Try trimming daily spending by ${money(Math.abs(Math.min(projection.dailyVariance, 0)))} to match your daily target.`;
  } else {
    outputs.safeToSpendNote.textContent = 'Spending needs a reset to avoid running short.';
    outputs.statusCallout.textContent = 'This trajectory is tight. Lower daily spending, reduce bills, or adjust the savings goal before the balance drops below your comfort level.';
  }
}

function renderBills(bills, plan) {
  const currentMonthKey = getCurrentMonthKey();
  outputs.billTotal.textContent = money(getMonthlyBillTotal(bills, currentMonthKey));
  outputs.billTable.innerHTML = bills.map((bill) => `
    <tr>
      <td>${bill.name}</td>
      <td>${money(bill.amount)}</td>
      <td>${bill.month === 'all' ? 'Every month' : monthFormatter.format(monthKeyToDate(bill.month))}</td>
      <td><button class="link-button" type="button" data-remove-bill="${bill.id}">Remove</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-remove-bill]').forEach((button) => {
    button.addEventListener('click', () => {
      saveBills(readBills().filter((bill) => bill.id !== button.dataset.removeBill));
      update();
    });
  });

  billFields.billMonth.querySelectorAll('option[data-month-option]').forEach((option) => option.remove());
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const monthKey = getMonthKey(plan.budgetYear, monthIndex);
    const option = document.createElement('option');
    option.value = monthKey;
    option.dataset.monthOption = 'true';
    option.textContent = monthFormatter.format(monthKeyToDate(monthKey));
    billFields.billMonth.append(option);
  }
}

function renderForecastItems(forecastItems, plan) {
  const currentMonthKey = getCurrentMonthKey();
  outputs.forecastItemTotal.textContent = money(getMonthlyForecastItemTotal(forecastItems, currentMonthKey));
  outputs.forecastItemAccrued.textContent = money(getAccruedForecastItemTotal(forecastItems, currentMonthKey));
  outputs.forecastItemTable.innerHTML = forecastItems.map((item) => {
    const appliesThisMonth = item.month === 'all' || item.month === currentMonthKey;
    const accrued = appliesThisMonth ? getForecastItemAccruedAmount(item, currentMonthKey) : 0;
    return `
      <tr>
        <td>${item.name}</td>
        <td>${money(item.amount)}</td>
        <td>${item.month === 'all' ? 'Every month' : monthFormatter.format(monthKeyToDate(item.month))}</td>
        <td>${appliesThisMonth ? money(accrued) : 'Not this month'}</td>
        <td><button class="link-button" type="button" data-remove-forecast-item="${item.id}">Remove</button></td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-remove-forecast-item]').forEach((button) => {
    button.addEventListener('click', () => {
      saveForecastItems(readForecastItems().filter((item) => item.id !== button.dataset.removeForecastItem));
      update();
    });
  });

  forecastItemFields.forecastItemMonth.querySelectorAll('option[data-month-option]').forEach((option) => option.remove());
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const monthKey = getMonthKey(plan.budgetYear, monthIndex);
    const option = document.createElement('option');
    option.value = monthKey;
    option.dataset.monthOption = 'true';
    option.textContent = monthFormatter.format(monthKeyToDate(monthKey));
    forecastItemFields.forecastItemMonth.append(option);
  }
}

function renderProjectionTable(trajectory) {
  outputs.projectionTable.innerHTML = trajectory
    .filter((_, index) => index % 3 === 0 || index === trajectory.length - 1)
    .map((point) => `
      <tr>
        <td>${dateFormatter.format(point.date)}</td>
        <td>${money(point.balance)}</td>
        <td>${money(point.spending)}</td>
        <td><span class="status-pill ${point.status.className}">${point.status.label}</span></td>
      </tr>
    `)
    .join('');
}

function renderSpendingEntries(spendingEntries, projection) {
  outputs.spendingEmpty.hidden = spendingEntries.length > 0;
  outputs.spendingTable.innerHTML = spendingEntries
    .slice()
    .reverse()
    .map((entry) => {
      const difference = projection.dailyTarget - entry.amount;
      const status = getSpendingStatus(difference);
      const adjustedBalance = getAdjustedBalanceForSpendingEntry(entry, spendingEntries, projection);
      return `
        <tr>
          <td>${dateFormatter.format(dateKeyToLocalDate(entry.date))}</td>
          <td>${money(entry.amount)}</td>
          <td>${money(projection.dailyTarget)}</td>
          <td class="${status.className}-text">${signedMoney(difference)}</td>
          <td>${money(adjustedBalance)}</td>
          <td><span class="status-pill ${status.className}">${status.label}</span></td>
          <td><button class="link-button" type="button" data-remove-spending="${entry.date}">Remove</button></td>
        </tr>
      `;
    })
    .join('');

  document.querySelectorAll('[data-remove-spending]').forEach((button) => {
    button.addEventListener('click', () => {
      saveSpendingEntries(readSpendingEntries().filter((entry) => entry.date !== button.dataset.removeSpending));
      update();
    });
  });
}

function renderYearForecast(forecast) {
  outputs.yearForecastTable.innerHTML = forecast.map((row) => `
    <tr>
      <td>${monthFormatter.format(monthKeyToDate(row.monthKey))}</td>
      <td>${money(row.predictedIncome)}</td>
      <td>${money(row.predictedBills)}</td>
      <td>${money(row.predictedForecastItems)}</td>
      <td>${money(row.predictedSpending)}</td>
      <td>${signedMoney(row.predictedNet)}</td>
      <td>${money(row.predictedEndingBalance)}</td>
    </tr>
  `).join('');

  outputs.yearlyIncome.textContent = money(forecast.reduce((total, row) => total + row.predictedIncome, 0));
  outputs.yearlyBills.textContent = money(forecast.reduce((total, row) => total + row.predictedBills, 0));
  outputs.yearlyPredictedSpending.textContent = money(forecast.reduce((total, row) => total + row.predictedSpending, 0));
  outputs.yearlyEndingBalance.textContent = money(forecast.at(-1)?.predictedEndingBalance || 0);
  outputs.predictionNote.textContent = 'Predictions use your plan until actual forecast-category spending exists, then average previous actual item spending to estimate coming months.';
}

function renderActualForecastItemOptions(forecastItems) {
  const monthKey = actualFields.actualMonth.value || getCurrentMonthKey();
  const currentValue = actualFields.actualForecastItem.value;
  const items = getForecastItemsForMonth(forecastItems, monthKey);

  actualFields.actualForecastItem.innerHTML = items.length
    ? items.map((item) => `<option value="${item.id}">${item.name}</option>`).join('')
    : '<option value="">Add a forecast category first</option>';

  if (items.some((item) => item.id === currentValue)) {
    actualFields.actualForecastItem.value = currentValue;
  }
}

function renderMonthlyComparison(forecast, monthlyActuals, forecastItems) {
  renderActualForecastItemOptions(forecastItems);

  const rows = forecast.flatMap((forecastRow) =>
    getForecastItemsForMonth(forecastItems, forecastRow.monthKey).map((item) => {
      const actual = monthlyActuals.find((entry) => entry.month === forecastRow.monthKey && entry.itemId === item.id);
      const actualAmount = actual?.amount || 0;
      const variance = item.amount - actualAmount;
      const expectedAccrued = getForecastItemAccruedAmount(item, forecastRow.monthKey);
      return { forecastRow, item, actual, actualAmount, variance, expectedAccrued };
    }),
  );

  outputs.monthlyComparisonEmpty.hidden = rows.length > 0;
  outputs.monthlyComparisonTable.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${monthFormatter.format(monthKeyToDate(row.forecastRow.monthKey))}</td>
        <td>${row.item.name}</td>
        <td>${money(row.item.amount)}</td>
        <td>${money(row.expectedAccrued)}</td>
        <td>${money(row.actualAmount)}</td>
        <td class="${row.variance >= 0 ? 'good' : 'bad'}-text">${signedMoney(row.variance)}</td>
        <td><span class="status-pill ${row.variance >= 0 ? 'good' : 'bad'}">${row.variance >= 0 ? 'Under forecast' : 'Over forecast'}</span></td>
        <td>${row.actual ? `<button class="link-button" type="button" data-remove-actual-month="${row.forecastRow.monthKey}" data-remove-actual-item="${row.item.id}">Remove</button>` : '—'}</td>
      </tr>
    `)
    .join('');

  document.querySelectorAll('[data-remove-actual-item]').forEach((button) => {
    button.addEventListener('click', () => {
      saveMonthlyActuals(readMonthlyActuals().filter((actual) => actual.month !== button.dataset.removeActualMonth || actual.itemId !== button.dataset.removeActualItem));
      update();
    });
  });
}


function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${url}"]`);
    if (existingScript?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existingScript || document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${url}`));

    if (!existingScript) {
      document.head.append(script);
    }
  });
}

async function ensureHighchartsLoaded() {
  if (window.Highcharts) return window.Highcharts;

  highchartsLoadPromise ||= (async () => {
    const errors = [];
    for (const url of HIGHCHARTS_SCRIPT_URLS) {
      try {
        await loadScript(url);
        if (window.Highcharts) return window.Highcharts;
        errors.push(`Loaded ${url}, but Highcharts was unavailable`);
      } catch (error) {
        errors.push(error.message);
      }
    }
    throw new Error(errors.join(' | '));
  })();

  return highchartsLoadPromise;
}

function getActualSeries(trajectory, spendingEntries, projection) {
  return spendingEntries
    .map((entry) => {
      const expectedPoint = trajectory.find((point) => point.dateKey === entry.date);
      if (!expectedPoint) return null;
      const actualBalance = getAdjustedBalanceForSpendingEntry(entry, spendingEntries, projection);
      return {
        date: entry.date,
        dateLabel: dateFormatter.format(dateKeyToLocalDate(entry.date)),
        expectedBalance: expectedPoint.balance,
        actualBalance,
        amount: entry.amount,
        delta: actualBalance - expectedPoint.balance,
      };
    })
    .filter(Boolean);
}


function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function pointsToPath(points) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function renderFallbackDotPlot(container, trajectory, actualSeries) {
  const width = 1200;
  const height = 520;
  const padding = { top: 44, right: 56, bottom: 72, left: 142 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const balances = [...trajectory.map((point) => point.balance), ...actualSeries.map((point) => point.actualBalance)];
  const min = Math.min(0, ...balances);
  const max = Math.max(100, ...balances);
  const range = max - min || 1;
  const xForIndex = (index) => padding.left + (chartWidth * index) / (trajectory.length - 1 || 1);
  const yForBalance = (balance) => padding.top + ((max - balance) / range) * chartHeight;
  const expectedPoints = trajectory.map((point, index) => ({ x: xForIndex(index), y: yForBalance(point.balance), point }));
  const actualPoints = actualSeries.map((point) => {
    const index = trajectory.findIndex((trajectoryPoint) => trajectoryPoint.dateKey === point.date);
    return { x: xForIndex(index), y: yForBalance(point.actualBalance), point };
  });
  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'fallback-dot-plot',
    role: 'img',
    'aria-label': 'Fallback dot plot comparing expected and actual balance',
  });

  for (let tick = 0; tick <= 4; tick += 1) {
    const y = padding.top + (chartHeight * tick) / 4;
    const value = max - (range * tick) / 4;
    svg.append(createSvgElement('line', { x1: padding.left, x2: width - padding.right, y1: y, y2: y, class: 'chart-grid-line' }));
    const label = createSvgElement('text', { x: padding.left - 16, y: y + 5, class: 'chart-axis-label', 'text-anchor': 'end' });
    label.textContent = money(value);
    svg.append(label);
  }

  svg.append(createSvgElement('path', { d: pointsToPath(expectedPoints), class: 'chart-line predicted' }));
  actualPoints.forEach((point) => {
    svg.append(createSvgElement('circle', {
      cx: point.x,
      cy: point.y,
      r: 7,
      class: point.point.delta >= 0 ? 'chart-marker under' : 'chart-marker over',
    }));
  });

  const note = createSvgElement('text', { x: padding.left, y: 24, class: 'chart-axis-label' });
  note.textContent = 'Built-in fallback dot plot — Highcharts CDN unavailable';
  svg.append(note);

  const startLabel = createSvgElement('text', { x: padding.left, y: height - 26, class: 'chart-axis-label', 'text-anchor': 'start' });
  startLabel.textContent = dateFormatter.format(trajectory[0].date);
  const endLabel = createSvgElement('text', { x: width - padding.right, y: height - 26, class: 'chart-axis-label', 'text-anchor': 'end' });
  endLabel.textContent = dateFormatter.format(trajectory.at(-1).date);
  svg.append(startLabel, endLabel);

  container.replaceChildren(svg);
}

function renderChart(trajectory, spendingEntries, projection) {
  const container = outputs.chart;
  const actualSeries = getActualSeries(trajectory, spendingEntries, projection);
  const expectedSeries = trajectory.map((point, index) => ({ x: index, y: displayAmount(point.balance), dateKey: point.dateKey }));
  const actualPoints = actualSeries.map((point) => ({
    name: point.dateLabel,
    x: trajectory.findIndex((trajectoryPoint) => trajectoryPoint.dateKey === point.date),
    y: displayAmount(point.actualBalance),
    dateKey: point.date,
    expected: money(point.expectedBalance),
    actual: money(point.actualBalance),
    spent: money(point.amount),
    delta: signedMoney(point.delta),
    color: point.delta >= 0 ? '#30d158' : '#ff453a',
  }));

  if (!window.Highcharts) {
    container.innerHTML = '<div class="chart-fallback">Loading Highcharts dot plot...</div>';
    ensureHighchartsLoaded()
      .then(() => renderChart(trajectory, spendingEntries, projection))
      .catch(() => {
        renderFallbackDotPlot(container, trajectory, actualSeries);
      });
    return;
  }

  trajectoryChart = window.Highcharts.chart(container, {
    chart: {
      type: 'scatter',
      backgroundColor: 'transparent',
      height: 520,
      spacing: [28, 28, 24, 24],
      style: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    },
    title: { text: null },
    credits: { enabled: false },
    accessibility: { enabled: false },
    xAxis: {
      type: 'category',
      categories: trajectory.map((point) => point.dateKey),
      tickInterval: Math.max(1, Math.floor(trajectory.length / 8)),
      labels: {
        formatter() { return dateFormatter.format(dateKeyToLocalDate(this.value)); },
        style: { color: '#667085', fontWeight: '700' },
      },
      lineColor: '#d9e2ec',
      tickColor: '#d9e2ec',
    },
    yAxis: {
      title: { text: `Balance (${selectedCurrency})`, style: { color: '#667085', fontWeight: '800' } },
      gridLineColor: '#d9e2ec',
      labels: {
        formatter() { return createCurrencyFormatter().format(this.value); },
        style: { color: '#667085', fontWeight: '700' },
      },
    },
    legend: {
      align: 'right',
      verticalAlign: 'top',
      itemStyle: { color: '#344054', fontWeight: '800' },
    },
    tooltip: {
      useHTML: true,
      borderRadius: 14,
      shadow: false,
      backgroundColor: 'rgba(255,255,255,0.96)',
      formatter() {
        if (this.series.name === 'Expected balance') {
          return `<strong>${dateFormatter.format(dateKeyToLocalDate(this.point.dateKey))}</strong><br/>Expected: ${createCurrencyFormatter().format(this.y)}`;
        }
        return `<strong>${this.point.name}</strong><br/>Actual: ${this.point.actual}<br/>Expected: ${this.point.expected}<br/>Difference: ${this.point.delta}<br/>Spent: ${this.point.spent}`;
      },
    },
    plotOptions: {
      series: { animation: { duration: 350 } },
      line: {
        marker: { enabled: false },
        lineWidth: 3,
        states: { hover: { lineWidthPlus: 0 } },
      },
      scatter: {
        marker: {
          radius: 7,
          symbol: 'circle',
          lineWidth: 3,
          lineColor: '#ffffff',
        },
      },
    },
    series: [
      {
        name: 'Expected balance',
        type: 'line',
        data: expectedSeries,
        color: '#2563eb',
        zIndex: 1,
      },
      {
        name: 'Actual performance',
        type: 'scatter',
        data: actualPoints,
        colorByPoint: true,
        zIndex: 2,
      },
    ],
  });
}


function updateCurrencyControls() {
  currencyControls.currencySelect.value = selectedCurrency;
  currencyControls.labels.forEach((label) => {
    label.textContent = selectedCurrency;
    label.classList.toggle('dkk', selectedCurrency === 'DKK');
    label.classList.toggle('eur', selectedCurrency === 'EUR');
  });
  currencyControls.rateValue.textContent = `1 EUR = ${createCurrencyFormatter('DKK').format(eurToDkkRate)}`;
  currencyControls.rateStatus.textContent = exchangeRateDate
    ? `Latest daily reference rate from ${exchangeRateDate}. Values display in ${selectedCurrency}.`
    : `Using fallback EUR/DKK rate until the latest rate loads. Values display in ${selectedCurrency}.`;
}

function extractEurToDkkRate(data) {
  return Number(data.rate || data.rates?.DKK || data.dkk);
}

async function fetchLatestExchangeRate() {
  updateCurrencyControls();
  const errors = [];

  for (const url of RATE_API_URLS) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Exchange rate request failed with ${response.status}`);
      const data = await response.json();
      const latestRate = extractEurToDkkRate(data);
      if (!Number.isFinite(latestRate)) throw new Error('Exchange rate response missing DKK');

      eurToDkkRate = latestRate;
      exchangeRateDate = data.date || data.timestamp || getTodayDateKey();
      const plan = readPlan();
      saveCurrencySettings();
      savePlan(plan);
      loadPlan();
      update();
      return;
    } catch (error) {
      errors.push(error.message);
    }
  }

  currencyControls.rateStatus.textContent = `Could not refresh the live rate. Using saved/fallback rate. ${errors.join(' | ')}`;
}

function update() {
  updateCurrencyControls();
  const plan = readPlan();
  const bills = readBills();
  const forecastItems = readForecastItems();
  const spendingEntries = readSpendingEntries();
  const monthlyActuals = readMonthlyActuals();
  savePlan(plan);
  const projection = calculateProjection(plan, bills, forecastItems);
  const forecast = calculateYearForecast(plan, bills, forecastItems, spendingEntries, monthlyActuals);

  renderSummary(plan, projection, spendingEntries);
  renderBills(bills, plan);
  renderForecastItems(forecastItems, plan);
  renderProjectionTable(projection.trajectory);
  renderSpendingEntries(spendingEntries, projection);
  renderYearForecast(forecast);
  renderMonthlyComparison(forecast, monthlyActuals, forecastItems);
  renderChart(projection.trajectory, spendingEntries, projection);
}

function addBill() {
  const name = billFields.billName.value.trim();
  const amount = selectedToDkk(Number(billFields.billAmount.value));
  if (!name || !Number.isFinite(amount)) return;
  saveBills([...readBills(), { id: createId(), name, amount, month: billFields.billMonth.value }]);
  billFields.billName.value = '';
  billFields.billAmount.value = '';
  update();
}

function addForecastItem() {
  const name = forecastItemFields.forecastItemName.value.trim();
  const amount = selectedToDkk(Number(forecastItemFields.forecastItemAmount.value));
  if (!name || !Number.isFinite(amount)) return;
  saveForecastItems([...readForecastItems(), { id: createId(), name, amount, month: forecastItemFields.forecastItemMonth.value }]);
  forecastItemFields.forecastItemName.value = '';
  forecastItemFields.forecastItemAmount.value = '';
  update();
}

function addSpendingEntry() {
  const date = spendingFields.spendingDate.value || getTodayDateKey();
  const amount = selectedToDkk(Number(spendingFields.dailySpent.value));
  if (!Number.isFinite(amount)) {
    spendingFields.dailySpent.focus();
    return;
  }
  const withoutSameDate = readSpendingEntries().filter((entry) => entry.date !== date);
  saveSpendingEntries([...withoutSameDate, { date, amount }]);
  spendingFields.dailySpent.value = '';
  update();
}

function saveMonthlyActual() {
  const month = actualFields.actualMonth.value || getCurrentMonthKey();
  const itemId = actualFields.actualForecastItem.value;
  const amount = selectedToDkk(Number(actualFields.actualForecastSpent.value));
  if (!itemId || !Number.isFinite(amount)) return;

  const withoutSameItem = readMonthlyActuals().filter((actual) => actual.month !== month || actual.itemId !== itemId);
  saveMonthlyActuals([...withoutSameItem, { month, itemId, amount }]);
  actualFields.actualForecastSpent.value = '';
  update();
}



function activateTab(tabName) {
  tabs.buttons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  tabs.panels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.hidden = !isActive;
    panel.classList.toggle('active', isActive);
  });

  if (tabName === 'actuals') {
    update();
    trajectoryChart?.reflow?.();
  }
}

tabs.buttons.forEach((button) => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
});

currencyControls.currencySelect.addEventListener('change', () => {
  const plan = readPlan();
  savePlan(plan);
  selectedCurrency = currencyControls.currencySelect.value;
  saveCurrencySettings();
  loadPlan();
  update();
});

Object.values(fields).forEach((field) => field.addEventListener('input', update));

document.querySelector('#billForm').addEventListener('submit', (event) => {
  event.preventDefault();
  addBill();
});

document.querySelector('#clearBillsButton').addEventListener('click', () => {
  saveBills([]);
  update();
});

document.querySelector('#forecastItemForm').addEventListener('submit', (event) => {
  event.preventDefault();
  addForecastItem();
});

document.querySelector('#clearForecastItemsButton').addEventListener('click', () => {
  saveForecastItems([]);
  update();
});

document.querySelector('#spendingForm').addEventListener('submit', (event) => {
  event.preventDefault();
  addSpendingEntry();
});

document.querySelector('#clearSpendingButton').addEventListener('click', () => {
  removeSavedJson(SPENDING_STORAGE_KEY);
  update();
});

actualFields.actualMonth.addEventListener('input', () => {
  renderActualForecastItemOptions(readForecastItems());
});

document.querySelector('#actualMonthlyForm').addEventListener('submit', (event) => {
  event.preventDefault();
  saveMonthlyActual();
});

document.querySelector('#clearMonthlyActualsButton').addEventListener('click', () => {
  removeSavedJson(MONTHLY_ACTUALS_STORAGE_KEY);
  update();
});

document.querySelector('#resetButton').addEventListener('click', () => {
  removeSavedJson(PLAN_STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  loadPlan();
  update();
});

readCurrencySettings();
loadPlan();
update();
fetchLatestExchangeRate();