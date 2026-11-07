const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const backupRoot = path.join(__dirname, '..', 'backups');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function backupAll() {
  if (mongoose.connection.readyState !== 1) return null;
  const dir = path.join(backupRoot, stamp());
  fs.mkdirSync(dir, { recursive: true });
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    const docs = await collection.find({}).toArray();
    fs.writeFileSync(path.join(dir, `${collection.collectionName}.json`), JSON.stringify(docs));
  }
  fs.writeFileSync(path.join(dir, '_meta.json'), JSON.stringify({ createdAt: new Date().toISOString() }));
  const dirs = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  while (dirs.length > 14) {
    const oldest = dirs.shift();
    fs.rmSync(path.join(backupRoot, oldest), { recursive: true, force: true });
  }
  return dir;
}

async function restoreLatest() {
  if (!fs.existsSync(backupRoot)) return false;
  const dirs = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (!dirs.length) return false;
  const dir = path.join(backupRoot, dirs[dirs.length - 1]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== '_meta.json');
  for (const file of files) {
    const name = file.replace(/\.json$/, '');
    const docs = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!Array.isArray(docs) || !docs.length) continue;
    const collection = mongoose.connection.db.collection(name);
    await collection.deleteMany({});
    await collection.insertMany(docs);
  }
  return dir;
}

module.exports = { backupAll, restoreLatest };
