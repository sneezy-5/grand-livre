// add-quiz.js
// À lancer après avoir ajouté un nouveau quiz à quizzes-data.js, si tu ne
// veux pas redémarrer le serveur tout de suite :
//
//   cd server
//   node add-quiz.js
//
// Sans danger à relancer plusieurs fois : n'insère que les mois absents.

const db = require("./db");
const seedQuizzes = require("./seed-quiz");

const result = seedQuizzes(db);
if (result.inserted === 0) {
  console.log("Aucun nouveau quiz à ajouter — la base est déjà à jour.");
} else {
  console.log(`${result.inserted} quiz ajouté(s) : ${result.months.join(", ")}`);
}
