import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const customers = await db.customer.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ customers })
  } catch (err) {
    console.error('[CUSTOMERS/GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
