const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

const firebaseConfig = {
  apiKey: "AIzaSyDYm30nzc81HL6tajlUH0rnIHr0XdOD9d4",
  authDomain: "zonealert-6019d.firebaseapp.com",
  projectId: "zonealert-6019d",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

signInWithEmailAndPassword(auth, "maryjessadano16@gmail.com", "12345678")
  .then(userCredential => userCredential.user.getIdToken())
  .then(token => console.log("🔥 Firebase ID Token:\n", token))
  .catch(console.error);
