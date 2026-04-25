// First-time setup: create admin user
const bcrypt = require('bcrypt');
const { db } = require('./db');

async function createAdmin(username, password, displayName) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    console.log('Admin user already exists.');
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)').run(
    username, hash, displayName
  );
  console.log(`Admin user "${username}" created successfully.`);
}

const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node setup.js <username> <password> <displayName>');
  process.exit(1);
}

createAdmin(args[0], args[1], args[2]).catch(console.error);
