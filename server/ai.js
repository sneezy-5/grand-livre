// ai.js
// Toutes les fonctions qui appellent l'IA (via OpenRouter, API compatible
// OpenAI) vivent ici, séparées des routes Express. Pas de SDK supplémentaire :
// juste fetch(), comme le reste du projet. Chaque fonction lève une erreur
// avec .statusCode explicite — server.js n'a qu'à la propager en JSON { error }.
//
// Rien ici ne s'exécute automatiquement : ce module n'est sollicité que
// lorsqu'une route liée à l'IA est appelée, elle-même déclenchée uniquement
// par un clic explicite côté interface (jamais en arrière-plan).

require("dotenv").config();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;
// Vérifie que ce modèle existe encore sur https://openrouter.ai/models —
// change OPENROUTER_MODEL dans .env pour en utiliser un autre.
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

function fail(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode || 502;
  return err;
}

function ensureConfigured() {
  if (!API_KEY) {
    throw fail(
      "OPENROUTER_API_KEY n'est pas configurée sur le serveur (voir server/.env.example).",
      503
    );
  }
}

// Extrait le premier bloc JSON d'une réponse texte, au cas où le modèle
// l'aurait entouré de ```json ... ``` malgré la consigne de ne renvoyer que du JSON.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  return raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
}

async function askText(prompt, maxTokens) {
  ensureConfigured();
  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Grand livre"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens || 2000,
        messages: [{ role: "user", content: prompt }]
      })
    });
  } catch (e) {
    throw fail("Impossible de joindre OpenRouter : " + e.message, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw fail("Erreur OpenRouter : " + (data.error?.message || res.status), res.status);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw fail("Réponse IA vide.", 502);
  return text;
}

function validateQuizShape(data) {
  if (!data || typeof data.title !== "string" || !Array.isArray(data.questions) || !data.questions.length) {
    throw fail("Réponse IA invalide : format de quiz inattendu.", 502);
  }
  data.questions.forEach((q) => {
    if (
      typeof q.prompt !== "string" ||
      !Array.isArray(q.options) ||
      q.options.length < 2 ||
      !q.options.every((o) => o && typeof o.id === "string" && typeof o.text === "string") ||
      typeof q.correct !== "string" ||
      !q.options.some((o) => o.id === q.correct) ||
      typeof q.explanation !== "string"
    ) {
      throw fail("Réponse IA invalide : question mal formée.", 502);
    }
  });
}

// Génère un quiz de contrôle pour un chapitre du Programme.
// `chapter` : { label, description, module, month_label }
async function generateQuiz(chapter, questionCount) {
  const n = questionCount || 6;
  const prompt = `Tu es un pédagogue expert dans le domaine du module ci-dessous, quel qu'il soit
(comptabilité, langue, développement, préparation de concours, gestion de projet...), qui prépare
des quiz de contrôle pour un(e) apprenant(e) autodidacte qui suit un curriculum personnel.

Module : "${chapter.module}"
Chapitre : "${chapter.label}"
Description du chapitre : "${chapter.description || "Non précisée — déduis le contenu du titre."}"

Écris un quiz de contrôle de ${n} questions à choix multiples en français, en te basant strictement
sur ce que ce chapitre est censé couvrir. Chaque question doit avoir exactement 4 options plausibles
(une seule correcte), et une explication claire et concise de la bonne réponse. Varie la difficulté
(quelques questions de compréhension simple, quelques-unes plus fines). N'invente pas de contexte
hors sujet.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, exactement dans cette forme :
{
  "title": "titre court et descriptif du quiz",
  "questions": [
    {
      "prompt": "énoncé de la question",
      "options": [{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],
      "correct": "b",
      "explanation": "pourquoi c'est la bonne réponse"
    }
  ]
}`;

  const text = await askText(prompt, 4000);
  let data;
  try {
    data = JSON.parse(extractJson(text));
  } catch (e) {
    throw fail("Réponse IA invalide : JSON illisible.", 502);
  }
  validateQuizShape(data);
  return data;
}

// Feedback ciblé après une tentative de quiz. `results` = le tableau déjà
// calculé côté serveur par /api/quizzes/:id/attempt (given/correct_option_id/
// is_correct/explanation par question).
async function generateFeedback(quizTitle, results) {
  const missed = results.filter((r) => !r.is_correct);
  const summary = results
    .map((r, i) => `${i + 1}. ${r.is_correct ? "Correct" : "Incorrect"} — ${r.explanation}`)
    .join("\n");

  const prompt = `Un(e) apprenant(e) autodidacte vient de terminer le quiz "${quizTitle}". Voici le
résultat détaillé, question par question :

${summary}

${missed.length === 0
    ? "Toutes les réponses sont correctes."
    : `${missed.length} question(s) sur ${results.length} sont incorrectes.`}

En 2 à 4 phrases, en français, donne un retour bienveillant mais concret et actionnable : félicite
sincèrement si le score est bon, identifie précisément le ou les points qui semblent mal maîtrisés
s'il y a des erreurs (pas de généralités vagues), et suggère quoi revoir. Pas de formule d'ouverture
type "Bonjour" ni de signature — juste le retour, directement.`;

  return (await askText(prompt, 500)).trim();
}

// Suggestion "quoi étudier ensuite", à partir d'un instantané de la
// progression (jalons, chapitres du Programme, scores de quiz récents).
async function generateNextStepSuggestion({ milestones, chapters, recentAttempts }) {
  const milestonesSummary = milestones.map((m) => `- ${m.label} : ${m.status}`).join("\n");
  const chaptersSummary = chapters
    .map((c) => `- [${c.module}] ${c.label} : ${c.status}`)
    .join("\n");
  const attemptsSummary = recentAttempts.length
    ? recentAttempts.map((a) => `- ${a.title} : ${a.score_pct}% (${a.date})`).join("\n")
    : "Aucune tentative de quiz enregistrée pour l'instant.";

  const prompt = `Voici l'état d'avancement d'un(e) apprenant(e) autodidacte sur son curriculum
personnel (potentiellement plusieurs domaines en parallèle), réparti en jalons et en chapitres :

Jalons :
${milestonesSummary}

Chapitres du programme :
${chaptersSummary}

Tentatives de quiz récentes :
${attemptsSummary}

En 3 à 5 phrases, en français, dis concrètement sur quoi se concentrer ensuite : quel(s)
chapitre(s) non terminé(s) prioriser, et s'il y a des scores de quiz faibles, quoi revoir en
premier. Sois précis (cite les titres exacts des chapitres/quiz concernés), pas de conseil
générique du type "continue comme ça". Pas de formule d'ouverture ni de signature.`;

  return (await askText(prompt, 600)).trim();
}

const VALID_DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function validateObjectivePlanShape(data) {
  const daysValid =
    data.schedule &&
    (data.schedule.days === null ||
      (Array.isArray(data.schedule.days) &&
        data.schedule.days.length &&
        data.schedule.days.every((d) => VALID_DAY_NAMES.includes(d))));
  if (
    !data ||
    typeof data.module !== "string" ||
    !Array.isArray(data.chapters) ||
    data.chapters.length < 2 ||
    !data.schedule ||
    !daysValid ||
    typeof data.schedule.duration_minutes !== "number" ||
    (data.schedule.start_time !== null && typeof data.schedule.start_time !== "string")
  ) {
    throw fail("Réponse IA invalide : format de plan inattendu.", 502);
  }
  data.chapters.forEach((c) => {
    if (typeof c.label !== "string" || typeof c.description !== "string") {
      throw fail("Réponse IA invalide : chapitre mal formé.", 502);
    }
    // "resources" est optionnel (l'IA peut l'omettre, ou renvoyer null quand
    // elle n'a rien de fiable à suggérer) — validé seulement s'il est un
    // tableau réellement présent, jamais bloquant sinon.
    if (c.resources !== undefined && c.resources !== null) {
      const validTypes = ["gratuit", "payant", "gratuit/payant"];
      if (
        !Array.isArray(c.resources) ||
        !c.resources.every(
          (r) => r && typeof r.name === "string" && validTypes.includes(r.type) && typeof r.note === "string"
        )
      ) {
        throw fail("Réponse IA invalide : ressources mal formées.", 502);
      }
    }
  });
}

// Découpe un objectif en chapitres à partir d'un message libre, et propose
// un planning (jours/durée/heure). Le calcul des dates réelles reste côté
// serveur (server.js) — l'IA ne fait que le découpage pédagogique et lire
// les préférences de l'apprenant(e), pas le calendrier lui-même.
async function generateObjectivePlan(message) {
  const prompt = `Tu es un pédagogue expert, capable de concevoir un parcours d'apprentissage
structuré dans absolument n'importe quel domaine — comptabilité, langue étrangère, développement
logiciel, préparation à un concours administratif, gestion de projet, etc. Adapte entièrement ton
expertise et ton vocabulaire au domaine de l'objectif ci-dessous, quel qu'il soit.

Message de l'apprenant(e), décrivant son objectif (et parfois ses disponibilités) :
"${message}"

Étape 1 — Découpe cet objectif en un module de chapitres progressifs (entre 4 et 10 chapitres
selon l'ampleur réelle de l'objectif — ne force pas un nombre rond, adapte-toi au contenu). Chaque
chapitre doit être une étape concrète et autonome, dans un ordre pédagogique logique (du plus
fondamental au plus avancé pour un cours théorique, ou du plus structurant au plus spécifique
pour un projet à développer). Donne à chacun un titre court et une description d'une phrase
précisant ce qu'il couvre.

Si le message cite un programme, référentiel, syllabus, manuel, plan de cours ou examen précis à
suivre (ex. "le programme du DCG UE9", "le référentiel du concours X", "le sommaire du livre Y",
"le plan officiel de tel diplôme"), utilise cette référence comme structure prioritaire : reprends
ses grandes parties comme trame des chapitres plutôt que d'improviser un découpage générique. Si
aucune référence n'est donnée, construis le découpage toi-même à partir de ton expertise du domaine.

Pour CHAQUE chapitre, recommande aussi 1 à 3 ressources externes réelles et pertinentes pour
l'étudier (cours en ligne, chaîne ou vidéo, plateforme d'apprentissage, livre de référence...),
en mélangeant gratuit et payant quand c'est pertinent plutôt que de toujours proposer la même
chose — adapte au domaine (ex. langue : Duolingo, italki, YouTube ; programmation : freeCodeCamp,
Udemy, la documentation officielle ; comptabilité/gestion : OpenClassrooms, Coursera, un manuel de
référence ; concours : annales officielles, une prépa en ligne). Le champ "type" de chaque ressource
doit valoir EXACTEMENT "gratuit", "payant", ou "gratuit/payant" (pour une plateforme freemium,
gratuite avec un palier payant, ex. Duolingo) — jamais une autre valeur. N'invente jamais une URL
précise — cite seulement le nom de la plateforme/du cours/du livre, jamais un lien. Si tu ne connais
aucune ressource fiable et pertinente pour un chapitre donné, laisse "resources" à un tableau vide
plutôt que d'inventer un nom qui n'existe pas.

Étape 2 — Propose un planning pour étudier ces chapitres (une session par chapitre) :
- "days" : les jours de la semaine à utiliser, parmi Lundi/Mardi/Mercredi/Jeudi/Vendredi/Samedi/Dimanche.
  Déduis-les UNIQUEMENT si le message donne une indication de fréquence ou de jours, même
  approximative (ex. "tous les jours" → les 7 jours, "le week-end" → Samedi/Dimanche, "3 fois par
  semaine" → 3 jours non consécutifs de ton choix, "les soirs de semaine" → Lundi à Vendredi). Si le
  message ne dit vraiment rien sur la fréquence ou les jours, mets "days" à null plutôt que
  d'inventer un rythme — ce point sera alors demandé séparément à l'apprenant(e), exactement comme
  pour l'heure ci-dessous.
- "duration_minutes" : la durée d'une session, en minutes. Si le message la précise, utilise-la.
  Sinon choisis une durée raisonnable selon la nature du chapitre (ex. 30 à 60).
- "start_time" : l'heure de la session, au format "HH:MM". Déduis-la UNIQUEMENT si le message
  donne une indication d'horaire, même approximative (ex. "le soir" → "19:00", "le matin" → "08:00",
  "à midi" → "12:30", "après le travail" → "19:00", "19h" → "19:00"). Si le message ne dit
  vraiment rien sur le moment de la journée, mets "start_time" à null plutôt que d'inventer une
  heure — ce point sera alors demandé séparément à l'apprenant(e).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, exactement dans cette forme :
{
  "module": "nom du module (court, descriptif)",
  "chapters": [
    {
      "label": "titre du chapitre",
      "description": "une phrase sur ce qu'il couvre",
      "resources": [
        {"name": "nom de la plateforme, du cours ou du livre", "type": "gratuit", "note": "pourquoi ce choix, une phrase"},
        {"name": "...", "type": "payant", "note": "..."}
      ]
    }
  ],
  "schedule": {
    "days": ["Lundi", "Mercredi", "Vendredi"],
    "duration_minutes": 45,
    "start_time": "19:00"
  }
}`;

  const text = await askText(prompt, 3000);
  let data;
  try {
    data = JSON.parse(extractJson(text));
  } catch (e) {
    throw fail("Réponse IA invalide : JSON illisible.", 502);
  }
  validateObjectivePlanShape(data);
  return data;
}

module.exports = {
  isConfigured: !!API_KEY,
  generateQuiz,
  generateFeedback,
  generateNextStepSuggestion,
  generateObjectivePlan
};
