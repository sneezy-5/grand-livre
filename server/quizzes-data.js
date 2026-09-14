// quizzes-data.js
// Le contenu de tous les quiz vit ici, séparé de la logique de base de données
// (db.js). Pour ajouter le quiz d'un nouveau mois : ajoute un objet à ce
// tableau (même forme que les existants), sauvegarde, puis lance :
//
//   node seed-quiz.js
//
// Ce script n'insère que les quiz dont le "month" n'existe pas encore en
// base — il ne touche jamais aux quiz déjà présents ni à leurs tentatives.

module.exports = [
  {
    month: "Sept. 2026",
    title: "Fondamentaux comptables — actif/passif, débit/crédit, partie double",
    questions: [
      {
        prompt: "Une entreprise achète un ordinateur avec son compte bancaire. Dans quelle catégorie se trouve cet ordinateur ensuite ?",
        options: [
          { id: "a", text: "Passif, car c'est une dette" },
          { id: "b", text: "Actif, car c'est un bien que l'entreprise possède" },
          { id: "c", text: "Ni l'un ni l'autre, ce n'est pas comptabilisé" },
          { id: "d", text: "Capitaux propres" }
        ],
        correct: "b",
        explanation: "L'actif représente les emplois : tout ce que l'entreprise possède ou contrôle (biens, créances, trésorerie). L'ordinateur est un bien détenu par l'entreprise, donc il figure à l'actif."
      },
      {
        prompt: "Un emprunt bancaire de 2 000 000 FCFA que l'entreprise doit rembourser figure :",
        options: [
          { id: "a", text: "À l'actif, car c'est de l'argent reçu" },
          { id: "b", text: "Au passif, car c'est une dette à rembourser" },
          { id: "c", text: "Nulle part, ce n'est pas une opération comptable" },
          { id: "d", text: "En charge dans le compte de résultat" }
        ],
        correct: "b",
        explanation: "Le passif regroupe les ressources : d'où vient l'argent de l'entreprise. Un emprunt est une ressource externe qu'il faudra rembourser, donc il figure au passif."
      },
      {
        prompt: "Quelle égalité comptable doit toujours être vraie ?",
        options: [
          { id: "a", text: "Charges = Produits" },
          { id: "b", text: "Actif = Passif" },
          { id: "c", text: "Débit = Résultat" },
          { id: "d", text: "Trésorerie = Capitaux propres" }
        ],
        correct: "b",
        explanation: "Le bilan doit toujours être équilibré : total de l'actif = total du passif. C'est la base de la comptabilité en partie double."
      },
      {
        prompt: "Un compte de trésorerie (banque) qui augmente est enregistré :",
        options: [
          { id: "a", text: "Au débit, car un compte d'actif augmente au débit" },
          { id: "b", text: "Au crédit, car c'est une ressource" },
          { id: "c", text: "Ni débit ni crédit, seulement dans le résultat" },
          { id: "d", text: "Cela dépend du montant" }
        ],
        correct: "a",
        explanation: "Pour un compte d'actif (comme la banque), une augmentation s'enregistre au débit et une diminution au crédit. C'est l'inverse pour les comptes de passif."
      },
      {
        prompt: "L'entreprise reçoit un apport en capital de 1 000 000 FCFA versé sur son compte bancaire. Que se passe-t-il ?",
        options: [
          { id: "a", text: "Le compte banque est débité, le compte capital est crédité" },
          { id: "b", text: "Le compte banque est crédité, le compte capital est débité" },
          { id: "c", text: "Seul le compte banque est mouvementé" },
          { id: "d", text: "Seul le compte capital est mouvementé" }
        ],
        correct: "a",
        explanation: "Principe de la partie double : la banque (actif) augmente donc elle est débitée ; le capital (passif) augmente donc il est crédité."
      },
      {
        prompt: "Qu'appelle-t-on le \"flux financier\" dans une opération d'achat au comptant ?",
        options: [
          { id: "a", text: "Le mouvement de bien ou de service qui entre dans l'entreprise" },
          { id: "b", text: "Le mouvement d'argent (paiement) qui accompagne l'opération" },
          { id: "c", text: "Le résultat net de l'exercice" },
          { id: "d", text: "La différence entre charges et produits" }
        ],
        correct: "b",
        explanation: "Le flux économique correspond au bien/service qui circule ; le flux financier correspond à l'argent qui circule en contrepartie."
      },
      {
        prompt: "Une entreprise vend de la marchandise à crédit (le client paiera plus tard). Quel compte est débité au moment de la vente ?",
        options: [
          { id: "a", text: "Le compte banque" },
          { id: "b", text: "Le compte client (créance)" },
          { id: "c", text: "Le compte fournisseur" },
          { id: "d", text: "Le compte capital" }
        ],
        correct: "b",
        explanation: "Tant que le client n'a pas payé, l'entreprise détient une créance sur lui : le compte client (actif) est débité, en contrepartie du compte de vente (produit) crédité."
      },
      {
        prompt: "Dans le \"patrimoine\" d'une entreprise, les capitaux propres représentent :",
        options: [
          { id: "a", text: "Ce que l'entreprise doit aux banques uniquement" },
          { id: "b", text: "La part du patrimoine qui appartient réellement aux propriétaires/associés" },
          { id: "c", text: "La trésorerie disponible en caisse" },
          { id: "d", text: "Le chiffre d'affaires de l'année" }
        ],
        correct: "b",
        explanation: "Les capitaux propres représentent ce qui revient aux associés (apports + résultats accumulés), par opposition aux dettes dues à des tiers externes."
      }
    ]
  },
  {
    month: "Oct. 2026",
    title: "Comptabilité courante — achats, ventes, banque/caisse, TVA, salaires",
    questions: [
      {
        prompt: "Une entreprise achète des marchandises à crédit à un fournisseur pour 300 000 FCFA. Quel compte est crédité ?",
        options: [
          { id: "a", text: "Le compte fournisseur (dette)" },
          { id: "b", text: "Le compte client (créance)" },
          { id: "c", text: "Le compte banque" },
          { id: "d", text: "Le compte capital" }
        ],
        correct: "a",
        explanation: "Tant que l'entreprise n'a pas payé, elle a une dette envers le fournisseur. Le compte fournisseur (passif) est crédité, en contrepartie du compte d'achat (charge) débité."
      },
      {
        prompt: "Quelle est la différence entre le compte \"client\" et le compte \"fournisseur\" ?",
        options: [
          { id: "a", text: "Client = ce qu'on doit ; Fournisseur = ce qu'on nous doit" },
          { id: "b", text: "Client = ce qu'on nous doit (créance) ; Fournisseur = ce qu'on doit (dette)" },
          { id: "c", text: "Ce sont deux noms différents pour le même compte" },
          { id: "d", text: "Les deux sont des comptes de charges" }
        ],
        correct: "b",
        explanation: "Le compte client est une créance (actif) : le client nous doit de l'argent. Le compte fournisseur est une dette (passif) : nous devons de l'argent au fournisseur."
      },
      {
        prompt: "Un client règle une facture de 150 000 FCFA par virement bancaire. Quelle écriture est correcte ?",
        options: [
          { id: "a", text: "Débit banque 150 000 / Crédit client 150 000" },
          { id: "b", text: "Débit client 150 000 / Crédit banque 150 000" },
          { id: "c", text: "Débit banque 150 000 / Crédit vente 150 000" },
          { id: "d", text: "Débit fournisseur 150 000 / Crédit banque 150 000" }
        ],
        correct: "a",
        explanation: "La banque (actif) augmente donc elle est débitée. La créance sur le client s'éteint puisqu'il a payé, donc le compte client est crédité (diminution d'un compte d'actif)."
      },
      {
        prompt: "Quelle est la différence entre le compte \"banque\" et le compte \"caisse\" ?",
        options: [
          { id: "a", text: "La caisse enregistre les mouvements en espèces, la banque les mouvements sur le compte bancaire" },
          { id: "b", text: "Ce sont deux noms différents pour le même compte" },
          { id: "c", text: "La banque suit les dettes, la caisse suit les créances" },
          { id: "d", text: "La caisse est un compte de charges" }
        ],
        correct: "a",
        explanation: "Les deux sont des comptes de trésorerie (actif), mais la caisse suit l'argent liquide détenu physiquement, la banque suit le solde du compte bancaire."
      },
      {
        prompt: "Une entreprise facture une vente de 100 000 FCFA hors taxes, avec une TVA de 18 %. Quel est le montant total TTC facturé au client ?",
        options: [
          { id: "a", text: "100 000 FCFA" },
          { id: "b", text: "118 000 FCFA" },
          { id: "c", text: "108 200 FCFA" },
          { id: "d", text: "82 000 FCFA" }
        ],
        correct: "b",
        explanation: "Le TTC (toutes taxes comprises) = HT + TVA = 100 000 + (100 000 × 18 %) = 100 000 + 18 000 = 118 000 FCFA."
      },
      {
        prompt: "Dans une vente avec TVA, cette taxe collectée auprès du client appartient-elle à l'entreprise ?",
        options: [
          { id: "a", text: "Oui, c'est un produit comme un autre" },
          { id: "b", text: "Non, l'entreprise la collecte pour le compte de l'État et devra la reverser" },
          { id: "c", text: "Oui, mais seulement la moitié" },
          { id: "d", text: "Cela dépend du secteur d'activité" }
        ],
        correct: "b",
        explanation: "La TVA collectée sur les ventes est une dette envers l'État (compte de passif) : l'entreprise ne fait que la collecter, elle devra la reverser lors de sa déclaration."
      },
      {
        prompt: "Le salaire brut d'un employé est de 400 000 FCFA, avec 40 000 FCFA de cotisations sociales retenues. Quel est le salaire net versé ?",
        options: [
          { id: "a", text: "400 000 FCFA" },
          { id: "b", text: "440 000 FCFA" },
          { id: "c", text: "360 000 FCFA" },
          { id: "d", text: "40 000 FCFA" }
        ],
        correct: "c",
        explanation: "Le salaire net = salaire brut − cotisations retenues = 400 000 − 40 000 = 360 000 FCFA. Les cotisations retenues constituent une dette envers les organismes sociaux, pas un montant versé à l'employé."
      },
      {
        prompt: "Pourquoi tient-on un compte séparé pour chaque client et chaque fournisseur (plutôt qu'un seul compte \"clients\" global) ?",
        options: [
          { id: "a", text: "C'est obligatoire par la loi sans exception" },
          { id: "b", text: "Pour savoir précisément combien chaque client doit et chaque fournisseur est dû" },
          { id: "c", text: "Cela n'apporte aucun intérêt pratique" },
          { id: "d", text: "Pour réduire le montant de la TVA à payer" }
        ],
        correct: "b",
        explanation: "Le suivi individuel (comptes auxiliaires) permet de savoir qui doit quoi précisément — indispensable pour relancer un client en retard ou vérifier ce qui reste dû à un fournisseur."
      }
    ]
  }
];
