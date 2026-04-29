// src/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { GARDEN_PRICES } from '@/types'
import { z } from 'zod'

const createBookingSchema = z.object({
  // Customer details
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),

  // Address
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  city: z.string().default('London'),
  postcode: z.string().min(5),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  // Lawn
  gardenSize: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'XL']),
  gardenAreaM2: z.number().optional(),
  gardenNotes: z.string().optional(),

  // Schedule
  frequency: z.enum(['ONE_OFF', 'FORTNIGHTLY', 'MONTHLY']),
  scheduledDate: z.string(), // ISO date string
  scheduledTime: z.string(), // e.g. "09:00"
})

// ── GET /api/bookings ─────────────────────────────────────
// Returns today's bookings for crew, all for admin
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') // YYYY-MM-DD
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')

    const where: any = {}

    if (date) {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      where.scheduledDate = { gte: start, lte: end }
    }

    if (status) where.status = status
    if (customerId) where.customerId = customerId

    // Crew can only see their own assigned jobs
    if (user.role === 'CREW') {
      where.job = { crewId: user.userId }
    }

    const bookings = await db.booking.findMany({
      where,
      include: {
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
            addressLine1: true,
            postcode: true,
            latitude: true,
            longitude: true,
            gardenSize: true,
            gardenNotes: true,
          },
        },
        job: {
          select: {
            id: true,
            routeOrder: true,
            startedAt: true,
            completedAt: true,
            photoUrl: true,
            crewNotes: true,
            crew: { select: { name: true } },
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    })

    return NextResponse.json({ bookings })
  } catch (err) {
    console.error('[BOOKINGS/GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST /api/bookings ────────────────────────────────────
// Public — creates a new customer booking
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createBookingSchema.parse(body)

    const priceInPence = GARDEN_PRICES[data.gardenSize]

    // Upsert customer (existing customer rebooking uses same email)
    const customer = await db.customer.upsert({
      where: { email: data.email },
      update: {
        name: data.name,
        phone: data.phone,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        postcode: data.postcode,
        latitude: data.latitude,
        longitude: data.longitude,
        gardenSize: data.gardenSize,
        gardenAreaM2: data.gardenAreaM2,
        gardenNotes: data.gardenNotes,
        frequency: data.frequency,
        pricePerCut: priceInPence,
      },
      create: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        postcode: data.postcode,
        latitude: data.latitude,
        longitude: data.longitude,
        gardenSize: data.gardenSize,
        gardenAreaM2: data.gardenAreaM2,
        gardenNotes: data.gardenNotes,
        frequency: data.frequency,
        pricePerCut: priceInPence,
      },
    })

    // Generate booking reference
    const reference = `GR-${Date.now().toString(36).toUpperCase().slice(-4)}`

    const scheduledDate = new Date(data.scheduledDate)

    const booking = await db.booking.create({
      data: {
        reference,
        customerId: customer.id,
        scheduledDate,
        scheduledTime: data.scheduledTime,
        gardenSize: data.gardenSize,
        frequency: data.frequency,
        priceInPence,
        status: 'PENDING',
        job: { create: {} }, // create empty job shell to be assigned later
      },
      include: {
        customer: { select: { name: true, email: true } },
      },
    })

    return NextResponse.json({ booking, reference }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 })
    }
    console.error('[BOOKINGS/POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
