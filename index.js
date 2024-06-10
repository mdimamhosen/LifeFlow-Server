const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(
  "sk_test_51PJJ5FP1qIb85z5FCmtK5CmOel5bERGJPnW9KZdi3CtwNjZHKZ9are6BAm4NFtZT9YaJDVjp7Bxny3pg824GxuhH00IqeBHJCR"
);

const port = process.env.PORT || 3001;

// set cors
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://lifeflow-72f2b.web.app",
    "https://lifeflow-72f2b.firebaseapp.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

// Email sending
const sendEmail = (email, emailData) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

  // verify connection configuration
  transporter.verify(function (error, success) {
    if (error) {
      console.log(error);
    } else {
      console.log("Server is ready to take our messages");
    }
  });

  const mailBody = {
    from: `"LifeFlow" <${process.env.EMAIL}>`,
    to: email,
    subject: emailData.subject,
    html: emailData.message,
  };
  transporter.sendMail(mailBody, (err, info) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

// MongoDB connection with cluster
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.p0ybkhk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const userCollection = client.db("lifeflow").collection("users");
    const reviewCollection = client.db("lifeflow").collection("reviews");
    const donationCollection = client.db("lifeflow").collection("donations");
    const blogCollection = client.db("lifeflow").collection("blogs");
    const donate = client.db("lifeflow").collection("donate");

    // auth related
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      console.log(token);
      res.send({ token });
    });
    //middleware to verify  token
    const verifyToken = (req, res, next) => {
      const authHeader = req?.headers?.authorization;

      if (!authHeader) {
        return res.status(401).send("Unauthorized access");
      }

      const token = authHeader.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(403).send({
            message: "forbidden access",
          });
        }
        req.decoded = decoded;
        console.log(req.decoded);
        next();
      });
    };
    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded?.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.role !== "Admin") {
        return res.status(403).send({
          message: "forbidden access",
        });
      }
      next();
    };
    // veify donor
    const verifyDonor = async (req, res, next) => {
      const decodedEmail = req.decoded?.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.role !== "Donor") {
        return res.status(403).send({
          message: "forbidden access",
        });
      }
      next();
    };
    // verify Volunteer
    const verifyVolunteer = async (req, res, next) => {
      const decodedEmail = req.decoded?.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);
      if (user?.role !== "Volunteer") {
        return res.status(403).send({
          message: "forbidden access",
        });
      }
      next();
    };
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res.send({ success: true }); // Respond with success
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // save user data to database
    app.put("/user", async (req, res) => {
      const user = req.body;

      const query = {
        email: user?.email,
      };

      // check if user already exists
      const isExists = await userCollection.findOne(query);
      if (isExists) {
        if (user.status === "Requested") {
          // user already exists and status is requested
          const result = await userCollection.updateOne(query, {
            $set: {
              status: user?.status,
            },
          });
          return res.send(result);
        } else {
          return res.send({ isExists });
        }
      }

      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };

      const result = await userCollection.updateOne(query, updateDoc, options);

      res.send(result);
    });
    app.patch("/user", async (req, res) => {
      const user = req.body;
      const query = {
        email: user?.email,
      };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // get all reviews from database
    app.get("/reviews", async (req, res) => {
      const cursor = reviewCollection.find({});
      const reviews = await cursor.toArray();
      res.send(reviews);
    });
    // send email to contact us form
    app.post("/contact", async (req, res) => {
      const emailData = req.body;
      const mailData = {
        subject: "LifeFlow - Contact Us",
        message: `
          <h1>Contact Us</h1>
          <p><b>Name:</b> ${emailData.name}</p>
          <p><b>Email:</b> ${emailData.email}</p>
          <p><b>Message:</b> ${emailData.message}</p>
        `,
      };

      sendEmail(emailData.email, mailData);
      console.log("Email sent successfully");
      res.send({ success: true });
    });
    // save donation data to database
    app.post("/donationRequest", verifyToken, async (req, res) => {
      const donation = req.body;
      const result = await donationCollection.insertOne(donation);
      res.send(result);
    });

    // get user information
    app.get("/users/info", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };

      try {
        const userInfo = await userCollection.findOne(query);
        if (userInfo) {
          res.send(userInfo);
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        console.error("Error retrieving user information:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // get all donation requests
    app.get("/alldonationrequest/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { requesterEmail: email };
      const cursor = donationCollection.find(query);
      const donationRequests = await cursor.toArray();
      res.send(donationRequests);
    });

    // delete donation request
    app.delete("/donationRequest/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationCollection.deleteOne(query);
      res.send(result);
    });
    // get single donation request
    app.get("/singledonationrequest/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const donationRequest = await donationCollection.findOne(query);
      res.send(donationRequest);
    });
    // update donation request
    app.patch("/donationUpdateRequest/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...req.body,
        },
      };
      const result = await donationCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // get all donation requests
    app.get("/alldonationRequest", async (req, res) => {
      const donationRequest = await donationCollection.find({}).toArray();
      res.send(donationRequest);
    });
    // get all users
    app.get("/allusers", async (req, res) => {
      const users = await userCollection.find({}).toArray();
      res.send(users);
    });
    // update user status and role to database
    app.patch("/users/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      console.log(req.body);

      const updateDoc = {
        $set: {
          ...req.body,
        },
      };
      console.log(updateDoc);
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // post blog data to database
    app.post("/blogs", verifyToken, async (req, res) => {
      const blog = req.body;
      const result = await blogCollection.insertOne(blog);
      res.send(result);
    });
    // get all blogs from database
    app.get("/blogs", async (req, res) => {
      const cursor = blogCollection.find({});
      const blogs = await cursor.toArray();
      res.send(blogs);
    });
    // delete blog from database
    app.delete("/blogs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogCollection.deleteOne(query);
      res.send(result);
    });
    // set blog status published or draft
    app.patch("/blogs/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...req.body,
        },
      };
      const result = await blogCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // update blog data
    app.patch("/blogs/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...req.body,
        },
      };
      const result = await blogCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // Update donation request status
    app.patch("/donationRequest/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          ...req.body,
        },
      };

      try {
        const result = await donationCollection.updateOne(query, updateDoc);

        res.send(result);
      } catch (error) {
        console.error("Error updating donation request:", error);
        res.status(500).send({
          error: "An error occurred while updating the donation request",
        });
      }
    });
    // get all blogs from database
    app.get("/blogs", async (req, res) => {
      const blogs = await blogCollection.find({}).toArray();
      res.send(blogs);
    });
    // get single blog from database
    app.get("/blog/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const blog = await blogCollection.findOne(query);
      res.send(blog);
    });
    // get donation request by
    app.get("/donors/search", async (req, res) => {
      console.log("searching");
      console.log(req.query);
      try {
        const { bloodGroup, district, upazila } = req.query;
        console.log(req.query);
        if (!bloodGroup || !district || !upazila) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const donors = await donationCollection
          .find({
            bloodGroup,
            district,
            upazila,
          })
          .toArray();
        console.log(donors);

        res.json(donors);
      } catch (error) {
        console.error("Error fetching search results:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
    // payment api
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const amount = req.body.amount;

      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).send({ error: "Invalid price provided." });
      }

      const priceIntent = Math.round(parseFloat(amount) * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: priceIntent,
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    // donation save api
    app.post("/donate", verifyToken, async (req, res) => {
      const result = await donate.insertOne(req.body);
      res.send(result);
    });
    // get all donation request
    app.get("/donate", verifyToken, async (req, res) => {
      const result = await donate.find({}).toArray();
      res.send(result);
    });
    // admin dontaion stat
    app.get("/admin-stat-donation", verifyToken, async (req, res) => {
      const bookingsDetails = await donate
        .find(
          {},
          {
            projection: {
              date: 1,
              amount: 1,
            },
          }
        )
        .toArray();
      const totalUsers = await userCollection.countDocuments();

      const totalAmount = bookingsDetails.reduce(
        (acc, curr) => acc + curr.amount,
        0
      );
      const chartData = bookingsDetails.map((item) => {
        const day = new Date(item.date).getDate();
        const month = new Date(item.date).getMonth();
        const year = new Date(item.date).getFullYear();
        const data = [`${day}/${month}/${year}`, item.amount];
        return data;
      });
      chartData.unshift(["Day", "Donation"]);

      res.send({
        bookingsDetails: bookingsDetails.length,
        totalUsers,

        totalAmount,
        chartData,
      });
    }); // Admin statistics API for blood donation
    // Admin statistics API for blood donation
    app.get("/admin-stat-bloodDonation", verifyToken, async (req, res) => {
      try {
        const bookingsDetails = await donationCollection
          .find({}, { projection: { date: 1, bloodGroup: 1 } })
          .toArray();

        const chartData = bookingsDetails.reduce((acc, item) => {
          const date = new Date(item.date);
          const formattedDate = `${date.getDate()}/${
            date.getMonth() + 1
          }/${date.getFullYear()}`;

          if (!acc[formattedDate]) {
            acc[formattedDate] = {};
          }

          if (!acc[formattedDate][item.bloodGroup]) {
            acc[formattedDate][item.bloodGroup] = 0;
          }

          acc[formattedDate][item.bloodGroup]++;

          return acc;
        }, {});

        const chartArray = [
          ["Date", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
        ];
        Object.keys(chartData).forEach((date) => {
          const row = [date];
          const bloodGroups = [
            "A+",
            "A-",
            "B+",
            "B-",
            "AB+",
            "AB-",
            "O+",
            "O-",
          ];
          bloodGroups.forEach((bloodGroup) => {
            row.push(chartData[date][bloodGroup] || 0);
          });
          chartArray.push(row);
        });

        res.send({
          chartData: chartArray,
        });
      } catch (error) {
        console.error("Error fetching blood donation statistics:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from LifeFlow Server..");
});

app.listen(port, () => {
  console.log(`LifeFlow is running on port ${port}`);
});
