const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(helmet());
app.use(express.static(path.join(__dirname, "public")));

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) =>
    cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`)
});
const upload = multer({ storage });

app.post("/upload", upload.single("video"), (req, res) => {
  try {
    const meta = {
      file: req.file?.filename,
      size: req.file?.size,
      consent_text: req.body.consent_text,
      consent_ts: req.body.consent_ts,
      user_agent: req.body.user_agent || req.headers["user-agent"],
      ip: req.ip,
      received_at: new Date().toISOString()
    };
    fs.appendFileSync(path.join(UPLOAD_DIR, "audit.log"), JSON.stringify(meta) + "\n");
    res.json({ ok: true, id: req.file?.filename });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
