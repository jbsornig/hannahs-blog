const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { db, UPLOADS_DIR } = require('./db');

// Multer setup for photo uploads
const upload = multer({
  dest: path.join(UPLOADS_DIR, 'tmp'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/admin/login');
}

// Login page
router.get('/login', (req, res) => {
  res.render('admin/login', { error: null, page: 'admin' });
});

// Login handler
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.render('admin/login', { error: 'Invalid credentials', page: 'admin' });
  }

  const bcrypt = require('bcrypt');
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.render('admin/login', { error: 'Invalid credentials', page: 'admin' });
  }

  req.session.userId = user.id;
  req.session.displayName = user.display_name;
  res.redirect('/admin');
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Dashboard
router.get('/', requireAuth, (req, res) => {
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
  const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE approved = 0').get().count;
  const prayerCount = db.prepare('SELECT COUNT(*) as count FROM prayer_requests WHERE status = ?').get('active').count;
  const stats = {};
  db.prepare('SELECT key, value FROM stats').all().forEach(s => { stats[s.key] = s.value; });

  const recentPosts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 5').all();

  res.render('admin/dashboard', {
    postCount, commentCount, prayerCount, stats, recentPosts, page: 'admin'
  });
});

// New post form
router.get('/posts/new', requireAuth, (req, res) => {
  res.render('admin/post-edit', { post: null, page: 'admin' });
});

// Edit post form
router.get('/posts/:id/edit', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).send('Post not found');

  const images = db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order').all(post.id);
  res.render('admin/post-edit', { post, images, page: 'admin' });
});

// Create/Update post
router.post('/posts/save', requireAuth, upload.array('photos', 20), async (req, res) => {
  const { id, title, content, excerpt, category, published } = req.body;
  const slug = createSlug(title);

  if (id) {
    // Update
    db.prepare(`
      UPDATE posts SET title = ?, slug = ?, content = ?, excerpt = ?, category = ?,
        published = ?, updated_at = datetime('now') WHERE id = ?
    `).run(title, slug, content, excerpt || '', category, published ? 1 : 0, id);
  } else {
    // Create
    const result = db.prepare(`
      INSERT INTO posts (title, slug, content, excerpt, category, published, author_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(title, slug, content, excerpt || '', category, published ? 1 : 0, req.session.userId);

    req.body.id = result.lastInsertRowid;
  }

  const postId = id || req.body.id;

  // Process uploaded images
  if (req.files && req.files.length > 0) {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as mx FROM post_images WHERE post_id = ?').get(postId);
    let order = (maxOrder && maxOrder.mx) ? maxOrder.mx + 1 : 0;

    for (const file of req.files) {
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
      const outputPath = path.join(UPLOADS_DIR, filename);

      // Compress and convert to webp
      await sharp(file.path)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outputPath);

      // Clean up temp file
      fs.unlinkSync(file.path);

      db.prepare(
        'INSERT INTO post_images (post_id, filename, sort_order) VALUES (?, ?, ?)'
      ).run(postId, filename, order++);
    }

    // Set first image as featured if none set
    const post = db.prepare('SELECT featured_image FROM posts WHERE id = ?').get(postId);
    if (!post.featured_image) {
      const firstImg = db.prepare('SELECT filename FROM post_images WHERE post_id = ? ORDER BY sort_order LIMIT 1').get(postId);
      if (firstImg) {
        db.prepare('UPDATE posts SET featured_image = ? WHERE id = ?').run(firstImg.filename, postId);
      }
    }
  }

  res.redirect('/admin');
});

// Delete post
router.post('/posts/:id/delete', requireAuth, (req, res) => {
  // Delete associated image files
  const images = db.prepare('SELECT filename FROM post_images WHERE post_id = ?').all(req.params.id);
  for (const img of images) {
    const filepath = path.join(UPLOADS_DIR, img.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// Delete image
router.post('/images/:id/delete', requireAuth, (req, res) => {
  const image = db.prepare('SELECT * FROM post_images WHERE id = ?').get(req.params.id);
  if (image) {
    const filepath = path.join(UPLOADS_DIR, image.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    db.prepare('DELETE FROM post_images WHERE id = ?').run(req.params.id);
  }
  res.redirect('back');
});

// Comments management
router.get('/comments', requireAuth, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, p.title as post_title, p.slug as post_slug
    FROM comments c LEFT JOIN posts p ON c.post_id = p.id
    ORDER BY c.approved ASC, c.created_at DESC
  `).all();

  res.render('admin/comments', { comments, page: 'admin' });
});

router.post('/comments/:id/approve', requireAuth, (req, res) => {
  db.prepare('UPDATE comments SET approved = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/admin/comments');
});

router.post('/comments/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.redirect('/admin/comments');
});

// Prayer requests management
router.get('/prayers', requireAuth, (req, res) => {
  const prayers = db.prepare('SELECT * FROM prayer_requests ORDER BY created_at DESC').all();
  res.render('admin/prayers', { prayers, page: 'admin' });
});

router.post('/prayers/:id/respond', requireAuth, (req, res) => {
  const { response, status } = req.body;
  db.prepare(
    "UPDATE prayer_requests SET response = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(response, status || 'active', req.params.id);
  res.redirect('/admin/prayers');
});

router.post('/prayers/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM prayer_requests WHERE id = ?').run(req.params.id);
  res.redirect('/admin/prayers');
});

// Stats management
router.post('/stats', requireAuth, (req, res) => {
  const { homes_completed, groups_hosted, families_served } = req.body;
  const update = db.prepare('UPDATE stats SET value = ? WHERE key = ?');
  update.run(parseInt(homes_completed) || 0, 'homes_completed');
  update.run(parseInt(groups_hosted) || 0, 'groups_hosted');
  update.run(parseInt(families_served) || 0, 'families_served');
  res.redirect('/admin');
});

function createSlug(title) {
  let slug = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  // Check for duplicates
  const existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }
  return slug;
}

module.exports = router;
