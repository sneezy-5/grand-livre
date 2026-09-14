// add-quiz.js
// À lancer après avoir ajouté un nouveau quiz à quizzes-data.js, si tu ne
// veux pas redémarrer le serveur tout de suite :
//
//   cd server
//   node add-quiz.js
//
// Sans danger à relancer plusieurs fois : n'insère que les mois absents.
// Chaque compte a sa propre base isolée — on boucle sur tous les comptes.

const { getDb } = require("./db");
const accountsDb = require("./accounts-db");
const seedQuizzes = require("./seed-quiz");

const accounts = accountsDb.prepare("SELECT id, email FROM accounts").all();
if (!accounts.length) {
  console.log("Aucun compte enregistré — rien à faire.");
} else {
  accounts.forEach(({ id, email }) => {
    const result = seedQuizzes(getDb(id));
    if (result.inserted === 0) {
      console.log(`${email} : aucun nouveau quiz à ajouter — déjà à jour.`);
    } else {
      console.log(`${email} : ${result.inserted} quiz ajouté(s) (${result.months.join(", ")})`);
    }
  });
}
