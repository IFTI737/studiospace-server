// Adds sample studios so the home page and explore page are not empty.
// Run once: npm run seed
import { MongoClient } from "mongodb";
import "dotenv/config";

const img = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

const host = {
  ownerEmail: "host@studiospace.app",
  ownerName: "StudioSpace Team",
  ownerImage: "",
};

const review = (userName, rating, comment) => ({
  userName,
  userEmail: `${userName.split(" ")[0].toLowerCase()}@example.com`,
  userImage: "",
  rating,
  comment,
  createdAt: new Date(),
});

const studios = [
  {
    title: "Northlight Cyc Wall Studio",
    category: "Photo Studio",
    hourlyRate: 45,
    securityDeposit: 100,
    maxCapacity: 10,
    location: "Gulshan 2, Dhaka",
    image: img("1492691527719-9d1e07e534b4"),
    gallery: [img("1516035069371-29a1b244cc32"), img("1554048612-b6a482bc67e5")],
    amenities: ["Cyc Wall", "Strobe Lights", "Changing Room", "Wi-Fi", "Parking"],
    overview:
      "A bright 1,200 sq ft daylight studio with a white infinity cyc wall, a full set of strobes and softboxes, and a private changing room. Great for fashion, product and portrait shoots.",
    reviews: [
      review("Nusrat Jahan", 5, "Perfect light and the cyc wall was spotless. Our lookbook came out great."),
      review("Arif Rahman", 5, "Easy check-in and the host helped us set up the strobes."),
    ],
  },
  {
    title: "Echo Room Podcast Lounge",
    category: "Podcast Lounge",
    hourlyRate: 25,
    securityDeposit: 50,
    maxCapacity: 4,
    location: "Dhanmondi 27, Dhaka",
    image: img("1478737270239-2f02b77fc618"),
    gallery: [img("1590602847861-f357a9332bbc")],
    amenities: ["4 Microphones", "Sound Treatment", "Video Cameras", "Wi-Fi", "Air Conditioning"],
    overview:
      "A cozy, sound-treated lounge with four broadcast microphones, a mixer and two 4K cameras for video podcasts. Hit record and we handle the rest.",
    reviews: [review("Tanvir Ahmed", 5, "Audio was crystal clear. We record here every week now.")],
  },
  {
    title: "Bassline Music Suite",
    category: "Music Suite",
    hourlyRate: 35,
    securityDeposit: 80,
    maxCapacity: 6,
    location: "Banani, Dhaka",
    image: img("1598488035139-bdbb2231ce04"),
    gallery: [img("1511379938547-c1f69419868d")],
    amenities: ["Vocal Booth", "Studio Monitors", "MIDI Keyboard", "Instruments", "Air Conditioning"],
    overview:
      "A mixing and recording suite with an isolated vocal booth, studio monitors and a set of keyboards and guitars you can use. Ideal for bands and solo artists.",
    reviews: [
      review("Sadia Islam", 4, "Great booth and gear. Booked again for our EP."),
      review("Rafiq Hasan", 5, "The engineer on site was very helpful."),
    ],
  },
  {
    title: "Frame 24 Sound Stage",
    category: "Film Stage",
    hourlyRate: 90,
    securityDeposit: 250,
    maxCapacity: 30,
    location: "Tejgaon Industrial Area, Dhaka",
    image: img("1485846234645-a62644f84728"),
    gallery: [img("1574717024653-61fd2cf4d44d")],
    amenities: ["Green Screen", "Lighting Grid", "Makeup Room", "Loading Dock", "Parking"],
    overview:
      "A 4,000 sq ft sound stage with a lighting grid, a green screen wall, makeup room and a loading dock for big gear. Built for ads, music videos and short films.",
    reviews: [review("Mehedi Hasan", 5, "Plenty of space and power. Our crew loved it.")],
  },
  {
    title: "Canvas & Clay Workshop",
    category: "Workshop",
    hourlyRate: 20,
    securityDeposit: 40,
    maxCapacity: 15,
    location: "Uttara Sector 7, Dhaka",
    image: img("1460661419201-fd4cecdf8a8b"),
    gallery: [img("1513364776144-60967b0f800f")],
    amenities: ["Easels", "Pottery Wheel", "Natural Light", "Sink", "Wi-Fi"],
    overview:
      "A calm, light-filled art workshop with easels, a pottery wheel and long work tables. Good for painting classes, pottery sessions and creative meetups.",
    reviews: [review("Farzana Akter", 4, "Lovely light, and everything was clean and ready.")],
  },
  {
    title: "Midnight Vocal Booth",
    category: "Music Suite",
    hourlyRate: 18,
    securityDeposit: 30,
    maxCapacity: 2,
    location: "Mirpur 10, Dhaka",
    image: img("1493225457124-a3eb161ffa5f"),
    gallery: [img("1505740420928-5e560c06d30e")],
    amenities: ["Vocal Booth", "Condenser Mic", "Headphones", "Air Conditioning"],
    overview:
      "A small, affordable booth for vocals, voice-over and audiobooks. Fully treated, with a condenser mic and closed-back headphones.",
    reviews: [],
  },
  {
    title: "Story Lab Video Podcast Set",
    category: "Podcast Lounge",
    hourlyRate: 40,
    securityDeposit: 80,
    maxCapacity: 5,
    location: "Bashundhara R/A, Dhaka",
    image: img("1590602847861-f357a9332bbc"),
    gallery: [img("1478737270239-2f02b77fc618")],
    amenities: ["3 Cameras", "LED Panels", "Sound Treatment", "Teleprompter", "Wi-Fi"],
    overview:
      "A styled set for video podcasts and interviews with three cameras, soft LED panels and a teleprompter. Leave with ready-to-edit footage.",
    reviews: [review("Imran Kabir", 5, "Looks amazing on camera. Super professional setup.")],
  },
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const collection = client.db("studiospace").collection("studios");

const docs = studios.map((studio, i) => {
  const ratings = studio.reviews.map((r) => r.rating);
  const avg = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : 0;
  return {
    ...studio,
    ...host,
    reviews: studio.reviews,
    rating: avg,
    createdAt: new Date(Date.now() - i * 86400000),
  };
});

const result = await collection.insertMany(docs);
console.log(`Added ${result.insertedCount} studios`);
await client.close();
