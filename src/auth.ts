import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "YOUR_CLIENT_ID_HERE";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "YOUR_CLIENT_SECRET_HERE";

const REDIRECT_PATH = "/";

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString("base64url")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return base64URLEncode(hash);
}

function generateState(): string {
  return base64URLEncode(randomBytes(16));
}

function waitForCallback(port: number, state: string, codeVerifier: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (!req.url) return;

      const parsed = new URL(req.url, `http://localhost:${port}`);
      const path = parsed.pathname;

      if (path === REDIRECT_PATH) {
        const code = parsed.searchParams.get("code");
        const returnedState = parsed.searchParams.get("state");
        const error = parsed.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>Authorization Failed</h1><p>Error: ${error}</p><p>You can close this window.</p>`);
          reject(new Error(`OAuth error: ${error}`));
          server.close();
          return;
        }

        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>State mismatch</h1><p>Security check failed. You can close this window.</p>");
          reject(new Error("State mismatch"));
          server.close();
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>No authorization code</h1><p>You can close this window.</p>");
          reject(new Error("No authorization code"));
          server.close();
          return;
        }

        try {
          const email = await exchangeCode(code, codeVerifier, port);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<h1>✅ Authorized!</h1><p>Account: ${email}</p><p>You can close this window and return to Claude.</p>`);
          resolve(email);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<h1>Error</h1><p>${err instanceof Error ? err.message : "Unknown error"}</p>`);
          reject(err);
        }
        server.close();
        return;
      }

      res.writeHead(404);
      res.end();
    });
    server.unref();
    server.listen(port, () => {
      setTimeout(() => {
        if (server.listening) {
          server.close();
          reject(new Error("OAuth timed out after 120 seconds"));
        }
      }, 120_000);
    });
    server.on("error", (err) => {
      reject(err);
    });
  });
}

async function exchangeCode(code: string, codeVerifier: string, port: number): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `http://localhost:${port}${REDIRECT_PATH}`
  );

  const { tokens } = await oauth2Client.getToken({
    code,
    codeVerifier,
  });

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to obtain tokens from Google");
  }

  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  const email = userInfo.email;
  if (!email) throw new Error("Could not retrieve email from Google account");

  const { saveAccount } = await import("./store.js");
  await saveAccount({
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ?? Date.now() + 3600_000,
    scope: tokens.scope ?? SCOPES.join(" "),
  });

  return email;
}

export async function initiateOAuth(): Promise<{ url: string; email: Promise<string> }> {
  const port = await findFreePort();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const emailPromise = waitForCallback(port, state, codeVerifier);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", `http://localhost:${port}${REDIRECT_PATH}`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return { url: authUrl.toString(), email: emailPromise };
}

export function getAuthenticatedClient(account: { accessToken: string; refreshToken: string; expiryDate: number }) {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.expiryDate,
  });

  return oauth2Client;
}

async function findFreePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not find free port")));
      }
    });
    server.on("error", reject);
  });
}

export function getClientId(): string {
  return GOOGLE_CLIENT_ID;
}
