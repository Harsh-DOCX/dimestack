const { Ledger, Account, Category } = require('./models');

const TREE = [
  { name: 'Salary', type: 'income' },
  { name: 'Freelance', type: 'income' },
  { name: 'Investments', type: 'income', children: ['Dividends', 'Interest'] },
  { name: 'Housing', type: 'expense', children: ['Rent', 'Maintenance'] },
  { name: 'Food', type: 'expense', children: ['Groceries', 'Dining out'] },
  { name: 'Transport', type: 'expense', children: ['Fuel', 'Transit'] },
  { name: 'Utilities', type: 'expense', children: ['Electricity', 'Internet', 'Phone'] },
  { name: 'Health', type: 'expense' },
  { name: 'Personal', type: 'expense', children: ['Shopping', 'Subscriptions'] },
];

async function seedUserFinance(user) {
  const ledger = await Ledger.create({
    user: user._id,
    name: 'Personal',
    description: 'Everyday income and spending',
    currency: user.currency || 'INR',
  });
  await Account.create([
    { user: user._id, ledger: ledger._id, name: 'Cash', kind: 'asset', openingBalance: 0 },
    { user: user._id, ledger: ledger._id, name: 'Bank', kind: 'asset', openingBalance: 0 },
    { user: user._id, ledger: ledger._id, name: 'Credit card', kind: 'liability', openingBalance: 0 },
  ]);
  for (const node of TREE) {
    const parent = await Category.create({ user: user._id, name: node.name, type: node.type, parent: null });
    if (node.children) {
      await Category.create(
        node.children.map((name) => ({ user: user._id, name, type: node.type, parent: parent._id }))
      );
    }
  }
  return ledger;
}

module.exports = { seedUserFinance };
