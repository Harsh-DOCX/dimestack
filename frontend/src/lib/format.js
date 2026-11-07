export function formatMoney(amount, currency = 'INR') {
  const value = Number(amount) || 0;
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function toInput(date) {
  const d = date instanceof Date ? date : new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayInput() {
  return toInput(new Date());
}

export function startOfMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toInput(date);
}

export function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

export function currentMonth() {
  return todayInput().slice(0, 7);
}
