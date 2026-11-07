const {
  Transaction,
  Transfer,
  Recurring,
  Account,
  Category,
} = require('./models');
const { advanceDate, fromCents, monthKey, eachDate, eachMonth } = require('./util');

async function ensureRecurring(userId, today) {
  const due = await Recurring.find({ user: userId, active: true, nextDate: { $lte: today } });
  let created = 0;
  for (const item of due) {
    let guard = 0;
    while (item.nextDate <= today && guard < 36) {
      await Transaction.create({
        user: userId,
        ledger: item.ledger,
        account: item.account,
        category: item.category,
        amount: item.amount,
        type: item.type,
        description: item.description,
        date: item.nextDate,
        recurring: item._id,
      });
      item.nextDate = advanceDate(item.nextDate, item.frequency);
      created += 1;
      guard += 1;
    }
    if (item.nextDate <= today) item.active = false;
    await item.save();
  }
  return created;
}

function txEffect(accountKind, type, amount) {
  if (accountKind === 'asset') return type === 'income' ? amount : -amount;
  return type === 'expense' ? amount : -amount;
}

function transferEffect(account, transfer) {
  const id = String(account._id);
  const incoming = String(transfer.toAccount) === id;
  const outgoing = String(transfer.fromAccount) === id;
  if (!incoming && !outgoing) return 0;
  if (account.kind === 'asset') return incoming ? transfer.amount : -transfer.amount;
  return incoming ? -transfer.amount : transfer.amount;
}

function accountBalance(account, txs, transfers, asOf) {
  let cents = account.openingBalance || 0;
  for (const tx of txs) {
    if (asOf && tx.date > asOf) continue;
    if (String(tx.account) !== String(account._id)) continue;
    cents += txEffect(account.kind, tx.type, tx.amount);
  }
  for (const transfer of transfers) {
    if (asOf && transfer.date > asOf) continue;
    cents += transferEffect(account, transfer);
  }
  return cents;
}

function categoryLabel(category) {
  if (!category) return 'Uncategorized';
  if (category.parent && category.parent.name) return category.parent.name;
  return category.name;
}

async function overview(userId, { from, to, ledgerId }) {
  const query = { user: userId, date: { $gte: from, $lte: to } };
  if (ledgerId) query.ledger = ledgerId;
  const txs = await Transaction.find(query).populate({ path: 'category', populate: { path: 'parent' } }).lean();
  let income = 0;
  let expense = 0;
  const byDate = new Map();
  const byCategory = new Map();
  const byMonth = new Map();
  for (const tx of txs) {
    const amount = tx.amount;
    if (tx.type === 'income') income += amount;
    else expense += amount;
    const day = byDate.get(tx.date) || { income: 0, expense: 0 };
    day[tx.type] += amount;
    byDate.set(tx.date, day);
    if (tx.type === 'expense') {
      const label = categoryLabel(tx.category);
      byCategory.set(label, (byCategory.get(label) || 0) + amount);
    }
    const month = monthKey(tx.date);
    const bucket = byMonth.get(month) || { income: 0, expense: 0 };
    bucket[tx.type] += amount;
    byMonth.set(month, bucket);
  }

  const span = eachDate(from, to);
  const useMonths = span.length > 120;
  const balanceSeries = [];
  let running = 0;
  if (useMonths) {
    for (const month of eachMonth(from, to)) {
      const bucket = byMonth.get(month) || { income: 0, expense: 0 };
      running += bucket.income - bucket.expense;
      balanceSeries.push({
        label: month,
        income: fromCents(bucket.income),
        expense: fromCents(bucket.expense),
        balance: fromCents(running),
      });
    }
  } else {
    for (const date of span) {
      const bucket = byDate.get(date) || { income: 0, expense: 0 };
      running += bucket.income - bucket.expense;
      balanceSeries.push({
        label: date.slice(5),
        income: fromCents(bucket.income),
        expense: fromCents(bucket.expense),
        balance: fromCents(running),
      });
    }
  }

  const monthly = eachMonth(from, to).map((month) => {
    const bucket = byMonth.get(month) || { income: 0, expense: 0 };
    return {
      month,
      income: fromCents(bucket.income),
      expense: fromCents(bucket.expense),
      savings: fromCents(bucket.income - bucket.expense),
    };
  });

  const distribution = [...byCategory.entries()]
    .map(([label, amount]) => ({ label, amount: fromCents(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const net = income - expense;
  return {
    income: fromCents(income),
    expense: fromCents(expense),
    net: fromCents(net),
    savingsRate: income > 0 ? Math.round((net / income) * 1000) / 10 : 0,
    count: txs.length,
    balanceSeries,
    distribution,
    monthly,
    typeSplit: [
      { label: 'Income', amount: fromCents(income) },
      { label: 'Expenses', amount: fromCents(expense) },
    ],
  };
}

async function netWorth(userId, { from, to }) {
  const [accounts, txs, transfers] = await Promise.all([
    Account.find({ user: userId }).lean(),
    Transaction.find({ user: userId, date: { $lte: to } }).lean(),
    Transfer.find({ user: userId, date: { $lte: to } }).lean(),
  ]);
  const rows = accounts.map((account) => ({
    id: String(account._id),
    name: account.name,
    kind: account.kind,
    ledgerId: account.ledger ? String(account.ledger) : '',
    openingBalance: fromCents(account.openingBalance || 0),
    balance: fromCents(accountBalance(account, txs, transfers, to)),
  }));
  const assets = rows.filter((row) => row.kind === 'asset').reduce((sum, row) => sum + row.balance, 0);
  const liabilities = rows.filter((row) => row.kind === 'liability').reduce((sum, row) => sum + row.balance, 0);
  const span = eachDate(from, to);
  const step = span.length > 90 ? Math.ceil(span.length / 60) : 1;
  const series = [];
  for (let i = 0; i < span.length; i += step) {
    const date = span[i];
    let assetCents = 0;
    let liabilityCents = 0;
    for (const account of accounts) {
      const cents = accountBalance(account, txs, transfers, date);
      if (account.kind === 'asset') assetCents += cents;
      else liabilityCents += cents;
    }
    series.push({
      label: date.slice(5),
      date,
      assets: fromCents(assetCents),
      liabilities: fromCents(liabilityCents),
      net: fromCents(assetCents - liabilityCents),
    });
  }
  return {
    accounts: rows,
    assets: Math.round(assets * 100) / 100,
    liabilities: Math.round(liabilities * 100) / 100,
    net: Math.round((assets - liabilities) * 100) / 100,
    series,
  };
}

async function ownedCategory(userId, categoryId) {
  if (!categoryId) return null;
  return Category.findOne({ _id: categoryId, user: userId });
}

module.exports = { ensureRecurring, overview, netWorth, ownedCategory, accountBalance, fromCents };
