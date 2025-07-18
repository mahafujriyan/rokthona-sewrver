// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const admin = require("../firebaseAdmin");
const verifyToken = require('./middlewares/verifyToken');

const { MongoClient, ServerApiVersion } = require('mongodb');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
//  veryfi token 
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; 
    next();
  } catch (error) {
    return res.status(403).send({ message: "Forbidden access" });
  }
};

module.exports = verifyToken;

// MongoDB Connection

const uri =`mongodb+srv://${process.env.SERVICE_KEY}:${process.env.SERVICE_PASS}@cluster0.prhiez6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
  
    const db = client.db("rokthona");

    const usersCollection = db.collection("users");
    const districtCollection = db.collection("districts");
    const upazilaCollection = db.collection("upazilas");

    // 🧠 USERS
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

 
app.get("/users/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  if (req.user.email !== email) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const user = await usersCollection.findOne({ email });
  res.send(user);
});

// Protect update route too
app.put("/users/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  if (req.user.email !== email) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const updatedData = { ...req.body };
  delete updatedData._id;

  const result = await usersCollection.updateOne(
    { email },
    { $set: updatedData }
  );

  res.send(result);
});
// 🔐 Only an admin can assign roles — this is protected
app.put('/users/role/:email', verifyToken, async (req, res) => {
  const targetEmail = req.params.email;
  const { role } = req.body;

  const requester = await usersCollection.findOne({ email: req.user.email });

  if (!requester || requester.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden: Only admins can update roles' });
  }

  const result = await usersCollection.updateOne(
    { email: targetEmail },
    { $set: { role } }
  );

  res.send(result);
});


         
      app.post('/users', async (req, res) => {
        const user = req.body;

        const existing = await usersCollection.findOne({ email: user.email });
        if (existing) {
          return res.status(409).send({ message: 'User already exists' });
        }

        // Set default role if not provided
        user.role = user.role || 'donor';

        const result = await usersCollection.insertOne(user);
        res.send(result);
      });



    // 📦 DISTRICTS API
    app.get("/api/districts", async (req, res) => {
      const districts = await districtCollection.find().toArray();
      res.json(districts);
    });

    // 📦 UPAZILAS API
    app.get("/api/upazilas", async (req, res) => {
      const upazilas = await upazilaCollection.find().toArray();
      res.json(upazilas);
    });

    // 🔍 Filter upazilas by district ID
    app.get("/api/upazilas/:districtId", async (req, res) => {
      const districtId = req.params.districtId;
      const filtered = await upazilaCollection.find({ district_id: districtId }).toArray();
      res.json(filtered);
    });

    // ☝️ ONE-TIME: SEED DISTRICTS
    app.get("/seed-districts", async (req, res) => {
      const districtData = JSON.parse(fs.readFileSync("./data/district.json", "utf-8"));
      const result = await districtCollection.insertMany(districtData);
      res.send(result);
    });

    // ☝️ ONE-TIME: SEED UPAZILAS
    app.get("/seed-upazilas", async (req, res) => {
      const upazilaData = JSON.parse(fs.readFileSync("./data/upazila.json", "utf-8"));
      const result = await upazilaCollection.insertMany(upazilaData);
      res.send(result);
    });

    console.log("✅ MongoDB connected and APIs ready");

  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
}

run();

// ✅ Root endpoint
app.get('/', (req, res) => res.send('RokthoNa API is running.....'));

// ✅ Start server (only once)
app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));
