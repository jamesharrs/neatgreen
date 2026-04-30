// PATCH /api/jobs/[id] — update job status (crew marks complete etc)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { status, crewNotes, photoUrl, startedAt, completedAt } = body

    const updateData: any = {}
    if (crewNotes !== undefined) updateData.crewNotes = crewNotes
    if (photoUrl !== undefined)  updateData.photoUrl  = photoUrl
    if (startedAt)   updateData.startedAt   = new Date(startedAt)
    if (completedAt) updateData.completedAt = new Date(completedAt)

    // If marking complete, also update booking status
    if (status === 'COMPLETED') {
      updateData.completedAt = updateData.completedAt ?? new Date()
      await db.booking.updateMany({
        where: { job: { id: params.id } },
        data: { status: 'COMPLETED' },
      })
    }
    if (status === 'IN_PROGRESS') {
      updateData.startedAt = updateData.startedAt ?? new Date()
      await db.booking.updateMany({
        where: { job: { id: params.id } },
        data: { status: 'IN_PROGRESS' },
      })
    }

    const job = await db.job.update({
      where: { id: params.id },
      data: updateData,
      include: {
        booking: { include: { customer: { select: { name: true, addressLine1: true } } } },
      },
    })

    return NextResponse.json({ job })
  } catch (err) {
    console.error('[JOBS/PATCH]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const job = await db.job.findUnique({
      where: { id: params.id },
      include: {
        booking: { include: { customer: true } },
        crew: { select: { name: true } },
      },
    })
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ job })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
