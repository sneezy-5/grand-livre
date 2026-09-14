// server.js
// Serveur Express : sert le frontend statique (public/) et expose l'API
// REST utilisée par public/js/app.js. Toutes les routes sont préfixées
// par /api. Chaque route est volontairement courte et lit/écrit une
// seule table pour rester facile à suivre.

const express = require("express");
const path = require("path");
const db = require("./db");
const seedQuizzes = require("./seed-quiz");
const ai = require("./ai");

const app = express();
const PORT = process.env.PORT || 3000;

// Synchronise les quiz de quizzes-data.js avec la base à chaque démarrage.
// N'insère que les mois absents — ne touche jamais aux quiz déjà présents
// ni à leur historique de tentatives.
const seedResult = seedQuizzes(db);
if (seedResult.inserted > 0) {
  console.log(`Quiz ajouté(s) au démarrage : ${seedResult.months.join(", ")}`);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

/* ================= aide : calendrier ================= */
// Utilisé pour planifier les chapitres générés par IA sur de vraies dates,
// en fonction des jours disponibles fournis par la personne — l'IA ne fait
// que le découpage pédagogique (voir ai.generateObjectivePlan), jamais le
// calcul de dates.

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTH_ABBR = ["janv.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function isoDate(d) { return d.toISOString().slice(0, 10); }
function mondayOf(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  return date;
}
function formatDateLabel(d) { return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`; }
const WEEKDAY_OFFSET_FROM_MONDAY = { Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4, Samedi: 5, Dimanche: 6 };
function dateOfSlot(slot) {
  const d = new Date(slot.week_start + "T00:00:00");
  d.setDate(d.getDate() + (WEEKDAY_OFFSET_FROM_MONDAY[slot.day] ?? 0));
  return d;
}

// Score minimal pour qu'un quiz lié à un chapitre le valide automatiquement
// — c'est désormais le SEUL moyen de faire passer un chapitre du Programme
// à "Terminé", le glisser-déposer direct vers cette colonne est bloqué
// côté interface.
const CHAPTER_PASS_THRESHOLD = 70;

// Répartit `count` sessions sur les prochaines occurrences des jours fournis
// (noms français, ex. ["Lundi","Mercredi"]), à partir d'aujourd'hui.
function scheduleDates(availableDayNames, count) {
  const wanted = new Set(availableDayNames.map((n) => DAY_NAMES.indexOf(n)).filter((i) => i >= 0));
  const dates = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dates.length < count) {
    if (wanted.has(cursor.getDay())) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/* ================= JOURNAL ================= */

// Liste des écritures, les plus récentes en premier.
app.get("/api/journal", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM journal_entries ORDER BY date DESC, id DESC")
    .all();
  res.json(rows);
});

// Ajoute une écriture. Le corps attendu :
// { date, domain, learned, can_do, difficult }
app.post("/api/journal", (req, res) => {
  const { date, domain, learned, can_do, difficult } = req.body;
  if (!date || !domain) {
    return res.status(400).json({ error: "date et domain sont obligatoires." });
  }
  const info = db
    .prepare(
      `INSERT INTO journal_entries (date, domain, learned, can_do, difficult)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(date, domain, learned || "", can_do || "", difficult || "");
  res.status(201).json({ id: info.lastInsertRowid });
});

/* ================= CALENDRIER ================= */
// Vue mensuelle : pour chaque jour du mois qui a au moins une écriture de
// journal, la liste de ses écritures. Sert à visualiser d'un coup d'œil
// si l'objectif quotidien (« j'ai appris/pratiqué aujourd'hui ») a été
// rempli, jour par jour. Aucune nouvelle table : on relit journal_entries.

// month attendu au format "AAAA-MM" (ex. "2026-09").
app.get("/api/calendar/:month", (req, res) => {
  const rows = db
    .prepare(
      "SELECT date, domain, learned, can_do, difficult FROM journal_entries WHERE date LIKE ? ORDER BY date ASC"
    )
    .all(req.params.month + "%");
  const byDate = {};
  rows.forEach((r) => {
    (byDate[r.date] = byDate[r.date] || []).push({
      domain: r.domain, learned: r.learned, can_do: r.can_do, difficult: r.difficult
    });
  });
  res.json(byDate);
});

/* ================= SEMAINE ================= */
// Les tâches de la semaine sont librement créées par la personne (texte +
// domaine), plutôt qu'un planning fixe — chaque semaine (clé = lundi,
// AAAA-MM-JJ) a sa propre liste de tâches par jour.

// Toutes les tâches d'une semaine, triées par jour puis par ordre d'ajout.
app.get("/api/week/:weekStart", (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM week_tasks WHERE week_start = ? ORDER BY sort_order ASC, id ASC"
    )
    .all(req.params.weekStart);
  res.json(rows);
});

// Ajoute une tâche à un jour de la semaine. Corps : { day, text, domain }
app.post("/api/week/:weekStart", (req, res) => {
  const { day, text, domain } = req.body;
  if (!day || !text) {
    return res.status(400).json({ error: "day et text sont obligatoires." });
  }
  const maxOrder = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM week_tasks WHERE week_start = ? AND day = ?"
    )
    .get(req.params.weekStart, day).m;
  const info = db
    .prepare(
      `INSERT INTO week_tasks (week_start, day, text, domain, status, sort_order)
       VALUES (?, ?, ?, ?, 'todo', ?)`
    )
    .run(req.params.weekStart, day, text, domain || "finance", maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Réordonne (et déplace éventuellement vers un autre jour) les tâches d'un
// jour, après un glisser-déposer. Corps : { day, order: [id1, id2, ...] }
// — tous les ids de `order` sont affectés à `day`, dans cet ordre.
// Déclarée avant "/api/week-tasks/:id" pour qu'Express ne confonde pas
// "reorder" avec un id de tâche.
app.post("/api/week-tasks/reorder", (req, res) => {
  const { day, order } = req.body;
  if (!day || !Array.isArray(order)) {
    return res.status(400).json({ error: "day et order (tableau d'ids) sont obligatoires." });
  }
  const update = db.prepare("UPDATE week_tasks SET day = ?, sort_order = ? WHERE id = ?");
  const reorder = db.transaction((ids) => {
    ids.forEach((id, i) => update.run(day, i, id));
  });
  reorder(order);
  res.json({ ok: true });
});

// Met à jour une tâche existante. Corps : { status } et/ou { text, domain }
app.post("/api/week-tasks/:id", (req, res) => {
  const { status, text, domain, day } = req.body;
  const task = db.prepare("SELECT * FROM week_tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "Tâche introuvable." });
  db.prepare(
    `UPDATE week_tasks SET status = ?, text = ?, domain = ?, day = ? WHERE id = ?`
  ).run(
    status || task.status,
    text != null ? text : task.text,
    domain || task.domain,
    day || task.day,
    req.params.id
  );
  res.json({ ok: true });
});

// Supprime une tâche.
app.delete("/api/week-tasks/:id", (req, res) => {
  db.prepare("DELETE FROM week_tasks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ================= MOIS ================= */

// Scores /10 des 5 domaines pour un mois donné (clé = "Sept. 2026" etc.)
app.get("/api/month/:month", (req, res) => {
  const row = db
    .prepare("SELECT * FROM month_scores WHERE month = ?")
    .get(req.params.month);
  res.json(row || {});
});

// Enregistre les 5 notes du mois. Corps : { finance, concours, anglais, tech, projet }
app.post("/api/month/:month", (req, res) => {
  const { finance, concours, anglais, tech, projet } = req.body;
  db.prepare(
    `INSERT INTO month_scores (month, finance, concours, anglais, tech, projet)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       finance = excluded.finance, concours = excluded.concours,
       anglais = excluded.anglais, tech = excluded.tech, projet = excluded.projet`
  ).run(req.params.month, finance, concours, anglais, tech, projet);
  res.json({ ok: true });
});

// Toutes les moyennes mensuelles en une fois, pour tracer la courbe de tendance.
app.get("/api/month-scores", (req, res) => {
  const rows = db.prepare("SELECT * FROM month_scores").all();
  res.json(rows);
});

/* ================= DASHBOARD ================= */

app.get("/api/dashboard", (req, res) => {
  const rows = db.prepare("SELECT domain, status FROM dashboard_status").all();
  const result = {};
  rows.forEach((r) => (result[r.domain] = r.status));
  res.json(result);
});

// Corps : { domain, status }
app.post("/api/dashboard", (req, res) => {
  const { domain, status } = req.body;
  if (!domain || !status) {
    return res.status(400).json({ error: "domain et status sont obligatoires." });
  }
  db.prepare(
    `INSERT INTO dashboard_status (domain, status) VALUES (?, ?)
     ON CONFLICT(domain) DO UPDATE SET status = excluded.status`
  ).run(domain, status);
  res.json({ ok: true });
});

/* ================= JALONS ================= */

app.get("/api/milestones", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM milestones ORDER BY sort_order ASC")
    .all();
  res.json(rows);
});

// Ajoute un jalon. Corps : { label, date_label }
app.post("/api/milestones", (req, res) => {
  const { label, date_label } = req.body;
  if (!label || !date_label) {
    return res.status(400).json({ error: "label et date_label sont obligatoires." });
  }
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM milestones").get().m;
  const info = db
    .prepare(
      `INSERT INTO milestones (label, date_label, status, sort_order)
       VALUES (?, ?, 'Pas commencé', ?)`
    )
    .run(label, date_label, maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Met à jour un jalon existant. Corps : n'importe lequel de { label, date_label, status }
app.post("/api/milestones/:id", (req, res) => {
  const { label, date_label, status } = req.body;
  const existing = db.prepare("SELECT * FROM milestones WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Jalon introuvable." });
  db.prepare("UPDATE milestones SET label = ?, date_label = ?, status = ? WHERE id = ?").run(
    label != null ? label : existing.label,
    date_label != null ? date_label : existing.date_label,
    status || existing.status,
    req.params.id
  );
  res.json({ ok: true });
});

// Supprime un jalon.
app.delete("/api/milestones/:id", (req, res) => {
  db.prepare("DELETE FROM milestones WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Réordonne les jalons. Corps : { order: [id1, id2, ...] } dans le nouvel ordre.
app.post("/api/milestones-reorder", (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: "order (tableau d'ids) est obligatoire." });
  }
  const update = db.prepare("UPDATE milestones SET sort_order = ? WHERE id = ?");
  const reorder = db.transaction((ids) => {
    ids.forEach((id, i) => update.run(i, id));
  });
  reorder(order);
  res.json({ ok: true });
});

/* ================= PROGRAMME ================= */
// Le curriculum détaillé (modules + chapitres) qui sous-tend les jalons et
// les quiz. Chaque chapitre appartient à un module (texte libre, pas une
// table séparée) — le regroupement par module se fait côté client.

app.get("/api/programme", (req, res) => {
  const rows = db.prepare("SELECT * FROM programme_chapters ORDER BY sort_order ASC").all();
  res.json(rows);
});

// Ajoute un chapitre. Corps : { module, label, description, month_label }
app.post("/api/programme", (req, res) => {
  const { module, label, description, month_label } = req.body;
  if (!module || !label) {
    return res.status(400).json({ error: "module et label sont obligatoires." });
  }
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM programme_chapters").get().m;
  const info = db
    .prepare(
      `INSERT INTO programme_chapters (module, label, description, month_label, status, sort_order)
       VALUES (?, ?, ?, ?, 'Pas commencé', ?)`
    )
    .run(module, label, description || "", month_label || "", maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Met à jour un chapitre. Corps : tout ou partie de { label, description, month_label, status }
app.post("/api/programme/:id", (req, res) => {
  const { label, description, month_label, status, module } = req.body;
  const existing = db.prepare("SELECT * FROM programme_chapters WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Chapitre introuvable." });
  db.prepare(
    "UPDATE programme_chapters SET label = ?, description = ?, month_label = ?, status = ?, module = ? WHERE id = ?"
  ).run(
    label != null ? label : existing.label,
    description != null ? description : existing.description,
    month_label != null ? month_label : existing.month_label,
    status || existing.status,
    module || existing.module,
    req.params.id
  );
  res.json({ ok: true });
});

// Supprime un chapitre. Les créneaux d'emploi du temps qui le référençaient
// perdent juste leur lien (chapter_id à NULL) — le créneau n'est pas effacé.
app.delete("/api/programme/:id", (req, res) => {
  const del = db.transaction((id) => {
    db.prepare("UPDATE schedule_slots SET chapter_id = NULL WHERE chapter_id = ?").run(id);
    db.prepare("DELETE FROM programme_chapters WHERE id = ?").run(id);
  });
  del(req.params.id);
  res.json({ ok: true });
});

// Supprime un objectif entier (un module et tous ses chapitres) — utilisé
// par la liste "Tes programmes" pour retirer un objectif complet en un coup,
// plutôt que chapitre par chapitre. Même traitement des créneaux liés que la
// suppression d'un chapitre seul : ils perdent juste leur lien, pas supprimés.
app.delete("/api/programme/module/:name", (req, res) => {
  const moduleName = decodeURIComponent(req.params.name);
  const del = db.transaction((name) => {
    const ids = db.prepare("SELECT id FROM programme_chapters WHERE module = ?").all(name).map((r) => r.id);
    const nullSlot = db.prepare("UPDATE schedule_slots SET chapter_id = NULL WHERE chapter_id = ?");
    const delChapter = db.prepare("DELETE FROM programme_chapters WHERE id = ?");
    ids.forEach((id) => { nullSlot.run(id); delChapter.run(id); });
    return ids.length;
  });
  const deleted = del(moduleName);
  res.json({ ok: true, deleted });
});

// Réordonne (et déplace éventuellement vers un autre module) les chapitres
// d'un module, après un glisser-déposer. Corps : { module, order: [id1, ...] }
// — tous les ids de `order` sont affectés à `module`, dans cet ordre. Même
// logique que /api/week-tasks/reorder : les sort_order des autres modules
// ne sont pas touchés, seul le filtrage par module compte à l'affichage.
app.post("/api/programme-reorder", (req, res) => {
  const { module, order } = req.body;
  if (!module || !Array.isArray(order)) {
    return res.status(400).json({ error: "module et order (tableau d'ids) sont obligatoires." });
  }
  const update = db.prepare("UPDATE programme_chapters SET module = ?, sort_order = ? WHERE id = ?");
  const reorder = db.transaction((ids) => {
    ids.forEach((id, i) => update.run(module, i, id));
  });
  reorder(order);
  res.json({ ok: true });
});

// Génère un quiz de contrôle pour ce chapitre via l'IA (OpenRouter) et
// l'insère avec les mêmes tables que les quiz créés à la main — il apparaît
// ensuite normalement dans l'onglet Quiz. Ne fait rien d'automatique :
// appelée uniquement quand la personne clique sur le bouton correspondant.
app.post("/api/programme/:id/generate-quiz", async (req, res) => {
  const chapter = db.prepare("SELECT * FROM programme_chapters WHERE id = ?").get(req.params.id);
  if (!chapter) return res.status(404).json({ error: "Chapitre introuvable." });
  try {
    const quiz = await ai.generateQuiz(chapter);
    const insertQuiz = db.prepare("INSERT INTO quizzes (month, title, chapter_id) VALUES (?, ?, ?)");
    const insertQuestion = db.prepare(
      `INSERT INTO quiz_questions (quiz_id, prompt, options_json, correct_option_id, explanation, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const create = db.transaction(() => {
      const quizId = insertQuiz.run(chapter.month_label || null, quiz.title, chapter.id).lastInsertRowid;
      quiz.questions.forEach((q, i) => {
        insertQuestion.run(quizId, q.prompt, JSON.stringify(q.options), q.correct, q.explanation, i);
      });
      return quizId;
    });
    res.status(201).json({ id: create() });
  } catch (e) {
    res.status(e.statusCode || 502).json({ error: e.message });
  }
});

// Insère un module de chapitres + leurs créneaux, répartis sur les
// prochaines dates correspondant aux jours fournis. Partagé par les deux
// routes ci-dessous (génération directe et finalisation après clarification
// de l'heure) pour ne pas dupliquer la logique de planification.
function persistObjective(module, chapters, days, start_time, duration_minutes) {
  const dates = scheduleDates(days, chapters.length);

  const insertChapter = db.prepare(
    `INSERT INTO programme_chapters (module, label, description, month_label, status, sort_order)
     VALUES (?, ?, ?, ?, 'Pas commencé', ?)`
  );
  const insertSlot = db.prepare(
    `INSERT INTO schedule_slots (week_start, day, start_time, duration_minutes, chapter_id, done, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  );
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM programme_chapters").get().m;
  const slotOrderCache = {}; // week_start|day -> prochain sort_order libre dans ce jour

  const created = db.transaction(() => {
    return chapters.map((c, i) => {
      const date = dates[i];
      const weekStart = isoDate(mondayOf(date));
      const day = DAY_NAMES[date.getDay()];
      const chapterId = insertChapter.run(
        module, c.label, c.description, formatDateLabel(date), maxOrder + 1 + i
      ).lastInsertRowid;

      const cacheKey = weekStart + "|" + day;
      if (slotOrderCache[cacheKey] === undefined) {
        slotOrderCache[cacheKey] = db
          .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM schedule_slots WHERE week_start = ? AND day = ?")
          .get(weekStart, day).m + 1;
      }
      insertSlot.run(weekStart, day, start_time, duration_minutes || 60, chapterId, slotOrderCache[cacheKey]++);

      return { id: chapterId, label: c.label, description: c.description, date_label: formatDateLabel(date), day };
    });
  });

  return created();
}

// Crée un nouvel objectif à partir d'un message libre : l'IA le découpe en
// chapitres ET propose un planning (jours/durée/heure), en respectant les
// préférences données dans le message quand elles y sont. Si l'IA ne peut
// déduire aucune heure du message, rien n'est enregistré : on renvoie le
// plan tel quel avec needs_time=true, et le client renvoie l'heure choisie
// par la personne à /api/objectives/finalize pour terminer la création
// (évite de rappeler l'IA une seconde fois pour la même génération).
// Corps : { message }
app.post("/api/objectives/generate", async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "message est obligatoire." });
  }
  try {
    const plan = await ai.generateObjectivePlan(message.trim());
    const { days, duration_minutes, start_time } = plan.schedule;

    if (!start_time) {
      return res.status(200).json({
        needs_time: true, module: plan.module, chapters: plan.chapters, days, duration_minutes
      });
    }

    const chapters = persistObjective(plan.module, plan.chapters, days, start_time, duration_minutes);
    res.status(201).json({ module: plan.module, chapters, days, start_time, duration_minutes });
  } catch (e) {
    res.status(e.statusCode || 502).json({ error: e.message });
  }
});

// Termine la création d'un objectif dont l'heure manquait : reprend le plan
// déjà généré (chapitres + jours/durée déjà décidés) tel que renvoyé par
// /api/objectives/generate, avec l'heure fournie ensuite par la personne.
// Corps : { module, chapters: [{label, description}], days, start_time, duration_minutes }
app.post("/api/objectives/finalize", (req, res) => {
  const { module, chapters, days, start_time, duration_minutes } = req.body;
  if (!module || !Array.isArray(chapters) || !chapters.length || !Array.isArray(days) || !days.length || !start_time) {
    return res.status(400).json({ error: "module, chapters, days et start_time sont obligatoires." });
  }
  const created = persistObjective(module, chapters, days, start_time, duration_minutes);
  res.status(201).json({ module, chapters: created });
});

/* ================= AUJOURD'HUI ================= */
// Écran d'accueil : les chapitres "à faire maintenant" (date planifiée <=
// aujourd'hui, pas encore Terminé) et un aperçu des prochains (verrouillés,
// juste pour contexte). Un chapitre n'apparaît ici que s'il a un créneau —
// créé automatiquement par /api/objectives/generate, ou manuellement en
// liant un chapitre existant à un créneau via l'Emploi du temps (backend
// conservé même sans onglet dédié).

app.get("/api/today", (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.module, c.label, c.description, c.status,
              s.week_start, s.day, s.start_time, s.duration_minutes
       FROM programme_chapters c
       JOIN schedule_slots s ON s.chapter_id = c.id
       WHERE c.status != 'Terminé'`
    )
    .all();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withDate = rows
    .map((r) => ({ ...r, _date: dateOfSlot(r) }))
    .sort((a, b) => a._date - b._date)
    .map((r) => {
      const quiz = db
        .prepare("SELECT id, title FROM quizzes WHERE chapter_id = ? ORDER BY id DESC LIMIT 1")
        .get(r.id);
      const { _date, week_start, day, ...rest } = r;
      return { ...rest, date_label: formatDateLabel(_date), quiz_id: quiz ? quiz.id : null, quiz_title: quiz ? quiz.title : null, _due: _date <= today };
    });

  const due = withDate.filter((r) => r._due).map(({ _due, ...r }) => r);
  const upcoming = withDate.filter((r) => !r._due).slice(0, 5).map(({ _due, ...r }) => r);

  res.json({ due, upcoming, pass_threshold: CHAPTER_PASS_THRESHOLD });
});

/* ================= EMPLOI DU TEMPS ================= */
// Des créneaux datés (une semaine précise, pas un modèle récurrent), chacun
// avec une heure de début, une durée, et un lien optionnel vers un chapitre
// du Programme. Le statut d'avancement du chapitre n'est pas modifié
// automatiquement : `done` ne concerne que le créneau lui-même.

// Tous les créneaux d'une semaine, avec le chapitre lié (label/module/statut).
app.get("/api/schedule/:weekStart", (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, c.label AS chapter_label, c.module AS chapter_module, c.status AS chapter_status
       FROM schedule_slots s LEFT JOIN programme_chapters c ON c.id = s.chapter_id
       WHERE s.week_start = ?
       ORDER BY s.day ASC, s.start_time ASC`
    )
    .all(req.params.weekStart);
  res.json(rows);
});

// Ajoute un créneau. Corps : { day, start_time, duration_minutes, chapter_id }
app.post("/api/schedule/:weekStart", (req, res) => {
  const { day, start_time, duration_minutes, chapter_id } = req.body;
  if (!day || !start_time) {
    return res.status(400).json({ error: "day et start_time sont obligatoires." });
  }
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM schedule_slots WHERE week_start = ? AND day = ?")
    .get(req.params.weekStart, day).m;
  const info = db
    .prepare(
      `INSERT INTO schedule_slots (week_start, day, start_time, duration_minutes, chapter_id, done, sort_order)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .run(req.params.weekStart, day, start_time, duration_minutes || 60, chapter_id || null, maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Met à jour un créneau. Corps : tout ou partie de
// { day, start_time, duration_minutes, chapter_id, done }
app.post("/api/schedule-slots/:id", (req, res) => {
  const { day, start_time, duration_minutes, chapter_id, done } = req.body;
  const existing = db.prepare("SELECT * FROM schedule_slots WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Créneau introuvable." });
  db.prepare(
    `UPDATE schedule_slots SET day = ?, start_time = ?, duration_minutes = ?, chapter_id = ?, done = ? WHERE id = ?`
  ).run(
    day || existing.day,
    start_time || existing.start_time,
    duration_minutes != null ? duration_minutes : existing.duration_minutes,
    chapter_id !== undefined ? chapter_id : existing.chapter_id,
    done != null ? (done ? 1 : 0) : existing.done,
    req.params.id
  );
  res.json({ ok: true });
});

// Supprime un créneau.
app.delete("/api/schedule-slots/:id", (req, res) => {
  db.prepare("DELETE FROM schedule_slots WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ================= QUIZ ================= */
// Le score est TOUJOURS calculé côté serveur, à partir des bonnes réponses
// stockées en base — jamais fait confiance à un score envoyé par le client.

// Liste des quiz disponibles (sans les questions).
app.get("/api/quizzes", (req, res) => {
  const rows = db.prepare("SELECT id, month, title FROM quizzes ORDER BY id ASC").all();
  res.json(rows);
});

// Un quiz avec ses questions — sans la bonne réponse ni l'explication,
// pour ne pas les exposer avant que la personne ait répondu.
app.get("/api/quizzes/:id", (req, res) => {
  const quiz = db
    .prepare(
      `SELECT q.id, q.month, q.title, q.chapter_id, c.label AS chapter_label, c.status AS chapter_status
       FROM quizzes q LEFT JOIN programme_chapters c ON c.id = q.chapter_id
       WHERE q.id = ?`
    )
    .get(req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz introuvable." });
  const questions = db
    .prepare("SELECT id, prompt, options_json FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC")
    .all(req.params.id)
    .map((q) => ({ id: q.id, prompt: q.prompt, options: JSON.parse(q.options_json) }));
  res.json({ ...quiz, questions, pass_threshold: CHAPTER_PASS_THRESHOLD });
});

// Corrige une tentative. Corps attendu : { answers: { questionId: optionId, ... } }
app.post("/api/quizzes/:id/attempt", (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== "object") {
    return res.status(400).json({ error: "answers est obligatoire." });
  }
  const quiz = db.prepare("SELECT chapter_id FROM quizzes WHERE id = ?").get(req.params.id);
  const questions = db
    .prepare("SELECT id, correct_option_id, explanation FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC")
    .all(req.params.id);
  if (!questions.length) return res.status(404).json({ error: "Quiz introuvable." });

  let correctCount = 0;
  const results = questions.map((q) => {
    const given = answers[q.id] ?? null;
    const isCorrect = given === q.correct_option_id;
    if (isCorrect) correctCount++;
    return {
      questionId: q.id,
      given,
      correct_option_id: q.correct_option_id,
      explanation: q.explanation,
      is_correct: isCorrect
    };
  });

  const total = questions.length;
  const scorePct = Math.round((correctCount / total) * 100);

  db.prepare(
    "INSERT INTO quiz_attempts (quiz_id, score_pct, correct_count, total_count) VALUES (?, ?, ?, ?)"
  ).run(req.params.id, scorePct, correctCount, total);

  let chapterCompleted = false;
  if (quiz && quiz.chapter_id && scorePct >= CHAPTER_PASS_THRESHOLD) {
    db.prepare("UPDATE programme_chapters SET status = 'Terminé' WHERE id = ?").run(quiz.chapter_id);
    chapterCompleted = true;
  }

  res.json({
    score_pct: scorePct, correct_count: correctCount, total_count: total, results,
    chapter_id: quiz ? quiz.chapter_id : null,
    chapter_completed: chapterCompleted,
    pass_threshold: CHAPTER_PASS_THRESHOLD
  });
});

// Avis IA ciblé sur une tentative déjà corrigée. Corps : { results } — le
// tableau renvoyé par /attempt ci-dessus, tel quel. Appelée uniquement sur
// clic explicite (bouton "Avis IA"), jamais automatiquement.
app.post("/api/quizzes/:id/feedback", async (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results) || !results.length) {
    return res.status(400).json({ error: "results est obligatoire." });
  }
  const quiz = db.prepare("SELECT title FROM quizzes WHERE id = ?").get(req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz introuvable." });
  try {
    const feedback = await ai.generateFeedback(quiz.title, results);
    res.json({ feedback });
  } catch (e) {
    res.status(e.statusCode || 502).json({ error: e.message });
  }
});

// Historique des tentatives pour un quiz, les plus récentes en premier.
app.get("/api/quizzes/:id/attempts", (req, res) => {
  const rows = db
    .prepare(
      "SELECT date, score_pct, correct_count, total_count FROM quiz_attempts WHERE quiz_id = ? ORDER BY date DESC"
    )
    .all(req.params.id);
  res.json(rows);
});

// Crée un quiz depuis l'app (formulaire de l'onglet Quiz). Corps :
// { month, title, questions: [{ prompt, options: [{id, text}], correct, explanation }] }
app.post("/api/quizzes", (req, res) => {
  const { month, title, questions } = req.body;
  if (!title || !Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ error: "title et au moins une question sont obligatoires." });
  }
  for (const q of questions) {
    if (!q.prompt || !Array.isArray(q.options) || q.options.length < 2 || !q.correct) {
      return res.status(400).json({ error: "Chaque question doit avoir un énoncé, au moins 2 options et une réponse correcte." });
    }
  }
  const insertQuiz = db.prepare("INSERT INTO quizzes (month, title) VALUES (?, ?)");
  const insertQuestion = db.prepare(
    `INSERT INTO quiz_questions (quiz_id, prompt, options_json, correct_option_id, explanation, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const create = db.transaction(() => {
    const quizId = insertQuiz.run(month || null, title).lastInsertRowid;
    questions.forEach((q, i) => {
      insertQuestion.run(
        quizId,
        q.prompt,
        JSON.stringify(q.options),
        q.correct,
        q.explanation || "",
        i
      );
    });
    return quizId;
  });
  const id = create();
  res.status(201).json({ id });
});

// Supprime un quiz, ses questions et son historique de tentatives.
app.delete("/api/quizzes/:id", (req, res) => {
  const del = db.transaction((id) => {
    db.prepare("DELETE FROM quiz_attempts WHERE quiz_id = ?").run(id);
    db.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(id);
    db.prepare("DELETE FROM quizzes WHERE id = ?").run(id);
  });
  del(req.params.id);
  res.json({ ok: true });
});

/* ================= SUGGESTION IA ================= */
// Une seule ligne en cache (table ai_insights) : régénérée uniquement quand
// la personne clique sur "Actualiser" dans l'onglet Bilan, jamais toute seule.

app.get("/api/insights", (req, res) => {
  const row = db.prepare("SELECT content, created_at FROM ai_insights WHERE id = 1").get();
  res.json(row || null);
});

app.post("/api/insights/refresh", async (req, res) => {
  try {
    const milestones = db.prepare("SELECT label, status FROM milestones ORDER BY sort_order ASC").all();
    const chapters = db.prepare("SELECT module, label, status FROM programme_chapters ORDER BY sort_order ASC").all();
    const recentAttempts = db
      .prepare(
        `SELECT q.title AS title, a.score_pct, a.date
         FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
         ORDER BY a.date DESC LIMIT 8`
      )
      .all();
    const content = await ai.generateNextStepSuggestion({ milestones, chapters, recentAttempts });
    db.prepare(
      `INSERT INTO ai_insights (id, content, created_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`
    ).run(content);
    res.json({ content, created_at: new Date().toISOString() });
  } catch (e) {
    res.status(e.statusCode || 502).json({ error: e.message });
  }
});

/* ================= RESET (protégé) ================= */

// Efface toutes les données. Nécessite d'envoyer { confirm: "EFFACER" }
// pour éviter un appel accidentel.
app.post("/api/reset", (req, res) => {
  if (req.body.confirm !== "EFFACER") {
    return res.status(400).json({ error: "Confirmation manquante." });
  }
  db.exec(`
    DELETE FROM journal_entries;
    DELETE FROM week_tasks;
    DELETE FROM schedule_slots;
    DELETE FROM month_scores;
    DELETE FROM dashboard_status;
    DELETE FROM quiz_attempts;
    DELETE FROM ai_insights;
    UPDATE milestones SET status = 'Pas commencé';
    UPDATE programme_chapters SET status = 'Pas commencé';
  `);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Grand livre — serveur lancé sur http://localhost:${PORT}`);
});
