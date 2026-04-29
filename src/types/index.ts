// src/types/index.ts
export type GardenSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL'
export type Frequency = 'ONE_OFF' | 'FORTNIGHTLY' | 'MONTHLY'
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED'
export type UserRole = 'ADMIN' | 'CREW' | 'CUSTOMER'

export const GARDEN_PRICES: Record<GardenSize, number> = {
  SMALL: 3500,   // £35
  MEDIUM: 4500,  // £45
  LARGE: 6000,   // £60
  XL: 9000,      // £90
}

export const GARDEN_LABELS: Record<GardenSize, string> = {
  SMALL: 'Small (up to 40m²)',
  MEDIUM: 'Medium (40–80m²)',
  LARGE: 'Large (80–150m²)',
  XL: 'XL (150m²+)',
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  ONE_OFF: 'One-off visit',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
}

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(0)}`
}

export function getGardenSizeFromArea(areaM2: number): GardenSize {
  if (areaM2 <= 40) return 'SMALL'
  if (areaM2 <= 80) return 'MEDIUM'
  if (areaM2 <= 150) return 'LARGE'
  return 'XL'
}

export interface BookingFormData {
  // Step 1 - Address & lawn size
  addressLine1: string
  postcode: string
  latitude?: number
  longitude?: number
  gardenAreaM2?: number
  gardenSize: GardenSize

  // Step 2 - Schedule
  frequency: Frequency
  scheduledDate: string
  scheduledTime: string

  // Step 3 - Contact
  name: string
  email: string
  phone: string
  gardenNotes?: string
}

export interface DashboardStats {
  revenueThisMonth: number
  revenueLastMonth: number
  activeCustomers: number
  newCustomersThisMonth: number
  jobsThisWeek: number
  jobsLastWeek: number
  avgRating: number
  totalRatings: number
}

export interface JobWithRelations {
  id: string
  routeOrder: number | null
  startedAt: Date | null
  completedAt: Date | null
  photoUrl: string | null
  booking: {
    reference: string
    scheduledTime: string
    status: BookingStatus
    priceInPence: number
    customer: {
      name: string
      addressLine1: string
      postcode: string
      latitude: number | null
      longitude: number | null
      gardenSize: GardenSize
      gardenNotes: string | null
      phone: string
    }
  }
}
