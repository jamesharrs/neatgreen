// src/lib/auth.ts
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { db } from './db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production'
)
const COOKIE_NAME = 'greenrun_token'

export interface JWTPayload extends Record<string, unknown> {
  userId: string
  email: string
  role: string
  name: string
}

// ── Sign a JWT ───────────────────────────────────────────
export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

// ── Verify a JWT ─────────────────────────────────────────
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

// ── Get current user from cookie ─────────────────────────
export async function getCurrentUser(): Promise<JWTPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

// ── Require auth (throws redirect if not logged in) ──────
export async function requireAuth(allowedRoles?: string[]) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error('FORBIDDEN')
  }
  return user
}

// ── Set auth cookie ──────────────────────────────────────
export function getAuthCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  }
}

export { COOKIE_NAME }
