# MHB · Dirección Deportiva

Plataforma web para que la dirección deportiva y los dirigentes del Montpellier Handball sigan, entiendan y planifiquen el plantel masculino y femenino: contratos y vencimientos, planificación por temporada, reclutamiento, masa salarial y agenda.

Es un único archivo (`index.html`), sin dependencias ni build. Abrilo en el navegador o publicalo en cualquier hosting estático (GitHub Pages, Netlify, Vercel).

## Secciones

| Sección | Qué muestra |
|---|---|
| **Panel** | KPIs (jugadores bajo contrato, vencimientos de la temporada, masa salarial comprometida vs. presupuesto, edad media, objetivos activos, fichajes que llegan), alertas priorizadas, gráficos de vencimientos por temporada, masa salarial por puesto y pirámide de edades, actividad reciente. |
| **Cancha** | Media cancha de balonmano con el plantel ubicado por puesto (foto de cada jugador), selector de temporada: bajo contrato esa temporada, fichajes que llegan, último año, objetivos en negociación (punteado) y deseados; banquillo con el cuerpo técnico. Botón **+** en cada puesto para ubicar a mano a cualquier jugador u objetivo en esa temporada (o crear uno nuevo). Modo **Defensa**: arco + posiciones 1 a 6 (extremos, laterales, centrales) con quién puede defender en cada una y los especialistas defensivos. |
| **Plantel** | Tabla completa (puesto, edad, nacionalidad, mano, altura, fin de contrato, meses restantes, salario, estado, agente) con búsqueda, filtros y orden. Ficha de cada jugador con pestañas Ficha / Contrato / Notas / Historial. |
| **Planilla** | Grilla editable tipo Excel (jugadores, staff, objetivos y matriz por temporadas): celdas editables con Tab/Enter, orden por columna, totales, pegar desde Excel, importar .xlsx/.csv y exportar un .xlsx con 5 hojas. |
| **Cuerpo técnico** | Entrenadores, preparador físico, kiné, médico, analista… con rol, contrato, salario y notas. Entran en Contratos, Agenda, Masa salarial y Cancha. |
| **Contratos** | Línea de tiempo tipo Gantt por temporada (con opciones de prórroga punteadas y marcador de hoy) y tabla de contratos. |
| **Planificación** | Matriz puesto × temporada: quién tiene contrato en cada temporada, huecos en rojo/ámbar, fichajes futuros en verde y objetivos en negociación/acuerdo punteados. |
| **Reclutamiento** | Pipeline Kanban (Observado → Contacto → Negociación → Acuerdo → Fichado / Descartado) con arrastrar y soltar, prioridad, costo de traspaso y salario pedido. Un objetivo se convierte en fichaje con un clic. |
| **Agentes** | Ofertas que mandan los representantes: agente y agencia, canal, jugador ofrecido, tipo de operación, temporada, salario y traspaso pedidos, prioridad y estado (nueva, en estudio, interesa, descartada, convertida). Directorio de agentes con las ofertas de cada uno y los jugadores del plantel que representa. Una oferta se convierte en objetivo del pipeline con un clic. |
| **Masa salarial** | Presupuesto vs. comprometido por temporada y equipo, uso en %, margen, desglose por puesto y salarios más altos. |
| **Agenda** | Vencimientos de contrato, límites de opción, seguimientos de objetivos y tareas propias, agrupados por urgencia. |
| **Ajustes** | Presupuestos por temporada, idioma (ES/FR), exportar CSV/JSON, importar respaldo, cargar o borrar datos de demostración. |

## Datos

- Plantel masculino 2026/27 y cuerpo técnico cargados desde fuentes públicas (web oficial del MHB, LNH, HandNews, prensa local); las fechas marcadas con ≈ son estimadas y están por confirmar. Los salarios no son públicos: quedan vacíos para que los complete el club.

- Publicado como Artifact de Claude: los datos viven en una base compartida; todos los dirigentes con acceso ven lo mismo en tiempo real.
- Abierto como archivo suelto o en un hosting estático: los datos se guardan en el navegador (`localStorage`). Usá **Exportar respaldo (JSON)** para moverlos.
- Los datos de demostración son ficticios (jugadores, clubes y agentes inventados) y están marcados como `demo`. Borralos desde Ajustes antes de cargar el plantel real.

## Modelo de jugador

Identidad (nombre, nacimiento, nacionalidad, dorsal), deportivo (equipo M/F, categoría, puesto principal y secundario, mano, altura, peso), contrato (inicio, fin, salario bruto mensual, opción club/jugador/mutua con fecha límite, cláusula, valor de mercado, estado: bajo contrato / renovación en curso / sale a fin de contrato / cedido / fichado que llega), representación (agente, teléfono), notas cronológicas e historial de contratos.
