// auth.js
// Authentification maison, sans dépendance : hachage de mot de passe via
// crypto.scryptSync (intégré à Node, recommandé pour ça), sessions opaques
// stockées côté serveur et envoyées en cookie HttpOnly. Cohérent avec le
// reste du projet, qui évite systématiquement les SDK/librairies quand une
// poignée de lignes suffit (voir ai.js pour l'appel IA en fetch() brut).
//
// Sécurité du cookie de session : `Secure` n'est ajouté que si
// COOKIE_SECURE=1 est défini dans l'environnement. Cette app est pensée pour
// de l'auto-hébergement, potentiellement en HTTP simple sur un réseau local
// (Docker sans TLS devant) — imposer `Secure` par défaut casserait la
// connexion dans ce cas. Si un reverse proxy termine le TLS devant cette
// app, définir COOKIE_SECURE=1.

const crypto = require("crypto");
const accountsDb = require("./accounts-db");
const { getDb } = require("./db");

const COOKIE_NAME = "gl_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function createSession(accountId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  accountsDb
    .prepare("INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)")
    .run(token, accountId, expiresAt);
  return { token, expiresAt };
}

function destroySession(token) {
  accountsDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function getAccountForToken(token) {
  if (!token) return null;
  const row = accountsDb
    .prepare(
      `SELECT a.id, a.email, s.expires_at
       FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    destroySession(token);
    return null;
  }
  return { id: row.id, email: row.email };
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  });
  return cookies;
}

function setSessionCookie(res, token, expiresAt) {
  const maxAgeSeconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  const secure = process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

// Middleware appliqué à toutes les routes /api/* sauf /api/auth/* : sans
// session valide, 401 immédiat. Avec une session valide, attache le compte
// et SA base isolée — tout le reste du serveur lit/écrit `req.db`, jamais
// une base globale.
function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  const account = getAccountForToken(token);
  if (!account) return res.status(401).json({ error: "Non authentifié." });
  req.account = account;
  req.db = getDb(account.id);
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getAccountForToken,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  requireAuth
};
