import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { isAdminEmail } from './store.ts';

interface FirebaseAppletConfig {
  apiKey: string;
  projectId: string;
}

function getFirebaseApiKey(): string {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as FirebaseAppletConfig;
  return parsed.apiKey;
}

export interface AuthenticatedAdmin {
  uid: string;
  email: string;
}

export interface AdminRequest extends Request {
  adminUser?: AuthenticatedAdmin;
}

export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<AuthenticatedAdmin | null> {
  const apiKey = getFirebaseApiKey();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) return null;
  const payload = (await res.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
    }>;
  };
  const user = payload.users?.[0];
  if (!user || !user.localId || !user.email || !user.emailVerified) {
    return null;
  }
  const allowed = await isAdminEmail(user.email);
  if (!allowed) return null;
  return {
    uid: user.localId,
    email: user.email,
  };
}

export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Missing authentication token.' });
      return;
    }
    const adminUser = await verifyFirebaseIdToken(token);
    if (!adminUser) {
      res.status(403).json({
        error: 'Access denied. Verified organizer administrator account required.',
      });
      return;
    }
    req.adminUser = adminUser;
    next();
  } catch (err) {
    console.error('Admin auth error:', err);
    res.status(500).json({ error: 'Authentication verification failed.' });
  }
}
