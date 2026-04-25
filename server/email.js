const fetch = require('node-fetch');
const { db } = require('./db');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BLOG_URL = process.env.BLOG_URL || 'http://localhost:3000';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';
const FROM_NAME = process.env.FROM_NAME || "Hannah's Blog";

async function sendEmail(to, subject, htmlContent) {
  if (!BREVO_API_KEY) {
    console.log('BREVO_API_KEY not set, skipping email to', to);
    return;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Brevo email error:', err);
  }
}

async function sendConfirmation(subscriber) {
  const confirmUrl = `${BLOG_URL}/subscribe/confirm/${subscriber.token}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
      <h2>Confirm Your Subscription</h2>
      <p>Hi ${subscriber.name},</p>
      <p>Thanks for subscribing to Hannah's Guatemala Mission Blog! Please confirm your email address:</p>
      <p><a href="${confirmUrl}" style="display: inline-block; padding: 10px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Confirm Subscription</a></p>
      <p style="color: #78716c; font-size: 0.85rem;">If you didn't sign up, just ignore this email.</p>
    </div>
  `;
  await sendEmail(subscriber.email, "Confirm your subscription - Hannah's Blog", html);
}

async function notifySubscribers(post) {
  const subscribers = db.prepare('SELECT * FROM subscribers WHERE confirmed = 1').all();
  if (subscribers.length === 0) return;

  const postUrl = `${BLOG_URL}/post/${post.slug}`;

  for (const sub of subscribers) {
    const unsubUrl = `${BLOG_URL}/unsubscribe/${sub.token}`;
    const html = `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2>New Post: ${post.title}</h2>
        <p>Hi ${sub.name},</p>
        <p>${post.excerpt || post.content.substring(0, 200) + '...'}</p>
        <p><a href="${postUrl}" style="display: inline-block; padding: 10px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Read Post</a></p>
        <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 1.5rem 0;">
        <p style="color: #78716c; font-size: 0.75rem;"><a href="${unsubUrl}">Unsubscribe</a></p>
      </div>
    `;
    await sendEmail(sub.email, `New Post: ${post.title}`, html);
  }

  console.log(`Notified ${subscribers.length} subscribers about "${post.title}"`);
}

module.exports = { sendConfirmation, notifySubscribers };
