require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { query, init, hasDb } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Feranmi";
const SECRET = process.env.SECRET || "mira-quil-admin";
const COOKIE = "mq_admin";

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: false, limit: "12mb" }));
app.use(express.static(__dirname));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

function sign(v) {
  return crypto.createHmac("sha256", SECRET).update(v).digest("hex");
}
function makeToken() {
  const payload = Buffer.from(JSON.stringify({ u: ADMIN_USER, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString("base64");
  return payload + "." + sign(payload);
}
function verifyToken(token) {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return false;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64").toString());
    return d.u === ADMIN_USER && d.exp > Date.now();
  } catch {
    return false;
  }
}
function getCookie(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)mq_admin=([^;]+)/);
  return m ? m[1] : null;
}
function requireAdmin(req, res, next) {
  if (verifyToken(getCookie(req))) return next();
  res.status(401).json({ ok: false, error: "Not authenticated" });
}
function imgUrl(id) {
  return id ? "/media/" + id : "";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: hasDb() });
});

app.post("/api/login", (req, res) => {
  const user = String(req.body.username || "").trim();
  const pass = String(req.body.password || "").trim();
  if (user !== ADMIN_USER || pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Wrong login" });
  }
  res.setHeader("Set-Cookie", COOKIE + "=" + makeToken() + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800");
  res.json({ ok: true });
});

app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", COOKIE + "=; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/media/:id", async (req, res) => {
  try {
    const rows = await query("SELECT mime_type, data FROM media_files WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).end();
    res.setHeader("Content-Type", rows[0].mime_type || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(rows[0].data);
  } catch {
    res.status(500).end();
  }
});

app.get("/api/portfolio", async (_req, res) => {
  if (!hasDb()) return res.json({ ok: true, items: [] });
  try {
    const rows = await query("SELECT id, title, image_id FROM portfolio ORDER BY id DESC");
    res.json({ ok: true, items: rows.map((r) => ({ id: r.id, title: r.title, image: imgUrl(r.image_id) })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: "DB error" });
  }
});

app.get("/api/testimonials", async (_req, res) => {
  if (!hasDb()) return res.json({ ok: true, items: [] });
  try {
    const rows = await query("SELECT id, quote, name, image_id FROM testimonials ORDER BY id DESC");
    res.json({
      ok: true,
      items: rows.map((r) => ({ id: r.id, quote: r.quote, name: r.name, image: imgUrl(r.image_id) })),
    });
  } catch {
    res.status(500).json({ ok: false, error: "DB error" });
  }
});

app.post("/api/enquire", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const service = String(req.body.service || "").trim();
  const message = String(req.body.message || "").trim();
  if (!name || !email || !service || !message) {
    return res.status(400).json({ ok: false, error: "Fill all fields." });
  }
  if (!hasDb()) return res.status(503).json({ ok: false, error: "Database not connected." });
  try {
    await query(
      "INSERT INTO enquiries (name, email, service, message) VALUES ($1,$2,$3,$4)",
      [name, email, service, message]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Could not save." });
  }
});

async function saveImage(file) {
  if (!file) return null;
  const rows = await query(
    "INSERT INTO media_files (mime_type, original_name, data) VALUES ($1,$2,$3) RETURNING id",
    [file.mimetype || "image/jpeg", file.originalname || "", file.buffer]
  );
  return rows[0].id;
}

app.get("/api/admin/portfolio", requireAdmin, async (_req, res) => {
  const rows = await query("SELECT id, title, image_id FROM portfolio ORDER BY id DESC");
  res.json({ ok: true, items: rows.map((r) => ({ id: r.id, title: r.title, image: imgUrl(r.image_id) })) });
});

app.post("/api/admin/portfolio", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const image_id = await saveImage(req.file);
    if (!image_id) return res.status(400).json({ ok: false, error: "Add an image." });
    const rows = await query("INSERT INTO portfolio (title, image_id) VALUES ($1,$2) RETURNING id", [title, image_id]);
    res.json({ ok: true, id: rows[0].id });
  } catch {
    res.status(500).json({ ok: false, error: "Could not save." });
  }
});

app.post("/api/admin/portfolio/:id", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const id = req.params.id;
    const title = String(req.body.title || "").trim();
    const cur = await query("SELECT image_id FROM portfolio WHERE id = $1", [id]);
    if (!cur.length) return res.status(404).json({ ok: false, error: "Not found" });
    let image_id = cur[0].image_id;
    if (req.file) image_id = await saveImage(req.file);
    await query("UPDATE portfolio SET title = $1, image_id = $2 WHERE id = $3", [title, image_id, id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Could not update." });
  }
});

app.delete("/api/admin/portfolio/:id", requireAdmin, async (req, res) => {
  await query("DELETE FROM portfolio WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.get("/api/admin/testimonials", requireAdmin, async (_req, res) => {
  const rows = await query("SELECT id, quote, name, image_id FROM testimonials ORDER BY id DESC");
  res.json({
    ok: true,
    items: rows.map((r) => ({ id: r.id, quote: r.quote, name: r.name, image: imgUrl(r.image_id) })),
  });
});

app.post("/api/admin/testimonials", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const quote = String(req.body.quote || "").trim();
    const name = String(req.body.name || "").trim();
    const image_id = await saveImage(req.file);
    if (!quote && !image_id) return res.status(400).json({ ok: false, error: "Add a quote or a screenshot." });
    const rows = await query(
      "INSERT INTO testimonials (quote, name, image_id) VALUES ($1,$2,$3) RETURNING id",
      [quote, name, image_id]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch {
    res.status(500).json({ ok: false, error: "Could not save." });
  }
});

app.post("/api/admin/testimonials/:id", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const id = req.params.id;
    const quote = String(req.body.quote || "").trim();
    const name = String(req.body.name || "").trim();
    const cur = await query("SELECT image_id FROM testimonials WHERE id = $1", [id]);
    if (!cur.length) return res.status(404).json({ ok: false, error: "Not found" });
    let image_id = cur[0].image_id;
    if (req.file) image_id = await saveImage(req.file);
    await query("UPDATE testimonials SET quote = $1, name = $2, image_id = $3 WHERE id = $4", [quote, name, image_id, id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Could not update." });
  }
});

app.delete("/api/admin/testimonials/:id", requireAdmin, async (req, res) => {
  await query("DELETE FROM testimonials WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.get("/api/admin/enquiries", requireAdmin, async (_req, res) => {
  const rows = await query("SELECT id, name, email, service, message, created_at FROM enquiries ORDER BY id DESC");
  res.json({ ok: true, items: rows });
});

app.delete("/api/admin/enquiries/:id", requireAdmin, async (req, res) => {
  await query("DELETE FROM enquiries WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

init()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log("Mirah Tracy on " + PORT));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
