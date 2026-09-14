// db.js
// Ouvre (ou crée) le fichier SQLite et s'assure que le schéma existe.
// Toute la logique de base de données vit ici : le reste du serveur
// ne fait qu'appeler les fonctions exportées plus bas.

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// DATA_DIR permet de séparer les données du code (utile pour un volume
// Docker monté sur un répertoire dédié) — par défaut, comportement inchangé :
// le fichier vit à côté du code, comme avant.
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "data.sqlite");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  domain TEXT NOT NULL,
  learned TEXT DEFAULT '',
  can_do TEXT DEFAULT '',
  difficult TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS week_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'finance',
  status TEXT NOT NULL DEFAULT 'todo',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS month_scores (
  month TEXT PRIMARY KEY,
  finance REAL,
  concours REAL,
  anglais REAL,
  tech REAL,
  projet REAL
);

CREATE TABLE IF NOT EXISTS dashboard_status (
  domain TEXT PRIMARY KEY,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  date_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pas commencé',
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS programme_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  month_label TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pas commencé',
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  day TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  chapter_id INTEGER REFERENCES programme_chapters(id),
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT,
  title TEXT NOT NULL,
  chapter_id INTEGER REFERENCES programme_chapters(id)
);

-- Cache de la dernière suggestion IA « quoi étudier ensuite » (une seule
-- ligne, id fixe) — évite de rappeler l'IA à chaque ouverture du Bilan.
CREATE TABLE IF NOT EXISTS ai_insights (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  date TEXT NOT NULL DEFAULT (datetime('now')),
  score_pct REAL NOT NULL,
  correct_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL
);
`);

// ---- seed des jalons par défaut, une seule fois ----
const milestoneCount = db.prepare("SELECT COUNT(*) AS n FROM milestones").get().n;
if (milestoneCount === 0) {
  const insert = db.prepare(
    "INSERT INTO milestones (label, date_label, status, sort_order) VALUES (?, ?, 'Pas commencé', ?)"
  );
  const defaults = [
    ["Je possède un vrai socle comptable.", "Déc. 2026"],
    ["Je comprends fiscalité + contrôle de gestion.", "Fév. 2027"],
    ["Je peux analyser financièrement une PME et comprendre son financement.", "Juin 2027"],
    ["Je comprends les mécanismes essentiels d'une banque/fintech et leurs risques.", "Oct. 2027"],
    ["Je peux concevoir une solution Tech à partir d'un problème financier réel.", "Déc. 2027"]
  ];
  const insertMany = db.transaction((rows) => {
    rows.forEach((row, i) => insert.run(row[0], row[1], i));
  });
  insertMany(defaults);
}

// ---- seed du programme (curriculum) par défaut, une seule fois ----
const programmeCount = db.prepare("SELECT COUNT(*) AS n FROM programme_chapters").get().n;
if (programmeCount === 0) {
  const insertChapter = db.prepare(
    `INSERT INTO programme_chapters (module, label, description, month_label, status, sort_order)
     VALUES (?, ?, ?, ?, 'Pas commencé', ?)`
  );
  const modules = [
    ["Comptabilité générale", [
      ["Les fondamentaux", "Bilan, actif/passif, débit/crédit, partie double.", "Sept. 2026"],
      ["Les opérations courantes", "Achats, ventes, TVA, banque/caisse, salaires.", "Oct. 2026"],
      ["Amortissements et dépréciations", "Constater l'usure des immobilisations et la perte de valeur des actifs.", "Nov. 2026"],
      ["Stocks et travaux de fin d'exercice", "Valoriser les stocks et préparer la clôture comptable.", "Nov. 2026"],
      ["Documents de synthèse", "Bilan, compte de résultat, annexe — lire et produire les états financiers.", "Déc. 2026"]
    ]],
    ["Fiscalité & contrôle de gestion", [
      ["Fiscalité des entreprises", "Impôt sur les sociétés, TVA approfondie, CET.", "Janv. 2027"],
      ["Fiscalité des particuliers", "Les grands principes de l'impôt sur le revenu.", "Janv. 2027"],
      ["Comptabilité analytique", "Coûts complets et coûts variables, coût de revient.", "Fév. 2027"],
      ["Contrôle de gestion — budgets", "Construire un budget prévisionnel et suivre les écarts.", "Fév. 2027"]
    ]],
    ["Analyse financière & financement", [
      ["Lecture des documents financiers", "Bilan fonctionnel, soldes intermédiaires de gestion.", "Mars 2027"],
      ["Ratios et diagnostic financier", "Solvabilité, liquidité, structure financière.", "Avr. 2027"],
      ["Rentabilité et création de valeur", "Rentabilité économique et financière.", "Mai 2027"],
      ["Modes de financement", "Dette, capital, leasing — comparer les sources de financement.", "Mai 2027"],
      ["Étude de cas — analyser une PME", "Mettre en pratique sur un cas réel ou simulé, de bout en bout.", "Juin 2027"]
    ]],
    ["Banque, Fintech & gestion des risques", [
      ["Fonctionnement d'une banque", "Bilan bancaire, métiers, comment une banque gagne de l'argent.", "Juil. 2027"],
      ["Panorama Fintech", "Paiement, crédit, néobanques — principaux modèles et enjeux.", "Août 2027"],
      ["Risques financiers", "Crédit, marché, liquidité, risque opérationnel.", "Sept. 2027"],
      ["Réglementation et conformité", "Notions de Bâle, KYC/AML — le cadre qui encadre banques et fintechs.", "Oct. 2027"]
    ]],
    ["Projet Finance × Tech", [
      ["Identifier un problème financier réel", "Choisir un cas concret à résoudre avec la tech.", "Nov. 2027"],
      ["Concevoir une solution", "Spécification fonctionnelle — définir ce que la solution doit faire.", "Nov. 2027"],
      ["Prototyper et développer", "Construire une première version fonctionnelle.", "Déc. 2027"],
      ["Présenter et valider le projet", "Restituer le travail et en tirer les enseignements.", "Déc. 2027"]
    ]]
  ];
  const insertAll = db.transaction(() => {
    let order = 0;
    modules.forEach(([module, chapters]) => {
      chapters.forEach(([label, description, month]) => {
        insertChapter.run(module, label, description, month, order);
        order++;
      });
    });
  });
  insertAll();
}

// ---- seed des quiz ----
// Géré séparément par seed-quiz.js, appelé depuis server.js au démarrage
// (idempotent : n'insère que les mois absents de la base).

// ---- migration : ajoute quizzes.chapter_id s'il manque ----
// (bases créées avant l'ajout des quiz générés par IA, liés à un chapitre).
// CREATE TABLE IF NOT EXISTS ne modifie pas un schéma déjà existant, d'où
// cette vérification manuelle via PRAGMA table_info.
const quizColumns = db.prepare("PRAGMA table_info(quizzes)").all().map((c) => c.name);
if (!quizColumns.includes("chapter_id")) {
  db.exec("ALTER TABLE quizzes ADD COLUMN chapter_id INTEGER REFERENCES programme_chapters(id)");
}

module.exports = db;
