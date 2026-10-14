# Cuentas del Viaje

Web app instalable para llevar las cuotas, los gastos y los saldos de un viaje entre dos personas, en dólares y en pesos.

- **Hosting:** GitHub Pages (gratis, repositorio público).
- **Datos:** Cloud Firestore en el plan gratuito Spark de Firebase. Los datos **no** están en este repositorio.
- **Acceso:** inicio de sesión con email y contraseña. Solo las cuentas listadas en `firestore.rules` (y en `firebase-config.js`) pueden leer o escribir.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura y estilos de la app |
| `app.js` | Lógica: login, cálculos, pantallas y sincronización con Firestore |
| `firebase-config.js` | Configuración web del proyecto de Firebase y mails habilitados |
| `firestore.rules` | Reglas de seguridad: copiar y publicar en Firebase → Firestore → Reglas |
| `manifest.webmanifest`, `sw.js`, `icons/` | Para instalarla en el celular y abrirla sin conexión |

## Instalar en el iPhone

Abrir la dirección en **Safari** → botón Compartir → **Agregar a pantalla de inicio**.

## Cambiar quién tiene acceso

Editar la lista de mails en `firestore.rules` (y publicarla de nuevo en Firebase) y en `firebase-config.js`.
