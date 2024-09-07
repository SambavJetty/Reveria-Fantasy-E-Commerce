const express = require("express");
const app = express();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require('dotenv').config();  // Add this line

app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Failed to connect to MongoDB', err));

// API Creation
app.get("/", (req, res) => {
    res.send("Express App is Running");
});

// Image Storage Engine
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Creating Upload Endpoint for images
app.use('/images', express.static('upload/images'));
app.post("/upload", upload.single('product'), (req, res) => {
    res.json({
        success: 1,
        image_url: `http://localhost:${process.env.PORT}/images/${req.file.filename}`
    });
});

// Database schema for creating products
const Product = mongoose.model("Product", {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    image: { type: String, required: true },
    category: { type: String, required: true },
    new_price: { type: Number, required: true },
    old_price: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    available: { type: Boolean, default: true }
});

// Adding product
app.post('/addproduct', async (req, res) => {
    try {
        let products = await Product.find({});
        let id = products.length ? products[products.length - 1].id + 1 : 1;

        const product = new Product({
            id,
            name: req.body.name,
            image: req.body.image,
            category: req.body.category,
            new_price: req.body.new_price,
            old_price: req.body.old_price,
        });

        await product.save();
        console.log("Product Saved");

        res.json({ success: true, name: req.body.name });
    } catch (error) {
        console.error("Error saving product:", error);
        res.status(500).json({ success: false, message: "Failed to save product." });
    }
});

// Removing product
app.post('/removeproduct', async (req, res) => {
    try {
        const result = await Product.findOneAndDelete({ id: req.body.id });
        if (result) {
            console.log("Product Removed");
            res.json({ success: true, name: req.body.name });
        } else {
            res.status(404).json({ success: false, message: "Product not found." });
        }
    } catch (error) {
        console.error("Error removing product:", error);
        res.status(500).json({ success: false, message: "Failed to remove product." });
    }
});

// Getting all products
app.get('/allproducts', async (req, res) => {
    let products = await Product.find({});
    console.log("All Products Fetched");
    res.send(products);
});

// User Schema
const Users = mongoose.model('Users', {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    cartData: { type: Object },
    date: { type: Date, default: Date.now }
});

// Registering a user
app.post('/signup', async (req, res) => {
    try {
        let check = await Users.findOne({ email: req.body.email });
        if (check) {
            return res.status(400).json({ success: false, errors: "Existing user found with the same email address" });
        }

        let cart = {};
        for (let i = 0; i < 300; i++) {
            cart[i] = 0;
        }

        const user = new Users({
            name: req.body.username,
            email: req.body.email,
            password: req.body.password,
            cartData: cart,
        });

        await user.save();
        const data = { user: { id: user.id } };
        const token = jwt.sign(data, process.env.JWT_SECRET);  // Use environment variable
        res.json({ success: true, token });
    } catch (error) {
        res.status(500).send("Error registering user");
    }
});

// Logging in user
app.post('/login', async (req, res) => {
    let user = await Users.findOne({ email: req.body.email });
    if (user) {
        const passCompare = req.body.password === user.password;
        if (passCompare) {
            const data = { user: { id: user.id } };
            const token = jwt.sign(data, process.env.JWT_SECRET);  // Use environment variable
            res.json({ success: true, token });
        } else {
            res.json({ success: false, errors: "Wrong Password" });
        }
    } else {
        res.json({ success: false, errors: "Wrong Email Id" });
    }
});

// Fetching new collection data
app.get('/newcollections', async (req, res) => {
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    console.log("New Collection Fetched");
    res.send(newcollection);
});

// Fetching popular products in women's category
app.get('/popularinwomen', async (req, res) => {
    let products = await Product.find({ category: "women" });
    let popular_in_women = products.slice(0, 4);
    console.log("Popular in Women fetched");
    res.send(popular_in_women);
});

// Middleware for fetching user data using auth token
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) {
        res.status(401).send({ errors: "Please authenticate using a valid token" });
    } else {
        try {
            const data = jwt.verify(token, process.env.JWT_SECRET);  // Use environment variable
            req.user = data.user;
            next();
        } catch (error) {
            res.status(401).send({ errors: "Please authenticate using a valid token" });
        }
    }
};

// Adding products to cart
app.post('/addtocart', fetchUser, async (req, res) => {
    try {
        console.log("Added", req.body.itemId);
        let userData = await Users.findOne({ _id: req.user.id });

        // Initialize cartData if not present
        if (!userData.cartData) {
            userData.cartData = {};
        }

        if (!userData.cartData[req.body.itemId]) {
            userData.cartData[req.body.itemId] = 0;
        }

        userData.cartData[req.body.itemId] += 1;
        await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });

        res.send("Added");
    } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).send("Error adding to cart");
    }
});

// Removing products from cart
app.post('/removefromcart', fetchUser, async (req, res) => {
    try {
        console.log("Removed", req.body.itemId);
        let userData = await Users.findOne({ _id: req.user.id });

        if (userData.cartData && userData.cartData[req.body.itemId] > 0) {
            userData.cartData[req.body.itemId] -= 1;
        }

        await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
        res.send("Removed");
    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).send("Error removing from cart");
    }
});

// Get cart data
app.post('/getcart', fetchUser, async (req, res) => {
    let userData = await Users.findOne({ _id: req.user.id });
    res.json(userData.cartData);
});


