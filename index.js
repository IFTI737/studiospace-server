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

app.get("/", (req, res) => {
  res.send({ message: "StudioSpace server is running" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
