// server.js
const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

const app  = express();
const PORT = process.env.PORT || 10000;

// Serve static files from /public (recorder.html, recorder.js, etc.)
app.use(express.static("public"));

// --- Ensure uploads folder exists -------------------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// --- Multer: store files on disk in /uploads --------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Make a safe unique filename
    const ext = path.extname(file.originalname) || ".png";
    const safeName =
      Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

// --- Endpoint that receives form fields + photo -----------
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  console.log("Form fields:", req.body);  // fullName, accountNumber, transactionMethod
  console.log("Saved file:", req.file);   // info about the saved photo

  if (!req.file) {
    return res.status(400).send("No photo received");
  }

  res.send("Photo stored as: " + req.file.filename);
});

// ----------------------------------------------------------
app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
