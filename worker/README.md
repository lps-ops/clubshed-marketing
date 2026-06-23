# ClubShed Email Worker

Cloudflare Worker that handles outbound email for ClubShed's marketing site. Two endpoints:

- `POST /api/lead-magnet` - Sends the inventory template to a user's email
- `POST /api/contact` - Sends a contact form message to hello@clubshed.pro plus an auto-reply

Lives at `api.clubshed.pro` once deployed. Uses Resend as the email provider.

## One-time setup (about 30 minutes)

You only do this once. After that, deploys take 30 seconds.

### Step 1: Sign up for Resend

1. Go to https://resend.com and sign up (free, no card required)
2. In the dashboard, go to "Domains" and click "Add Domain"
3. Enter `clubshed.pro`
4. Resend will show you a list of DNS records to add (SPF, DKIM, DMARC, and MX-related entries)

### Step 2: Add the Resend DNS records to Cloudflare

Open your Cloudflare dashboard, click `clubshed.pro`, then DNS, then "Add record" for each one Resend shows.

For each record:
- Type: as shown by Resend (TXT, CNAME, MX)
- Name: as shown by Resend (often the leaf name like `resend._domainkey`, not the full hostname)
- Content: as shown by Resend
- Proxy status: **DNS only (grey cloud)** for all of them
- TTL: Auto

After you've added them, click "Verify" in the Resend dashboard. It usually takes a few minutes for the records to propagate. Don't skip this. Without verified domains, your emails will go to spam.

**Heads up on the MX record conflict:** If Resend wants you to add an MX record but you already have Cloudflare Email Routing using MX records to receive `hello@clubshed.pro`, do this:
- Resend's sending uses SPF + DKIM, not MX. You typically do NOT need to add Resend's MX record for sending.
- Cloudflare Email Routing's existing MX records (pointing to `mx-cloudflare-router.com` or similar) stay as-is.
- Add only the SPF (TXT) and DKIM (CNAME or TXT) records from Resend. Skip any MX that conflicts.
- If Resend's verification fails, contact Resend support, explain you use Cloudflare Email Routing for inbound, and ask them to verify with SPF+DKIM only.

### Step 3: Get your Resend API key

1. In Resend dashboard, go to "API Keys"
2. Click "Create API Key"
3. Name it `clubshed-worker-prod`
4. Permission: "Sending access" (not full access)
5. Domain: clubshed.pro
6. Copy the key. You'll only see it once. Save it somewhere safe for the next step.

### Step 4: Install wrangler (the Cloudflare CLI)

In Terminal on your Mac:

```
npm install -g wrangler
wrangler login
```

The login command opens a browser tab where you authorise wrangler to access your Cloudflare account.

### Step 5: Set up the worker

In Terminal:

```
cd ~/Desktop/clubshed/worker
npm install
```

### Step 6: (Optional but recommended) Create the KV namespace for rate limiting

```
wrangler kv namespace create RATE_LIMIT
```

This outputs something like:

```
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "abc123def456..."
```

Open `wrangler.toml` and uncomment the `[[kv_namespaces]]` section near the bottom. Paste the `id` you got. Save the file.

If you skip this step, the worker will still work, but rate limiting becomes a no-op (someone could spam your endpoints). For production, do this step.

### Step 7: Set the Resend API key as a secret

```
wrangler secret put RESEND_API_KEY
```

Paste the key from Step 3 when prompted, then press Enter. The value is encrypted and stored by Cloudflare. It never lives in code.

### Step 8: First deploy

```
wrangler deploy
```

This will:
- Bundle the worker code
- Upload to Cloudflare
- Try to route it at `api.clubshed.pro/*`

If the route assignment fails (it sometimes does on first deploy because the DNS record doesn't exist yet), do this:

1. In Cloudflare dashboard, go to Workers & Pages
2. Click your `clubshed-email` worker
3. Settings → Triggers → Custom Domains → Add Custom Domain
4. Enter `api.clubshed.pro`
5. Cloudflare will automatically add the right DNS record

### Step 9: Test the endpoints

In Terminal, test the lead magnet endpoint:

```bash
curl -X POST https://api.clubshed.pro/api/lead-magnet \
  -H "Content-Type: application/json" \
  -d '{"email":"your-real-email@example.com","firstName":"Lucas"}'
```

You should receive the template email at `your-real-email@example.com` within a few seconds. Check spam if it's not in inbox.

Test the contact endpoint:

```bash
curl -X POST https://api.clubshed.pro/api/contact \
  -H "Content-Type: application/json" \
  -d '{"email":"your-real-email@example.com","name":"Test","message":"Testing the contact form from curl"}'
```

You should get an auto-reply at the sender email, and the message itself should land in `hello@clubshed.pro`.

If anything fails, run `wrangler tail` in another terminal window to see live logs.

## Day-to-day usage

To deploy code changes:

```
cd ~/Desktop/clubshed/worker
wrangler deploy
```

To see live logs:

```
wrangler tail
```

To update the Resend API key (if you rotate it):

```
wrangler secret put RESEND_API_KEY
```

## Costs at your scale

- **Cloudflare Workers free tier:** 100,000 requests/day. You'll never hit this.
- **Cloudflare KV free tier:** 100,000 reads/day, 1,000 writes/day, 1 GB storage. Plenty.
- **Resend free tier:** 3,000 emails/month, 100 emails/day. Plenty for the first few hundred lead magnet downloads.
- **Resend Pro:** $20/month for 50,000 emails. Upgrade when you outgrow the free tier.

Estimated monthly cost while the marketing site has under 100 lead magnet downloads and a few contact form submissions per day: **€0**.

## Security notes

- The Resend API key is stored as an encrypted Cloudflare secret. It never appears in code or logs.
- CORS is locked to `clubshed.pro` and `www.clubshed.pro` (plus localhost for development). Random websites can't call your endpoints.
- Honeypot field catches naive bots.
- Rate limiting prevents email-bombing of individual addresses.
- Email length and validation prevents the worker from being abused as a relay.

## When something goes wrong

**Emails arrive in spam:** Verify the SPF, DKIM, and DMARC records are all in Cloudflare DNS and that Resend's dashboard shows your domain as "Verified".

**Worker returns 403 "Origin not allowed":** You're calling from a domain not in the allowlist. Update `ALLOWED_ORIGINS` in `index.js` and redeploy.

**Worker returns 500:** Check `wrangler tail` for the actual error. Most often: Resend API key invalid, or Resend domain not verified, or the `from` address doesn't match the verified domain.

**Inbound emails to hello@clubshed.pro stop arriving:** You broke the Cloudflare Email Routing setup while adding Resend's DNS records. Go to Cloudflare → Email → Email Routing and re-verify. The MX records there must stay intact.
