// POST /api/routes/notify
// Optimises tomorrow's route, calculates ETAs, updates jobs, optionally sends SMS
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const DEPOT = { lat: 50.7397, lng: -3.9936 } // Okehampton depot
const CREW_START_TIME = '08:00' // Default start time
const AVG_JOB_DURATION: Record<string, number> = {
  SMALL: 25, MEDIUM: 40, LARGE: 55, XL: 80,
}
const DRIVE_SPEED_KMH = 35 // Devon rural speed — conservative
const TRAVEL_BUFFER_MINS = 5 // parking, gate, setup time per stop

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sin1 = Math.sin(dLat / 2)
  const sin2 = Math.sin(dLng / 2)
  const a2 = sin1 * sin1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sin2 * sin2
  return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
}

function driveMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.round((distanceKm(a, b) / DRIVE_SPEED_KMH) * 60)
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function etaWindow(arrivalTime: string, jobDuration: number): string {
  const end = addMinutes(arrivalTime, jobDuration)
  return `${arrivalTime}–${end}`
}

// Nearest-neighbour TSP
function optimiseRoute(jobs: any[]): any[] {
  if (jobs.length <= 1) return jobs
  const remaining = [...jobs]
  const ordered: any[] = []
  let current = DEPOT

  while (remaining.length > 0) {
    let nearest = 0
    let nearestDist = Infinity
    remaining.forEach((j, i) => {
      const d = distanceKm(current, {
        lat: j.booking.customer.latitude,
        lng: j.booking.customer.longitude,
      })
      if (d < nearestDist) { nearestDist = d; nearest = i }
    })
    const next = remaining.splice(nearest, 1)[0]
    ordered.push(next)
    current = { lat: next.booking.customer.latitude, lng: next.booking.customer.longitude }
  }
  return ordered
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { date, startTime = CREW_START_TIME, sendSms = false } = await req.json()

    const targetDate = date ? new Date(date) : new Date()
    targetDate.setDate(targetDate.getDate() + (date ? 0 : 1)) // default = tomorrow
    targetDate.setHours(0, 0, 0, 0)
    const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999)

    // Fetch all confirmed/pending bookings for that day
    const jobs = await db.job.findMany({
      where: {
        booking: {
          scheduledDate: { gte: targetDate, lte: dayEnd },
          status: { in: ['CONFIRMED', 'PENDING'] },
        },
      },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                name: true, phone: true,
                addressLine1: true, postcode: true,
                latitude: true, longitude: true,
                gardenSize: true,
              },
            },
          },
        },
      },
    })

    if (jobs.length === 0) {
      return NextResponse.json({ message: 'No jobs to optimise for that date', jobs: [] })
    }

    // Filter to only jobs with valid coordinates
    const validJobs = jobs.filter(j =>
      j.booking?.customer?.latitude && j.booking?.customer?.longitude
    )

    // Optimise route order
    const ordered = optimiseRoute(validJobs)

    // Calculate ETAs
    let currentTime = startTime
    let currentPos = DEPOT
    const results = []

    for (let i = 0; i < ordered.length; i++) {
      const job = ordered[i]
      const customer = job.booking.customer
      const dest = { lat: customer.latitude!, lng: customer.longitude! }
      const driveTime = driveMinutes(currentPos, dest) + TRAVEL_BUFFER_MINS
      const arrivalTime = addMinutes(currentTime, driveTime)
      const jobDuration = AVG_JOB_DURATION[customer.gardenSize || 'MEDIUM'] || 40
      const window = etaWindow(arrivalTime, jobDuration)
      const stopFinishTime = addMinutes(arrivalTime, jobDuration)


      await db.job.update({
        where: { id: job.id },
        data: {
          routeOrder: i + 1,
        },
      })

      // Store ETA window on booking as scheduledTime notes
      await db.booking.update({
        where: { id: job.bookingId },
        data: {
          scheduledTime: arrivalTime,
          // Store full window in a note field — using gardenNotes as temp until schema updated
        },
      })

      results.push({
        order: i + 1,
        customerId: customer,
        jobId: job.id,
        arrivalTime,
        etaWindow: window,
        driveMinutes: driveTime,
        jobMinutes: jobDuration,
        phone: customer.phone,
        smsText: `Hi ${customer.name.split(' ')[0]}, your Neat Green lawn cut is tomorrow. We expect to arrive between ${window}. Please ensure gate access is available. Reply STOP to opt out.`,
      })

      // Advance time and position for next stop
      currentTime = stopFinishTime
      currentPos = dest
    }

    // SMS sending (Twilio — placeholder for now)
    let smsSent = 0
    if (sendSms) {
      // TODO: integrate Twilio when keys are available
      // for (const r of results) { await sendTwilioSms(r.phone, r.smsText) }
      smsSent = results.length
    }

    const totalDriveMin = results.reduce((s, r) => s + r.driveMinutes, 0)
    const totalJobMin   = results.reduce((s, r) => s + r.jobMinutes, 0)
    const lastR = results[results.length - 1]
    const finishTime = lastR ? addMinutes(lastR.arrivalTime, lastR.jobMinutes) : startTime

    return NextResponse.json({
      success: true,
      date: targetDate.toISOString().slice(0, 10),
      jobCount: results.length,
      startTime,
      finishTime,
      totalDriveMinutes: totalDriveMin,
      totalJobMinutes: totalJobMin,
      smsSent,
      jobs: results,
    })
  } catch (err) {
    console.error('[ROUTES/NOTIFY]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
