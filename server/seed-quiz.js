// seed-quiz.js
// Insère dans la base tous les quiz de quizzes-data.js qui n'y sont pas
// encore (comparaison par "month"). Ne touche jamais aux quiz déjà
// présents, ni à leurs questions, ni à l'historique des tentatives.
//
// Appelé automatiquement à chaque démarrage du serveur (voir server.js),
// et réutilisable à la main via add-quiz.js après avoir ajouté un quiz
// à quizzes-data.js sans redémarrer le serveur.
//
const QUIZZES = require("./quizzes-data");

module.exports = function seedQuizzes(db) {
  const insertQuiz = db.prepare("INSERT INTO quizzes (month, title) VALUES (?, ?)");
  const insertQuestion = db.prepare(
    `INSERT INTO quiz_questions (quiz_id, prompt, options_json, correct_option_id, explanation, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const existingMonths = new Set(
    db.prepare("SELECT month FROM quizzes").all().map((r) => r.month)
  );

  const toInsert = QUIZZES.filter((q) => !existingMonths.has(q.month));
  if (!toInsert.length) return { inserted: 0 };

  const insertAll = db.transaction((quizzes) => {
    quizzes.forEach((quiz) => {
      const info = insertQuiz.run(quiz.month, quiz.title);
      quiz.questions.forEach((q, i) => {
        insertQuestion.run(info.lastInsertRowid, q.prompt, JSON.stringify(q.options), q.correct, q.explanation, i);
      });
    });
  });
  insertAll(toInsert);

  return { inserted: toInsert.length, months: toInsert.map((q) => q.month) };
};
