// src/app/api/dashboard/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // This month boundaries
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Last month boundaries
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

    // This week
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)

    // Last week
    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(weekStart)

    const [
      completedThisMonth,
      completedLastMonth,
      activeCustomers,
      newCustomers,
      jobsThisWeek,
      jobsLastWeek,
      ratings,
      todaysJobs,
    ] = await Promise.all([
      // Revenue this month (completed bookings)
      db.booking.aggregate({
        where: { status: 'COMPLETED', scheduledDate: { gte: monthStart, lte: monthEnd } },
        _sum: { priceInPence: true },
        _count: true,
      }),
      // Revenue last month
      db.booking.aggregate({
        where: { status: 'COMPLETED', scheduledDate: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { priceInPence: true },
      }),
      // Active customers
      db.customer.count({ where: { active: true, subscriptionActive: true } }),
      // New customers this month
      db.customer.count({ where: { createdAt: { gte: monthStart } } }),
      // Jobs this week
      db.booking.count({
        where: { scheduledDate: { gte: weekStart }, status: { not: 'CANCELLED' } },
      }),
      // Jobs last week
      db.booking.count({
        where: { scheduledDate: { gte: lastWeekStart, lt: lastWeekEnd }, status: { not: 'CANCELLED' } },
      }),
      // Ratings
      db.job.aggregate({
        where: { rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      // Today's schedule
      db.booking.findMany({
        where: {
          scheduledDate: {
            gte: new Date(now.setHours(0, 0, 0, 0)),
            lte: new Date(now.setHours(23, 59, 59, 999)),
          },
          status: { not: 'CANCELLED' },
        },
        include: {
          customer: { select: { name: true, addressLine1: true, postcode: true } },
          job: { select: { routeOrder: true, startedAt: true, completedAt: true, crew: { select: { name: true } } } },
        },
        orderBy: { scheduledTime: 'asc' },
      }),
    ])

    return NextResponse.json({
      stats: {
        revenueThisMonth: completedThisMonth._sum.priceInPence ?? 0,
        revenueLastMonth: completedLastMonth._sum.priceInPence ?? 0,
        activeCustomers,
        newCustomersThisMonth: newCustomers,
        jobsThisWeek,
        jobsLastWeek,
        avgRating: ratings._avg.rating ?? 0,
        totalRatings: ratings._count.rating,
      },
      todaysJobs,
    })
  } catch (err) {
    console.error('[DASHBOARD]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
