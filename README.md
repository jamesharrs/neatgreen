# 🌿 GreenRun — Setup & Deployment Guide

## Stack
- **Frontend + API**: Next.js 14 (App Router) → Vercel
- **Database**: PostgreSQL → Railway
- **ORM**: Prisma
- **Auth**: JWT (bcrypt passwords)
- **Maps**: Google Maps JavaScript API
- **Payments**: Stripe (ready to wire up)
- **SMS**: Twilio (ready to wire up)

---

## 1. Local Setup

```bash
# Clone and install
git clone <your-repo>
cd greenrun
npm install

# Set up environment
cp .env.example .env.local
# Fill in your values (see below)

# Push schema to Railway DB
npm run db:push

# Seed with sample data + admin login
npm run db:seed

# Start dev server
npm run dev
```

Open http://localhost:3000

---

## 2. Environment Variables

Fill in `.env.local`:

### DATABASE_URL
- Go to Railway → your Postgres service → **Connect** tab
- Copy the **Connection URL** (starts with `postgresql://`)

### JWT_SECRET
Generate a strong secret:
```bash
openssl rand -base64 32
```

### NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
- console.cloud.google.com → APIs & Services → Credentials
- Enable: Maps JavaScript API, Geocoding API, Drawing Library
- Create API Key → restrict to your domain

### STRIPE_SECRET_KEY / PUBLISHABLE_KEY
- dashboard.stripe.com → Developers → API Keys
- Use test keys (sk_test_... / pk_test_...) for now

### TWILIO (optional for now)
- console.twilio.com → get Account SID + Auth Token

---

## 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login and link project
vercel login
vercel link

# Add environment variables in Vercel dashboard
# Project Settings → Environment Variables → add each from .env.local

# Deploy
vercel --prod
```

Or connect your GitHub repo to Vercel for auto-deploy on push.

---

## 4. Railway Database

The DATABASE_URL from Railway is all you need.

After deploying to Vercel, run migrations:
```bash
# Point to production DB temporarily
DATABASE_URL="your-railway-url" npx prisma migrate deploy

# Seed production data
DATABASE_URL="your-railway-url" npm run db:seed
```

---

## 5. Default Login Credentials

After seeding:

| Role  | Email                    | Password      |
|-------|--------------------------|---------------|
| Admin | admin@greenrun.co.uk     | greenrun2024  |
| Crew  | crew@greenrun.co.uk      | crew2024      |

⚠️ Change these immediately in production via Prisma Studio:
```bash
npm run db:studio
```

---

## 6. API Routes Summary

| Method | Endpoint                    | Auth     | Description               |
|--------|-----------------------------|----------|---------------------------|
| POST   | /api/auth/login             | Public   | Login → sets JWT cookie   |
| DELETE | /api/auth/login             | Any      | Logout                    |
| GET    | /api/bookings               | Admin/Crew | List bookings (filterable) |
| POST   | /api/bookings               | Public   | Create new booking        |
| GET    | /api/bookings/[id]          | Admin/Crew | Get single booking       |
| PATCH  | /api/bookings/[id]          | Admin/Crew | Update status/details    |
| DELETE | /api/bookings/[id]          | Admin    | Cancel booking            |
| GET    | /api/dashboard              | Admin    | Stats + today's jobs      |
| POST   | /api/routes/optimise        | Admin/Crew | Optimise day's route     |

---

## 7. Google Maps — Enabling APIs

In Google Cloud Console (console.cloud.google.com):

1. Go to **APIs & Services → Library**
2. Search and enable each:
   - ✅ Maps JavaScript API
   - ✅ Geocoding API  
   - ✅ Maps Static API
   - ✅ Places API (for address autocomplete)
3. Go to **Credentials → Edit your API Key**
4. Under **Application restrictions**: select HTTP referrers
5. Add: `localhost:3000/*` and `yourdomain.vercel.app/*`
6. Under **API restrictions**: restrict to the 4 APIs above

---

## 8. Project Structure

```
greenrun/
├── prisma/
│   ├── schema.prisma        ← Database models
│   └── seed.ts              ← Sample data + admin user
├── src/
│   ├── app/
│   │   ├── page.tsx         ← Landing page
│   │   ├── book/page.tsx    ← Booking flow with Maps lawn sizer
│   │   ├── admin/page.tsx   ← Admin dashboard
│   │   ├── crew/page.tsx    ← Crew mobile view
│   │   └── api/
│   │       ├── auth/login/  ← JWT auth
│   │       ├── bookings/    ← Bookings CRUD
│   │       ├── dashboard/   ← Stats
│   │       └── routes/      ← Route optimisation
│   ├── components/
│   │   └── maps/
│   │       └── LawnSizer.tsx ← Google Maps polygon measurement
│   ├── lib/
│   │   ├── db.ts            ← Prisma client
│   │   └── auth.ts          ← JWT helpers
│   └── types/index.ts       ← Shared types + pricing
├── .env.example             ← Copy to .env.local
├── vercel.json              ← Vercel config (lhr1 = London)
└── README.md
```

---

## Next Steps

- [ ] Wire booking form → POST /api/bookings
- [ ] Wire admin dashboard → GET /api/dashboard  
- [ ] Wire crew view → GET /api/bookings?date=today
- [ ] Add Stripe checkout on booking confirmation
- [ ] Add Twilio SMS on booking confirmed + crew ETA
- [ ] Add address autocomplete (Google Places API)
- [ ] Add weather API → auto-reschedule on rain

---

## Useful Commands

```bash
npm run dev          # Start local dev server
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run db:push      # Push schema changes to DB
npm run db:migrate   # Create + run a migration
npm run db:seed      # Reseed sample data
npm run build        # Production build
vercel --prod        # Deploy to production
```
