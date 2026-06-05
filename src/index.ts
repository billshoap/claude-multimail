#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getAccounts, getAccount, removeAccount } from "./store.js";
import { initiateOAuth } from "./auth.js";
import { sendEmail, listEmails, readEmail, searchEmails, getUnreadCount } from "./gmail.js";
import open from "open";

const server = new Server(
  {
    name: "MultiMail",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "add_gmail_account",
      description: "Add a new Gmail account by opening a browser for Google OAuth authorization",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "remove_gmail_account",
      description: "Remove a configured Gmail account",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Email address of the account to remove" },
        },
        required: ["accountId"],
      },
    },
    {
      name: "list_accounts",
      description: "List all configured Gmail accounts",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "send_email",
      description: "Send an email from one of your Gmail accounts",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Email address of the sender account" },
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses",
          },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body text" },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "CC recipients (optional)",
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "BCC recipients (optional)",
          },
        },
        required: ["accountId", "to", "subject", "body"],
      },
    },
    {
      name: "list_emails",
      description: "List recent emails from a Gmail account's inbox",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Email address of the account" },
          maxResults: {
            type: "number",
            description: "Maximum number of emails to return (default: 20)",
          },
          labelIds: {
            type: "array",
            items: { type: "string" },
            description: 'Filter by label IDs (e.g. ["INBOX"], ["SENT"])',
          },
        },
        required: ["accountId"],
      },
    },
    {
      name: "read_email",
      description: "Read the full content of a specific email",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Email address of the account" },
          messageId: { type: "string", description: "The Gmail message ID" },
        },
        required: ["accountId", "messageId"],
      },
    },
    {
      name: "search_emails",
      description: "Search emails in a Gmail account using Gmail search syntax",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Email address of the account" },
          query: { type: "string", description: "Gmail search query (e.g. 'from:alice has:attachment')" },
          maxResults: {
            type: "number",
            description: "Maximum number of results (default: 20)",
          },
        },
        required: ["accountId", "query"],
      },
    },
    {
      name: "get_unread_count",
      description: "Get the number of unread emails in a Gmail account's inbox",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Email address of the account" },
        },
        required: ["accountId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "add_gmail_account": {
      try {
        const { url, email: emailPromise } = await initiateOAuth();

        setImmediate(async () => {
          try {
            await open(url);
          } catch {
            // fallback: just return the URL
          }
        });

        const email = await emailPromise;

        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully authorized Gmail account: **${email}**\n\nYou can now send emails and read your inbox from this account.`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        if (message.includes("timed out")) {
          return {
            content: [
              {
                type: "text",
                text: "⏱️ OAuth authorization timed out. Please try again and complete the browser authorization within 2 minutes.",
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `❌ Authorization failed: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "remove_gmail_account": {
      const { accountId } = args as { accountId: string };
      const removed = await removeAccount(accountId);
      if (!removed) {
        return {
          content: [{ type: "text", text: `Account not found: ${accountId}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `✅ Removed account: ${accountId}` }],
      };
    }

    case "list_accounts": {
      const accounts = await getAccounts();
      const emails = Object.keys(accounts);
      if (emails.length === 0) {
        return {
          content: [{ type: "text", text: "No Gmail accounts configured. Use `add_gmail_account` to add one." }],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `**Configured accounts (${emails.length}):**\n${emails.map((e) => `- ${e}`).join("\n")}`,
          },
        ],
      };
    }

    case "send_email": {
      const sendParams = args as {
        accountId: string;
        to: string[];
        subject: string;
        body: string;
        cc?: string[];
        bcc?: string[];
      };
      try {
        const result = await sendEmail(sendParams);
        return {
          content: [
            {
              type: "text",
              text: `✅ Email sent from ${sendParams.accountId}\nTo: ${sendParams.to.join(", ")}\nSubject: ${sendParams.subject}\nMessage ID: ${result.id}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Failed to send email: ${err instanceof Error ? err.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }

    case "list_emails": {
      const listParams = args as { accountId: string; maxResults?: number; labelIds?: string[] };
      try {
        const emails = await listEmails(listParams);
        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: "No emails found." }],
          };
        }

        const formatted = emails.map(
          (e) =>
            `${e.unread ? "🔴" : "⚪"} **${e.subject || "(no subject)"}**\n  From: ${e.from}\n  Date: ${e.date}\n  ID: \`${e.id}\`\n  ${e.snippet}`
        );

        return {
          content: [
            {
              type: "text",
              text: `**Inbox for ${listParams.accountId}** (${emails.length} messages):\n\n${formatted.join("\n\n")}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Failed to list emails: ${err instanceof Error ? err.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }

    case "read_email": {
      const { accountId, messageId } = args as { accountId: string; messageId: string };
      try {
        const email = await readEmail(accountId, messageId);
        return {
          content: [
            {
              type: "text",
              text: `**Subject:** ${email.subject}\n**From:** ${email.from}\n**To:** ${email.to}\n**Date:** ${email.date}\n**Labels:** ${email.labels.join(", ")}\n\n${email.body || email.snippet}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Failed to read email: ${err instanceof Error ? err.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }

    case "search_emails": {
      const searchParams = args as { accountId: string; query: string; maxResults?: number };
      try {
        const emails = await searchEmails(searchParams);
        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: `No results for query: "${searchParams.query}"` }],
          };
        }

        const formatted = emails.map(
          (e) =>
            `${e.unread ? "🔴" : "⚪"} **${e.subject || "(no subject)"}**\n  From: ${e.from}\n  Date: ${e.date}\n  ID: \`${e.id}\`\n  ${e.snippet}`
        );

        return {
          content: [
            {
              type: "text",
              text: `**Search results for "${searchParams.query}"** (${emails.length}):\n\n${formatted.join("\n\n")}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Search failed: ${err instanceof Error ? err.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }

    case "get_unread_count": {
      const { accountId } = args as { accountId: string };
      try {
        const count = await getUnreadCount(accountId);
        return {
          content: [
            {
              type: "text",
              text: `📬 **${accountId}**: ${count} unread message${count !== 1 ? "s" : ""} in inbox`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Failed to get unread count: ${err instanceof Error ? err.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const accounts = await getAccounts();
  const resources = [];

  for (const email of Object.keys(accounts)) {
    resources.push({
      uri: `gmail://${email}/inbox`,
      name: `Inbox for ${email}`,
      description: `Recent inbox messages for ${email}`,
      mimeType: "text/plain",
    });
  }

  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const match = uri.match(/^gmail:\/\/([^/]+)\/inbox$/);
  if (!match) {
    throw new McpError(ErrorCode.InvalidRequest, `Invalid URI: ${uri}`);
  }

  const email = decodeURIComponent(match[1]);
  const account = await getAccount(email);
  if (!account) {
    throw new McpError(ErrorCode.InvalidRequest, `Account not found: ${email}`);
  }

  const emails = await listEmails({ accountId: email, maxResults: 10 });

  const text = emails
    .map(
      (e) =>
        `[${e.unread ? "UNREAD" : "READ"}] ${e.subject || "(no subject)"}\nFrom: ${e.from}\nDate: ${e.date}\n${e.snippet}`
    )
    .join("\n\n---\n\n");

  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: text || "No messages in inbox.",
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🖥️ MultiMail MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
