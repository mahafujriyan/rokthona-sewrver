
const express = require('express');

const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const admin = require("./firebaseAdmin");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const fs = require('fs');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); 
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Verify Token Middleware
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

const uri = `mongodb+srv://${process.env.SERVICE_KEY}:${process.env.SERVICE_PASS}@cluster0.prhiez6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("rokthona");
    const usersCollection = db.collection("users");
    const donationRequestCollection = db.collection("donation");
    const districtCollection = db.collection("districts");
    const upazilaCollection = db.collection("upazilas");
    const blogCollection = db.collection("blogs");
    const fundsCollection = db.collection("funds");


    // Admin verification middleware
    const verifyAdmin = async (req, res, next) => {
      const requester = await usersCollection.findOne({ email: req.user.email });
      if (requester?.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden: Admins only' });
      }
      next();
    };

    // volenters verification 
    const verifyVolunteer = async (req, res, next) => {
  try {
    const user = await usersCollection.findOne({ email: req.user.email });

    if (!user || user.role !== 'volunteer') {
      return res.status(403).send({ message: 'Forbidden: Volunteers only' });
    }

    next();
  } catch (error) {
    console.error('❌ Volunteer verification error:', error);
    res.status(500).send({ message: 'Failed to verify volunteer access' });
  }
};
const verifyAdminOrVolunteer = async (req, res, next) => {
  try {
    const user = await usersCollection.findOne({ email: req.user.email });

    if (!user || (user.role !== 'admin' && user.role !== 'volunteer')) {
      return res.status(403).send({ message: 'Forbidden: Admins or Volunteers only' });
    }

    next();
  } catch (error) {
    console.error('❌ Role verification error:', error);
    res.status(500).send({ message: 'Failed to verify access' });
  }
};


    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get('/recipients', verifyToken, async (req, res) => {
      try {
        const recipients = await usersCollection.find({ role: 'recipient' }).toArray();
        res.send(recipients);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch recipients', error: error.message });
      }
    });

    app.get('/donations/:id', verifyToken, 
      async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid donation request ID" });
      }

      try {
        const request = await donationRequestCollection.findOne({ _id: new ObjectId(id) });
        if (!request) return res.status(404).send({ message: 'Donation request not found' });
        res.send(request);
      } catch (error) {
        console.error("❌ Error in /donation-requests/:id:", error);
        res.status(500).send({ message: 'Failed to fetch donation request', error: error.message });
      }
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const existing = await usersCollection.findOne({ email: user.email });

      if (existing) {
        return res.status(409).send({ message: 'User already exists' });
      }

      user.role = user.role || 'donor';
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.user.email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    app.put('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.user.email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const updatedData = { ...req.body };
      delete updatedData._id;
      const result = await usersCollection.updateOne(
        { email },
        { $set: updatedData }
      );
      res.send(result);
    });
    // PATCH /users/:id — for updating status or role
app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid user ID' });
  }

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.send(result);
  } catch (error) {
    console.error('❌ Failed to update user:', error);
    res.status(500).send({ message: 'Failed to update user', error: error.message });
  }
});


    app.put("/set-role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;

      const requester = req.user.email;
      const requesterAccount = await usersCollection.findOne({ email: requester });

      if (requesterAccount?.role !== "admin") {
        return res.status(403).send({ message: "Only admins can assign roles." });
      }

      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });

        const result = await usersCollection.updateOne(
          { email },
          { $set: { role } }
        );

        res.send({ message: `✅ User updated to ${role}.`, mongoResult: result });
      } catch (error) {
        res.status(500).send({ message: "❌ Failed to update role", error: error.message });
      }
    });

    app.put('/users/role/:email', verifyToken, verifyAdmin, async (req, res) => {
      const targetEmail = req.params.email;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { email: targetEmail },
        { $set: { role } }
      );
      res.send(result);
    });

    //  search donner
    app.get('/donors', async (req, res) => {
  const { bloodGroup, district, upazila } = req.query;

 const query = {
  role: 'donor',
  ...(bloodGroup && { bloodGroup: { $regex: `^${bloodGroup}$`, $options: 'i' } }),
  ...(district && { district }),
  ...(upazila && { upazila }),
};


  try {
    const donors = await usersCollection.find(query).toArray();
    res.send(donors);
  } catch (error) {
    res.status(500).send({ message: "Failed to search donors", error: error.message });
  }
});
//  admin data 

    app.get('/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalDonations = await donationRequestCollection.countDocuments();
      
    const totalFundingData = await fundsCollection.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]).toArray();

    const totalFunding = totalFundingData[0]?.total || 0;
      res.send({
        totalUsers,
         totalRequests: totalDonations,
        totalFunding
       
      });
    });
    app.get('/volunteers/stats', verifyToken, verifyVolunteer, async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalDonations = await donationRequestCollection.countDocuments();
      
    const totalFundingData = await fundsCollection.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]).toArray();

    const totalFunding = totalFundingData[0]?.total || 0;
      res.send({
        totalUsers,
        totalRequests: totalDonations,
        totalFunding
       
      });
    });



// searcfh the data 
app.patch('/donationData/:id/confirm', verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid donation request ID" });
  }

  const donorName = req.user.name || req.user.displayName;
  const donorEmail = req.user.email;

  try {
    const result = await donationRequestCollection.updateOne(
      { _id: new ObjectId(id), status: 'pending' }, 
      {
        $set: {
          status: 'inprogress',
          donorName,
          donorEmail,
          confirmedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(400).send({ message: 'No pending donation found or already confirmed.' });
    }

    res.send({ message: 'Donation confirmed!', result });
  } catch (error) {
    console.error('❌ Error confirming donation:', error);
    res.status(500).send({ message: 'Failed to confirm donation', error: error.message });
  }
});



    // ✅ GET all donation requests (Admin only)
app.get('/admin/all', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await donationRequestCollection.countDocuments(query);

    const requests = await donationRequestCollection
      .find(query)
      .sort({ donationDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    res.send({
      requests,
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error("❌ Error in /donation-requests/all:", err);
    res.status(500).send({ message: 'Failed to fetch donation requests.' });
  }
});


    app.post('/donation-requests', verifyToken, async (req, res) => {
      const request = req.body;
      const result = await donationRequestCollection.insertOne(request);
      res.send({ message: 'Donation request created', result });
    });

    app.get('/donation-requestss/by-requester', verifyToken, async (req, res) => {
      try {
        const { email, status, page = 1, limit = 10 } = req.query;

        if (!email) {
          return res.status(400).send({ message: "Email query param is required" });
        }

        if (req.user.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const query = { requesterEmail: email };
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await donationRequestCollection.countDocuments(query);

        const requests = await donationRequestCollection
          .find(query)
          .sort({ donationDate: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          requests,
          totalPages: Math.ceil(total / parseInt(limit)),
        });
      } catch (err) {
        console.error("❌ Error in /donation-requests/by-requester:", err);
        res.status(500).send({ message: 'Failed to fetch donation requests.' });
      }
    });

    app.get('/donation-requests/by-donor', verifyToken, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email query param is required" });
      }

      try {
        if (req.user.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const requests = await donationRequestCollection.find({ donorEmail: email }).toArray();
        res.send(requests);
      } catch (error) {
        console.error('Error fetching donor donation requests:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

 app.get('/donationValue/public', verifyToken, async (req, res) => {
  try {
    const pendingRequests = await donationRequestCollection
      .find({ status: 'pending' })
      .sort({ donationDate: -1 })
      .toArray();

    res.send(pendingRequests);
  } catch (err) {
    console.error('❌ Error in GET /donation-requests/public:', err);
    res.status(500).send({ message: 'Failed to fetch public donation requests' });
  }
}); 
// Make sure this exists
app.patch('/donationRequest/:id/confirm', verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await donationRequestCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: 'inprogress',
        donorName: req.user.name,
        donorEmail: req.user.email,
        donorId: req.user.uid,
      },
    }
  );

  if (result.modifiedCount > 0) {
    return res.send({ message: 'Donation confirmed successfully' });
  }

  res.status(400).send({ message: 'Unable to confirm donation' });
});


app.patch('/donationsData/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid donation request ID" });
  }

  if (!status || typeof status !== 'string') {
    return res.status(400).send({ message: "Valid status is required" });
  }

  try {
    const result = await donationRequestCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send({ message: "Donation request not found or status already set" });
    }

    res.send({ message: "Status updated successfully", result });
  } catch (error) {
    console.error("❌ Error updating status:", error);
    res.status(500).send({ message: "Failed to update status", error: error.message });
  }
});


 


    // blog post  and others 

    // Create a blog
// Allow admins and volunteers to create blogs
app.post('/blogs', verifyToken, verifyAdminOrVolunteer, async (req, res) => {
  const blog = {
    ...req.body,
    status: req.body.status || 'draft',
    createdAt: new Date(),
  };
  const result = await blogCollection.insertOne(blog);
  res.send(result);
});


// Get all blogs with optional status filter
app.get('/blogs', async (req, res) => {
  const { status } = req.query;
  const query = status ? { status } : {};
  const blogs = await blogCollection.find(query).sort({ createdAt: -1 }).toArray();
  res.send(blogs);
});

// Get single blog
app.get('/blogs/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid blog ID" });
  const blog = await blogCollection.findOne({ _id: new ObjectId(id) });
  res.send(blog);
});


// Publish
app.patch('/blogs/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;


  if (!status || !['draft', 'published'].includes(status)) {
    return res.status(400).send({ message: 'Invalid status value' });
  }


  console.log('Updating blog status:', id, 'to', status);

  try {
    const result = await blogsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    // ✅ 3. Handle response
    res.send({ success: result.modifiedCount > 0 });
  } catch (error) {
    res.status(500).send({ message: 'Failed to update status', error: error.message });
  }
});


// Delete blog
app.delete('/blogs/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// Funding related api 



// get funding data 
app.get('/admin/stats', verifyToken, verifyAdminOrVolunteer, async (req, res) => {
  try {
    const totalUsers = await usersCollection.estimatedDocumentCount();
    const totalRequests = await donationCollection.estimatedDocumentCount();
    const totalFundingData = await fundsCollection.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]).toArray();

    const totalFunding = totalFundingData[0]?.total || 0;

    res.send({
      totalUsers,
      totalRequests,
      totalFunding,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).send({ error: 'Failed to load stats' });
  }
});



// post the funds

app.post('/create-payment-intent', verifyToken, async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount < 10) {
    return res.status(400).json({ error: 'Amount too small' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd', 
      payment_method_types: ['card'],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).send({ error: 'Failed to create payment intent' });
  }
});





app.post('/payments', verifyToken, async (req, res) => {
  const { amount, transactionId, date } = req.body;

  try {
    const payment = {
      name: req.user.name || req.user.displayName || 'Anonymous',
      email: req.user.email,
      amount: parseFloat(amount),
      transactionId,
      date: new Date(date || Date.now())
    };

    const result = await fundsCollection.insertOne(payment);
    res.send({ message: 'Payment saved successfully', result });
  } catch (error) {
    res.status(500).send({ error: 'Failed to save payment' });
  }
});




    app.get("/api/districts", async (req, res) => {
      const districts = await districtCollection.find().toArray();
      res.json(districts);
    });

    app.get("/api/upazilas", async (req, res) => {
      const upazilas = await upazilaCollection.find().toArray();
      res.json(upazilas);
    });

    app.get("/api/upazilas/:districtId", async (req, res) => {
      const districtId = req.params.districtId;
      const filtered = await upazilaCollection.find({ district_id: districtId }).toArray();
      res.json(filtered);
    });

    app.get("/seed-districts", async (req, res) => {
      const districtData = JSON.parse(fs.readFileSync("./data/district.json", "utf-8"));
      const result = await districtCollection.insertMany(districtData);
      res.send(result);
    });

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

app.get('/', (req, res) => res.send('RokthoNa API is running.....'));

app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));