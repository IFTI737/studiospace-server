import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = process.env.PORT || 5000;

const app = express();
app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000"].filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectClient = await connectToMongoDB();
const db = connectClient.db("studiospace");
const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");
const wishlistCollection = db.collection("wishlist");

// Helper: returns an ObjectId or null when the id is not valid
const toObjectId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

// ---------------- JWT middleware ----------------
// Better Auth (Next.js client) signs the JWT. We verify it with the public keys
// it publishes at /api/auth/jwks. Any missing or bad token -> 401 Unauthorized.
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload; // { id, email, name, image, ... }
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

// Checks that the email in the URL belongs to the logged-in user
const verifyOwnerEmail = (req, res, next) => {
  if (req.params.email !== req.user?.email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

// ---------------- Studios ----------------
app.post("/studios", verifyToken, async (req, res) => {
  const studioData = req.body;

  const newStudio = {
    ...studioData,
    hourlyRate: Number(studioData.hourlyRate),
    securityDeposit: Number(studioData.securityDeposit),
    maxCapacity: Number(studioData.maxCapacity),
    // owner always comes from the verified token, not from the form
    ownerEmail: req.user.email,
    ownerName: req.user.name,
    ownerImage: req.user.image || "",
    rating: 0,
    reviews: [],
    createdAt: new Date(),
  };

  const result = await studiosCollection.insertOne(newStudio);
  res.send(result);
});

app.get("/studios/:id", async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(404).send({ message: "Studio not found" });

  const result = await studiosCollection.findOne({ _id });
  if (!result) return res.status(404).send({ message: "Studio not found" });
  res.send(result);
});

app.get("/my-listings/:email", verifyToken, verifyOwnerEmail, async (req, res) => {
  const result = await studiosCollection
    .find({ ownerEmail: req.params.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

app.patch("/studios/:id", verifyToken, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(404).send({ message: "Studio not found" });

  const studio = await studiosCollection.findOne({ _id });
  if (!studio) return res.status(404).send({ message: "Studio not found" });
  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).send({ message: "You can only edit your own studio" });
  }

  // never let the client change these fields
  const { _id: _ignore, ownerEmail, ownerName, rating, reviews, createdAt, ...rest } = req.body;
  const updatedData = {
    ...rest,
    hourlyRate: Number(rest.hourlyRate),
    securityDeposit: Number(rest.securityDeposit),
    maxCapacity: Number(rest.maxCapacity),
    updatedAt: new Date(),
  };

  const result = await studiosCollection.updateOne({ _id }, { $set: updatedData });
  res.send(result);
});

app.delete("/studios/:id", verifyToken, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) return res.status(404).send({ message: "Studio not found" });

  const studio = await studiosCollection.findOne({ _id });
  if (!studio) return res.status(404).send({ message: "Studio not found" });
  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).send({ message: "You can only delete your own studio" });
  }

  const result = await studiosCollection.deleteOne({ _id });
  res.send(result);
});

// ---------------- Explore + Featured ----------------
// GET /studios?category=Photo Studio&search=dhaka&sort=price-asc
app.get("/studios", async (req, res) => {
  const { category, search, sort } = req.query;
  const query = {};

  if (category && category !== "All") query.category = category;
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { location: { $regex: search, $options: "i" } },
    ];
  }

  const sortOptions = {
    "price-asc": { hourlyRate: 1 },
    "price-desc": { hourlyRate: -1 },
    rating: { rating: -1 },
    newest: { createdAt: -1 },
  };

  const result = await studiosCollection
    .find(query)
    .sort(sortOptions[sort] || { createdAt: -1 })
    .toArray();
  res.send(result);
});

app.get("/featured-studios", async (req, res) => {
  const result = await studiosCollection
    .find()
    .sort({ rating: -1, createdAt: -1 })
    .limit(6)
    .toArray();
  res.send(result);
});

// ---------------- Bookings ----------------
// Booking time is stored as startAt / endAt (Date) so we can check overlap.
app.post("/bookings", verifyToken, async (req, res) => {
  const { studioId, date, startTime, hours, guests, note } = req.body;

  const _id = toObjectId(studioId);
  const studio = _id && (await studiosCollection.findOne({ _id }));
  if (!studio) return res.status(404).send({ message: "Studio not found" });

  if (studio.ownerEmail === req.user.email) {
    return res.status(400).send({ message: "You cannot book your own studio" });
  }

  const startAt = new Date(`${date}T${startTime}:00`);
  const endAt = new Date(startAt.getTime() + Number(hours) * 60 * 60 * 1000);
  if (isNaN(startAt.getTime()) || Number(hours) < 1) {
    return res.status(400).send({ message: "Please choose a valid date and time" });
  }
  if (startAt < new Date()) {
    return res.status(400).send({ message: "You cannot book a time in the past" });
  }

  // Double-booking prevention: two slots overlap when
  // existing.start < new.end AND existing.end > new.start
  const clash = await bookingsCollection.findOne({
    studioId,
    status: { $in: ["Confirmed", "Pending"] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  });

  if (clash) {
    return res.status(409).send({
      message:
        "This studio is already booked for part of that time. Please pick another slot.",
    });
  }

  const booking = {
    studioId,
    studioTitle: studio.title,
    studioImage: studio.image,
    studioLocation: studio.location,
    category: studio.category,
    hostEmail: studio.ownerEmail,
    hostName: studio.ownerName,
    hourlyRate: studio.hourlyRate,
    securityDeposit: studio.securityDeposit,
    date,
    startTime,
    hours: Number(hours),
    guests: Number(guests) || 1,
    note: note || "",
    startAt,
    endAt,
    totalPrice: studio.hourlyRate * Number(hours),
    userEmail: req.user.email,
    userName: req.user.name,
    userImage: req.user.image || "",
    status: "Pending",
    createdAt: new Date(),
  };

  const result = await bookingsCollection.insertOne(booking);
  res.send(result);
});

app.get("/my-bookings/:email", verifyToken, verifyOwnerEmail, async (req, res) => {
  const result = await bookingsCollection
    .find({ userEmail: req.params.email })
    .sort({ startAt: -1 })
    .toArray();
  res.send(result);
});

// Guest cancels their own pending booking
app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const booking = _id && (await bookingsCollection.findOne({ _id }));
  if (!booking) return res.status(404).send({ message: "Booking not found" });
  if (booking.userEmail !== req.user.email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  if (booking.status !== "Pending") {
    return res.status(400).send({ message: "Only pending bookings can be cancelled" });
  }

  const result = await bookingsCollection.updateOne(
    { _id },
    { $set: { status: "Cancelled", updatedAt: new Date() } },
  );
  res.send(result);
});

// ---------------- Host side: requests for my studios ----------------
app.get("/host-bookings/:email", verifyToken, verifyOwnerEmail, async (req, res) => {
  const result = await bookingsCollection
    .find({ hostEmail: req.params.email })
    .sort({ startAt: -1 })
    .toArray();
  res.send(result);
});

// Host changes status: Pending -> Confirmed / Cancelled, Confirmed -> Completed
app.patch("/bookings/:id/status", verifyToken, async (req, res) => {
  const { status } = req.body;
  const allowed = ["Confirmed", "Completed", "Cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).send({ message: "Invalid status" });
  }

  const _id = toObjectId(req.params.id);
  const booking = _id && (await bookingsCollection.findOne({ _id }));
  if (!booking) return res.status(404).send({ message: "Booking not found" });
  if (booking.hostEmail !== req.user.email) {
    return res.status(403).send({ message: "Only the host can update this booking" });
  }

  // Before confirming, make sure no other confirmed booking overlaps
  if (status === "Confirmed") {
    const clash = await bookingsCollection.findOne({
      _id: { $ne: _id },
      studioId: booking.studioId,
      status: "Confirmed",
      startAt: { $lt: booking.endAt },
      endAt: { $gt: booking.startAt },
    });
    if (clash) {
      return res.status(409).send({
        message: "Another confirmed booking already covers this time.",
      });
    }
  }

  const result = await bookingsCollection.updateOne(
    { _id },
    { $set: { status, updatedAt: new Date() } },
  );
  res.send(result);
});

// ---------------- Reviews ----------------
// $push adds the review, then $avg (aggregation pipeline update) recalculates rating
app.post("/studios/:id/reviews", verifyToken, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const studio = _id && (await studiosCollection.findOne({ _id }));
  if (!studio) return res.status(404).send({ message: "Studio not found" });

  const rating = Math.min(5, Math.max(1, Number(req.body.rating)));
  const comment = String(req.body.comment || "").trim();
  if (!comment) return res.status(400).send({ message: "Please write a comment" });

  const review = {
    _id: new ObjectId(),
    userName: req.user.name,
    userEmail: req.user.email,
    userImage: req.user.image || "",
    rating,
    comment,
    createdAt: new Date(),
  };

  await studiosCollection.updateOne({ _id }, { $push: { reviews: review } });
  const result = await studiosCollection.updateOne({ _id }, [
    { $set: { rating: { $round: [{ $avg: "$reviews.rating" }, 1] } } },
  ]);
  res.send(result);
});

// ---------------- Wishlist (saved studios) ----------------
app.get("/wishlist/:email", verifyToken, verifyOwnerEmail, async (req, res) => {
  const saved = await wishlistCollection.find({ userEmail: req.params.email }).toArray();
  const ids = saved.map((item) => toObjectId(item.studioId)).filter(Boolean);
  const studios = await studiosCollection.find({ _id: { $in: ids } }).toArray();
  res.send(studios);
});

// Toggle: saves the studio, or removes it if it was already saved
app.post("/wishlist", verifyToken, async (req, res) => {
  const { studioId } = req.body;
  const filter = { studioId, userEmail: req.user.email };

  const existing = await wishlistCollection.findOne(filter);
  if (existing) {
    await wishlistCollection.deleteOne(filter);
    return res.send({ saved: false });
  }

  await wishlistCollection.insertOne({ ...filter, createdAt: new Date() });
  res.send({ saved: true });
});

app.get("/wishlist-ids/:email", verifyToken, verifyOwnerEmail, async (req, res) => {
  const saved = await wishlistCollection.find({ userEmail: req.params.email }).toArray();
  res.send(saved.map((item) => item.studioId));
});

app.get("/", (req, res) => {
  res.send({ message: "StudioSpace server is running" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
