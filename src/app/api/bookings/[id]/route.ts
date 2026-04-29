// src/app/api/bookings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED']).optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  notes: z.string().optional(),
  crewId: z.string().optional(),
  // Job completion fields
  photoUrl: z.string().optional(),
  crewNotes: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
})

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const booking = await db.booking.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      job: { include: { crew: { select: { name: true, phone: true } } } },
    },
  })

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ booking })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const data = updateSchema.parse(body)

    const booking = await db.booking.findUnique({
      where: { id: params.id },
      include: { job: true },
    })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Update booking fields
    const bookingUpdate: any = {}
    if (data.status) bookingUpdate.status = data.status
    if (data.scheduledDate) bookingUpdate.scheduledDate = new Date(data.scheduledDate)
    if (data.scheduledTime) bookingUpdate.scheduledTime = data.scheduledTime
    if (data.notes !== undefined) bookingUpdate.notes = data.notes

    const updated = await db.booking.update({
      where: { id: params.id },
      data: bookingUpdate,
    })

    // Update associated job if needed
    if (booking.job && (data.crewId || data.photoUrl || data.crewNotes || data.rating || data.status)) {
      const jobUpdate: any = {}
      if (data.crewId) jobUpdate.crewId = data.crewId
      if (data.photoUrl) jobUpdate.photoUrl = data.photoUrl
      if (data.crewNotes) jobUpdate.crewNotes = data.crewNotes
      if (data.rating) jobUpdate.rating = data.rating
      if (data.status === 'IN_PROGRESS') jobUpdate.startedAt = new Date()
      if (data.status === 'COMPLETED') jobUpdate.completedAt = new Date()

      await db.job.update({ where: { id: booking.job.id }, data: jobUpdate })
    }

    return NextResponse.json({ booking: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('[BOOKINGS/PATCH]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.booking.update({
    where: { id: params.id },
    data: { status: 'CANCELLED' },
  })

  return NextResponse.json({ ok: true })
}
