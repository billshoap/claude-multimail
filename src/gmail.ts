import { google } from "googleapis";
import { GmailAccount, EmailMessage, SendEmailParams, ListEmailsParams, SearchEmailsParams } from "./types.js";
import { getAuthenticatedClient } from "./auth.js";
import { getAccount, updateTokens } from "./store.js";

function getGmailClient(account: GmailAccount) {
  const auth = getAuthenticatedClient(account);
  return google.gmail({ version: "v1", auth });
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function encodeBase64(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64url");
}

function parseEmailHeaders(payload: any): { from: string; to: string; subject: string; date: string } {
  const headers: Record<string, string> = {};
  if (payload?.headers) {
    for (const h of payload.headers) {
      headers[h.name.toLowerCase()] = h.value;
    }
  }
  return {
    from: headers.from || "",
    to: headers.to || "",
    subject: headers.subject || "",
    date: headers.date || "",
  };
}

function extractBody(payload: any): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = decodeBase64(payload.body.data);
    return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return "";
}

async function ensureFreshToken(account: GmailAccount): Promise<void> {
  const auth = getAuthenticatedClient(account);
  const now = Date.now();

  if (account.expiryDate && account.expiryDate <= now + 60_000) {
    try {
      const { credentials } = await auth.refreshAccessToken();
      await updateTokens(
        account.email,
        credentials.access_token!,
        credentials.refresh_token || account.refreshToken,
        credentials.expiry_date ?? now + 3600_000
      );
    } catch (err) {
      throw new Error(`Token refresh failed for ${account.email}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }
}

export async function sendEmail(params: SendEmailParams): Promise<{ id: string; threadId: string }> {
  const account = await getAccount(params.accountId);
  if (!account) throw new Error(`Account not found: ${params.accountId}. Use add_gmail_account first.`);

  await ensureFreshToken(account);
  const gmail = getGmailClient(account);

  const toHeader = params.to.join(", ");
  const ccHeader = params.cc?.length ? `CC: ${params.cc.join(", ")}\r\n` : "";
  const bccHeader = params.bcc?.length ? `BCC: ${params.bcc.join(", ")}\r\n"` : "";

  const raw = [
    `From: ${account.email}`,
    `To: ${toHeader}`,
    ccHeader && `Cc: ${params.cc!.join(", ")}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    params.body,
  ]
    .filter(Boolean)
    .join("\r\n");

  const encoded = encodeBase64(raw);

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  return {
    id: response.data.id!,
    threadId: response.data.threadId!,
  };
}

export async function listEmails(params: ListEmailsParams): Promise<EmailMessage[]> {
  const account = await getAccount(params.accountId);
  if (!account) throw new Error(`Account not found: ${params.accountId}`);

  await ensureFreshToken(account);
  const gmail = getGmailClient(account);

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: params.maxResults ?? 20,
    labelIds: params.labelIds ?? ["INBOX"],
  });

  const messages = response.data.messages || [];
  if (messages.length === 0) return [];

  const results: EmailMessage[] = [];

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });

    const payload = detail.data.payload;
    const headers = parseEmailHeaders(payload);
    const body = extractBody(payload);
    const labels = detail.data.labelIds ?? [];
    const snippet = detail.data.snippet ?? "";

    results.push({
      id: detail.data.id!,
      threadId: detail.data.threadId!,
      from: headers.from,
      to: headers.to,
      subject: headers.subject,
      snippet,
      body,
      date: headers.date,
      labels,
      unread: labels.includes("UNREAD"),
    });
  }

  return results;
}

export async function readEmail(accountId: string, messageId: string): Promise<EmailMessage> {
  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  await ensureFreshToken(account);
  const gmail = getGmailClient(account);

  const detail = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const payload = detail.data.payload;
  const headers = parseEmailHeaders(payload);
  const body = extractBody(payload);
  const labels = detail.data.labelIds ?? [];
  const snippet = detail.data.snippet ?? "";

  return {
    id: detail.data.id!,
    threadId: detail.data.threadId!,
    from: headers.from,
    to: headers.to,
    subject: headers.subject,
    snippet,
    body,
    date: headers.date,
    labels,
    unread: labels.includes("UNREAD"),
  };
}

export async function searchEmails(params: SearchEmailsParams): Promise<EmailMessage[]> {
  const account = await getAccount(params.accountId);
  if (!account) throw new Error(`Account not found: ${params.accountId}`);

  await ensureFreshToken(account);
  const gmail = getGmailClient(account);

  const response = await gmail.users.messages.list({
    userId: "me",
    q: params.query,
    maxResults: params.maxResults ?? 20,
  });

  const messages = response.data.messages || [];
  if (messages.length === 0) return [];

  const results: EmailMessage[] = [];

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });

    const payload = detail.data.payload;
    const headers = parseEmailHeaders(payload);
    const body = extractBody(payload);
    const labels = detail.data.labelIds ?? [];
    const snippet = detail.data.snippet ?? "";

    results.push({
      id: detail.data.id!,
      threadId: detail.data.threadId!,
      from: headers.from,
      to: headers.to,
      subject: headers.subject,
      snippet,
      body,
      date: headers.date,
      labels,
      unread: labels.includes("UNREAD"),
    });
  }

  return results;
}

export async function getUnreadCount(accountId: string): Promise<number> {
  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  await ensureFreshToken(account);
  const gmail = getGmailClient(account);

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 0,
    labelIds: ["INBOX", "UNREAD"],
  });

  return response.data.resultSizeEstimate ?? 0;
}
