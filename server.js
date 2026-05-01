const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { db, UPLOADS_DIR } = require('./server/db');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'hannah-blog-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === '1',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
  }
}));

// Trust proxy for Render
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Static files
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Make session and site settings available to views
app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.currentYear = new Date().getFullYear();
  const siteNameRow = db.prepare("SELECT value FROM settings WHERE key = 'site_name'").get();
  res.locals.siteName = (siteNameRow && siteNameRow.value) || "Hannah's Blog";
  next();
});

// Routes
app.use('/', require('./server/routes-public'));
app.use('/admin', require('./server/routes-admin'));

// 404
app.use((req, res) => {
  res.status(404).render('404', { page: '' });
});

app.listen(PORT, () => {
  console.log(`Hannah's Blog running at http://localhost:${PORT}`);
});
