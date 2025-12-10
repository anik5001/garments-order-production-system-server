const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Garments order and production tacker system !");
});

const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("garments-order-production-system-DB");

    const userCollection = db.collection("users");
    const productCollection = db.collection("products");
    const orderBookingCollection = db.collection("order-booking");

    // user api
    app.post("/user", async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      user.status = "pending";
      const email = user.email;
      const userExits = await userCollection.findOne({ email });
      if (userExits) {
        return res.send({ message: "user Exits" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/user", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // products api

    app.get("/products", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });
    // details product api
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      console.log("details hit");
      res.send(result);
    });
    // booking  product details api
    // app.get("/booking-product/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await productCollection.findOne(query);
    //   console.log("details ");
    //   res.send(result);
    // });

    // order booking
    app.post("/order-booking", async (req, res) => {
      const body = req.body;
      const result = await orderBookingCollection.insertOne(body);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
