const mongoose = require('mongoose');
const config = require('./config');
const { restoreLatest } = require('./backup');

async function connect() {
  mongoose.set('strictQuery', true);
  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri);
    return { mode: 'configured' };
  }
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/dimestack', {
      serverSelectionTimeoutMS: 1500,
    });
    return { mode: 'local' };
  } catch (err) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('dimestack'));
    const restored = await restoreLatest();
    return { mode: 'embedded', restored: Boolean(restored) };
  }
}

module.exports = { connect };
