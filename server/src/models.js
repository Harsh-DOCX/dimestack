const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' },
    googleId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, default: '' },
    verifyExpires: { type: Date },
    resetTokenHash: { type: String, default: '' },
    resetOtpHash: { type: String, default: '' },
    resetExpires: { type: Date },
    phone: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    bio: { type: String, default: '' },
    utm: {
      source: { type: String, default: '' },
      medium: { type: String, default: '' },
      campaign: { type: String, default: '' },
      term: { type: String, default: '' },
      content: { type: String, default: '' },
      landingPath: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshHash: { type: String, required: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

const ledgerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true }
);

const accountSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ledger: { type: Schema.Types.ObjectId, ref: 'Ledger' },
    name: { type: String, required: true },
    kind: { type: String, enum: ['asset', 'liability'], required: true },
    openingBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const categorySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  },
  { timestamps: true }
);

const transactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ledger: { type: Schema.Types.ObjectId, ref: 'Ledger', required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    description: { type: String, required: true },
    date: { type: String, required: true },
    recurring: { type: Schema.Types.ObjectId, ref: 'Recurring' },
  },
  { timestamps: true }
);

const transferSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ledger: { type: Schema.Types.ObjectId, ref: 'Ledger', required: true },
    fromAccount: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    toAccount: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    date: { type: String, required: true },
  },
  { timestamps: true }
);

const budgetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ledger: { type: Schema.Types.ObjectId, ref: 'Ledger', default: null },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    month: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { timestamps: true }
);

budgetSchema.index({ user: 1, category: 1, month: 1, ledger: 1 }, { unique: true });

const recurringSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ledger: { type: Schema.Types.ObjectId, ref: 'Ledger', required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    description: { type: String, required: true },
    frequency: { type: String, enum: ['weekly', 'biweekly', 'monthly', 'yearly'], required: true },
    nextDate: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const goalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    targetAmount: { type: Number, required: true },
    savedAmount: { type: Number, default: 0 },
    deadline: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = {
  User: mongoose.model('User', userSchema),
  Session: mongoose.model('Session', sessionSchema),
  Ledger: mongoose.model('Ledger', ledgerSchema),
  Account: mongoose.model('Account', accountSchema),
  Category: mongoose.model('Category', categorySchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  Transfer: mongoose.model('Transfer', transferSchema),
  Budget: mongoose.model('Budget', budgetSchema),
  Recurring: mongoose.model('Recurring', recurringSchema),
  Goal: mongoose.model('Goal', goalSchema),
};
