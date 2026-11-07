const express = require('express');
const PDFDocument = require('pdfkit');
const {
  Ledger,
  Account,
  Category,
  Transaction,
  Transfer,
  Budget,
  Recurring,
  Goal,
} = require('../models');
const { requireAuth, requireVerified } = require('../middleware');
const { ensureRecurring, overview, netWorth } = require('../finance');
const { fromCents, toCents, isDateStr, csvEscape, parseCsv } = require('../util');
const { z, objectId, dateStr, monthStr, parse, bad } = require('../validate');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));

function rangeOf(req) {
  const today = req.today;
  const from = req.query.from || `${today.slice(0, 7)}-01`;
  const to = req.query.to || today;
  if (!isDateStr(from) || !isDateStr(to) || from > to) throw bad('Choose a valid date range.');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days > 366 * 5) throw bad('Date range cannot exceed 5 years.');
  return { from, to };
}

async function own(Model, id, userId) {
  if (!isId(id)) return null;
  return Model.findOne({ _id: id, user: userId });
}

async function assertLinks(userId, { ledgerId, accountId, categoryId, subcategoryId, type }) {
  const ledger = await own(Ledger, ledgerId, userId);
  if (!ledger) throw bad('Choose a ledger.');
  const account = await own(Account, accountId, userId);
  if (!account) throw bad('Choose an account.');
  if (account.ledger && String(account.ledger) !== String(ledger._id)) {
    throw bad('That account belongs to a different ledger.');
  }
  const category = await own(Category, categoryId, userId);
  if (!category || category.type !== type) throw bad('Choose a category that matches the transaction type.');
  let leaf = category;
  if (subcategoryId) {
    const sub = await own(Category, subcategoryId, userId);
    if (!sub || String(sub.parent) !== String(category._id)) throw bad('Choose a subcategory of the selected category.');
    leaf = sub;
  } else if (category.parent) {
    throw bad('Choose a top-level category, then a subcategory if you need one.');
  }
  return { ledger, account, category: leaf };
}

function presentCategory(category) {
  if (!category) return null;
  const parent = category.parent && category.parent.name ? category.parent : null;
  return {
    category: parent
      ? { id: String(parent._id), name: parent.name }
      : { id: String(category._id), name: category.name },
    subcategory: parent ? { id: String(category._id), name: category.name } : null,
  };
}

function presentTransaction(tx) {
  const names = presentCategory(tx.category);
  return {
    id: String(tx._id),
    kind: 'transaction',
    date: tx.date,
    amount: fromCents(tx.amount),
    type: tx.type,
    description: tx.description,
    ledger: tx.ledger ? { id: String(tx.ledger._id || tx.ledger), name: tx.ledger.name || '' } : null,
    account: tx.account ? { id: String(tx.account._id || tx.account), name: tx.account.name || '' } : null,
    counterAccount: null,
    ...(names || { category: null, subcategory: null }),
  };
}

function presentTransfer(transfer) {
  return {
    id: String(transfer._id),
    kind: 'transfer',
    date: transfer.date,
    amount: fromCents(transfer.amount),
    type: 'transfer',
    description: transfer.description,
    ledger: transfer.ledger ? { id: String(transfer.ledger._id || transfer.ledger), name: transfer.ledger.name || '' } : null,
    account: transfer.fromAccount
      ? { id: String(transfer.fromAccount._id || transfer.fromAccount), name: transfer.fromAccount.name || '' }
      : null,
    counterAccount: transfer.toAccount
      ? { id: String(transfer.toAccount._id || transfer.toAccount), name: transfer.toAccount.name || '' }
      : null,
    category: null,
    subcategory: null,
  };
}

const txPopulate = [
  { path: 'ledger', select: 'name' },
  { path: 'account', select: 'name' },
  { path: 'category', populate: { path: 'parent', select: 'name' } },
];

router.use(requireAuth);

router.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.json({ transactions: [], ledgers: [], goals: [] });
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [transactions, ledgers, goals] = await Promise.all([
    Transaction.find({ user: req.user._id, description: rx }).sort({ date: -1 }).limit(8).populate(txPopulate),
    Ledger.find({ user: req.user._id, name: rx }).limit(5),
    Goal.find({ user: req.user._id, name: rx }).limit(5),
  ]);
  res.json({
    transactions: transactions.map(presentTransaction),
    ledgers: ledgers.map((ledger) => ({ id: String(ledger._id), name: ledger.name })),
    goals: goals.map((goal) => ({ id: String(goal._id), name: goal.name })),
  });
}));

router.get('/ledgers', wrap(async (req, res) => {
  const ledgers = await Ledger.find({ user: req.user._id }).sort({ name: 1 });
  res.json({
    ledgers: ledgers.map((ledger) => ({
      id: String(ledger._id),
      name: ledger.name,
      description: ledger.description,
      currency: ledger.currency,
    })),
  });
}));

router.post('/ledgers', requireVerified, wrap(async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Name the ledger.').max(60),
      description: z.string().max(180).optional().default(''),
      currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD']).optional(),
    }),
    req.body
  );
  const ledger = await Ledger.create({
    user: req.user._id,
    name: data.name,
    description: data.description || '',
    currency: data.currency || req.user.currency || 'INR',
  });
  await Account.create({ user: req.user._id, ledger: ledger._id, name: 'Cash', kind: 'asset', openingBalance: 0 });
  res.status(201).json({
    ledger: { id: String(ledger._id), name: ledger.name, description: ledger.description, currency: ledger.currency },
  });
}));

router.patch('/ledgers/:id', requireVerified, wrap(async (req, res) => {
  const ledger = await own(Ledger, req.params.id, req.user._id);
  if (!ledger) throw bad('Ledger not found.', 404);
  const data = parse(
    z.object({
      name: z.string().trim().min(2).max(60),
      description: z.string().max(180).optional().default(''),
      currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD']),
    }),
    req.body
  );
  ledger.name = data.name;
  ledger.description = data.description || '';
  ledger.currency = data.currency;
  await ledger.save();
  res.json({ ledger: { id: String(ledger._id), name: ledger.name, description: ledger.description, currency: ledger.currency } });
}));

router.delete('/ledgers/:id', requireVerified, wrap(async (req, res) => {
  const ledger = await own(Ledger, req.params.id, req.user._id);
  if (!ledger) throw bad('Ledger not found.', 404);
  const [txCount, accountCount] = await Promise.all([
    Transaction.countDocuments({ user: req.user._id, ledger: ledger._id }),
    Account.countDocuments({ user: req.user._id, ledger: ledger._id }),
  ]);
  if ((txCount || accountCount) && req.query.force !== 'true') {
    throw bad('This ledger still has accounts or transactions. Confirm deletion to remove them too.', 409);
  }
  await Promise.all([
    Transaction.deleteMany({ user: req.user._id, ledger: ledger._id }),
    Transfer.deleteMany({ user: req.user._id, ledger: ledger._id }),
    Recurring.deleteMany({ user: req.user._id, ledger: ledger._id }),
    Budget.deleteMany({ user: req.user._id, ledger: ledger._id }),
    Account.deleteMany({ user: req.user._id, ledger: ledger._id }),
    ledger.deleteOne(),
  ]);
  res.json({ ok: true });
}));

router.get('/accounts', wrap(async (req, res) => {
  const accounts = await Account.find({ user: req.user._id }).sort({ name: 1 });
  res.json({
    accounts: accounts.map((account) => ({
      id: String(account._id),
      name: account.name,
      kind: account.kind,
      ledgerId: account.ledger ? String(account.ledger) : '',
      openingBalance: fromCents(account.openingBalance || 0),
    })),
  });
}));

router.post('/accounts', requireVerified, wrap(async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Name the account.').max(60),
      kind: z.enum(['asset', 'liability']),
      ledgerId: objectId,
      openingBalance: z.coerce.number().min(-1000000000).max(1000000000),
    }),
    req.body
  );
  const ledger = await own(Ledger, data.ledgerId, req.user._id);
  if (!ledger) throw bad('Choose a ledger.');
  const account = await Account.create({
    user: req.user._id,
    ledger: ledger._id,
    name: data.name,
    kind: data.kind,
    openingBalance: toCents(data.openingBalance),
  });
  res.status(201).json({
    account: {
      id: String(account._id),
      name: account.name,
      kind: account.kind,
      ledgerId: String(ledger._id),
      openingBalance: fromCents(account.openingBalance),
    },
  });
}));

router.patch('/accounts/:id', requireVerified, wrap(async (req, res) => {
  const account = await own(Account, req.params.id, req.user._id);
  if (!account) throw bad('Account not found.', 404);
  const data = parse(
    z.object({
      name: z.string().trim().min(2).max(60),
      kind: z.enum(['asset', 'liability']),
      openingBalance: z.coerce.number().min(-1000000000).max(1000000000),
    }),
    req.body
  );
  account.name = data.name;
  account.kind = data.kind;
  account.openingBalance = toCents(data.openingBalance);
  await account.save();
  res.json({ ok: true });
}));

router.delete('/accounts/:id', requireVerified, wrap(async (req, res) => {
  const account = await own(Account, req.params.id, req.user._id);
  if (!account) throw bad('Account not found.', 404);
  const [tx, incoming, outgoing] = await Promise.all([
    Transaction.countDocuments({ user: req.user._id, account: account._id }),
    Transfer.countDocuments({ user: req.user._id, toAccount: account._id }),
    Transfer.countDocuments({ user: req.user._id, fromAccount: account._id }),
  ]);
  if (tx || incoming || outgoing) throw bad('Move or delete the records on this account before removing it.', 409);
  await account.deleteOne();
  res.json({ ok: true });
}));

router.get('/categories', wrap(async (req, res) => {
  const categories = await Category.find({ user: req.user._id }).sort({ type: 1, name: 1 });
  res.json({
    categories: categories.map((category) => ({
      id: String(category._id),
      name: category.name,
      type: category.type,
      parentId: category.parent ? String(category.parent) : '',
    })),
  });
}));

router.post('/categories', requireVerified, wrap(async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Name the category.').max(40),
      type: z.enum(['income', 'expense']),
      parentId: z.string().optional().or(z.literal('')),
    }),
    req.body
  );
  let parent = null;
  if (data.parentId) {
    parent = await own(Category, data.parentId, req.user._id);
    if (!parent || parent.parent) throw bad('Subcategories can only sit under a top-level category.');
    if (parent.type !== data.type) throw bad('Subcategory type must match its parent.');
  }
  const category = await Category.create({
    user: req.user._id,
    name: data.name,
    type: data.type,
    parent: parent ? parent._id : null,
  });
  res.status(201).json({
    category: { id: String(category._id), name: category.name, type: category.type, parentId: parent ? String(parent._id) : '' },
  });
}));

router.delete('/categories/:id', requireVerified, wrap(async (req, res) => {
  const category = await own(Category, req.params.id, req.user._id);
  if (!category) throw bad('Category not found.', 404);
  const [children, used, budgets, recurring] = await Promise.all([
    Category.countDocuments({ user: req.user._id, parent: category._id }),
    Transaction.countDocuments({ user: req.user._id, category: category._id }),
    Budget.countDocuments({ user: req.user._id, category: category._id }),
    Recurring.countDocuments({ user: req.user._id, category: category._id }),
  ]);
  if (children || used || budgets || recurring) {
    throw bad('Remove subcategories, transactions, budgets, and schedules that use this category first.', 409);
  }
  await category.deleteOne();
  res.json({ ok: true });
}));

router.get('/transactions', wrap(async (req, res) => {
  await ensureRecurring(req.user._id, req.today);
  const { from, to } = req.query.from || req.query.to ? rangeOf(req) : { from: '0000-01-01', to: '9999-12-31' };
  const page = Math.max(1, Number(req.query.page) || 1);
  const txQuery = { user: req.user._id, date: { $gte: from, $lte: to } };
  const transferQuery = { user: req.user._id, date: { $gte: from, $lte: to } };
  if (isId(req.query.ledgerId)) {
    txQuery.ledger = req.query.ledgerId;
    transferQuery.ledger = req.query.ledgerId;
  }
  if (isId(req.query.accountId)) txQuery.account = req.query.accountId;
  if (isId(req.query.categoryId)) {
    const kids = await Category.find({ user: req.user._id, parent: req.query.categoryId }).select('_id');
    txQuery.category = { $in: [req.query.categoryId, ...kids.map((kid) => kid._id)] };
  }
  if (req.query.type === 'income' || req.query.type === 'expense') txQuery.type = req.query.type;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    txQuery.description = rx;
    transferQuery.description = rx;
  }
  if (req.query.min) {
    const cents = toCents(req.query.min);
    if (Number.isFinite(cents)) txQuery.amount = { ...(txQuery.amount || {}), $gte: cents };
  }
  if (req.query.max) {
    const cents = toCents(req.query.max);
    if (Number.isFinite(cents)) txQuery.amount = { ...(txQuery.amount || {}), $lte: cents };
  }
  const wantTx = req.query.type !== 'transfer';
  const wantTransfer = !req.query.type || req.query.type === 'transfer';
  if (wantTransfer && isId(req.query.accountId)) {
    transferQuery.$or = [{ fromAccount: req.query.accountId }, { toAccount: req.query.accountId }];
  }
  const [txs, transfers] = await Promise.all([
    wantTx ? Transaction.find(txQuery).populate(txPopulate) : [],
    wantTransfer && !req.query.categoryId ? Transfer.find(transferQuery).populate(['ledger', 'fromAccount', 'toAccount']) : [],
  ]);
  let items = [...txs.map(presentTransaction), ...transfers.map(presentTransfer)];
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = items.length;
  items = items.slice((page - 1) * 25, page * 25);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / 25)) });
}));

const txBody = z.object({
  amount: z.coerce.number().positive('Enter an amount greater than zero.').max(1000000000),
  description: z.string().trim().min(1, 'Add a short description.').max(240),
  type: z.enum(['income', 'expense']),
  date: dateStr,
  ledgerId: objectId,
  accountId: objectId,
  categoryId: objectId,
  subcategoryId: z.string().optional().or(z.literal('')),
});

router.post('/transactions', requireVerified, wrap(async (req, res) => {
  const data = parse(txBody, req.body);
  if (!isDateStr(data.date)) throw bad('Use a real date.');
  const links = await assertLinks(req.user._id, data);
  const tx = await Transaction.create({
    user: req.user._id,
    ledger: links.ledger._id,
    account: links.account._id,
    category: links.category._id,
    amount: toCents(data.amount),
    type: data.type,
    description: data.description,
    date: data.date,
  });
  const full = await Transaction.findById(tx._id).populate(txPopulate);
  res.status(201).json({ transaction: presentTransaction(full) });
}));

router.patch('/transactions/:id', requireVerified, wrap(async (req, res) => {
  const tx = await own(Transaction, req.params.id, req.user._id);
  if (!tx) throw bad('Transaction not found.', 404);
  const data = parse(txBody, req.body);
  if (!isDateStr(data.date)) throw bad('Use a real date.');
  const links = await assertLinks(req.user._id, data);
  tx.ledger = links.ledger._id;
  tx.account = links.account._id;
  tx.category = links.category._id;
  tx.amount = toCents(data.amount);
  tx.type = data.type;
  tx.description = data.description;
  tx.date = data.date;
  await tx.save();
  const full = await Transaction.findById(tx._id).populate(txPopulate);
  res.json({ transaction: presentTransaction(full) });
}));

router.delete('/transactions/:id', requireVerified, wrap(async (req, res) => {
  const tx = await own(Transaction, req.params.id, req.user._id);
  if (!tx) throw bad('Transaction not found.', 404);
  await tx.deleteOne();
  res.json({ ok: true });
}));

router.post('/transactions/import', requireVerified, wrap(async (req, res) => {
  const data = parse(z.object({ csv: z.string().min(1, 'The file is empty.').max(2_000_000) }), req.body);
  const rows = parseCsv(data.csv);
  if (rows.length < 2) throw bad('Add a header row and at least one transaction.');
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  for (const name of ['date', 'type', 'amount', 'description', 'ledger', 'account']) {
    if (idx(name) === -1) throw bad(`Missing the ${name} column.`);
  }
  const [ledgers, accounts, categories] = await Promise.all([
    Ledger.find({ user: req.user._id }),
    Account.find({ user: req.user._id }),
    Category.find({ user: req.user._id }),
  ]);
  const byName = (list, name) => list.find((item) => item.name.toLowerCase() === name.toLowerCase());
  const planned = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const cell = (name) => (row[idx(name)] || '').trim();
    const type = cell('type').toLowerCase();
    const date = cell('date');
    const amount = Number(cell('amount'));
    const description = cell('description');
    if (!isDateStr(date)) throw bad(`Row ${r + 1}: use a YYYY-MM-DD date.`);
    if (!Number.isFinite(amount) || amount <= 0) throw bad(`Row ${r + 1}: amount must be greater than zero.`);
    if (!description) throw bad(`Row ${r + 1}: description is required.`);
    const ledger = byName(ledgers, cell('ledger'));
    if (!ledger) throw bad(`Row ${r + 1}: no ledger named ${cell('ledger') || '(blank)'}.`);
    const account = accounts.find((item) => item.name.toLowerCase() === cell('account').toLowerCase() && String(item.ledger) === String(ledger._id));
    if (!account) throw bad(`Row ${r + 1}: no account named ${cell('account') || '(blank)'} on that ledger.`);
    if (type === 'transfer') {
      const toName = cell('toaccount');
      const dest = accounts.find((item) => item.name.toLowerCase() === toName.toLowerCase());
      if (!dest) throw bad(`Row ${r + 1}: no destination account named ${toName || '(blank)'}.`);
      if (String(dest._id) === String(account._id)) throw bad(`Row ${r + 1}: choose two different accounts.`);
      planned.push({ kind: 'transfer', ledger, account, dest, amount, description, date });
      continue;
    }
    if (type !== 'income' && type !== 'expense') throw bad(`Row ${r + 1}: type must be income, expense, or transfer.`);
    const categoryName = cell('category');
    const subName = idx('subcategory') === -1 ? '' : cell('subcategory');
    let category = categories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase() && item.type === type && !item.parent);
    if (!category) throw bad(`Row ${r + 1}: no ${type} category named ${categoryName || '(blank)'}.`);
    if (subName) {
      const sub = categories.find((item) => item.name.toLowerCase() === subName.toLowerCase() && String(item.parent) === String(category._id));
      if (!sub) throw bad(`Row ${r + 1}: no subcategory named ${subName}.`);
      category = sub;
    }
    planned.push({ kind: 'transaction', ledger, account, category, amount, description, date, type });
  }
  for (const item of planned) {
    if (item.kind === 'transfer') {
      await Transfer.create({
        user: req.user._id,
        ledger: item.ledger._id,
        fromAccount: item.account._id,
        toAccount: item.dest._id,
        amount: toCents(item.amount),
        description: item.description,
        date: item.date,
      });
    } else {
      await Transaction.create({
        user: req.user._id,
        ledger: item.ledger._id,
        account: item.account._id,
        category: item.category._id,
        amount: toCents(item.amount),
        type: item.type,
        description: item.description,
        date: item.date,
      });
    }
  }
  res.json({ imported: planned.length });
}));

router.post('/transactions/export', wrap(async (req, res) => {
  const from = req.body.from || '0000-01-01';
  const to = req.body.to || '9999-12-31';
  if (!isDateStr(from) || !isDateStr(to) || from > to) throw bad('Choose a valid date range.');
  const query = { user: req.user._id, date: { $gte: from, $lte: to } };
  if (isId(req.body.ledgerId)) query.ledger = req.body.ledgerId;
  const [txs, transfers] = await Promise.all([
    Transaction.find(query).populate(txPopulate),
    Transfer.find(query).populate(['ledger', 'fromAccount', 'toAccount']),
  ]);
  const lines = [['date', 'type', 'amount', 'description', 'ledger', 'account', 'toAccount', 'category', 'subcategory']];
  for (const tx of txs) {
    const names = presentCategory(tx.category);
    lines.push([
      tx.date,
      tx.type,
      fromCents(tx.amount).toFixed(2),
      tx.description,
      tx.ledger?.name || '',
      tx.account?.name || '',
      '',
      names?.category?.name || '',
      names?.subcategory?.name || '',
    ]);
  }
  for (const transfer of transfers) {
    lines.push([
      transfer.date,
      'transfer',
      fromCents(transfer.amount).toFixed(2),
      transfer.description,
      transfer.ledger?.name || '',
      transfer.fromAccount?.name || '',
      transfer.toAccount?.name || '',
      '',
      '',
    ]);
  }
  const csv = `\uFEFF${lines.map((line) => line.map(csvEscape).join(',')).join('\n')}`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="dimestack-transactions.csv"');
  res.send(csv);
}));

router.post('/transfers', requireVerified, wrap(async (req, res) => {
  const data = parse(
    z.object({
      ledgerId: objectId,
      fromAccountId: objectId,
      toAccountId: objectId,
      amount: z.coerce.number().positive().max(1000000000),
      description: z.string().trim().min(1).max(240),
      date: dateStr,
    }),
    req.body
  );
  if (!isDateStr(data.date)) throw bad('Use a real date.');
  if (data.fromAccountId === data.toAccountId) throw bad('Choose two different accounts.');
  const [ledger, fromAccount, toAccount] = await Promise.all([
    own(Ledger, data.ledgerId, req.user._id),
    own(Account, data.fromAccountId, req.user._id),
    own(Account, data.toAccountId, req.user._id),
  ]);
  if (!ledger || !fromAccount || !toAccount) throw bad('Choose a ledger and two of your accounts.');
  const transfer = await Transfer.create({
    user: req.user._id,
    ledger: ledger._id,
    fromAccount: fromAccount._id,
    toAccount: toAccount._id,
    amount: toCents(data.amount),
    description: data.description,
    date: data.date,
  });
  res.status(201).json({ id: String(transfer._id) });
}));

router.patch('/transfers/:id', requireVerified, wrap(async (req, res) => {
  const transfer = await own(Transfer, req.params.id, req.user._id);
  if (!transfer) throw bad('Transfer not found.', 404);
  const data = parse(
    z.object({
      amount: z.coerce.number().positive().max(1000000000),
      description: z.string().trim().min(1).max(240),
      date: dateStr,
    }),
    req.body
  );
  if (!isDateStr(data.date)) throw bad('Use a real date.');
  transfer.amount = toCents(data.amount);
  transfer.description = data.description;
  transfer.date = data.date;
  await transfer.save();
  res.json({ ok: true });
}));

router.delete('/transfers/:id', requireVerified, wrap(async (req, res) => {
  const transfer = await own(Transfer, req.params.id, req.user._id);
  if (!transfer) throw bad('Transfer not found.', 404);
  await transfer.deleteOne();
  res.json({ ok: true });
}));

router.get('/budgets', wrap(async (req, res) => {
  const month = req.query.month || req.today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad('Use a month in YYYY-MM format.');
  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
  const [budgets, txs, categories] = await Promise.all([
    Budget.find({ user: req.user._id, month }).populate('category'),
    Transaction.find({ user: req.user._id, type: 'expense', date: { $gte: `${month}-01`, $lte: monthEnd } }),
    Category.find({ user: req.user._id }),
  ]);
  const childIds = new Map();
  for (const category of categories) {
    if (!category.parent) continue;
    const key = String(category.parent);
    childIds.set(key, [...(childIds.get(key) || []), String(category._id)]);
  }
  const rows = budgets.map((budget) => {
    const ids = new Set([String(budget.category._id), ...(childIds.get(String(budget.category._id)) || [])]);
    const spent = txs
      .filter((tx) => ids.has(String(tx.category)) && (!budget.ledger || String(tx.ledger) === String(budget.ledger)))
      .reduce((sum, tx) => sum + tx.amount, 0);
    return {
      id: String(budget._id),
      month: budget.month,
      amount: fromCents(budget.amount),
      spent: fromCents(spent),
      ledgerId: budget.ledger ? String(budget.ledger) : '',
      category: budget.category ? { id: String(budget.category._id), name: budget.category.name, type: budget.category.type } : null,
    };
  });
  res.json({ budgets: rows });
}));

router.post('/budgets', requireVerified, wrap(async (req, res) => {
  const data = parse(
    z.object({
      categoryId: objectId,
      month: monthStr,
      amount: z.coerce.number().positive().max(1000000000),
      ledgerId: z.string().optional().or(z.literal('')),
    }),
    req.body
  );
  const category = await own(Category, data.categoryId, req.user._id);
  if (!category || category.type !== 'expense' || category.parent) throw bad('Budget a top-level expense category.');
  let ledger = null;
  if (data.ledgerId) {
    ledger = await own(Ledger, data.ledgerId, req.user._id);
    if (!ledger) throw bad('Choose a ledger.');
  }
  const existing = await Budget.findOne({
    user: req.user._id,
    category: category._id,
    month: data.month,
    ledger: ledger ? ledger._id : null,
  });
  if (existing) {
    existing.amount = toCents(data.amount);
    await existing.save();
    return res.json({ id: String(existing._id), updated: true });
  }
  const budget = await Budget.create({
    user: req.user._id,
    category: category._id,
    month: data.month,
    amount: toCents(data.amount),
    ledger: ledger ? ledger._id : null,
  });
  return res.status(201).json({ id: String(budget._id) });
}));

router.delete('/budgets/:id', requireVerified, wrap(async (req, res) => {
  const budget = await own(Budget, req.params.id, req.user._id);
  if (!budget) throw bad('Budget not found.', 404);
  await budget.deleteOne();
  res.json({ ok: true });
}));

router.get('/recurring', wrap(async (req, res) => {
  const created = await ensureRecurring(req.user._id, req.today);
  const items = await Recurring.find({ user: req.user._id }).sort({ nextDate: 1 }).populate(['ledger', 'account', 'category']);
  res.json({
    recorded: created,
    recurring: items.map((item) => ({
      id: String(item._id),
      amount: fromCents(item.amount),
      type: item.type,
      description: item.description,
      frequency: item.frequency,
      nextDate: item.nextDate,
      active: item.active,
      ledger: item.ledger ? { id: String(item.ledger._id), name: item.ledger.name } : null,
      account: item.account ? { id: String(item.account._id), name: item.account.name } : null,
      category: item.category ? { id: String(item.category._id), name: item.category.name } : null,
    })),
  });
}));

router.post('/recurring', requireVerified, wrap(async (req, res) => {
  const data = parse(
    txBody.extend({ frequency: z.enum(['weekly', 'biweekly', 'monthly', 'yearly']) }),
    { ...req.body, date: req.body.nextDate }
  );
  if (!isDateStr(req.body.nextDate)) throw bad('Use a real next date.');
  const links = await assertLinks(req.user._id, { ...data, date: req.body.nextDate });
  const item = await Recurring.create({
    user: req.user._id,
    ledger: links.ledger._id,
    account: links.account._id,
    category: links.category._id,
    amount: toCents(data.amount),
    type: data.type,
    description: data.description,
    frequency: data.frequency,
    nextDate: req.body.nextDate,
    active: true,
  });
  const recorded = await ensureRecurring(req.user._id, req.today);
  res.status(201).json({ id: String(item._id), recorded });
}));

router.patch('/recurring/:id', requireVerified, wrap(async (req, res) => {
  const item = await own(Recurring, req.params.id, req.user._id);
  if (!item) throw bad('Recurring transaction not found.', 404);
  if (typeof req.body.active === 'boolean' && Object.keys(req.body).length === 1) {
    item.active = req.body.active;
    await item.save();
    return res.json({ ok: true });
  }
  const data = parse(txBody.extend({ frequency: z.enum(['weekly', 'biweekly', 'monthly', 'yearly']) }), {
    ...req.body,
    date: req.body.nextDate,
  });
  const links = await assertLinks(req.user._id, data);
  item.ledger = links.ledger._id;
  item.account = links.account._id;
  item.category = links.category._id;
  item.amount = toCents(data.amount);
  item.type = data.type;
  item.description = data.description;
  item.frequency = data.frequency;
  item.nextDate = req.body.nextDate;
  await item.save();
  return res.json({ ok: true });
}));

router.delete('/recurring/:id', requireVerified, wrap(async (req, res) => {
  const item = await own(Recurring, req.params.id, req.user._id);
  if (!item) throw bad('Recurring transaction not found.', 404);
  await item.deleteOne();
  res.json({ ok: true });
}));

router.get('/goals', wrap(async (req, res) => {
  const goals = await Goal.find({ user: req.user._id }).sort({ deadline: 1, name: 1 });
  res.json({
    goals: goals.map((goal) => ({
      id: String(goal._id),
      name: goal.name,
      targetAmount: fromCents(goal.targetAmount),
      savedAmount: fromCents(goal.savedAmount),
      deadline: goal.deadline || '',
      note: goal.note || '',
      progress: goal.targetAmount > 0 ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 1000) / 10) : 0,
    })),
  });
}));

router.post('/goals', requireVerified, wrap(async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2, 'Name the goal.').max(80),
      targetAmount: z.coerce.number().positive().max(1000000000),
      savedAmount: z.coerce.number().min(0).max(1000000000).optional().default(0),
      deadline: z.string().optional().or(z.literal('')),
      note: z.string().max(240).optional().default(''),
    }),
    req.body
  );
  if (data.deadline && !isDateStr(data.deadline)) throw bad('Use a real deadline or leave it blank.');
  const goal = await Goal.create({
    user: req.user._id,
    name: data.name,
    targetAmount: toCents(data.targetAmount),
    savedAmount: toCents(data.savedAmount || 0),
    deadline: data.deadline || '',
    note: data.note || '',
  });
  res.status(201).json({ id: String(goal._id) });
}));

router.post('/goals/:id/contribute', requireVerified, wrap(async (req, res) => {
  const goal = await own(Goal, req.params.id, req.user._id);
  if (!goal) throw bad('Goal not found.', 404);
  const data = parse(z.object({ amount: z.coerce.number().positive().max(1000000000) }), req.body);
  goal.savedAmount += toCents(data.amount);
  await goal.save();
  res.json({ savedAmount: fromCents(goal.savedAmount) });
}));

router.delete('/goals/:id', requireVerified, wrap(async (req, res) => {
  const goal = await own(Goal, req.params.id, req.user._id);
  if (!goal) throw bad('Goal not found.', 404);
  await goal.deleteOne();
  res.json({ ok: true });
}));

router.get('/reports/overview', wrap(async (req, res) => {
  await ensureRecurring(req.user._id, req.today);
  const range = rangeOf(req);
  if (req.query.ledgerId && !isId(req.query.ledgerId)) throw bad('Choose a valid ledger.');
  if (req.query.ledgerId) {
    const ledger = await own(Ledger, req.query.ledgerId, req.user._id);
    if (!ledger) throw bad('Ledger not found.', 404);
  }
  const report = await overview(req.user._id, { ...range, ledgerId: req.query.ledgerId || '' });
  res.json({ ...report, from: range.from, to: range.to });
}));

router.get('/reports/networth', wrap(async (req, res) => {
  const range = rangeOf(req);
  res.json(await netWorth(req.user._id, range));
}));

router.post('/reports/pdf', wrap(async (req, res) => {
  const from = req.body.from;
  const to = req.body.to;
  if (!isDateStr(from) || !isDateStr(to) || from > to) throw bad('Choose a valid date range.');
  const ledgerId = req.body.ledgerId || '';
  if (ledgerId && !isId(ledgerId)) throw bad('Choose a valid ledger.');
  const report = await overview(req.user._id, { from, to, ledgerId });
  const doc = new PDFDocument({ margin: 48 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.fontSize(18).text('DimeStack report');
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#444444').text(`${req.user.name} · ${from} to ${to}`);
  doc.moveDown();
  doc.fillColor('#111111').fontSize(12);
  doc.text(`Income ${report.income.toFixed(2)}`);
  doc.text(`Expenses ${report.expense.toFixed(2)}`);
  doc.text(`Net ${report.net.toFixed(2)}`);
  doc.text(`Savings rate ${report.savingsRate}%`);
  doc.moveDown();
  doc.fontSize(14).text('Month by month');
  doc.moveDown(0.4);
  doc.fontSize(10);
  report.monthly.forEach((month) => {
    doc.text(`${month.month}    income ${month.income.toFixed(2)}    expenses ${month.expense.toFixed(2)}    savings ${month.savings.toFixed(2)}`);
  });
  doc.moveDown();
  doc.fontSize(14).text('Expense distribution');
  doc.moveDown(0.4);
  doc.fontSize(10);
  if (!report.distribution.length) doc.text('No expenses in this range.');
  report.distribution.forEach((slice) => doc.text(`${slice.label}    ${slice.amount.toFixed(2)}`));
  doc.moveDown();
  doc.fillColor('#555555').fontSize(9).text('DimeStack');
  doc.end();
  const buffer = await done;
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'attachment; filename="dimestack-report.pdf"');
  res.send(buffer);
}));

module.exports = router;
