const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function isDateStr(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function resolveToday(input) {
  const utc = todayUTC();
  if (!isDateStr(input)) return utc;
  const diff = Math.abs(Date.parse(`${input}T00:00:00Z`) - Date.parse(`${utc}T00:00:00Z`));
  if (diff > 2 * 24 * 3600 * 1000) return utc;
  return input;
}

function advanceDate(dateStr, frequency) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (frequency === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7);
  else if (frequency === 'biweekly') dt.setUTCDate(dt.getUTCDate() + 14);
  else if (frequency === 'yearly') dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  else dt.setUTCMonth(dt.getUTCMonth() + 1);
  return dt.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

function fromCents(cents) {
  return round2(Number(cents || 0) / 100);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function eachDate(from, to) {
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function eachMonth(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const end = to.slice(0, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= end) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

let dummyHashPromise;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash('dimestack-not-a-user-password', 12);
  return dummyHashPromise;
}

function timingEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    phone: user.phone || '',
    currency: user.currency || 'INR',
    timezone: user.timezone || 'Asia/Kolkata',
    bio: user.bio || '',
    hasPassword: Boolean(user.passwordHash),
    googleLinked: Boolean(user.googleId),
    createdAt: user.createdAt,
  };
}

module.exports = {
  hashToken,
  randomToken,
  randomOtp,
  todayUTC,
  isDateStr,
  resolveToday,
  advanceDate,
  round2,
  toCents,
  fromCents,
  monthKey,
  eachDate,
  eachMonth,
  dummyHash,
  timingEqual,
  csvEscape,
  parseCsv,
  publicUser,
};
