require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);

const express = require("express");
const cors = require("cors");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;
const serviceAccount = require("./garments-order-production-adminSDK.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// middleware
app.use(express.json());
app.use(cors());

const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  // console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    // console.log(decoded);
    next();
  } catch (err) {
    // console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

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
    // await client.connect();
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
    // all user api
    app.get("/user", async (req, res) => {
      const result = await userCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });
    // get user role
    app.get("/user/role", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;

      const result = await userCollection.findOne({ email: email });
      res.send({ role: result?.userRole, status: result?.status });
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
      // console.log("details hit");
      res.send(result);
    });
    // products find by email
    app.get("/my-products", verifyJWT, async (req, res) => {
      // console.log("hit product by email");
      const email = req.tokenEmail;
      const result = await productCollection
        .find({
          createdBy: email,
        })
        .toArray();
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
    // all order api
    app.get("/order-booking", async (req, res) => {
      const result = await orderBookingCollection.find().toArray();
      res.send(result);
    });

    // order get api by email
    app.get("/my-orders", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;
      const result = await orderBookingCollection
        .find({
          userEmail: email,
        })
        .toArray();
      res.send(result);
    });

    // payment apis

    // alternative way
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",

        customer_email: paymentInfo.userEmail,

        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: paymentInfo.productName,
              },
              unit_amount: Math.round(paymentInfo.orderPrice * 100),
            },
            quantity: 1,
          },
        ],

        metadata: {
          productId: paymentInfo.productId,
          productName: paymentInfo.productName,
          orderQty: String(paymentInfo.orderQty),
          unitPrice: String(paymentInfo.unitPrice),
          orderPrice: String(paymentInfo.orderPrice),

          firstName: paymentInfo.firstName,
          lastName: paymentInfo.lastName,

          phone: paymentInfo.phone,
          address: paymentInfo.address,
          notes: paymentInfo.notes || "",

          paymentMethod: "payfast",
        },

        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/booking-product/${paymentInfo.productId}`,
      });

      res.send({ url: session.url });
    });

    app.post("/payment-success", async (req, res) => {
      const { sessionId } = req.body;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log(session);

      if (session.payment_status !== "paid") {
        return res.status(400).send({ message: "Payment not completed" });
      }
      const order = await orderBookingCollection.findOne({
        transactionId: session.payment_intent,
      });
      // console.log(order);
      if (order) {
        return;
      }
      const orderInfo = {
        productId: session.metadata.productId,
        productName: session.metadata.productName,

        userEmail: session.customer_email,
        customerName:
          session.metadata.firstName + " " + session.metadata.lastName,

        unitPrice: Number(session.metadata.unitPrice),
        orderQty: Number(session.metadata.orderQty),
        orderPrice: Number(session.metadata.orderPrice),

        transactionId: session.payment_intent,
        paymentMethod: session.metadata.paymentMethod,

        phone: session.metadata.phone,
        address: session.metadata.address,
        notes: session.metadata.notes,

        status: "pending",
        createdAt: new Date(),
      };

      const result = await orderBookingCollection.insertOne(orderInfo);
      // update product quantity
      await productCollection.updateOne(
        {
          _id: new ObjectId(session.metadata.productId),
        },
        {
          $inc: {
            quantity: -Number(session.metadata.orderQty),
          },
        }
      );

      res.send({
        success: true,
        orderId: result.insertedId,
      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
