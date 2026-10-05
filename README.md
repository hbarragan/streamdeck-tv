# StreamDeck TV

Catálogos de streaming para España en una interfaz pensada para televisión. Elige plataforma, explora películas y series y abre el título en Plex.

El proyecto surge para conservar una forma familiar de descubrir contenido cuando el reproductor principal es Plex. La web funciona y la adaptación a Fire TV está en desarrollo; el salto nativo debe comprobarse en el dispositivo y con su versión de Plex.

## Funciones

- Plataformas confirmadas por TMDB/JustWatch en España: Prime Video, Netflix, Apple TV, Movistar Plus+, Disney+, Max, SkyShowtime y Filmin.
- Catálogo de suscripción, búsqueda por plataforma, fichas y paginación.
- Netflix con Top 10 semanal oficial de España y filas de géneros.
- Temas visuales por plataforma y navegación con mando.
- Búsqueda inmediata en Plex Web y envoltura Android con intents dirigidos a Plex.

La popularidad de TMDB no equivale a audiencia oficial. Los estrenos se ordenan por fecha del título, no por incorporación a la plataforma. El Top 10 de Netflix indica su semana y no reproduce la portada personalizada de una cuenta. Los títulos del ranking que no pueden identificarse conservan su puesto y no ofrecen reproducción.

## Ejecutar

Requiere Node.js 22 o posterior, sin dependencias de producción.

```powershell
Copy-Item .env.example .env
# Configura TMDB_TOKEN (API Read Access Token).
npm start
```

Abre http://localhost:3477. La disponibilidad se comprueba para España y suscripciones; la aplicación no proporciona archivos de vídeo. La reproducción requiere acceso al contenido correspondiente en Plex.

## Credenciales

Este repositorio no contiene claves, sesiones, APK personales ni configuración privada. Guarda las credenciales fuera del repositorio o en variables privadas del servidor. Para ejecutar con un archivo externo:

```powershell
node --env-file=C:/ruta/privada/runtime.env server/index.js
```

TMDB_TOKEN es necesario para el catálogo. PLEX_URL, PLEX_TOKEN, PLEX_SERVER_ID, PLEX_LIBRARY_IDS, PLEX_HOME_URL y PLEX_SERVER_NAME permiten conectar tu biblioteca. El enlace de búsqueda web no requiere un token Plex. Ninguna respuesta de la API devuelve claves.

El script opcional `scripts/connect-plex.mjs` usa autorización PIN. Configura tu propio PLEX_SERVER_ID y las bibliotecas antes de usarlo. Admite STREAMDECK_ENV_FILE para guardar la configuración fuera del proyecto. Nunca publiques archivos de credenciales.

## NAS con Docker

La imagen solo incluye Node, servidor y archivos públicos. El volumen externo `streamdeck-private` contiene `streamdeck.env`, con permisos 0600 y propietario 1000. El contenedor lo monta en modo lectura, ejecuta como usuario node y arranca con `--env-file`. Tiene reinicio automático, healthcheck y límites de memoria/CPU.

```powershell
docker build -t streamdeck-tv:1.2.0-arm64 .
# Prepara el volumen externo y su archivo de configuración privado.
$env:STREAMDECK_BIND_IP = 'IP-DEL-NAS'
docker compose up -d --wait
```

El puerto es 3477. En QNAP se utiliza la red bridge existente para evitar crear un switch virtual adicional. `scripts/deploy-nas.ps1` admite host, directorio de certificados TLS y archivo privado mediante parámetros; no incluye esos datos. Comprueba que el puerto está libre antes de instalar. No es necesario detener otros servicios.

## Vercel

Producción: https://streamdeck-tv.vercel.app. `api/index.js` reutiliza el mismo manejador HTTP. Configura los secretos como variables sensibles en Vercel. `.vercelignore` excluye credenciales y compilaciones Android.

```powershell
vercel link
vercel deploy --prod
```

## Fire TV

La envoltura Android está en `android/`: pantalla horizontal, launcher de televisión y control con flechas/OK/Volver. Requiere Plex instalado y configurado. El catálogo consulta la dirección de servidor elegida; puedes usar el NAS o Vercel. STREAMDECK_API_BASE permite configurar la dirección predeterminada al compilar.

```powershell
npm run android:build
```

El script usa Android SDK 35, Gradle 8.11.1 y JDK 17 o 21; admite rutas mediante parámetros. Genera una APK de depuración para sideload personal en `dist/`. La compilación normal no incluye claves. La variante `-IncludeCredentials` es opcional para uso privado y genera un archivo que permite extraer sus claves; sus assets y APK quedan excluidos de Git. No publiques esa variante.

La app intenta ACTION_SEARCH en Plex. En una variante privada puede consultar la biblioteca y abrir un resultado inequívoco mediante enlace nativo. Si no encuentra el título o el enlace no está soportado, abre Plex y muestra el título que debes buscar. No utiliza un navegador como alternativa en Fire TV. La compatibilidad debe verificarse en el dispositivo real; no se considera terminada la integración nativa.

## Verificación

```powershell
npm test
```

Las pruebas verifican proveedores, disponibilidad en España, búsqueda, ranking oficial, emparejamiento Plex y protección de rutas/credenciales. Solo las pruebas utilizan respuestas simuladas.

## Fuentes y atribución

- [TMDB](https://developer.themoviedb.org/reference/discover-movie): catálogo y disponibilidad facilitada por JustWatch.
- [Netflix Tudum](https://www.netflix.com/tudum/top10/spain): Top 10 semanal oficial de España.
- [Intents Plex](https://forums.plex.tv/t/android-intents/755047): enlaces nativos; su compatibilidad depende de la versión.

This product uses the TMDB API but is not endorsed or certified by TMDB. StreamDeck es independiente de las plataformas mostradas. Marcas y materiales promocionales pertenecen a sus titulares.
