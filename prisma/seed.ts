// prisma/seed.ts
import { PrismaClient, GardenSize, Frequency, BookingStatus, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Neat Green database...')

  // ── Admin user ──────────────────────────────────────────
  const adminPassword = await bcrypt.hash('greenrun2024', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@greenrun.co.uk' },
    update: {},
    create: {
      email: 'admin@greenrun.co.uk',
      passwordHash: adminPassword,
      name: 'James (Admin)',
      role: UserRole.ADMIN,
      phone: '07700900000',
    },
  })
  console.log('✅ Admin:', admin.email)

  // ── Crew member ─────────────────────────────────────────
  const crewPassword = await bcrypt.hash('crew2024', 10)
  const crew = await prisma.user.upsert({
    where: { email: 'crew@greenrun.co.uk' },
    update: {},
    create: {
      email: 'crew@greenrun.co.uk',
      passwordHash: crewPassword,
      name: 'Dan (Crew)',
      role: UserRole.CREW,
      phone: '07700900001',
    },
  })
  console.log('✅ Crew:', crew.email)

  // ── Devon customers within Okehampton territory ──────────
  const customers = [
    {
      name: 'Tom Westcott',
      email: 'tom.w@example.com',
      phone: '07700900100',
      addressLine1: '4 Crediton Road',
      city: 'Okehampton',
      postcode: 'EX20 1LB',
      latitude: 50.7392,
      longitude: -3.9981,
      gardenSize: GardenSize.MEDIUM,
      gardenAreaM2: 68.0,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 4500,
      subscriptionActive: true,
    },
    {
      name: 'Sarah Brimacombe',
      email: 'sarah.b@example.com',
      phone: '07700900101',
      addressLine1: '12 Fore Street',
      city: 'Hatherleigh',
      postcode: 'EX20 3JH',
      latitude: 50.8129,
      longitude: -4.0652,
      gardenSize: GardenSize.LARGE,
      gardenAreaM2: 132.0,
      frequency: Frequency.MONTHLY,
      pricePerCut: 6500,
      subscriptionActive: true,
    },
    {
      name: 'Mike Radford',
      email: 'mike.r@example.com',
      phone: '07700900102',
      addressLine1: '2 Church Lane',
      city: 'North Tawton',
      postcode: 'EX20 2ED',
      latitude: 50.7959,
      longitude: -3.9071,
      gardenSize: GardenSize.SMALL,
      gardenAreaM2: 38.5,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 3500,
      subscriptionActive: true,
    },
    {
      name: 'Clare Pengelly',
      email: 'clare.p@example.com',
      phone: '07700900103',
      addressLine1: 'Moor View Cottage',
      city: 'Belstone',
      postcode: 'EX20 1RD',
      latitude: 50.7148,
      longitude: -3.9401,
      gardenSize: GardenSize.XL,
      gardenAreaM2: 420.0,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 13500,
      subscriptionActive: true,
    },
    {
      name: 'James Arundell',
      email: 'james.a@example.com',
      phone: '07700900104',
      addressLine1: '8 Station Road',
      city: 'Sampford Courtenay',
      postcode: 'EX20 2TB',
      latitude: 50.7701,
      longitude: -3.9538,
      gardenSize: GardenSize.MEDIUM,
      gardenAreaM2: 85.0,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 4500,
      subscriptionActive: true,
    },
    {
      name: 'Ruth Endacott',
      email: 'ruth.e@example.com',
      phone: '07700900105',
      addressLine1: 'Hillside Farm',
      city: 'Sticklepath',
      postcode: 'EX20 2NW',
      latitude: 50.7252,
      longitude: -3.9764,
      gardenSize: GardenSize.XL,
      gardenAreaM2: 280.0,
      frequency: Frequency.MONTHLY,
      pricePerCut: 9500,
      subscriptionActive: true,
    },
    {
      name: 'Paul Heard',
      email: 'paul.h@example.com',
      phone: '07700900106',
      addressLine1: '3 West Street',
      city: 'Okehampton',
      postcode: 'EX20 1HQ',
      latitude: 50.7378,
      longitude: -4.0012,
      gardenSize: GardenSize.SMALL,
      gardenAreaM2: 28.0,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 3500,
      subscriptionActive: true,
    },
    {
      name: 'Emma Trevithick',
      email: 'emma.t@example.com',
      phone: '07700900107',
      addressLine1: 'Dartmoor View',
      city: 'Spreyton',
      postcode: 'EX17 5AN',
      latitude: 50.7893,
      longitude: -3.8812,
      gardenSize: GardenSize.LARGE,
      gardenAreaM2: 165.0,
      frequency: Frequency.MONTHLY,
      pricePerCut: 7500,
      subscriptionActive: true,
    },
  ]

  const createdCustomers: any[] = []
  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: { email: c.email },
      update: c,
      create: c,
    })
    createdCustomers.push(customer)
    console.log('✅ Customer:', customer.name, `(${customer.postcode})`)
  }

  // ── Today's route — 5 stops in Okehampton area ──────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Delete existing routes/bookings for today to avoid duplicates
  await prisma.job.deleteMany({ where: { booking: { scheduledDate: { gte: today } } } })
  await prisma.booking.deleteMany({ where: { scheduledDate: { gte: today } } })
  await prisma.route.deleteMany({ where: { date: { gte: today } } })

  const route = await prisma.route.create({
    data: {
      date: today,
      crewId: crew.id,
      optimised: true,
      totalMiles: 18.6,
      totalMinutes: 42,
    },
  })

  // ── Today's schedule (5 stops, spread across the territory) ─
  const schedule = [
    { customer: createdCustomers[0], time: '08:00', status: BookingStatus.COMPLETED, order: 1 },   // Okehampton
    { customer: createdCustomers[2], time: '09:00', status: BookingStatus.COMPLETED, order: 2 },   // North Tawton
    { customer: createdCustomers[7], time: '10:30', status: BookingStatus.IN_PROGRESS, order: 3 }, // Spreyton
    { customer: createdCustomers[4], time: '12:00', status: BookingStatus.CONFIRMED, order: 4 },   // Sampford Courtenay
    { customer: createdCustomers[6], time: '13:30', status: BookingStatus.CONFIRMED, order: 5 },   // Okehampton
  ]

  for (const s of schedule) {
    const ref = `NG-${Math.random().toString(36).slice(2,6).toUpperCase()}`
    const scheduledDate = new Date(today)
    const [h, m] = s.time.split(':').map(Number)
    scheduledDate.setHours(h, m, 0, 0)

    const booking = await prisma.booking.create({
      data: {
        reference: ref,
        customerId: s.customer.id,
        scheduledDate,
        scheduledTime: s.time,
        gardenSize: s.customer.gardenSize,
        frequency: s.customer.frequency,
        priceInPence: s.customer.pricePerCut,
        status: s.status,
        job: {
          create: {
            crewId: crew.id,
            routeId: route.id,
            routeOrder: s.order,
            startedAt: (s.status === BookingStatus.COMPLETED || s.status === BookingStatus.IN_PROGRESS)
              ? new Date(scheduledDate.getTime() + 5 * 60000) : null,
            completedAt: s.status === BookingStatus.COMPLETED
              ? new Date(scheduledDate.getTime() + 40 * 60000) : null,
            reminderSent: true,
          },
        },
      },
    })
    console.log(`✅ Booking ${booking.reference}: ${s.customer.name} @ ${s.time} [${s.status}]`)
  }

  // ── Future bookings (next 7 days) ────────────────────────
  const futureDays = [1, 2, 3, 5, 7]
  for (const daysAhead of futureDays) {
    const futureDate = new Date(today)
    futureDate.setDate(today.getDate() + daysAhead)
    const custIdx = daysAhead % createdCustomers.length
    const customer = createdCustomers[custIdx]
    const ref = `NG-${Math.random().toString(36).slice(2,6).toUpperCase()}`
    futureDate.setHours(9, 0, 0, 0)

    await prisma.booking.create({
      data: {
        reference: ref,
        customerId: customer.id,
        scheduledDate: futureDate,
        scheduledTime: undefined,
        gardenSize: customer.gardenSize,
        frequency: customer.frequency,
        priceInPence: customer.pricePerCut,
        status: BookingStatus.CONFIRMED,
        job: { create: {} },
      },
    })
    console.log(`✅ Future booking: ${customer.name} in ${daysAhead} day(s)`)
  }

  console.log('\n🎉 Seed complete! Devon territory data loaded.')
  console.log('\n📋 Login credentials:')
  console.log('   Admin: admin@greenrun.co.uk / greenrun2024')
  console.log('   Crew:  crew@greenrun.co.uk  / crew2024')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
