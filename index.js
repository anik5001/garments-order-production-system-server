require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);

const express = require("express");
const cors = require("cors");

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
    // latest product api
    app.get("/latest-product", async (req, res) => {
      const result = await productCollection
        .find()
        .sort({
          createdAt: 1,
        })
        .limit(6)
        .toArray();
      res.send(result);
    });
    //all products api
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
    // Add product
    app.post("/products", async (req, res) => {
      const data = req.body;
      const result = await productCollection.insertOne(data);
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

    // payment apis

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "usd",
              product_data: {
                name: paymentInfo?.productName,
              },
              unit_amount: paymentInfo?.orderPrice * 100,
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          productId: paymentInfo?.productId,
          customer: paymentInfo?.firstName + " " + paymentInfo.lastName,
          // orderQty: paymentInfo?.orderQty,
          // phone: paymentInfo?.phone,
          // address: paymentInfo?.address,
          // notes: paymentInfo?.notes,
        },
        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/booking-product/${paymentInfo?.productId}`,
      });

      res.send({ url: session.url });
    });

    app.post("/payment-success", async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const product = await productCollection.findOne({
        _id: new ObjectId(session.metadata.productId),
      });
      console.log(session);
      if (session.status === "complete") {
        const orderInfo = {
          productId: session.metadata.productId,
          customerName: session.metadata.customer,
          transactionId: session.payment_intent,
          userEmail: session.customer_email,

          productName: product.productName,
          unitPrice: product.price,
          orderQty: session.metadata.orderQty,
          orderPrice: session.amount_total / 100,
          paymentMethod: "payfast",

          phone: session.metadata.phone,
          address: session.metadata.address,
          notes: session.metadata.notes,
          status: "pending",
          createdAt: new Date(),
        };
        // console.log(orderInfo);
        const result = await orderBookingCollection.insertOne(orderInfo);
        res.send(result);
      }
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
