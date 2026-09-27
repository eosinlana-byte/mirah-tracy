const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Feranmi";
const SECRET = process.env.SECRET || "mira-quil-admin";
const COOKIE = "mq_admin";
const DATA = path.join("/tmp", "mira-enquiries.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname));

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
function readList() {
  try {
    return JSON.parse(fs.readFileSync(DATA, "utf8"));
  } catch {
    return [];
  }
}
function writeList(list) {
  fs.writeFileSync(DATA, JSON.stringify(list, null, 2));
}

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

app.post("/api/enquire", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const service = String(req.body.service || "").trim();
  const message = String(req.body.message || "").trim();
  if (!name || !email || !service || !message) {
    return res.status(400).json({ ok: false, error: "Fill all fields." });
  }
  const list = readList();
  list.unshift({ id: Date.now(), name, email, service, message, at: new Date().toISOString() });
  writeList(list);
  res.json({ ok: true });
});

app.get("/api/enquiries", requireAdmin, (_req, res) => {
  res.json({ ok: true, items: readList() });
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Mira Quil on " + PORT);
});
