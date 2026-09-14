// app.js
// SPA en Vue 3 (chargé depuis un CDN dans index.html, pas de build).
// Le fichier est découpé en 4 composants — un par onglet — plus un
// composant racine qui gère la navigation et une bannière d'erreur
// partagée. Chaque composant appelle directement l'API REST du
// serveur (voir server/server.js) : pas d'état caché ailleurs.

const { createApp, reactive, ref, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;

/* ================= constantes partagées ================= */

// À partir des chapitres Programme d'un module : Maîtrisé si tous terminés,
// Débutant si rien de terminé mais au moins un "En cours", En progression
// sinon dès qu'un chapitre est terminé, Pas commencé si le module est vide
// ou que rien n'a démarré.
function autoDomainStatus(chapters) {
  if (!chapters.length) return "Pas commencé";
  const total = chapters.length;
  const done = chapters.filter(c => c.status === "Terminé").length;
  const started = chapters.filter(c => c.status !== "Pas commencé").length;
  if (done === total) return "Maîtrisé";
  if (done > 0) return "En progression";
  if (started > 0) return "Débutant";
  return "Pas commencé";
}
const STATUS_STYLE = {
  "Pas commencé": { bg: "var(--grey-status-bg)", fg: "var(--grey-status)" },
  "Débutant": { bg: "var(--anglais-bg)", fg: "var(--anglais)" },
  "En progression": { bg: "var(--tech-bg)", fg: "var(--tech)" },
  "Maîtrisé": { bg: "var(--finance-bg)", fg: "var(--finance)" },
  "À revoir": { bg: "var(--projet-bg)", fg: "var(--projet)" }
};
const MS_CYCLE = ["Pas commencé", "En cours", "Atteint"];
const MS_STYLE = {
  "Pas commencé": { bg: "var(--grey-status-bg)", fg: "var(--grey-status)" },
  "En cours": { bg: "var(--tech-bg)", fg: "var(--tech)" },
  "Atteint": { bg: "var(--finance-bg)", fg: "var(--finance)" }
};
const CHAPTER_CYCLE = ["Pas commencé", "En cours", "Terminé"];
const CHAPTER_STYLE = {
  "Pas commencé": { bg: "var(--grey-status-bg)", fg: "var(--grey-status)" },
  "En cours": { bg: "var(--tech-bg)", fg: "var(--tech)" },
  "Terminé": { bg: "var(--finance-bg)", fg: "var(--finance)" }
};
// Chaque objectif (module) a sa propre couleur, pour qu'on distingue au
// premier coup d'œil compta / anglais / projet fintech / concours etc. sans
// avoir à lire le badge — un hash déterministe du nom du module, réparti sur
// la palette. Ça marche pour n'importe quel module, y compris ceux que l'IA
// vient de créer à partir d'un objectif libre.
const PALETTE_KEYS = ["finance", "anglais", "concours", "tech", "projet"];
function moduleColorKey(moduleName) {
  let hash = 0;
  for (let i = 0; i < moduleName.length; i++) hash = (hash * 31 + moduleName.charCodeAt(i)) >>> 0;
  return PALETTE_KEYS[hash % PALETTE_KEYS.length];
}
function moduleStyle(moduleName) {
  const key = moduleColorKey(moduleName);
  return { bg: "var(--" + key + "-bg)", fg: "var(--" + key + ")" };
}
const MONTHS = ["Sept. 2026", "Oct. 2026", "Nov. 2026", "Déc. 2026", "Janv. 2027", "Fév. 2027",
  "Mars 2027", "Avr. 2027", "Mai 2027", "Juin 2027", "Juil. 2027", "Août 2027",
  "Sept. 2027", "Oct. 2027", "Nov. 2027", "Déc. 2027"];
const SCORE_FIELDS = [
  { id: "finance", label: "Finance" },
  { id: "concours", label: "Concours" },
  { id: "anglais", label: "Anglais" },
  { id: "tech", label: "Tech" },
  { id: "projet", label: "Projet" }
];

const NAV_ICONS = {
  jour: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l1.1-4.4 10.6-10.6a1.5 1.5 0 0 1 2.1 0l1.2 1.2a1.5 1.5 0 0 1 0 2.1L8.4 18.9 4 20z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  semaine: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 9.5h17M8 3v3M16 3v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7.5 13.2l2 2 3.2-3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  emploi: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.3" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5V12l3.2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calendrier: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 9.5h17M8 3v3M16 3v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.3" cy="13.4" r="1.15" fill="currentColor"/><circle cx="12" cy="13.4" r="1.15" fill="currentColor"/><circle cx="15.7" cy="13.4" r="1.15" fill="currentColor"/><circle cx="8.3" cy="17" r="1.15" fill="currentColor"/><circle cx="12" cy="17" r="1.15" fill="currentColor"/></svg>',
  programme: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5c2-1 5-1 7 .5v13c-2-1.5-5-1.5-7-.5v-13zM18 5.5c-2-1-5-1-7 .5v13c2-1.5 5-1.5 7-.5v-13z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  mois: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.3" stroke="currentColor" stroke-width="1.6"/><path d="M9.6 9.4a2.4 2.4 0 1 1 3.4 2.2c-.9.5-1 .9-1 1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="16.6" r="1" fill="currentColor"/></svg>',
  bilan: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.3" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.6" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>'
};

function growTextarea(el) {
  requestAnimationFrame(() => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  });
}
const vAutoGrow = { mounted: growTextarea, updated: growTextarea };

function escapeHtml(s) {
  return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function iconFor(status) {
  if (status === "done" || status === "Maîtrisé" || status === "Atteint" || status === "Terminé") {
    return '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 10.3l2.3 2.3 4.7-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (status === "partial" || status === "En progression" || status === "En cours" || status === "Débutant") {
    return '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
  }
  return '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 3"/></svg>';
}
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}
function fmtShort(d) { return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

/* ================= dialogue de confirmation ================= */
// Remplace window.confirm() par une vraie fenêtre modale, cohérente avec le
// reste du design. État partagé + fonction askConfirm() utilisable depuis
// n'importe quel composant ; <ConfirmDialog/> (montée une fois dans App)
// affiche la modale correspondante.

const confirmState = reactive({ open: false, message: "" });
let confirmResolve = null;

function askConfirm(message) {
  return new Promise((resolve) => {
    confirmState.message = message;
    confirmState.open = true;
    confirmResolve = resolve;
  });
}

const ConfirmDialog = {
  setup() {
    function answer(value) {
      confirmState.open = false;
      if (confirmResolve) { confirmResolve(value); confirmResolve = null; }
    }
    return { confirmState, answer };
  },
  template: `
    <div v-if="confirmState.open" class="modal-backdrop" @click.self="answer(false)">
      <div class="modal-box" role="alertdialog" aria-modal="true">
        <p class="modal-message">{{ confirmState.message }}</p>
        <div class="modal-actions">
          <button class="btn-quiet" @click="answer(false)">Annuler</button>
          <button class="btn-ink" @click="answer(true)">Confirmer</button>
        </div>
      </div>
    </div>
  `
};

/* ================= client API ================= */
// Petit wrapper autour de fetch : lève une erreur lisible si la requête
// échoue, pour que chaque composant puisse l'afficher dans la bannière.

const apiState = reactive({ error: null });

async function apiGet(path) {
  try {
    const res = await fetch("/api" + path);
    if (!res.ok) throw new Error("Réponse " + res.status);
    apiState.error = null;
    return await res.json();
  } catch (e) {
    apiState.error = "Impossible de contacter le serveur (" + path + "). Vérifie que le serveur Express tourne.";
    throw e;
  }
}
async function apiPost(path, body) {
  try {
    const res = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Réponse " + res.status);
    apiState.error = null;
    return await res.json();
  } catch (e) {
    apiState.error = "Échec de l'enregistrement (" + path + "). Réessaie dans un instant.";
    throw e;
  }
}
async function apiDelete(path) {
  try {
    const res = await fetch("/api" + path, { method: "DELETE" });
    if (!res.ok) throw new Error("Réponse " + res.status);
    apiState.error = null;
    return await res.json();
  } catch (e) {
    apiState.error = "Échec de la suppression (" + path + "). Réessaie dans un instant.";
    throw e;
  }
}

// Appels aux routes IA : contrairement à apiPost, l'erreur n'alimente pas la
// bannière globale — elle est renvoyée telle quelle (message du serveur,
// ex. "clé manquante") pour être affichée juste à côté du bouton IA concerné.
async function aiPost(path, body) {
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur IA.");
  return data;
}

/* ================= store partagé : chapitres du Programme ================= */
// ProgrammeTab, BilanTab et EmploiDuTempsTab lisent tous les trois la
// progression du curriculum. Plutôt que chacun refasse son propre fetch
// (donnant l'impression trompeuse que "ça se met à jour" seulement parce
// qu'on re-télécharge à chaque changement d'onglet), ils partagent le même
// tableau réactif : une mutation faite par l'un (ex. glisser une carte dans
// Programme) est immédiatement visible par les autres, sans round-trip
// réseau — de la vraie réactivité Vue, pas un rechargement déguisé.
const programmeStore = reactive({ chapters: [], loaded: false, loading: false });

async function loadProgrammeChapters(force) {
  if (programmeStore.loaded && !force) return programmeStore.chapters;
  programmeStore.loading = true;
  try {
    programmeStore.chapters = await apiGet("/programme");
    programmeStore.loaded = true;
  } finally {
    programmeStore.loading = false;
  }
  return programmeStore.chapters;
}

/* ================= composant : Aujourd'hui ================= */
// Écran d'accueil : la ou les leçons du jour (chapitres du Programme dont
// la date planifiée est arrivée), avec l'exercice (quiz IA) directement
// intégré — pas de journal à remplir, pas d'autre onglet à visiter pour
// valider un chapitre. Les prochaines leçons sont listées en aperçu,
// verrouillées tant que leur date n'est pas là.

const AujourdhuiTab = {
  setup() {
    const due = ref([]);
    const upcoming = ref([]);
    const loading = ref(true);
    const passThreshold = ref(70);

    // État du quiz tenu par chapitre (et non global) : plusieurs leçons du
    // jour peuvent venir d'objectifs différents (compta, anglais, projet…)
    // et chacune avance indépendamment.
    const quizzes = reactive({});
    const answersMap = reactive({});
    const resultsMap = reactive({});
    const missingAnswerMap = reactive({});
    const submittingMap = reactive({});
    const generatingQuizFor = ref(null);
    const quizGenError = reactive({});

    async function load() {
      loading.value = true;
      try {
        const [res] = await Promise.all([apiGet("/today"), loadProgrammeChapters()]);
        due.value = res.due;
        upcoming.value = res.upcoming;
        passThreshold.value = res.pass_threshold;
        await Promise.all(
          due.value
            .filter((c) => c.quiz_id && c.status !== "Pas commencé")
            .map(async (c) => {
              quizzes[c.id] = await apiGet("/quizzes/" + c.quiz_id);
              answersMap[c.id] = {};
            })
        );
      } finally {
        loading.value = false;
      }
    }

    // Contexte "objectif" (module) affiché sur chaque carte, pour que le
    // lien programme → cours du jour → quiz soit visible, pas juste su.
    function moduleProgress(moduleName) {
      const list = programmeStore.chapters.filter((c) => c.module === moduleName);
      const done = list.filter((c) => c.status === "Terminé").length;
      return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
    }

    // Étape 1 : marquer le cours comme étudié (Pas commencé → En cours) —
    // distincte de la validation par quiz, pour que le geste "j'ai fini
    // d'apprendre" soit explicite avant de passer à l'exercice.
    async function markStudied(c) {
      c.status = "En cours";
      const chapter = programmeStore.chapters.find((x) => x.id === c.id);
      if (chapter) chapter.status = "En cours";
      // Un quiz avait peut-être déjà été généré avant ce passage à "En
      // cours" (ex. régénéré depuis Programme) — il n'a alors jamais été
      // chargé par load(), qui ne le fait que pour les chapitres déjà "En
      // cours" au moment du chargement de la page.
      if (c.quiz_id && !quizzes[c.id]) {
        quizzes[c.id] = await apiGet("/quizzes/" + c.quiz_id);
        answersMap[c.id] = {};
      }
      await apiPost("/programme/" + c.id, { status: "En cours" });
    }

    async function generateQuizFor(c) {
      generatingQuizFor.value = c.id;
      delete quizGenError[c.id];
      try {
        const created = await aiPost("/programme/" + c.id + "/generate-quiz");
        c.quiz_id = created.id;
        quizzes[c.id] = await apiGet("/quizzes/" + created.id);
        answersMap[c.id] = {};
      } catch (e) {
        quizGenError[c.id] = e.message;
      } finally {
        generatingQuizFor.value = null;
      }
    }

    async function submitQuiz(c) {
      const quiz = quizzes[c.id];
      const answers = answersMap[c.id];
      const unanswered = quiz.questions.some((q) => !answers[q.id]);
      if (unanswered) { missingAnswerMap[c.id] = true; return; }
      missingAnswerMap[c.id] = false;
      submittingMap[c.id] = true;
      try {
        resultsMap[c.id] = await apiPost("/quizzes/" + c.quiz_id + "/attempt", { answers: { ...answers } });
        if (resultsMap[c.id].chapter_completed) {
          const chapter = programmeStore.chapters.find((x) => x.id === c.id);
          if (chapter) chapter.status = "Terminé";
          await load();
        }
      } finally {
        submittingMap[c.id] = false;
      }
    }

    function retryQuiz(c) {
      delete resultsMap[c.id];
      missingAnswerMap[c.id] = false;
      answersMap[c.id] = {};
    }

    function resultFor(c, questionId) {
      const r = resultsMap[c.id];
      return r ? r.results.find((x) => x.questionId === questionId) : null;
    }
    function optionStyle(c, question, option) {
      const r = resultsMap[c.id];
      if (!r) return {};
      const rf = resultFor(c, question.id);
      if (option.id === rf.correct_option_id) return { borderColor: "var(--finance)", background: "var(--finance-bg)" };
      if (option.id === rf.given && !rf.is_correct) return { borderColor: "var(--projet)", background: "var(--projet-bg)" };
      return {};
    }

    onMounted(load);

    return {
      due, upcoming, loading, passThreshold, quizzes, answersMap, resultsMap,
      missingAnswerMap, submittingMap, generatingQuizFor, quizGenError, moduleProgress, markStudied,
      generateQuizFor, submitQuiz, retryQuiz, resultFor, optionStyle, moduleStyle
    };
  },
  template: `
    <section class="folio">
      <div class="ledger-card today-head">
        <div>
          <h2 style="margin:0 0 4px">Aujourd'hui</h2>
          <p class="folio-sub" style="margin:0">
            {{ loading ? "Chargement…" : (due.length ? "À enchaîner dans l'ordre que tu veux" : "Rien de prévu aujourd'hui") }}
          </p>
        </div>
        <div v-if="!loading && due.length" class="today-head-count">{{ due.length }}</div>
      </div>

      <template v-if="!loading">
        <div v-if="!due.length" class="ledger-card">
          <p class="empty" style="padding:0">
            <template v-if="upcoming.length">Prochaine leçon : {{ upcoming[0].label }} ({{ upcoming[0].date_label }}).</template>
            <template v-else>Aucune leçon planifiée — crée un objectif dans l'onglet Programme pour commencer.</template>
          </p>
        </div>

        <div v-if="due.length" class="today-grid">
        <div v-for="c in due" :key="c.id" class="ledger-card today-lesson"
          :style="{'--m-color': moduleStyle(c.module).fg, '--m-bg': moduleStyle(c.module).bg}">
          <div class="today-lesson-top">
            <span class="today-lesson-badge">{{ c.module }}</span>
            <span class="today-lesson-date">{{ c.date_label }}</span>
          </div>
          <h2 class="today-lesson-title">{{ c.label }}</h2>

          <div class="today-lesson-progress">
            <div class="programme-progress-track">
              <div class="programme-progress-fill" :style="{width: moduleProgress(c.module).pct + '%'}"></div>
            </div>
            <span class="today-lesson-progress-label">{{ moduleProgress(c.module).done }}/{{ moduleProgress(c.module).total }}</span>
          </div>

          <p v-if="c.description" class="today-lesson-desc">{{ c.description }}</p>

          <div v-if="c.status === 'Pas commencé'" class="today-lesson-action">
            <p class="today-lesson-hint">Étudie ce cours, puis reviens valider ici.</p>
            <button class="btn-lesson" @click="markStudied(c)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              J'ai terminé d'apprendre ce cours
            </button>
          </div>

          <div v-else-if="!c.quiz_id" class="today-lesson-action">
            <p class="today-lesson-hint">Cours étudié — passe le quiz pour valider et débloquer le suivant.</p>
            <button class="btn-lesson" :disabled="generatingQuizFor === c.id" @click="generateQuizFor(c)">
              <span v-if="generatingQuizFor === c.id" class="btn-spinner"></span>
              <span v-else>✨</span>
              {{ generatingQuizFor === c.id ? "Génération…" : "Générer le quiz (IA)" }}
            </button>
            <p v-if="quizGenError[c.id]" class="ai-error">{{ quizGenError[c.id] }}</p>
          </div>

          <div v-else-if="quizzes[c.id]" class="today-lesson-action">
            <div v-for="(q,i) in quizzes[c.id].questions" :key="q.id" class="quiz-question">
              <p class="quiz-question-prompt">{{ i+1 }}. {{ q.prompt }}</p>
              <label v-for="opt in q.options" :key="opt.id" class="quiz-option"
                :class="{correct: resultsMap[c.id] && opt.id === resultFor(c, q.id).correct_option_id, incorrect: resultsMap[c.id] && opt.id === resultFor(c, q.id).given && !resultFor(c, q.id).is_correct}">
                <input type="radio" :name="'q'+q.id" :value="opt.id" v-model="answersMap[c.id][q.id]" :disabled="!!resultsMap[c.id]">
                <span>{{ opt.text }}</span>
              </label>
              <p v-if="resultsMap[c.id] && resultFor(c, q.id)" class="quiz-explanation">{{ resultFor(c, q.id).explanation }}</p>
            </div>

            <p v-if="missingAnswerMap[c.id]" class="ai-error">Réponds à toutes les questions avant de valider.</p>

            <button v-if="!resultsMap[c.id]" class="btn-lesson" :disabled="submittingMap[c.id]" @click="submitQuiz(c)">
              {{ submittingMap[c.id] ? "Correction…" : "Valider" }}
            </button>
            <template v-else>
              <div class="ai-card" :class="{'ai-card-neutral': !resultsMap[c.id].chapter_completed}">
                <p class="ai-card-text" style="margin:0">
                  <template v-if="resultsMap[c.id].chapter_completed">✓ Chapitre validé — passé à « Terminé ». Bravo !</template>
                  <template v-else>{{ resultsMap[c.id].score_pct }}% — il faut ≥{{ passThreshold }}% pour valider ce chapitre. Retente quand tu es prêt(e).</template>
                </p>
              </div>
              <button v-if="!resultsMap[c.id].chapter_completed" class="btn-quiet" style="margin-top:10px" @click="retryQuiz(c)">Refaire l'exercice</button>
            </template>
          </div>
        </div>
        </div>

        <div v-if="upcoming.length" class="ledger-card">
          <p class="folio-sub" style="margin:0 0 4px">🔒 À venir</p>
          <div v-for="c in upcoming" :key="c.id" class="today-upcoming-item">
            <span class="upcoming-dot" :style="{background: moduleStyle(c.module).fg}"></span>
            <div class="upcoming-main">
              <span class="upcoming-title">{{ c.label }}</span>
              <div class="upcoming-meta">{{ c.module }}</div>
            </div>
            <span class="today-lesson-date">{{ c.date_label }}</span>
          </div>
        </div>
      </template>
    </section>
  `
};

/* ================= composant : Programme ================= */
// Le curriculum détaillé : modules regroupant des chapitres, chacun avec
// un statut (Pas commencé / En cours / Terminé). CRUD complet + glisser-
// déposer pour réordonner ou déplacer un chapitre vers un autre module,
// même mécanique que les tâches de la semaine (SemaineTab).

const ProgrammeTab = {
  setup() {
    // Alias lecture/écriture vers le store partagé (voir plus haut) : tout
    // le code existant continue à lire/écrire `chapters.value` normalement,
    // mais ça retombe sur le même tableau réactif que Bilan et Emploi du
    // temps — une modification ici leur est visible instantanément.
    const chapters = computed({
      get: () => programmeStore.chapters,
      set: (v) => { programmeStore.chapters = v; }
    });
    const loading = ref(true);
    const newChapter = reactive({ module: "", label: "", description: "", month_label: "" });
    // Ordre des modules (pour les onglets filtre), figé au chargement et
    // complété si un nouveau module est créé.
    const moduleOrder = ref([]);
    const selectedModule = ref(null);

    async function load() {
      loading.value = true;
      try {
        await loadProgrammeChapters(true);
        const seen = [];
        chapters.value.forEach(c => { if (!seen.includes(c.module)) seen.push(c.module); });
        moduleOrder.value = seen;
        if (!selectedModule.value || !seen.includes(selectedModule.value)) selectedModule.value = seen[0] || null;
      } finally { loading.value = false; }
    }

    const modules = computed(() => moduleOrder.value);
    function chaptersFor(module) { return chapters.value.filter(c => c.module === module); }
    function moduleProgress(module) {
      const list = chaptersFor(module);
      const done = list.filter(c => c.status === "Terminé").length;
      return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
    }
    const overallProgress = computed(() => {
      const done = chapters.value.filter(c => c.status === "Terminé").length;
      return { done, total: chapters.value.length };
    });

    // ---- kanban : 3 colonnes = les 3 statuts, scopées au module sélectionné ----
    const columns = computed(() => CHAPTER_CYCLE.map(status => ({
      status, items: chaptersFor(selectedModule.value).filter(c => c.status === status)
    })));

    watch(selectedModule, m => { newChapter.module = m || ""; }, { immediate: true });

    async function saveChapterText(c) {
      await apiPost("/programme/" + c.id, { label: c.label, month_label: c.month_label });
    }
    async function moveChapterModule(c, newModule) {
      c.module = newModule;
      await apiPost("/programme/" + c.id, { module: newModule });
    }
    async function addChapter() {
      if (!newChapter.module.trim() || !newChapter.label.trim()) return;
      const moduleName = newChapter.module.trim();
      const created = await apiPost("/programme", {
        module: moduleName, label: newChapter.label.trim(),
        description: newChapter.description.trim(), month_label: newChapter.month_label.trim()
      });
      chapters.value.push({
        id: created.id, module: moduleName, label: newChapter.label.trim(),
        description: newChapter.description.trim(), month_label: newChapter.month_label.trim(),
        status: "Pas commencé", sort_order: chapters.value.length
      });
      if (!moduleOrder.value.includes(moduleName)) moduleOrder.value.push(moduleName);
      selectedModule.value = moduleName;
      newChapter.label = ""; newChapter.description = ""; newChapter.month_label = "";
    }
    async function removeChapter(c) {
      if (!(await askConfirm("Supprimer ce chapitre ?"))) return;
      await apiDelete("/programme/" + c.id);
      chapters.value = chapters.value.filter(x => x.id !== c.id);
    }

    // ---- génération de quiz par IA (OpenRouter), un chapitre à la fois ----
    const generatingQuizFor = ref(null);
    const quizGenError = reactive({});
    const quizGenDone = reactive({});
    async function generateQuizForChapter(c) {
      generatingQuizFor.value = c.id;
      delete quizGenError[c.id];
      try {
        await aiPost("/programme/" + c.id + "/generate-quiz");
        quizGenDone[c.id] = true;
      } catch (e) {
        quizGenError[c.id] = e.message;
      } finally {
        generatingQuizFor.value = null;
      }
    }

    // ---- drag-and-drop : les 3 colonnes de statut sont fixes, pas besoin
    // de réinitialiser Sortable au changement de module ou après ajout/suppression.
    // "Terminé" est verrouillé : on ne peut y entrer qu'en réussissant le
    // quiz du chapitre (voir QuizTab) — le glisser-déposer direct est refusé.
    const columnEls = {};
    let sortables = [];

    async function onChapterDrop(evt) {
      const destStatus = evt.to.dataset.status;
      const movedId = Number(evt.item.dataset.id);
      const moved = chapters.value.find(c => c.id === movedId);
      const statusChanged = moved && moved.status !== destStatus;
      if (moved) moved.status = destStatus;

      const allIds = [];
      CHAPTER_CYCLE.forEach(status => {
        const el = columnEls[status];
        if (!el) return;
        Array.from(el.children).forEach(child => allIds.push(Number(child.dataset.id)));
      });
      const byId = new Map(chapters.value.map(c => [c.id, c]));
      const reordered = allIds.map(id => byId.get(id)).filter(Boolean);
      const others = chapters.value.filter(c => c.module !== selectedModule.value);
      chapters.value = [...others, ...reordered];

      if (statusChanged) await apiPost("/programme/" + movedId, { status: destStatus });
      await apiPost("/programme-reorder", { module: selectedModule.value, order: allIds });
    }

    function initDragAndDrop() {
      sortables.forEach(s => s.destroy());
      sortables = CHAPTER_CYCLE.map(status => {
        const el = columnEls[status];
        if (!el) return null;
        return Sortable.create(el, {
          group: "programme-kanban",
          handle: ".drag-handle",
          animation: 150,
          forceFallback: true,
          onMove: (evt) => evt.to.dataset.status !== "Terminé",
          onEnd: onChapterDrop
        });
      }).filter(Boolean);
    }

    onBeforeUnmount(() => sortables.forEach(s => s.destroy()));
    onMounted(async () => { await load(); await nextTick(); initDragAndDrop(); });

    // ---- nouvel objectif : un simple message libre. L'IA découpe en
    // chapitres ET choisit elle-même les jours/durée par défaut ; elle ne
    // devine jamais l'heure sans indice dans le message — dans ce cas on la
    // demande ensuite (pendingTime), sans relancer l'IA une seconde fois.
    const showManualAdd = ref(false);
    const objectiveMessage = ref("");
    const objectiveLoading = ref(false);
    const objectiveError = ref(null);
    const pendingTime = ref(null); // { module, chapters, days, duration_minutes, chosenTime }
    // Historique affiché comme une conversation avec l'assistant : chaque
    // objectif soumis devient un échange (message envoyé + réponse de l'IA),
    // pour que la logique "je dis mon objectif → il construit le programme"
    // soit visible, pas juste un formulaire qui se vide silencieusement.
    const chatLog = ref([]);

    function applyCreatedObjective(module, createdChapters) {
      createdChapters.forEach((c, i) => {
        chapters.value.push({
          id: c.id, module, label: c.label, description: c.description,
          month_label: c.date_label, status: "Pas commencé", sort_order: chapters.value.length + i
        });
      });
      if (!moduleOrder.value.includes(module)) moduleOrder.value.push(module);
      selectedModule.value = module;
    }

    async function generateObjective() {
      if (!objectiveMessage.value.trim() || pendingTime.value) return;
      const title = objectiveMessage.value.trim();
      objectiveLoading.value = true;
      objectiveError.value = null;
      try {
        const res = await aiPost("/objectives/generate", { message: title });
        if (res.needs_time) {
          pendingTime.value = {
            module: res.module, chapters: res.chapters, days: res.days,
            duration_minutes: res.duration_minutes, chosenTime: "19:00"
          };
          chatLog.value.push({ title, askTime: true });
        } else {
          applyCreatedObjective(res.module, res.chapters);
          chatLog.value.push({
            title, module: res.module, count: res.chapters.length,
            firstDate: res.chapters[0] ? res.chapters[0].date_label : "",
            days: res.days, start_time: res.start_time, duration_minutes: res.duration_minutes
          });
        }
        objectiveMessage.value = "";
      } catch (e) {
        objectiveError.value = e.message;
        chatLog.value.push({ title, error: e.message });
      } finally {
        objectiveLoading.value = false;
      }
    }

    async function confirmPendingTime() {
      const draft = pendingTime.value;
      if (!draft) return;
      objectiveLoading.value = true;
      objectiveError.value = null;
      try {
        const res = await apiPost("/objectives/finalize", {
          module: draft.module, chapters: draft.chapters, days: draft.days,
          start_time: draft.chosenTime, duration_minutes: draft.duration_minutes
        });
        applyCreatedObjective(res.module, res.chapters);
        chatLog.value.push({
          title: draft.chosenTime, isTimeReply: true,
          module: res.module, count: res.chapters.length,
          firstDate: res.chapters[0] ? res.chapters[0].date_label : "",
          days: draft.days, start_time: draft.chosenTime, duration_minutes: draft.duration_minutes
        });
      } catch (e) {
        objectiveError.value = e.message;
      } finally {
        pendingTime.value = null;
        objectiveLoading.value = false;
      }
    }

    // Liste des programmes en cours, affichée à côté du chat — c'est elle
    // qui remplace les onglets-filtre pour choisir quel programme regarder.
    const objectivesPanel = computed(() => modules.value.map((m) => ({
      name: m, ...moduleProgress(m), style: moduleStyle(m)
    })));

    async function removeObjective(moduleName) {
      if (!(await askConfirm("Supprimer le programme « " + moduleName + " » et tous ses chapitres ?"))) return;
      await apiDelete("/programme/module/" + encodeURIComponent(moduleName));
      chapters.value = chapters.value.filter((c) => c.module !== moduleName);
      moduleOrder.value = moduleOrder.value.filter((m) => m !== moduleName);
      if (selectedModule.value === moduleName) selectedModule.value = moduleOrder.value[0] || null;
    }

    return {
      chapters, loading, modules, selectedModule, columns, moduleProgress, overallProgress,
      newChapter, saveChapterText, moveChapterModule, addChapter, removeChapter, columnEls,
      CHAPTER_STYLE, generatingQuizFor, quizGenError, quizGenDone, generateQuizForChapter,
      showManualAdd, objectiveMessage, objectiveLoading, objectiveError, generateObjective,
      pendingTime, confirmPendingTime, chatLog, objectivesPanel, moduleStyle, removeObjective
    };
  },
  template: `
    <section class="folio">
      <div class="programme-layout">
        <div class="programme-main">
        <div class="objective-list">
          <p class="folio-sub" style="margin:0 0 10px; padding:0 2px">Tes programmes</p>
          <p v-if="loading" class="loading-row" style="padding:0 2px">Chargement…</p>
          <template v-else>
            <div v-for="m in objectivesPanel" :key="m.name" class="objective-item" :class="{active: m.name === selectedModule}"
              :style="{'--m-color': m.style.fg, '--m-bg': m.style.bg}" @click="selectedModule = m.name">
              <span class="objective-item-dot"></span>
              <span class="objective-item-main">
                <span class="objective-item-name">{{ m.name }}</span>
                <span class="objective-item-meta">{{ m.done }}/{{ m.total }} chapitres</span>
              </span>
              <button class="icon-btn" title="Supprimer ce programme" @click.stop="removeObjective(m.name)">✕</button>
            </div>
            <p v-if="!objectivesPanel.length" class="empty" style="padding:6px 2px">Aucun programme pour l'instant — décris ton objectif à l'assistant.</p>
          </template>
        </div>

        <div class="ledger-card" v-if="!loading && selectedModule">
          <div class="folio-head">
            <div>
              <h2>{{ selectedModule }}</h2>
              <p class="folio-sub">{{ moduleProgress(selectedModule).done }}/{{ moduleProgress(selectedModule).total }} chapitres terminés · {{ overallProgress.done }}/{{ overallProgress.total }} au total</p>
            </div>
          </div>

          <div class="programme-progress-track"><div class="programme-progress-fill" :style="{width: moduleProgress(selectedModule).pct + '%'}"></div></div>

          <div class="kanban-board">
            <div v-for="col in columns" :key="col.status" class="kanban-column">
              <div class="kanban-column-head">
                <span class="kanban-column-title">
                  <span class="kanban-dot" :style="{background: CHAPTER_STYLE[col.status].fg}"></span>{{ col.status }}
                  <span v-if="col.status === 'Terminé'" title="Se valide uniquement en réussissant le quiz du chapitre (≥70%), pas de glisser-déposer direct">🔒</span>
                </span>
                <span class="kanban-column-count">{{ col.items.length }}</span>
              </div>
              <div class="kanban-cards" :data-status="col.status" :ref="el => columnEls[col.status] = el">
                <div v-for="c in col.items" :key="c.id" class="kanban-card" :data-id="c.id">
                  <div class="kanban-card-top">
                    <span class="drag-handle" title="Glisser pour réordonner ou changer de statut">⠿</span>
                    <div class="kanban-card-body">
                      <textarea class="kanban-card-title" rows="1" v-auto-grow v-model="c.label" @change="saveChapterText(c)"></textarea>
                      <p v-if="c.description" class="kanban-card-desc">{{ c.description }}</p>
                      <div class="kanban-card-meta">
                        <input type="text" class="kanban-card-input" v-model="c.month_label" @change="saveChapterText(c)" placeholder="Période">
                        <select class="kanban-card-select" :value="c.module" @change="moveChapterModule(c, $event.target.value)">
                          <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
                        </select>
                        <button class="icon-btn" title="Supprimer" @click="removeChapter(c)">✕</button>
                      </div>
                      <div class="ai-row">
                        <button class="btn-quiet" :disabled="generatingQuizFor === c.id" @click="generateQuizForChapter(c)">
                          {{ generatingQuizFor === c.id ? "Génération…" : (quizGenDone[c.id] ? "✓ Quiz créé — régénérer" : "✨ Générer un quiz IA") }}
                        </button>
                        <p v-if="quizGenError[c.id]" class="ai-error">{{ quizGenError[c.id] }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button class="btn-quiet" style="margin-top:14px" @click="showManualAdd = !showManualAdd">
            {{ showManualAdd ? "Fermer" : "+ Ajouter un chapitre manuellement" }}
          </button>
          <div class="programme-add" v-if="showManualAdd">
            <input type="text" v-model="newChapter.module" class="programme-add-wide" placeholder="Module (ex. Comptabilité générale)" list="programme-modules">
            <datalist id="programme-modules">
              <option v-for="m in modules" :key="m" :value="m"></option>
            </datalist>
            <input type="text" v-model="newChapter.label" class="programme-add-flex" placeholder="Titre du chapitre">
            <input type="text" v-model="newChapter.month_label" class="programme-add-month" placeholder="Période (ex. Mars 2027)">
            <input type="text" v-model="newChapter.description" class="programme-add-wide" placeholder="Description courte (optionnel)">
            <button class="btn-quiet" @click="addChapter">+ Ajouter un chapitre</button>
          </div>
        </div>
        </div>

        <div class="chat-slot">
        <div class="chat-card chat-card-side">
          <div class="chat-header">
            <div class="chat-avatar">🎓</div>
            <div>
              <strong style="font-size:14px">Assistant pédagogique</strong>
              <p class="folio-sub" style="margin:2px 0 0">Dis-lui ce que tu veux atteindre, il construit le programme.</p>
            </div>
          </div>

          <div class="chat-log">
            <div class="chat-bubble chat-bubble-assistant">
              Décris un objectif — comptabilité, anglais, un projet à développer, un concours administratif,
              n'importe quel domaine. Précise tes disponibilités si tu en as (jours, heure, durée) ; sinon
              je choisis un rythme raisonnable moi-même, et je ne te demande l'heure que si je n'ai vraiment
              aucun indice. Tu peux aussi me donner un programme, référentiel ou cours précis à suivre
              (ex. « le programme du DCG UE9 », « le plan du livre X ») — je structure les chapitres dessus.
            </div>
            <template v-for="(m,i) in chatLog" :key="i">
              <div class="chat-bubble chat-bubble-user">{{ m.title }}</div>
              <div v-if="m.askTime" class="chat-bubble chat-bubble-assistant">
                À quelle heure veux-tu recevoir ces sessions ?
              </div>
              <div v-else class="chat-bubble chat-bubble-assistant" :class="{'chat-bubble-error': m.error}">
                <template v-if="m.error">{{ m.error }}</template>
                <template v-else>
                  J'ai découpé ça en <strong>{{ m.count }} chapitres</strong> sous « {{ m.module }} ».
                  Planifié {{ m.days.join(', ') }} à {{ m.start_time }} ({{ m.duration_minutes }} min/session),
                  à partir du {{ m.firstDate }}. Ça t'attend dans Aujourd'hui à chaque date.
                </template>
              </div>
            </template>

            <div v-if="pendingTime" class="chat-time-reply">
              <input type="time" v-model="pendingTime.chosenTime">
              <button class="btn-quiet" :disabled="objectiveLoading" @click="confirmPendingTime">
                {{ objectiveLoading ? "…" : "Confirmer" }}
              </button>
            </div>

            <div v-if="objectiveLoading" class="chat-bubble chat-bubble-assistant chat-bubble-loading">
              <span class="btn-spinner btn-spinner-dark"></span> {{ pendingTime ? "Je planifie…" : "Je construis ton programme…" }}
            </div>
          </div>

          <div class="chat-composer">
            <textarea class="chat-input" v-model="objectiveMessage" rows="1" v-auto-grow :disabled="!!pendingTime"
              placeholder="Écris ton objectif, avec toutes les précisions utiles — ex. « Comprendre la fiscalité des entreprises, surtout la TVA et l'IS, je pars de zéro, le soir »…"
              @keydown.enter.exact.prevent="generateObjective"></textarea>
            <button class="btn-ink chat-send" :disabled="objectiveLoading || !objectiveMessage.trim() || !!pendingTime" @click="generateObjective">
              {{ objectiveLoading ? "Génération…" : "✨ Construire le programme" }}
            </button>
            <p v-if="objectiveError" class="ai-error">{{ objectiveError }}</p>
          </div>
        </div>
        </div>
      </div>
    </section>
  `
};

/* ================= composant : Bilan ================= */

const BilanTab = {
  setup() {
    // chapters lit le même tableau réactif que ProgrammeTab (voir
    // programmeStore plus haut) : une modification faite là-bas — y compris
    // pendant que Bilan reste affiché — recalcule `dashboard` toute seule,
    // sans refetch. `manualStatus` ne couvre que les domaines sans module
    // (Concours/Anglais/Technologie), les seuls encore modifiables à la main.
    // Les domaines ne sont plus une liste figée : chaque objectif créé dans
    // Programme (via l'assistant IA ou manuellement) EST un domaine ici,
    // avec un statut entièrement calculé depuis ses chapitres — plus besoin
    // de coder chaque domaine à l'avance ni de suivre certains à la main.
    const chapters = computed(() => programmeStore.chapters);
    const milestones = ref([]);
    const loading = ref(true);
    const newMilestone = reactive({ label: "", date_label: "" });

    function chaptersFor(moduleName) { return chapters.value.filter(c => c.module === moduleName); }
    const domainsPanel = computed(() => {
      const seen = [];
      chapters.value.forEach(c => { if (!seen.includes(c.module)) seen.push(c.module); });
      return seen.map(name => {
        const list = chaptersFor(name);
        const done = list.filter(c => c.status === "Terminé").length;
        return { name, done, total: list.length, status: autoDomainStatus(list), style: moduleStyle(name) };
      });
    });

    async function load() {
      loading.value = true;
      try {
        const [ms, ins] = await Promise.all([apiGet("/milestones"), apiGet("/insights")]);
        await loadProgrammeChapters();
        milestones.value = ms;
        insight.value = ins;
      } finally { loading.value = false; }
    }

    // ---- suggestion IA "quoi étudier ensuite" (OpenRouter), sur clic explicite ----
    const insight = ref(null);
    const insightLoading = ref(false);
    const insightError = ref(null);
    async function refreshInsight() {
      insightLoading.value = true;
      insightError.value = null;
      try {
        insight.value = await aiPost("/insights/refresh");
      } catch (e) {
        insightError.value = e.message;
      } finally {
        insightLoading.value = false;
      }
    }

    async function saveMilestoneText(m) {
      await apiPost("/milestones/" + m.id, { label: m.label, date_label: m.date_label });
    }
    async function addMilestone() {
      if (!newMilestone.label.trim() || !newMilestone.date_label.trim()) return;
      const created = await apiPost("/milestones", { label: newMilestone.label.trim(), date_label: newMilestone.date_label.trim() });
      milestones.value.push({ id: created.id, label: newMilestone.label.trim(), date_label: newMilestone.date_label.trim(), status: "Pas commencé", sort_order: milestones.value.length });
      newMilestone.label = ""; newMilestone.date_label = "";
    }
    async function removeMilestone(m) {
      if (!(await askConfirm("Supprimer ce jalon ?"))) return;
      await apiDelete("/milestones/" + m.id);
      milestones.value = milestones.value.filter(x => x.id !== m.id);
    }

    // ---- kanban : 3 colonnes = les 3 statuts de MS_CYCLE ----
    const columns = computed(() => MS_CYCLE.map(status => ({
      status, items: milestones.value.filter(m => m.status === status)
    })));
    const columnEls = {};
    let sortables = [];

    async function onMilestoneDrop(evt) {
      const destStatus = evt.to.dataset.status;
      const movedId = Number(evt.item.dataset.id);
      const moved = milestones.value.find(m => m.id === movedId);
      const statusChanged = moved && moved.status !== destStatus;
      if (moved) moved.status = destStatus;

      const allIds = [];
      MS_CYCLE.forEach(status => {
        const el = columnEls[status];
        if (!el) return;
        Array.from(el.children).forEach(child => allIds.push(Number(child.dataset.id)));
      });
      const byId = new Map(milestones.value.map(m => [m.id, m]));
      milestones.value = allIds.map(id => byId.get(id)).filter(Boolean);

      if (statusChanged) await apiPost("/milestones/" + movedId, { status: destStatus });
      await apiPost("/milestones-reorder", { order: allIds });
    }

    function initDragAndDrop() {
      sortables.forEach(s => s.destroy());
      sortables = MS_CYCLE.map(status => {
        const el = columnEls[status];
        if (!el) return null;
        return Sortable.create(el, {
          group: "milestones-kanban",
          handle: ".drag-handle",
          animation: 150,
          forceFallback: true,
          onEnd: onMilestoneDrop
        });
      }).filter(Boolean);
    }

    onBeforeUnmount(() => sortables.forEach(s => s.destroy()));
    onMounted(async () => { await load(); await nextTick(); initDragAndDrop(); });

    return {
      domainsPanel, milestones, loading,
      STATUS_STYLE, MS_STYLE, iconFor, newMilestone, saveMilestoneText, addMilestone,
      removeMilestone, columns, columnEls,
      insight, insightLoading, insightError, refreshInsight
    };
  },
  template: `
    <section class="folio">
      <div class="ai-card">
        <div class="folio-head" style="margin-bottom:0">
          <strong style="font-size:13px">✨ Suggestion IA — quoi étudier ensuite</strong>
          <button class="btn-quiet" :disabled="insightLoading" @click="refreshInsight">
            {{ insightLoading ? "Analyse…" : (insight ? "Actualiser" : "Obtenir une suggestion") }}
          </button>
        </div>
        <p v-if="insightError" class="ai-error">{{ insightError }}</p>
        <p v-else-if="insight" class="ai-card-text">{{ insight.content }}</p>
        <p v-else class="folio-sub" style="margin:10px 0 0">
          Clique sur le bouton pour une suggestion basée sur tes jalons, tes chapitres et tes scores de quiz.
        </p>
        <p v-if="insight && insight.created_at" class="ai-card-meta">Générée le {{ new Date(insight.created_at).toLocaleString('fr-FR') }}</p>
      </div>
      <div class="ledger-card">
        <h2>État des domaines</h2>
        <p class="folio-sub" style="margin-top:-8px">
          Un domaine par objectif créé dans l'onglet Programme — sa progression se met à jour
          automatiquement au fil des chapitres validés, aucun réglage à faire ici.
        </p>
        <p v-if="loading" class="loading-row">Chargement…</p>
        <p v-else-if="!domainsPanel.length" class="empty">
          Aucun domaine pour l'instant — crée ton premier objectif dans l'onglet Programme.
        </p>
        <div v-else v-for="d in domainsPanel" :key="d.name" class="domain-row">
          <span class="domain-label">
            <span class="dot" :style="{background: d.style.fg}"></span>{{ d.name }}
          </span>
          <span class="schedule-duration" style="margin-right:8px">{{ d.done }}/{{ d.total }} chapitres</span>
          <button class="status-pill status-pill-auto" style="min-width:130px"
            :style="{background: STATUS_STYLE[d.status].bg, color: STATUS_STYLE[d.status].fg, borderColor:'transparent'}"
            title="Calculé automatiquement depuis le Programme">
            <span v-html="iconFor(d.status)"></span>
            <span>{{ d.status }}</span>
          </button>
        </div>
      </div>
      <div class="ledger-card">
        <h2>Jalons — ma roadmap</h2>
        <p v-if="loading" class="loading-row">Chargement…</p>
        <template v-else>
          <div class="kanban-board">
            <div v-for="col in columns" :key="col.status" class="kanban-column">
              <div class="kanban-column-head">
                <span class="kanban-column-title">
                  <span class="kanban-dot" :style="{background: MS_STYLE[col.status].fg}"></span>{{ col.status }}
                </span>
                <span class="kanban-column-count">{{ col.items.length }}</span>
              </div>
              <div class="kanban-cards" :data-status="col.status" :ref="el => columnEls[col.status] = el">
                <div v-for="m in col.items" :key="m.id" class="kanban-card" :data-id="m.id">
                  <div class="kanban-card-top">
                    <span class="drag-handle" title="Glisser pour réordonner ou changer de statut">⠿</span>
                    <div class="kanban-card-body">
                      <textarea class="kanban-card-title" rows="1" v-auto-grow v-model="m.label" @change="saveMilestoneText(m)" placeholder="Ce jalon..."></textarea>
                      <div class="kanban-card-meta">
                        <input type="text" class="kanban-card-input" v-model="m.date_label" @change="saveMilestoneText(m)" placeholder="Échéance">
                        <button class="icon-btn" title="Supprimer" @click="removeMilestone(m)">✕</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="milestone-add">
            <input type="text" v-model="newMilestone.label" placeholder="Nouveau jalon — ce que je saurai faire">
            <input type="text" v-model="newMilestone.date_label" placeholder="Échéance (ex. Mars 2027)">
            <button class="btn-quiet" @click="addMilestone">+ Ajouter un jalon</button>
          </div>
        </template>
      </div>
    </section>
  `
};

/* ================= composant racine ================= */

const App = {
  components: { AujourdhuiTab, ProgrammeTab, BilanTab, ConfirmDialog },
  setup() {
    const activeTab = ref("jour");
    const tabs = [
      { id: "jour", label: "Aujourd'hui", icon: NAV_ICONS.jour },
      { id: "programme", label: "Programme", icon: NAV_ICONS.programme },
      { id: "bilan", label: "Bilan", icon: NAV_ICONS.bilan }
    ];
    const resetConfirming = ref(false);
    const menuOpen = ref(false);

    async function reset() {
      if (!resetConfirming.value) { resetConfirming.value = true; return; }
      await apiPost("/reset", { confirm: "EFFACER" });
      location.reload();
    }
    function selectTab(id) { activeTab.value = id; menuOpen.value = false; }
    watch(menuOpen, (open) => { document.body.style.overflow = open ? "hidden" : ""; });

    return { activeTab, tabs, apiState, resetConfirming, reset, menuOpen, selectTab };
  },
  template: `
    <div class="app-shell">
      <button class="menu-toggle" @click="menuOpen = true" aria-label="Ouvrir le menu">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
      <div class="sidebar-backdrop" v-if="menuOpen" @click="menuOpen = false"></div>

      <aside class="sidebar" :class="{open: menuOpen}">
        <div class="sidebar-brand">
          <div class="masthead-mark" aria-hidden="true">
            <svg viewBox="0 0 100 100" width="30" height="30">
              <rect width="100" height="100" rx="22" fill="var(--brand)"/>
              <line x1="24" y1="34" x2="76" y2="34" stroke="white" stroke-width="6" stroke-linecap="round"/>
              <line x1="24" y1="50" x2="76" y2="50" stroke="white" stroke-width="6" stroke-linecap="round"/>
              <line x1="24" y1="66" x2="58" y2="66" stroke="white" stroke-width="6" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <h1>Grand livre</h1>
            <p class="masthead-sub">Finance × Tech</p>
          </div>
          <button class="sidebar-close" @click="menuOpen = false" aria-label="Fermer le menu">✕</button>
        </div>

        <nav class="sidebar-nav" role="tablist">
          <button v-for="t in tabs" :key="t.id" class="side-link" :class="{active: activeTab === t.id}"
            role="tab" :aria-selected="activeTab === t.id" @click="selectTab(t.id)">
            <span class="tab-icon" v-html="t.icon"></span><span>{{ t.label }}</span>
          </button>
        </nav>
      </aside>

      <div class="main-col">
        <div v-if="apiState.error" class="api-banner">
          {{ apiState.error }}
        </div>

        <main>
          <AujourdhuiTab v-if="activeTab === 'jour'" />
          <ProgrammeTab v-else-if="activeTab === 'programme'" />
          <BilanTab v-else-if="activeTab === 'bilan'" />
        </main>

        <footer class="foot">
          <span>Parcours sept. 2026 → déc. 2027 · données en SQLite.</span>
          <button class="btn-quiet" @click="reset">
            {{ resetConfirming ? "Confirmer l'effacement" : "Réinitialiser" }}
          </button>
        </footer>
      </div>

      <ConfirmDialog />
    </div>
  `
};

createApp(App).directive("auto-grow", vAutoGrow).mount("#app");
