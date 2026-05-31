const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('./db');
const { sendConfirmation, notifyAdminNewComment } = require('./email');

// Home page
router.get('/', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.display_name as author_name,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND approved = 1) as comment_count,
      (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND approved = 1 AND reply IS NOT NULL) as reply_count
    FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.published = 1
    ORDER BY p.pinned DESC, p.created_at DESC
    LIMIT 5
  `).all();

  const stats = {};
  db.prepare('SELECT key, value FROM stats').all().forEach(s => {
    stats[s.key] = s.value;
  });

  const recentPrayers = db.prepare(`
    SELECT * FROM prayer_requests WHERE status = 'active' ORDER BY created_at DESC LIMIT 3
  `).all();

  const settings = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(s => { settings[s.key] = s.value; });

  const encouragementCount = db.prepare('SELECT COUNT(*) as count FROM encouragements').get().count;

  if (!req.cookies.visited) {
    db.prepare("UPDATE stats SET value = value + 1 WHERE key = 'visitor_count'").run();
    res.cookie('visited', '1', { httpOnly: true, sameSite: 'lax' });
  }
  const visitorCount = db.prepare("SELECT value FROM stats WHERE key = 'visitor_count'").get();

  res.render('home', { posts, stats, settings, recentPrayers, encouragementCount, visitorCount: visitorCount ? visitorCount.value : 0, page: 'home', subscribe: req.query.subscribe || null });
});

// All posts (with optional category filter)
router.get('/posts', (req, res) => {
  const category = req.query.category;
  let posts;
  if (category) {
    posts = db.prepare(`
      SELECT p.*, u.display_name as author_name,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND approved = 1) as comment_count,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as like_count
      FROM posts p LEFT JOIN users u ON p.author_id = u.id
      WHERE p.published = 1 AND p.category = ?
      ORDER BY p.created_at DESC
    `).all(category);
  } else {
    posts = db.prepare(`
      SELECT p.*, u.display_name as author_name,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND approved = 1) as comment_count,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as like_count
      FROM posts p LEFT JOIN users u ON p.author_id = u.id
      WHERE p.published = 1
      ORDER BY p.created_at DESC
    `).all();
  }

  res.render('posts', { posts, category: category || 'all', page: 'posts' });
});

// Single post
router.get('/post/:slug', (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.display_name as author_name
    FROM posts p LEFT JOIN users u ON p.author_id = u.id
    WHERE p.slug = ? AND p.published = 1
  `).get(req.params.slug);

  if (!post) return res.status(404).render('404', { page: '' });

  const images = db.prepare(
    'SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order'
  ).all(post.id);

  const comments = db.prepare(
    'SELECT * FROM comments WHERE post_id = ? AND approved = 1 ORDER BY created_at ASC'
  ).all(post.id);

  const videos = db.prepare(
    'SELECT * FROM post_videos WHERE post_id = ? ORDER BY sort_order'
  ).all(post.id);

  const likeCount = db.prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?').get(post.id).count;
  const visitorId = req.cookies.visitor_id || '';
  const alreadyLiked = visitorId ? !!db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND visitor_id = ?').get(post.id, visitorId) : false;
  const likeNames = db.prepare("SELECT liker_name, reaction FROM post_likes WHERE post_id = ? AND liker_name IS NOT NULL AND liker_name != '' ORDER BY created_at DESC").all(post.id).map(r => (r.reaction === 'thumbsup' ? '&#128077;' : '&#9829;') + ' ' + r.liker_name);

  res.render('post-single', { post, images, videos, comments, likeCount, alreadyLiked, likeNames, page: 'posts' });
});

// Like a post
router.post('/post/:slug/like', (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  let visitorId = req.cookies.visitor_id;
  if (!visitorId) {
    visitorId = crypto.randomBytes(16).toString('hex');
    res.cookie('visitor_id', visitorId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
  }

  const name = (req.body.name || '').trim().substring(0, 50);
  const reaction = req.body.reaction === 'thumbsup' ? 'thumbsup' : 'heart';

  const existing = db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND visitor_id = ?').get(post.id, visitorId);
  if (!existing) {
    db.prepare('INSERT INTO post_likes (post_id, visitor_id, liker_name, reaction) VALUES (?, ?, ?, ?)').run(post.id, visitorId, name || null, reaction);
  }

  const count = db.prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?').get(post.id).count;
  const likes = db.prepare("SELECT liker_name, reaction FROM post_likes WHERE post_id = ? AND liker_name IS NOT NULL AND liker_name != '' ORDER BY created_at DESC").all(post.id);
  const names = likes.map(r => (r.reaction === 'thumbsup' ? '👍' : '♥') + ' ' + r.liker_name);
  res.json({ liked: true, count, names });
});

// Submit comment
router.post('/post/:slug/comment', (req, res) => {
  const post = db.prepare('SELECT id, title FROM posts WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { author_name, author_email, content } = req.body;
  if (!author_name || !content) {
    return res.status(400).json({ error: 'Name and comment are required' });
  }

  db.prepare(
    'INSERT INTO comments (post_id, author_name, author_email, content) VALUES (?, ?, ?, ?)'
  ).run(post.id, author_name.trim(), (author_email || '').trim(), content.trim());

  notifyAdminNewComment(author_name.trim(), content.trim(), post.title, req.params.slug)
    .catch(err => console.error('Admin notification error:', err));

  res.redirect(`/post/${req.params.slug}?commented=1`);
});

// Prayer requests page
router.get('/prayers', (req, res) => {
  const prayers = db.prepare(
    "SELECT * FROM prayer_requests WHERE status IN ('active', 'answered') ORDER BY created_at DESC"
  ).all();

  res.render('prayers', { prayers, page: 'prayers' });
});

// Submit prayer request
router.post('/prayers', (req, res) => {
  const { author_name, content } = req.body;
  if (!author_name || !content) {
    return res.status(400).json({ error: 'Name and prayer request are required' });
  }

  db.prepare(
    'INSERT INTO prayer_requests (author_name, content) VALUES (?, ?)'
  ).run(author_name.trim(), content.trim());

  res.redirect('/prayers?submitted=1');
});

// Subscribe
router.post('/subscribe', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.redirect('/?subscribe=error#subscribe');
  }

  const existing = db.prepare('SELECT * FROM subscribers WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) {
    if (existing.confirmed) {
      return res.redirect('/?subscribe=already#subscribe');
    }
    // Resend confirmation
    await sendConfirmation(existing);
    return res.redirect('/?subscribe=pending#subscribe');
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO subscribers (name, email, token) VALUES (?, ?, ?)'
  ).run(name.trim(), email.trim().toLowerCase(), token);

  const subscriber = db.prepare('SELECT * FROM subscribers WHERE token = ?').get(token);
  await sendConfirmation(subscriber);

  res.redirect('/?subscribe=pending#subscribe');
});

// Confirm subscription
router.get('/subscribe/confirm/:token', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscribers WHERE token = ?').get(req.params.token);
  if (!sub) return res.status(404).render('404', { page: '' });

  db.prepare('UPDATE subscribers SET confirmed = 1 WHERE id = ?').run(sub.id);
  res.render('subscribed', { name: sub.name, page: '' });
});

// Unsubscribe
router.get('/unsubscribe/:token', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscribers WHERE token = ?').get(req.params.token);
  if (!sub) return res.status(404).render('404', { page: '' });

  db.prepare('DELETE FROM subscribers WHERE id = ?').run(sub.id);
  res.render('unsubscribed', { page: '' });
});

// About page
router.get('/about', (req, res) => {
  const stats = {};
  db.prepare('SELECT key, value FROM stats').all().forEach(s => {
    stats[s.key] = s.value;
  });
  const aboutRow = db.prepare("SELECT value FROM settings WHERE key = 'about_content'").get();
  const aboutContent = aboutRow ? aboutRow.value : '';
  res.render('about', { stats, aboutContent, page: 'about' });
});

// Encouragement wall
router.get('/encouragement', (req, res) => {
  const messages = db.prepare('SELECT * FROM encouragements ORDER BY created_at DESC').all();
  res.render('encouragement', { messages, submitted: req.query.submitted || null, page: 'encouragement' });
});

router.post('/encouragement', (req, res) => {
  const { author_name, content } = req.body;
  if (!author_name || !content) {
    return res.redirect('/encouragement');
  }
  db.prepare('INSERT INTO encouragements (author_name, content) VALUES (?, ?)').run(author_name.trim(), content.trim());
  res.redirect('/encouragement?submitted=1');
});

module.exports = router;
