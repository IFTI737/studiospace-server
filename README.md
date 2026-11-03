# StudioSpace — Server

Express + MongoDB REST API for **StudioSpace**, a peer-to-peer creative studio booking platform.

## Features
- Studio CRUD with owner checks (only the owner can edit or delete)
- Explore with category filter, search (title/location) and sorting
- Featured studios using `.limit(6)`
- Bookings saved with status `Pending`; host can Confirm / Complete / Cancel
- Double-booking prevention using a MongoDB time-overlap query (`$lt` / `$gt`)
- Reviews with average rating recalculated by an aggregation pipeline update (`$avg`)
- Saved studios wishlist
- JWT protection: tokens issued by Better Auth are verified with `jose` against the client's JWKS; missing/invalid tokens get `401 Unauthorized`

## Tech
Node.js, Express 5, MongoDB driver, jose, dotenv, cors — deployed on Vercel.

## Local setup
```bash
npm install
cp .env.example .env   # fill MONGODB_URI and CLIENT_URL
npm run seed           # optional: adds sample studios
npm run dev
```

## Main routes
| Method | Route | Auth |
| --- | --- | --- |
| GET | /studios, /featured-studios, /studios/:id | public |
| POST | /studios | JWT |
| PATCH / DELETE | /studios/:id | JWT + owner |
| GET | /my-listings/:email | JWT |
| POST | /bookings | JWT |
| GET | /my-bookings/:email, /host-bookings/:email | JWT |
| PATCH | /bookings/:id/cancel, /bookings/:id/status | JWT |
| POST | /studios/:id/reviews, /wishlist | JWT |
