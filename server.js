import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";
const DATA_FILE = join(__dirname, "clients.json");
const USERS_FILE = join(__dirname, "users.json");

function loadClients() {
  if (!existsSync(DATA_FILE)) return [];
  try { return JSON.parse(readFileSync(DATA_FILE, "utf-8")); } catch { return []; }
}

function saveClients(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function loadUsers() {
  if (!existsSync(USERS_FILE)) return [];
  try { return JSON.parse(readFileSync(USERS_FILE, "utf-8")); } catch { return []; }
}

function saveUsers(data) {
  writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function makeOfflineUUID(username) {
  const hash = createHash("md5").update("OfflinePlayer:" + username).digest("hex");
  const p1 = hash.slice(0, 8);
  const p2 = hash.slice(8, 12);
  const p3 = (parseInt(hash.slice(12, 16), 16) & 0x0fff | 0x3000).toString(16).padStart(4, "0");
  const p4 = (parseInt(hash.slice(16, 20), 16) & 0x3fff | 0x8000).toString(16).padStart(4, "0");
  const p5 = hash.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

function auth(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key || req.body?.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

const heartbeats = new Map();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/clients.json", (req, res) => res.json(loadClients()));

app.get("/admin/clients", auth, (req, res) => res.json(loadClients()));

app.post("/admin/clients", auth, (req, res) => {
  const body = req.body;
  if (!body.name || !body.downloadUrl) return res.status(400).json({ error: "name and downloadUrl are required" });
  const clients = loadClients();
  const id = clients.length ? Math.max(...clients.map(c => c.id || 0)) + 1 : 1;
  const client = {
    id, name: body.name, type: body.type || "Fabric",
    status: body.status || "Стабильная", title: body.title || body.name,
    description: body.description || "", folder: body.folder || body.name.replace(/\s+/g, "_"),
    downloadUrl: body.downloadUrl, exePath: body.exePath || "launcher.jar"
  };
  clients.push(client);
  saveClients(clients);
  res.status(201).json(client);
});

app.put("/admin/clients/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const clients = loadClients();
  const idx = clients.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  clients[idx] = { ...clients[idx], ...req.body, id };
  saveClients(clients);
  res.json(clients[idx]);
});

app.delete("/admin/clients/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const clients = loadClients();
  const filtered = clients.filter(c => c.id !== id);
  if (filtered.length === clients.length) return res.status(404).json({ error: "not found" });
  saveClients(filtered);
  res.json({ ok: true });
});

app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || typeof username !== "string") return res.status(400).json({ error: "username required" });
  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "password must be at least 6 characters" });
  }
  const clean = username.trim();
  if (clean.length < 3 || clean.length > 16 || !/^[a-zA-Z0-9_]+$/.test(clean)) {
    return res.status(400).json({ error: "invalid username (3-16 chars, a-z 0-9 _)" });
  }
  const users = loadUsers();
  const uuid = makeOfflineUUID(clean);
  const exists = users.find(u => u.uuid === uuid);
  if (exists) return res.status(409).json({ error: "already_registered", uuid: exists.uuid, username: exists.username });
  const token = randomBytes(32).toString("hex");
  const passwordHash = createHash("sha256").update(password).digest("hex");
  const user = { uuid, username: clean, token, passwordHash, prefix: "" };
  users.push(user);
  saveUsers(users);
  res.status(201).json({ uuid, username: clean, token });
});

app.post("/api/login", (req, res) => {
  const { uuid, token, username, password } = req.body;
  const users = loadUsers();
  // Token-based login (auto-login from saved session)
  if (uuid && token && !password) {
    const user = users.find(u => u.uuid === uuid && u.token === token);
    if (!user) return res.status(401).json({ error: "invalid credentials" });
    return res.json({ uuid: user.uuid, username: user.username, token: user.token, prefix: user.prefix || "" });
  }
  // Username + password login
  if (username && password) {
    const clean = username.trim();
    const passwordHash = createHash("sha256").update(password).digest("hex");
    const idx = users.findIndex(u => u.username.toLowerCase() === clean.toLowerCase());
    if (idx === -1) return res.status(401).json({ error: "invalid credentials" });
    const user = users[idx];
    // Migration: old account without passwordHash — accept any password and save it
    if (!user.passwordHash) {
      users[idx].passwordHash = passwordHash;
      saveUsers(users);
    } else if (user.passwordHash !== passwordHash) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    return res.json({ uuid: user.uuid, username: user.username, token: user.token, prefix: user.prefix || "" });
  }
  return res.status(400).json({ error: "provide username+password or uuid+token" });
});

app.post("/api/heartbeat", (req, res) => {
  const { uuid, username } = req.body;
  if (!uuid) return res.status(400).json({ error: "uuid required" });
  heartbeats.set(uuid, { username: username || "", ts: Date.now() });
  res.json({ ok: true });
});

setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [uuid, info] of heartbeats) {
    if (info.ts < cutoff) heartbeats.delete(uuid);
  }
}, 30000);

app.get("/api/online", (req, res) => {
  const cutoff = Date.now() - 60000;
  let online = 0;
  for (const info of heartbeats.values()) {
    if (info.ts >= cutoff) online++;
  }
  res.json({ online });
});

app.get("/api/players", (req, res) => {
  const cutoff = Date.now() - 60000;
  const uuids = [];
  for (const [uuid, info] of heartbeats) {
    if (info.ts >= cutoff) uuids.push(uuid);
  }
  res.json({ uuids });
});

app.get("/api/prefixes", (req, res) => {
  const users = loadUsers();
  const prefixes = {};
  for (const u of users) {
    if (u.prefix) prefixes[u.uuid] = u.prefix;
  }
  res.json({ prefixes });
});

app.post("/admin/prefix", auth, (req, res) => {
  const { uuid, prefix } = req.body;
  if (!uuid) return res.status(400).json({ error: "uuid required" });
  const users = loadUsers();
  const idx = users.findIndex(u => u.uuid === uuid);
  if (idx === -1) return res.status(404).json({ error: "user not found" });
  users[idx].prefix = prefix || "";
  saveUsers(users);
  res.json({ ok: true, uuid, prefix: users[idx].prefix });
});

app.get("/admin/users", auth, (req, res) => {
  const users = loadUsers();
  res.json(users.map(u => ({ uuid: u.uuid, username: u.username, prefix: u.prefix || "" })));
});

app.put("/admin/users/:uuid", auth, (req, res) => {
  const users = loadUsers();
  const idx = users.findIndex(u => u.uuid === req.params.uuid);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  if (req.body.prefix !== undefined) users[idx].prefix = req.body.prefix;
  if (req.body.username !== undefined) users[idx].username = req.body.username;
  saveUsers(users);
  res.json({ ok: true });
});

app.delete("/admin/users/:uuid", auth, (req, res) => {
  const users = loadUsers();
  const filtered = users.filter(u => u.uuid !== req.params.uuid);
  if (filtered.length === users.length) return res.status(404).json({ error: "not found" });
  saveUsers(filtered);
  res.json({ ok: true });
});

app.get("/", (req, res) => res.json({ status: "ok", clients: loadClients().length, users: loadUsers().length }));
app.get("/admin", (req, res) => res.sendFile(join(__dirname, "admin.html")));

app.listen(PORT, () => console.log(`memorium server running on port ${PORT}`));
