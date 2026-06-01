// ClubShed email worker
// Deploy with: wrangler deploy
// Handles two endpoints:
//   POST /api/lead-magnet  - Sends the inventory template to a user
//   POST /api/contact      - Sends a contact form message to hello@clubshed.pro

// Environment variables required (set via `wrangler secret put`):
//   RESEND_API_KEY     - From https://resend.com/api-keys
//   HONEYPOT_FIELD     - Optional: name of the hidden field for spam detection. Defaults to "website"

const ALLOWED_ORIGINS = [
  'https://clubshed.pro',
  'https://www.clubshed.pro',
  'http://localhost:4321', // local dev
];

const TEMPLATE_URL = 'https://clubshed.pro/ClubShed-Inventory-Template.xlsx';
const FROM_EMAIL = 'ClubShed <hello@clubshed.pro>';
const REPLY_TO = 'hello@clubshed.pro';
const ADMIN_EMAIL = 'hello@clubshed.pro';

// ---------- Helpers ----------

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function isValidEmail(email) {
  // Lightweight validation. Real validation happens at the SMTP layer.
  if (typeof email !== 'string') return false;
  if (email.length > 254) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Rate limit: max 5 requests per email per hour to prevent abuse.
// Uses Cloudflare KV namespace `RATE_LIMIT` if bound, otherwise no-op.
async function checkRateLimit(env, key, limit, windowSeconds) {
  if (!env.RATE_LIMIT) return { ok: true };
  const now = Math.floor(Date.now() / 1000);
  const bucketKey = `${key}:${Math.floor(now / windowSeconds)}`;
  const current = parseInt((await env.RATE_LIMIT.get(bucketKey)) || '0', 10);
  if (current >= limit) {
    return { ok: false, remaining: 0 };
  }
  await env.RATE_LIMIT.put(bucketKey, String(current + 1), {
    expirationTtl: windowSeconds * 2,
  });
  return { ok: true, remaining: limit - current - 1 };
}

async function sendEmail(env, payload) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Resend API error:', response.status, errorText);
    throw new Error(`Email send failed: ${response.status}`);
  }

  return await response.json();
}

// ---------- Email templates ----------

function leadMagnetEmail(firstName) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';
  return {
    subject: 'Your free ClubShed inventory template',
    text: `${greeting}

Here's the ClubShed inventory template you requested:

${TEMPLATE_URL}

It's an .xlsx file with five sheets: Instructions, Inventory, Loans Log, Annual Audit, and Setup. Open it in Google Sheets (recommended), Excel, Numbers, or LibreOffice.

A quick tip: start with the Setup sheet to set your team names, then move to Inventory and add a few items. The Annual Audit sheet will populate automatically.

When you outgrow the spreadsheet (most clubs do within a season), ClubShed picks up where it leaves off. Free for one team and 30 items:

https://app.clubshed.pro/signup

Reply to this email if you have questions, want feedback on your setup, or want to chat about how your club tracks equipment. I read every reply personally.

Lucas
Co-founder, HVV Football Factory
Builder of ClubShed
clubshed.pro`,
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1c1c; line-height: 1.55; max-width: 580px; margin: 0 auto; padding: 24px; background: #f4f1ea; }
  h1 { color: #1a2e1f; font-size: 22px; margin: 0 0 16px; }
  p { margin: 0 0 16px; }
  .btn { display: inline-block; background: #e8552a; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 8px 0 20px; }
  .signature { color: #6b665a; font-size: 14px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #d8d3c5; }
  .footer { color: #6b665a; font-size: 12px; margin-top: 20px; }
  a { color: #e8552a; }
</style>
</head>
<body>
  <h1>Your free ClubShed inventory template</h1>
  <p>${greeting}</p>
  <p>Here's the template you requested. It's an .xlsx file with five sheets: Instructions, Inventory, Loans Log, Annual Audit, and Setup. Open it in Google Sheets (recommended), Excel, Numbers, or LibreOffice.</p>
  <p><a class="btn" href="${TEMPLATE_URL}">Download the template</a></p>
  <p><strong>Quick tip:</strong> start with the Setup sheet to set your team names, then move to Inventory and add a few items. The Annual Audit sheet populates automatically.</p>
  <p>When you outgrow the spreadsheet, ClubShed picks up where it leaves off. Free for one team and 30 items:</p>
  <p><a href="https://app.clubshed.pro/signup">app.clubshed.pro/signup</a></p>
  <p>Reply to this email if you have questions, want feedback on your setup, or want to chat about how your club tracks equipment. I read every reply personally.</p>
  <div class="signature">
    Lucas<br>
    Co-founder, HVV Football Factory<br>
    Builder of ClubShed<br>
    <a href="https://clubshed.pro">clubshed.pro</a>
  </div>
  <div class="footer">
    You're receiving this because you downloaded the template at clubshed.pro/templates/inventory-spreadsheet. We won't email you again unless you reply.
  </div>
</body>
</html>`,
  };
}

function contactAutoReply(firstName) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';
  return {
    subject: 'Got your message',
    text: `${greeting}

Got your message. I'll reply personally within 24 hours, usually sooner.

If it's urgent and you don't hear back, reply to this email and your message will jump the queue.

Lucas
clubshed.pro`,
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1c1c; line-height: 1.55; max-width: 580px; margin: 0 auto; padding: 24px; }
  p { margin: 0 0 16px; }
  .signature { color: #6b665a; font-size: 14px; margin-top: 24px; }
</style>
</head>
<body>
  <p>${greeting}</p>
  <p>Got your message. I'll reply personally within 24 hours, usually sooner.</p>
  <p>If it's urgent and you don't hear back, reply to this email and your message will jump the queue.</p>
  <div class="signature">Lucas<br><a href="https://clubshed.pro">clubshed.pro</a></div>
</body>
</html>`,
  };
}

function contactAdminNotification(name, email, message) {
  return {
    subject: `[ClubShed contact] ${name || 'Anonymous'}: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`,
    text: `New contact form submission:

From: ${name || 'Not provided'} <${email}>

Message:
${message}

---
Reply directly to this email to respond.`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a2e1f;">New contact form submission</h2>
  <p><strong>From:</strong> ${escapeHtml(name || 'Not provided')} &lt;${escapeHtml(email)}&gt;</p>
  <p><strong>Message:</strong></p>
  <blockquote style="border-left: 4px solid #e8552a; padding-left: 16px; margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</blockquote>
  <hr style="border: none; border-top: 1px solid #d8d3c5; margin: 24px 0;">
  <p style="color: #6b665a; font-size: 13px;">Reply directly to this email to respond.</p>
</body>
</html>`,
  };
}

// ---------- Route handlers ----------

async function handleLeadMagnet(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
  }

  // Honeypot field for bot detection. Real users leave it empty.
  const honeypotField = env.HONEYPOT_FIELD || 'website';
  if (body[honeypotField] && body[honeypotField].length > 0) {
    // Quietly succeed without sending — pretend everything is fine to the bot
    return jsonResponse({ ok: true }, 200, origin);
  }

  const email = (body.email || '').trim().toLowerCase();
  const firstName = (body.firstName || '').trim().slice(0, 60);

  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'Please enter a valid email address' }, 400, origin);
  }

  // Rate limit: 3 sends per email per 24 hours
  const limit = await checkRateLimit(env, `leadmagnet:${email}`, 3, 86400);
  if (!limit.ok) {
    return jsonResponse(
      { error: 'You\'ve requested this template a few times already. Check your inbox and spam folder, or email hello@clubshed.pro.' },
      429,
      origin
    );
  }

  const emailContent = leadMagnetEmail(firstName);

  try {
    await sendEmail(env, {
      from: FROM_EMAIL,
      to: [email],
      reply_to: REPLY_TO,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  } catch (err) {
    console.error('Lead magnet send failed:', err);
    return jsonResponse(
      { error: 'Email could not be sent right now. Please email hello@clubshed.pro and we\'ll send it manually.' },
      500,
      origin
    );
  }

  return jsonResponse({ ok: true, message: 'Template sent. Check your inbox.' }, 200, origin);
}

async function handleContact(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
  }

  const honeypotField = env.HONEYPOT_FIELD || 'website';
  if (body[honeypotField] && body[honeypotField].length > 0) {
    return jsonResponse({ ok: true }, 200, origin);
  }

  const email = (body.email || '').trim().toLowerCase();
  const name = (body.name || '').trim().slice(0, 100);
  const message = (body.message || '').trim().slice(0, 5000);

  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'Please enter a valid email address' }, 400, origin);
  }
  if (message.length < 5) {
    return jsonResponse({ error: 'Please write a message of at least 5 characters' }, 400, origin);
  }

  // Rate limit: 5 messages per email per hour
  const limit = await checkRateLimit(env, `contact:${email}`, 5, 3600);
  if (!limit.ok) {
    return jsonResponse(
      { error: 'You\'ve sent a few messages already. We\'ll reply soon.' },
      429,
      origin
    );
  }

  const adminEmail = contactAdminNotification(name, email, message);
  const autoReply = contactAutoReply(name.split(' ')[0]);

  try {
    // Notify the founder
    await sendEmail(env, {
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      reply_to: email, // so the founder can hit Reply and it goes straight to the sender
      subject: adminEmail.subject,
      text: adminEmail.text,
      html: adminEmail.html,
    });

    // Auto-reply to the sender (best effort: if this fails, the message still got through)
    try {
      await sendEmail(env, {
        from: FROM_EMAIL,
        to: [email],
        reply_to: REPLY_TO,
        subject: autoReply.subject,
        text: autoReply.text,
        html: autoReply.html,
      });
    } catch (err) {
      console.error('Auto-reply failed (non-fatal):', err);
    }
  } catch (err) {
    console.error('Contact send failed:', err);
    return jsonResponse(
      { error: 'Message could not be sent. Please email hello@clubshed.pro directly.' },
      500,
      origin
    );
  }

  return jsonResponse({ ok: true, message: 'Got your message. We\'ll reply within 24 hours.' }, 200, origin);
}

// ---------- Main handler ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Origin check
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    if (url.pathname === '/api/lead-magnet') {
      return handleLeadMagnet(request, env, origin);
    }

    if (url.pathname === '/api/contact') {
      return handleContact(request, env, origin);
    }

    return jsonResponse({ error: 'Not found' }, 404, origin);
  },
};
