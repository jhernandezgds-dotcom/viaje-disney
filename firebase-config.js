// Configuración web del proyecto de Firebase.
// Estos datos no son secretos: identifican el proyecto. La seguridad la dan las reglas de Firestore.
export const firebaseConfig = {
  apiKey: "PEGAR_AQUI",
  authDomain: "PEGAR_AQUI",
  projectId: "PEGAR_AQUI",
  storageBucket: "PEGAR_AQUI",
  messagingSenderId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI"
};

// Las únicas cuentas que pueden entrar (también están en firestore.rules).
export const ALLOWED_EMAILS = [
  "jhernandezgds@gmail.com",
  "melinatorres_5@hotmail.com"
];

// Identificador del viaje dentro de la base de datos.
export const TRIP_ID = "principal";
