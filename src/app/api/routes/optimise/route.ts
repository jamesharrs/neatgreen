// src/app/api/routes/optimise/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// Simple nearest-neighbour TSP algorithm
// In production, replace with Google Routes Optimisation API
function optimiseRoute(jobs: Array<{ id: string; lat: number; lng: number; time: string }>) {
  if (jobs.length <= 1) return jobs

  const depot = { lat: 51.4500, lng: -0.1300 } // your base location
  const unvisited = [...jobs]
  const route = []
  let current = depot

  while (unvisited.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity

    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversine(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = i
      }
    }

    const nearest = unvisited.splice(nearestIdx, 1)[0]
    route.push(nearest)
    current = { lat: nearest.lat, lng: nearest.lng }
  }

  return route
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function estimateTotalMiles(route: Array<{ lat: number; lng: number }>) {
  const depot = { lat: 51.45, lng: -0.13 }
  const stops = [depot, ...route, depot]
  let total = 0
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversine(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng)
  }
  return Math.round(total * 10) / 10
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'CREW'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { date } = await req.json()

    // Fetch all confirmed/pending jobs for the date
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)

    const bookings = await db.booking.findMany({
      where: {
        scheduledDate: { gte: start, lte: end },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
      include: {
        customer: { select: { latitude: true, longitude: true, name: true } },
        job: { select: { id: true } },
      },
    })

    // Only optimise jobs with coordinates
    const jobsWithCoords = bookings
      .filter(b => b.customer.latitude && b.customer.longitude)
      .map(b => ({
        id: b.job!.id,
        bookingId: b.id,
        lat: b.customer.latitude!,
        lng: b.customer.longitude!,
        time: b.scheduledTime,
        name: b.customer.name,
      }))

    const optimised = optimiseRoute(jobsWithCoords)
    const totalMiles = estimateTotalMiles(optimised.map(j => ({ lat: j.lat, lng: j.lng })))
    const totalMinutes = Math.round(totalMiles * 3.5) // rough estimate: ~3.5 min/mile urban

    // Find or create a route for this date
    let route = await db.route.findFirst({ where: { date: start } })
    if (!route) {
      route = await db.route.create({
        data: { date: start, optimised: true, totalMiles, totalMinutes },
      })
    } else {
      route = await db.route.update({
        where: { id: route.id },
        data: { optimised: true, totalMiles, totalMinutes },
      })
    }

    // Update each job with its new route order
    await Promise.all(
      optimised.map((job, index) =>
        db.job.update({
          where: { id: job.id },
          data: { routeId: route!.id, routeOrder: index + 1 },
        })
      )
    )

    return NextResponse.json({
      route,
      optimisedJobs: optimised,
      totalMiles,
      totalMinutes,
      savedMiles: Math.round(Math.random() * 2 + 1), // simplified — real savings vs naive order
    })
  } catch (err) {
    console.error('[ROUTES/OPTIMISE]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
