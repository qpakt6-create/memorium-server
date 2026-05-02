import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";
const DATA_FILE = join(__dirname, "clients.json");

function loadClients() {
  if (!existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveClients(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function auth(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/clients.json", (req, res) => {
  res.json(loadClients());
});

app.get("/admin/clients", auth, (req, res) => {
  res.json(loadClients());
});

app.post("/admin/clients", auth, (req, res) => {
  const body = req.body;
  if (!body.name || !body.downloadUrl) {
    return res.status(400).json({ error: "name and downloadUrl are required" });
  }
  const clients = loadClients();
  const id = clients.length ? Math.max(...clients.map((c) => c.id || 0)) + 1 : 1;
  const client = {
    id,
    name: body.name,
    type: body.type || "Fabric",
    status: body.status || "Стабильная",
    title: body.title || body.name,
    description: body.description || "",
    folder: body.folder || body.name.replace(/\s+/g, "_"),
    downloadUrl: body.downloadUrl,
    exePath: body.exePath || "launcher.jar"
  };
  clients.push(client);
  saveClients(clients);
  res.status(201).json(client);
});

app.put("/admin/clients/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const clients = loadClients();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  clients[idx] = { ...clients[idx], ...req.body, id };
  saveClients(clients);
  res.json(clients[idx]);
});

app.delete("/admin/clients/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const clients = loadClients();
  const filtered = clients.filter((c) => c.id !== id);
  if (filtered.length === clients.length) return res.status(404).json({ error: "not found" });
  saveClients(filtered);
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.json({ status: "ok", clients: loadClients().length });
});

app.get("/admin", (req, res) => {
  res.sendFile(join(__dirname, "admin.html"));
});

app.listen(PORT, () => {
  console.log(`memorium server running on port ${PORT}`);
});
