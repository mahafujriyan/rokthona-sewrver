// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// MongoDB Connection


const uri = "mongodb+srv://mahafujhossainriyan:tMsIdRrRC43yK71S@cluster0.prhiez6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("rokthonaDB");
    const usersCollection = db.collection("users");

    // 🔐 Auth Middleware (simple)
    const verifyApiKey = (req, res, next) => {
      const apiKey = req.headers.authorization;
      if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ message: "Forbidden: Invalid API Key" });
      }
      next();
    };

    // ➕ CREATE
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // 📥 READ ALL
    app.get('/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // 🔍 READ ONE
    app.get('/users/:id', async (req, res) => {
      const id = req.params.id;
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      res.send(user);
    });

    // ✏️ UPDATE
    app.put('/users/:id', async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // ❌ DELETE
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Secure Admin Route Example
    app.put('/make-admin/:id', verifyApiKey, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    app.get('/', (req, res) => {
      res.send('🚀 RokthoNa API is running');
    });

  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
}

run();

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
app.get('/', (req, res) => res.send('RokthoNa API is running'));

// Start Server
app.listen(port, () => console.log(`Server running on port ${port}`));
