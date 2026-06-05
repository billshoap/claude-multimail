export interface GmailAccount {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  labels: string[];
  unread: boolean;
}

export interface SendEmailParams {
  accountId: string;
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

export interface ListEmailsParams {
  accountId: string;
  maxResults?: number;
  labelIds?: string[];
}

export interface SearchEmailsParams {
  accountId: string;
  query: string;
  maxResults?: number;
}

export interface AuthState {
  codeVerifier: string;
  port: number;
  state: string;
}
