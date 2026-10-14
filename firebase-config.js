// Configuración web del proyecto de Firebase.
// Estos datos no son secretos: identifican el proyecto. La seguridad la dan las reglas de Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyAeXfBUFLC1ewbhp1xK-_0fOh16QvZvkus",
  authDomain: "viaje-disney.firebaseapp.com",
  projectId: "viaje-disney",
  storageBucket: "viaje-disney.firebasestorage.app",
  messagingSenderId: "535259197265",
  appId: "1:535259197265:web:c68e8327d4c4f45e572d70"
};

// Las únicas cuentas que pueden entrar (también están en firestore.rules).
export const ALLOWED_EMAILS = [
  "jhernandezgds@gmail.com",
  "melinatorres_5@hotmail.com"
];

// Identificador del viaje dentro de la base de datos.
export const TRIP_ID = "principal";
