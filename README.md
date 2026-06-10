# Prode Amigos

App privada para el prode de amigos **2P Mundial 2026**. Es una web estática mobile-first en español, con Supabase para login, base de datos y reglas de seguridad.

## Qué incluye

- Login por usuario usando Supabase Auth con emails internos `usuario@prodeamigos.local`.
- Onboarding de primer ingreso para elegir nombre de equipo, único y no editable.
- Avatares automáticos tipo figurita.
- Predicción de partidos con default `0-0`, edición hasta el kickoff y bloqueo automático.
- Predicciones especiales: clasificados por grupo, goleador de fase de grupos y campeón.
- Ranking por liga con desempates: exactos, puntos de grupos, puntos especiales y empate oficial.
- Panel admin para carga manual de equipos, jugadores y partidos.
- Migración SQL con RLS en todas las tablas.
- Función Edge opcional para crear usuarios y resetear passwords sin exponer la service role key.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

En `.env`, completá:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

## Supabase

1. Creá un proyecto en Supabase.
2. En SQL Editor, ejecutá `supabase/migrations/001_schema.sql`.
3. Ejecutá `supabase/seed/001_initial_data.sql`.
4. En Authentication, dejá habilitado Email/Password.
5. No habilites registro público en la UI de la app. Los usuarios se crean solo por admin.

## Crear los usuarios iniciales

Usá la service role key solo en tu máquina o en un entorno seguro. Nunca la pongas en el frontend.

```bash
SUPABASE_URL=https://tu-proyecto.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key \
node scripts/create-initial-users.mjs
```

Usuarios creados:

- `chino / 2026chino`
- `agustin / 2026agustin`
- `nacho / 2026nacho`
- `eze / 2026eze`
- `juli / 2026juli`
- `nicou / 2026nicou`
- `patricio / 2026patricio`
- `nicoe / 2026nicoe`
- `seba / 2026seba`
- `andy / 2026andy`
- `miatello / 2026miatello`
- `tomas / 2026tomas`
- `martin / 2026martin`
- `rama / 2026rama`
- `sergio / 2026sergio`

`chino` queda marcado como admin inicial.

## Admin

El panel admin permite cargar datos manualmente para que el juego no dependa de APIs pagas:

- equipos
- grupos
- jugadores
- partidos
- horarios

Los resultados, goleadores, clasificados y campeón están preparados en la base. Podés editarlos desde Supabase Table Editor o extender el panel admin con formularios adicionales usando las mismas tablas.

Para crear usuarios o resetear contraseñas desde una función segura:

```bash
supabase functions deploy admin-users
```

La función valida que quien llama sea admin en `profiles.is_admin = true` y usa la service role key solo dentro de Supabase.

## Datos del Mundial

La app funciona con carga manual y también con fuente gratuita.

Fuente base recomendada: `openfootball/worldcup.json`, que publica el fixture de World Cup 2026 en JSON sin API key. Para cargar o refrescar el fixture:

```bash
SUPABASE_URL=https://tu-proyecto.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key \
node scripts/import-openfootball.mjs https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
```

También podés pasar un archivo local:

```bash
node scripts/import-openfootball.mjs ./worldcup.json
```

Para resultados en vivo o estados oficiales, `football-data.org` incluye Worldcup en el free tier. Si usás ese token, no lo pongas en el frontend: sincronizá desde un script local, una GitHub Action privada, o una Supabase Edge Function.

Para cargar planteles/jugadores desde la página pública de squads:

```bash
SUPABASE_URL=https://tu-proyecto.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key \
node scripts/import-wikipedia-squads.mjs
```

También existe un importador CSV para correcciones manuales o listas oficiales descargadas:

```bash
node scripts/import-players-csv.mjs data/players.csv
```

## GitHub Pages

1. En Supabase, agregá tu dominio de GitHub Pages a los sitios permitidos de Auth.
2. Configurá variables del build con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Generá el sitio:

```bash
npm run build
```

4. Publicá la carpeta `dist`.

Si el repo se sirve desde una subcarpeta, agregá `base: '/nombre-del-repo/'` en `vite.config.js`.

## Reglas de puntaje

- Resultado exacto: 3 puntos.
- Ganador correcto o empate correcto: 1 punto.
- Incorrecto: 0 puntos.
- Goleador de grupos correcto: 5 puntos. Si hay empate entre goleadores, todos valen.
- Campeón correcto: 7 puntos.
- Clasificados por grupo: 2 puntos por equipo y posición correcta, 1 punto por equipo correcto en posición equivocada.

## Seguridad

- RLS está habilitado en todas las tablas.
- Cada usuario lee solo ligas donde participa.
- Un usuario solo edita sus predicciones antes del kickoff.
- Las predicciones especiales se insertan una vez y cierran antes del primer partido.
- Las predicciones de otros usuarios se ocultan hasta que empieza la fecha correspondiente.
- La service role key nunca se usa en el frontend.
