// prisma/seed.ts
import { PrismaClient, GardenSize, Frequency, BookingStatus, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

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
  console.log('✅ Admin user:', admin.email)

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
  console.log('✅ Crew user:', crew.email)

  // ── Sample customers ─────────────────────────────────────
  const customers = [
    {
      name: 'Sarah Johnson',
      email: 'sarah.j@example.com',
      phone: '07700900100',
      addressLine1: '14 Oak Avenue',
      city: 'London',
      postcode: 'SW4 0AB',
      latitude: 51.4589,
      longitude: -0.1294,
      gardenSize: GardenSize.MEDIUM,
      gardenAreaM2: 62.4,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 4500,
      subscriptionActive: true,
    },
    {
      name: 'Mike Kowalski',
      email: 'mike.k@example.com',
      phone: '07700900101',
      addressLine1: '7 Elm Close',
      city: 'London',
      postcode: 'SW2 1CD',
      latitude: 51.4612,
      longitude: -0.1178,
      gardenSize: GardenSize.LARGE,
      gardenAreaM2: 105.0,
      frequency: Frequency.MONTHLY,
      pricePerCut: 6000,
      subscriptionActive: true,
    },
    {
      name: 'Rachel Pierce',
      email: 'rachel.p@example.com',
      phone: '07700900102',
      addressLine1: '3 Birch Road',
      city: 'London',
      postcode: 'SW4 2EF',
      latitude: 51.4601,
      longitude: -0.1332,
      gardenSize: GardenSize.SMALL,
      gardenAreaM2: 34.8,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 3500,
      subscriptionActive: true,
    },
    {
      name: 'David Williams',
      email: 'david.w@example.com',
      phone: '07700900103',
      addressLine1: '22 Pine Street',
      city: 'London',
      postcode: 'SW3 3GH',
      latitude: 51.4556,
      longitude: -0.1244,
      gardenSize: GardenSize.MEDIUM,
      gardenAreaM2: 71.2,
      frequency: Frequency.FORTNIGHTLY,
      pricePerCut: 4500,
      subscriptionActive: true,
    },
    {
      name: 'Anna Lawson',
      email: 'anna.l@example.com',
      phone: '07700900104',
      addressLine1: '9 Cedar Lane',
      city: 'London',
      postcode: 'SW5 4IJ',
      latitude: 51.4578,
      longitude: -0.1389,
      gardenSize: GardenSize.LARGE,
      gardenAreaM2: 118.6,
      frequency: Frequency.MONTHLY,
      pricePerCut: 6000,
      subscriptionActive: true,
    },
  ]

  const createdCustomers = []
  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: { email: c.email },
      update: {},
      create: c,
    })
    createdCustomers.push(customer)
    console.log('✅ Customer:', customer.name)
  }

  // ── Today's route ────────────────────────────────────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const route = await prisma.route.create({
    data: {
      date: today,
      crewId: crew.id,
      optimised: true,
      totalMiles: 11.4,
      totalMinutes: 38,
    },
  })

  // ── Sample bookings + jobs for today ─────────────────────
  const schedule = [
    { customer: createdCustomers[0], time: '08:00', status: BookingStatus.COMPLETED, order: 1 },
    { customer: createdCustomers[1], time: '09:30', status: BookingStatus.IN_PROGRESS, order: 2 },
    { customer: createdCustomers[2], time: '11:00', status: BookingStatus.CONFIRMED, order: 3 },
    { customer: createdCustomers[3], time: '13:00', status: BookingStatus.CONFIRMED, order: 4 },
    { customer: createdCustomers[4], time: '14:30', status: BookingStatus.PENDING, order: 5 },
  ]

  for (const s of schedule) {
    const ref = `GR-${Math.floor(1000 + Math.random() * 9000)}`
    const scheduledDate = new Date(today)
    const [h, m] = s.time.split(':').map(Number)
    scheduledDate.setHours(h, m, 0, 0)

    const booking = await prisma.booking.create({
      data: {
        reference: ref,
        customerId: s.customer.id,
        scheduledDate: scheduledDate,
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
            startedAt: s.status === BookingStatus.COMPLETED || s.status === BookingStatus.IN_PROGRESS
              ? new Date(scheduledDate.getTime() + 5 * 60000) : null,
            completedAt: s.status === BookingStatus.COMPLETED
              ? new Date(scheduledDate.getTime() + 35 * 60000) : null,
            reminderSent: true,
          },
        },
      },
    })
    console.log(`✅ Booking ${booking.reference}: ${s.customer.name} @ ${s.time}`)
  }

  console.log('\n🎉 Seed complete!')
  console.log('\n📋 Login credentials:')
  console.log('   Admin: admin@greenrun.co.uk / greenrun2024')
  console.log('   Crew:  crew@greenrun.co.uk  / crew2024')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
