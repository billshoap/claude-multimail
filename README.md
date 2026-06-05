# MultiMail

Multi-account Gmail MCP connector for Claude — add any number of Gmail accounts, send emails, and monitor your inbox.

## One-command Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/billshoap/claude-multimail/main/install.sh)
```

Or with your Google credentials:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/billshoap/claude-multimail/main/install.sh) \
  --client-id YOUR_ID --client-secret YOUR_SECRET
```

Restart Claude → "Add my Gmail account"

## The Problem

The stock `@anthropic/gmail-mcp` connector only supports **a single Gmail account**. If you have multiple email addresses (work, personal, side projects), you're out of luck — you'd need separate config entries and can't switch between them within a conversation.

## The Fix

MultiMail lets you add **as many Gmail accounts as you want** and switch between them seamlessly:

- "Add my Gmail account" → **browser popup, click Allow, done**
- "Add my **work** email too" → **repeat for a second account**
- "What's in my **work** inbox?" → **reads from that account**
- "Send this from my **personal** email" → **sends from that account**

Accounts persist across sessions. Add once, use forever.

## How to Share with Others

Each user needs their own Google Cloud project. No personal info is baked into the code.

### For each new user:

**1. Clone or copy the project**

```bash
git clone <your-repo-url> /path/to/multimail
# or just copy the folder
```

**2. Install dependencies**

```bash
cd /path/to/multimail
npm install && npm run build
```

**3. Create a Google Cloud project (5 minutes)**

- Go to https://console.cloud.google.com/apis/credentials
- Create a project (or use existing)
- Go to **APIs & Services** → **Library** → search "Gmail API" → **Enable**
- Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth Client ID**
- Application type: **Desktop app**
- Name: `MultiMail`
- Redirect URIs: `http://localhost`
- Click **Create**
- Copy the **Client ID** and **Client Secret**

**4. Add themselves as a test user**

- Go to **APIs & Services** → **OAuth consent screen**
- Under **Test users** → **Add Users** → enter their Gmail address

**5. Add to Claude Desktop config**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "MultiMail": {
      "command": "node",
      "args": ["/absolute/path/to/multimail/build/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "their_client_id",
        "GOOGLE_CLIENT_SECRET": "their_client_secret"
      },
      "icon": "/absolute/path/to/multimail/icon.svg"
    }
  }
}
```

**6. Restart Claude → say "Add my Gmail account"**

### Publishing (no test user needed)

If you want users to skip the "test user" step, submit your Google Cloud project for verification:
- Go to **OAuth consent screen** → **Publish app**
- Fill out the verification form (takes a few days)

Once verified, anyone can use it without being added as a test user.

## Privacy

- **No personal data in code** — your email lives only in `~/.multimail/accounts.json`
- **File permissions** — `accounts.json` is locked to `600` (owner-only read/write)
- **Tokens stay local** — OAuth tokens never leave your machine
- **Each user has their own Google project** — no shared secrets

## Custom Connectors

Need a custom MCP connector for your business or tool? I build tailored connectors that give Claude access to any API, database, or internal system.

**What I can build:**
- CRM connectors (Salesforce, HubSpot, custom)
- Database connectors (Postgres, MySQL, Snowflake)
- Internal tool integrations
- Custom SaaS connectors
- Multi-account versions of existing connectors

**Contact:** [wshoap@gmail.com](mailto:wshoap@gmail.com) — open to contract work and collaborations.

---

## Commands

| In Claude, say... | What happens |
|---|---|
| "Add my Gmail account" | Browser opens → sign in → done |
| "What's in my inbox?" | Lists recent emails |
| "Send an email to bob@example.com" | Sends from your account |
| "How many unread emails?" | Unread count |
| "Add another account" | Repeat OAuth for a second email |
