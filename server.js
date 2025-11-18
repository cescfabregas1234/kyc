// server.js

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;   // Render will set PORT

// --- Make sure the uploads & public folders exist ---
const uploadsDir = path.join(__dirname, "uploads");
const publicDir  = path.join(__dirname, "public");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(publicDir,  { recursive: true });

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve your front-end (recorder.html, recorder.js, etc.)
app.use(express.static("public"));

// Serve uploaded photos under /files/<filename>
app.use("/files", express.static("uploads"));

// --- Multer storage config for photo uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const unique =
      Date.now() + "-" + Math.random().toString(36).substring(2, 8);
    // default extension .png if none
    const ext = path.extname(file.originalname || "") || ".png";
    cb(null, unique + ext);
  },
});

const upload = multer({ storage });

// --- Route: handle photo upload from the browser ---
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filename = req.file.filename;
  const url = `/files/${filename}`; // public URL for this image

  // This JSON is what you can see in the browser if you want
  res.json({
    message: "Photo stored.",
    filename,
    url,
  });
});

// --- Optional: list all uploaded files as a simple HTML page ---
app.get("/files-list", (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).send("Cannot read uploads folder.");
    }

    const items = files
      .map(
        (f) =>
          `<li><a href="/files/${encodeURIComponent(
            f
          )}" target="_blank" rel="noopener noreferrer">${f}</a></li>`
      )
      .join("");

    res.send(`<h1>Uploaded Photos</h1><ul>${items}</ul>`);
  });
});

// --- Health check (optional) ---
app.get("/health", (req, res) => res.send("OK"));

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
