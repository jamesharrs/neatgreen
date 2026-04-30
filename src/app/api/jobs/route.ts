// GET /api/jobs — returns today's jobs for crew, or filtered for admin
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

    const start = new Date(date); start.setHours(0, 0, 0, 0)
    const end   = new Date(date); end.setHours(23, 59, 59, 999)

    const where: any = {
      booking: { scheduledDate: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
    }
    if (user.role === 'CREW') where.crewId = user.userId

    const jobs = await db.job.findMany({
      where,
      orderBy: { routeOrder: 'asc' },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                name: true, phone: true,
                addressLine1: true, addressLine2: true, postcode: true,
                latitude: true, longitude: true,
                gardenSize: true, gardenAreaM2: true, gardenNotes: true,
              },
            },
          },
        },
        crew: { select: { name: true } },
      },
    })

    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('[JOBS/GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
