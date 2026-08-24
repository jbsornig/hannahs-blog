const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { db, UPLOADS_DIR } = require('./db');

const router = express.Router();

const SNAPSHOT_FILENAME = 'blog-backup.db';

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/admin/login');
}

// Consistent snapshot of the SQLite database (safe to take while WAL mode is
// active) streamed to the browser as a download.
router.get('/database', requireAuth, async (req, res) => {
  const snapshotPath = path.join(os.tmpdir(), SNAPSHOT_FILENAME);
  try {
    await db.backup(snapshotPath);
  } catch (error) {
    console.error('Database snapshot failed', error);
    return res.status(500).send('Backup failed: ' + error.message);
  }
  res.download(snapshotPath, 'blog.db', (error) => {
    fs.unlink(snapshotPath, () => {});
    if (error) console.error('Backup download failed', error);
  });
});

// Listing of every file on the persistent disk, used to confirm the local
// archive captured everything before the service is deleted.
router.get('/manifest', requireAuth, (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR)
      .map((name) => ({ name, stat: fs.statSync(path.join(UPLOADS_DIR, name)) }))
      .filter((entry) => entry.stat.isFile())
      .map((entry) => ({ name: entry.name, size: entry.stat.size }));

    res.json({
      uploadsDir: UPLOADS_DIR,
      count: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      files,
    });
  } catch (error) {
    console.error('Upload manifest failed', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
