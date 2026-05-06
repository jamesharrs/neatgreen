// POST /api/routes/notify
// Optimises tomorrow's route and calculates ETA windows for each customer
// Optionally sends SMS via Twilio (when configured)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// Average job durations in minutes by garden size
const JOB_DURATIONS: Record<string, number> = {
  SMALL:  25,
  MEDIUM: 40,
  LARGE:  55,
  XL:     90,
}

// Travel speed assumption: 30mph average on Devon roads = 0.5 miles/min
const MILES_PER_MINUTE = 0.5

// Haversine distance in miles between two lat/lng points
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Nearest-neighbour TSP from a depot
function optimiseRoute(
  depot: { lat: number; lng: number },
  stops: Array<{ id: string; lat: number; lng: number; gardenSize: string }>
) {
  const remaining = [...stops]
  const ordered: typeof stops = []
  let current = depot

  while (remaining.length > 0) {
    let nearest = 0
    let nearestDist = Infinity
    remaining.forEach((s, i) => {
      const d = haversineM(current.lat, current.lng, s.lat, s.lng)
      if (d < nearestDist) { nearestDist = d; nearest = i }
    })
    ordered.push(remaining[nearest])
    current = remaining[nearest]
    remaining.splice(nearest, 1)
  }
  return ordered
}

// Format a Date as HH:MM
function fmt(d: Date) {
  return d.toTimeString().slice(0, 5)
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { date, depotLat = 50.7397, depotLng = -3.9936, startTime = '08:00' } = body

    // Default to tomorrow
    const targetDate = date ? new Date(date) : (() => {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0,0,0,0); return d
    })()
    const endDate = new Date(targetDate)
    endDate.setHours(23, 59, 59, 999)

    // Fetch all confirmed bookings for target date
    const bookings = await db.booking.findMany({
      where: {
        scheduledDate: { gte: targetDate, lte: endDate },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        customer: true,
        job: true,
      },
    })

    if (bookings.length === 0) {
      return NextResponse.json({ error: 'No bookings found for this date' }, { status: 404 })
    }

    // Build stops with coordinates
    const stops = bookings
      .filter(b => b.customer.latitude && b.customer.longitude)
      .map(b => ({
        id: b.id,
        jobId: b.job?.id,
        lat: b.customer.latitude!,
        lng: b.customer.longitude!,
        gardenSize: b.gardenSize,
        customerName: b.customer.name,
        customerPhone: b.customer.phone,
        address: `${b.customer.addressLine1}, ${b.customer.postcode}`,
      }))

    // Optimise route
    const ordered = optimiseRoute({ lat: depotLat, lng: depotLng }, stops)

    // Calculate ETA windows
    const [startH, startM] = startTime.split(':').map(Number)
    let currentTime = new Date(targetDate)
    currentTime.setHours(startH, startM, 0, 0)
    let currentLat = depotLat, currentLng = depotLng
    let totalMiles = 0

    const results = []

    for (let i = 0; i < ordered.length; i++) {
      const stop = ordered[i]
      const driveMiles = haversineM(currentLat, currentLng, stop.lat, stop.lng)
      const driveMins  = Math.round(driveMiles / MILES_PER_MINUTE)
      const jobMins    = JOB_DURATIONS[stop.gardenSize] || 40
      totalMiles += driveMiles

      const arriveTime = new Date(currentTime.getTime() + driveMins * 60000)
      const leaveTime  = new Date(arriveTime.getTime() + jobMins * 60000)

      // ETA window: arrive ± 15 mins
      const etaFrom = new Date(arriveTime.getTime() - 15 * 60000)
      const etaTo   = new Date(arriveTime.getTime() + 15 * 60000)
      const etaWindow = `${fmt(etaFrom)}–${fmt(etaTo)}`
      const scheduledTime = fmt(arriveTime)

      // Update booking + job in DB
      await db.booking.update({
        where: { id: stop.id },
        data: {
          scheduledTime,
          status: 'CONFIRMED',
          job: {
            update: {
              routeOrder: i + 1,
              etaWindow,
              etaNotifiedAt: new Date(),
            },
          },
        },
      })

      // TODO: Twilio SMS
      // const msg = `Hi ${stop.customerName.split(' ')[0]}, your Neat Green lawn cut is tomorrow.`
      //           + ` We expect to arrive between ${etaWindow}. Any questions? Reply to this message.`
      // await twilioClient.messages.create({ to: stop.customerPhone, from: process.env.TWILIO_FROM, body: msg })

      results.push({
        order: i + 1,
        customerName: stop.customerName,
        address: stop.address,
        phone: stop.customerPhone,
        driveMins,
        driveMiles: driveMiles.toFixed(1),
        arriveTime: scheduledTime,
        etaWindow,
        jobMins,
      })

      currentTime = leaveTime
      currentLat  = stop.lat
      currentLng  = stop.lng
    }

    // Update or create route record
    const routeDate = new Date(targetDate)
    routeDate.setHours(0,0,0,0)
    await db.route.upsert({
      where: { date: routeDate } as any,
      update: {
        optimised: true,
        totalMiles: Math.round(totalMiles * 10) / 10,
        totalMinutes: results.reduce((s, r) => s + r.driveMins + r.jobMins, 0),
      },
      create: {
        date: routeDate,
        optimised: true,
        totalMiles: Math.round(totalMiles * 10) / 10,
        totalMinutes: results.reduce((s, r) => s + r.driveMins + r.jobMins, 0),
      },
    })

    return NextResponse.json({
      date: targetDate.toISOString().slice(0, 10),
      stops: results.length,
      totalMiles: Math.round(totalMiles * 10) / 10,
      startTime,
      depot: { lat: depotLat, lng: depotLng },
      route: results,
      smsReady: false, // set to true when Twilio configured
    })

  } catch (err) {
    console.error('[ROUTES/NOTIFY]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
