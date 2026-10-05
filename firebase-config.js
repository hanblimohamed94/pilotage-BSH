/* =====================================================================
   CONFIGURATION FIREBASE — à remplacer par la vôtre
   =====================================================================
   1. Allez sur https://console.firebase.google.com
   2. Créez un projet (gratuit, offre "Spark")
   3. Dans le projet : icône "</>" ("Ajouter une application Web")
   4. Donnez-lui un nom (ex: "Pilotage BSH"), pas besoin de cocher Hosting
   5. Copiez l'objet "firebaseConfig" qui s'affiche et collez-le ci-dessous
      à la place de l'exemple
   6. Activez ensuite, dans le menu de gauche de la console Firebase :
        - "Authentication" -> onglet "Sign-in method" -> activer "E-mail/mot de passe"
        - "Firestore Database" -> "Créer une base de données" -> mode production
   Voir GUIDE_DEPLOIEMENT.md pour le détail pas à pas avec les captures.
   ===================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDuJW3IWtmYmKBJ29bg4-nH-ekgJUo7Cso",
  authDomain:"pilotage-bsh.firebaseapp.com",
  projectId: "pilotage-bsh",
  storageBucket: "pilotage-bsh.firebasestorage.app",
  messagingSenderId: "897854967231",
  appId: "1:897854967231:web:945c984c2e625bf58ee50a",
  measurementId: "G-6BSZKWW6TF"
};
