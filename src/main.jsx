import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Award,
  BookOpen,
  CalendarClock,
  Check,
  Crown,
  GitBranch,
  Lock,
  LogOut,
  Medal,
  MessageCircle,
  Plus,
  Save,
  Send,
  Shield,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { hasSupabaseConfig, supabase, usernameToEmail } from './lib/supabase';
import './styles.css';

const LEAGUE_NAME = '2P Mundial 2026';
const AVATAR_FALLBACK = 'PA';
const tabs = [
  { id: 'dashboard', label: 'Inicio', icon: Trophy },
  { id: 'predictions', label: 'Mi prode', icon: CalendarClock },
  { id: 'points', label: 'Mis puntos', icon: Star },
  { id: 'ranking', label: 'Ranking', icon: Medal },
  { id: 'fixture', label: 'Fixture', icon: GitBranch },
  { id: 'rules', label: 'Reglas', icon: BookOpen },
  { id: 'qualifiers', label: 'Grupos', icon: Users },
  { id: 'scorers', label: 'Goleadores', icon: Award },
  { id: 'profile', label: 'Perfil', icon: UserRound },
];

const TZ_AR = 'America/Argentina/Buenos_Aires';
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const nowIso = () => new Date().toISOString();
const dateInTz = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const timeInTz = (date, timeZone) =>
  new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
const dateKey = (value) => (value ? dateInTz(new Date(value), TZ_AR) : 'sin-fecha');
const fmtDay = (value) =>
  value && value !== 'sin-fecha'
    ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00Z`))
    : 'Sin día';
// Fechas en la hora local del dispositivo de quien mira.
const fmtDate = (value) =>
  value
    ? new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Sin horario';
// Hora local del que mira + referencia argentina si difieren.
const fmtKickoff = (value) => {
  if (!value) return 'Sin horario';
  const date = new Date(value);
  const sameAsArgentina = timeInTz(date, DEVICE_TZ) === timeInTz(date, TZ_AR) && dateInTz(date, DEVICE_TZ) === dateInTz(date, TZ_AR);
  if (sameAsArgentina) return `${fmtDate(value)} 🇦🇷`;
  const sameDay = dateInTz(date, DEVICE_TZ) === dateInTz(date, TZ_AR);
  const argentina = sameDay
    ? timeInTz(date, TZ_AR)
    : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ_AR }).format(date);
  return `${fmtDate(value)} (${argentina} 🇦🇷)`;
};
const timeAgo = (value) => {
  const hours = Math.round((Date.now() - new Date(value).getTime()) / 3600000);
  if (hours < 1) return 'hace minutos';
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
};

// RNG con semilla: mismos titulares para todos durante el día, rotan a medianoche ART.
const hashSeed = (str) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
};
const seededRng = (seedStr) => {
  let a = hashSeed(seedStr);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Portada ilustrada con IA atada a un protagonista: solo se muestra si ese
// equipo sigue liderando. Si lo superan, cae al diseño con avatares.
const ORACLE_COVER = { team: 'Victor', image: 'press-oracle.webp' };
// Persecución: portada propia cuando el líder es Victor y lo persigue La Scaloneta.
const CHASE_COVER = { leader: 'Victor', second: 'La Scaloneta papá!!', image: 'press-chase.webp' };
// El amarrete: portada propia para Yayo FC (Agustin) mientras sea el rey del puntito.
const STINGY_COVER = { team: 'Yayo FC', image: 'press-amarrete.webp' };
// El equipo del creador del prode (para el autochiste cuando va mal).
const CREATOR_TEAM = 'El Diego FC';
// Portadas curadas nuevas: el soldado rebelde (Juliancito vs Victor) y el que
// puso a Messi de goleador (La Scaloneta).
const SOLDIER_COVER = { rebel: 'Juliancito', leader: 'Victor', image: 'press-soldado.webp' };
const MESSI_COVER = { picker: 'La Scaloneta papá!!', image: 'press-messi.webp' };
const EXACTO_COVER = 'press-exacto.webp';
const DESMEMORIADOS_COVER = 'press-desmemoriados.webp';
const SIGNO_COVER = 'press-signo.webp';

function buildProdeHeadlines(facts, byTeam = {}) {
  if (!facts) return [];
  const rng = seededRng(dateKey(nowIso()));
  const pickOne = (options) => options[Math.floor(rng() * options.length)];
  const stories = [];
  const sign = (h, a) => Math.sign(Number(h) - Number(a));
  // Nombre propio + equipo: "Tomas Dinn (La Tanoneta)". Si no hay perfil, queda el equipo.
  const who = (team) => {
    const member = byTeam[team];
    return member?.real_name && member.real_name !== team ? `${member.real_name} (${team})` : team;
  };
  const whoList = (teams) => teams.map(who).join(', ');

  for (const match of facts.lockedPicks || []) {
    const picks = match.picks || [];
    if (!picks.length) continue;
    const versus = `${match.home} vs ${match.away}`;
    const finished = match.home_score !== null && match.away_score !== null;
    const groups = { 1: [], 0: [], '-1': [] };
    picks.forEach((p) => groups[sign(p.home, p.away)].push(p));
    const sorted = Object.entries(groups).filter(([, list]) => list.length).sort((a, b) => a[1].length - b[1].length);
    const minority = sorted.length > 1 && sorted[0][1].length === 1 ? sorted[0][1][0] : null;
    const minoritySign = minority ? Number(sorted[0][0]) : null;

    if (finished) {
      const score = `${match.home_score}-${match.away_score}`;
      const exacts = picks.filter((p) => Number(p.home) === match.home_score && Number(p.away) === match.away_score);
      if (exacts.length === 1) {
        stories.push({ priority: 1, tag: 'VIDENTE', mood: 'vidente', emoji: '🔮', actors: [exacts[0].team], title: pickOne([
          `🔮 ¿Vidente o arreglado? ${who(exacts[0].team)} clavó el ${score} de ${versus} y la liga exige allanamiento`,
          `🎯 ESCALOFRIANTE: ${who(exacts[0].team)} sabía el ${score} de ${versus} antes que la FIFA. Interpol ya fue notificada`,
          `🕵️ CASO ABIERTO: ${who(exacts[0].team)} acertó el ${score} de ${versus}. ¿Talento o tiene un primo en el vestuario?`,
        ]), detail: 'Único exacto del partido. 3 puntos y una citación a declarar.' });
      } else if (exacts.length === 0) {
        stories.push({ priority: 1, tag: 'PAPELÓN', mood: 'papelon', emoji: '🤡', actors: [], title: pickOne([
          `🤡 PAPELÓN PLANETARIO: ${picks.length} prodes y NADIE le embocó al ${score} de ${versus}. Devuelvan las camisetas`,
          `❌ VERGÜENZA HISTÓRICA: el ${score} de ${versus} dejó a la liga ENTERA pagando. Ni uno. CERO.`,
        ]), detail: 'Cero exactos. Una liga entera mirando para otro lado.' });
      } else {
        stories.push({ priority: 2, tag: 'DATA', mood: 'exclusivo', emoji: '🎯', actors: exacts.map((p) => p.team), title: `🎯 Lluvia de exactos en ${versus}: ${whoList(exacts.map((p) => p.team))} la clavaron con el ${score}`, detail: '3 puntos por cabeza. Sospechosamente fácil.' });
      }
      // Goleada oficial: resultado escandaloso, sin importar los prodes.
      const margin = Math.abs(match.home_score - match.away_score);
      const totalGoals = Number(match.home_score) + Number(match.away_score);
      if (margin >= 4 || totalGoals >= 6) {
        const winner = match.home_score > match.away_score ? match.home : match.away;
        const loser = match.home_score > match.away_score ? match.away : match.home;
        stories.push({ priority: 2, tag: 'GOLEADA', mood: 'goleada', emoji: '💥', actors: [], title: pickOne([
          `💥 MASACRE MUNDIALISTA: ${winner} le metió ${Math.max(match.home_score, match.away_score)} a ${loser} (${score}). El portero pidió el libro de quejas`,
          `🌊 DILUVIO DE GOLES: ${score} en ${versus}. ${loser} todavía no terminó de sacar la pelota del arco`,
        ]), detail: 'Resultado para el museo del horror. Ningún prode esperaba semejante baile.' });
      }
      if (minority) {
        const hit = minoritySign === sign(match.home_score, match.away_score);
        stories.push({ priority: 1, tag: hit ? 'BATACAZO' : 'PAPELÓN', mood: hit ? 'batacazo' : 'crisis', emoji: hit ? '💣' : '🪦', actors: [minority.team], title: hit
          ? pickOne([
              `💣 EL BATACAZO DEL AÑO: ${who(minority.team)} desafió a los ${picks.length - 1} restantes en ${versus}... y les arruinó el asado`,
              `👑 SOLO CONTRA EL MUNDO: ${who(minority.team)} fue el ÚNICO que la vio en ${versus}. El resto, a llorar al campito`,
            ])
          : pickOne([
              `📉 SE ESTRELLÓ MAL: ${who(minority.team)} quiso el batacazo en ${versus} y quedó en ridículo nacional`,
              `🪦 QEPD el batacazo de ${who(minority.team)} en ${versus}. El grupo de WhatsApp no perdona`,
            ]), detail: `Puso ${minority.home}-${minority.away} cuando todos iban para el otro lado.` });
      }
    } else {
      if (minority) {
        stories.push({ priority: 2, tag: 'BATACAZO', mood: 'batacazo', emoji: '🚨', actors: [minority.team], title: pickOne([
          `🚨 REBELDE SIN CAUSA: ${who(minority.team)} puso ${minority.home}-${minority.away} en ${versus} y desafía a toda la liga. Valiente o inconsciente`,
          `💥 ${who(minority.team)} va por el batacazo en ${versus}: ${minority.home}-${minority.away} mientras los demás se abrazan asustados`,
        ]), detail: 'El pronóstico ya está cerrado. No hay vuelta atrás. Palomitas listas.' });
      } else if (sorted.length === 1 && picks.length > 2) {
        stories.push({ priority: 3, tag: 'EXCLUSIVO', mood: 'exclusivo', emoji: '🤝', actors: [], title: `🤝 UNANIMIDAD SOSPECHOSA: los ${picks.length} pusieron LO MISMO en ${versus}. ¿Cartel del prode o falta de personalidad?`, detail: 'Nadie quiso despeinarse. Aburridos.' });
      }
    }
  }

  for (const today of facts.todayMissing || []) {
    const absent = today.absent || [];
    const versus = `${today.home} vs ${today.away}`;
    if (absent.length && absent.length <= 3) {
      stories.push({ priority: 2, tag: 'ESCÁNDALO', mood: 'escandalo', emoji: '😱', actors: absent, title: pickOne([
        `😱 ESCÁNDALO: ${whoList(absent)} ${absent.length === 1 ? 'todavía no cargó' : 'todavía no cargaron'} el prode para ${versus}. La liga ya le está eligiendo apodo`,
        `⏰ ALARMA MÁXIMA: ${versus} se juega HOY y ${whoList(absent)} ${absent.length === 1 ? 'sigue roncando' : 'siguen roncando'}. Insólito`,
      ]), detail: 'El reloj corre. Después no lloren.' });
    } else {
      // Previa para los días sin escándalos: que nunca falte material.
      stories.push({ priority: 5, tag: 'HOY', mood: 'urgente', emoji: '🍿', actors: [], title: pickOne([
        `🍿 HOY SE JUEGA: ${versus}. La liga contiene la respiración y afila los colmillos`,
        `🔥 LLEGÓ EL DÍA: ${versus}. Prodes cerrados, uñas comidas, amistades en juego`,
        `⚽ ${versus} se juega HOY: en unas horas sabremos quién la vio y quién quedó pagando`,
      ]), detail: 'Pronósticos cargados. Ya no depende de ustedes.' });
    }
  }

  // Portada: los que duermen sin completar los primeros 3 partidos del Mundial.
  const earlyMissing = facts.earlyMissing || [];
  const earlyMatches = facts.earlyMatches || [];
  if (earlyMatches.length >= 3) {
    if (earlyMissing.length) {
      const list = whoList(earlyMissing);
      const one = earlyMissing.length === 1;
      stories.push({ priority: 0, tag: 'ÚLTIMO MOMENTO', mood: 'siesta', emoji: '😴', actors: earlyMissing, scene: { sleeping: earlyMissing }, title: pickOne([
        `🚨 ESCÁNDALO MAYÚSCULO: ${list} ${one ? 'DUERME' : 'DUERMEN'} la siesta del siglo y ${one ? 'debe' : 'deben'} completar el prode de los primeros 3 partidos`,
        `😴 PAPELÓN EN LA PREVIA: el Mundial ya está acá y ${list} ${one ? 'sigue roncando' : 'siguen roncando'}: ${one ? 'le faltan' : 'les faltan'} los primeros 3 partidos`,
        `🛏️ ALERTA ROJA: la liga entera festeja el arranque mientras ${list} ${one ? 'duerme' : 'duermen'} sin cargar los primeros 3 partidos`,
      ]), detail: 'El resto ya cumplió y lo festeja en su cara. Qué papelón.' });
    }
  }

  const standings = facts.standings || [];
  const leader = standings[0];
  const second = standings[1];
  const last = standings[standings.length - 1];
  if (leader && second && leader.total > 0) {
    const gap = leader.total - second.total;

    // === Noticias curadas pinneadas (top 3) ===
    // 1) El soldado rebelde: Juliancito, el único que le pelea al líder Victor.
    const rebel = standings.find((item) => item.team === SOLDIER_COVER.rebel);
    if (leader.team === SOLDIER_COVER.leader && rebel && rebel.team !== leader.team) {
      const rebelGap = leader.total - rebel.total;
      stories.push({ pin: true, priority: -1, tag: 'EL ÚLTIMO REBELDE', mood: 'exclusivo', emoji: '⚔️', actors: [rebel.team, leader.team], cover: SOLDIER_COVER.image, title: pickOne([
        `⚔️ EL ÚNICO QUE LE HACE SOMBRA: ${who(rebel.team)} es el ÚLTIMO rebelde de pie. Mientras todos se rindieron ante el rey ${who(leader.team)}, él carga espada en mano a ${rebelGap} puntos`,
        `🛡️ DAVID CONTRA GOLIAT: ${who(rebel.team)} se planta ante el trono de ${who(leader.team)} y jura que la remontada existe. El resto ya entregó las armas`,
      ]), detail: 'El rey ni se inmuta. El rebelde transpira. La épica más ridícula del prode.' });
    }
    // 2) El que puso a Messi de goleador y la pegó.
    const messiPicker = standings.find((item) => item.team === MESSI_COVER.picker);
    if (messiPicker) {
      stories.push({ pin: true, priority: -1, tag: 'LA PULGA', mood: 'exclusivo', emoji: '🐐', actors: [messiPicker.team], cover: MESSI_COVER.image, title: pickOne([
        `🐐 ABRAZADO A LA GLORIA: ${who(messiPicker.team)} fue el ÚNICO que puso a Messi de goleador... y la Pulga lidera la bota de oro del Mundial. El resto, verde de envidia`,
        `🥇 OLFATO DE CRACK: ${who(messiPicker.team)} se la jugó por Messi como goleador y le está saliendo redondo. Los demás se muerden los codos`,
      ]), detail: 'El que la ve, la ve. El resto, a llorar al vestuario.' });
    }
    // 3) El pelotón del barro: 3+ equipos amontonados en mitad de tabla.
    const midById = {};
    standings.slice(2).forEach((item) => { (midById[item.total] = midById[item.total] || []).push(item.team); });
    const cluster = Object.entries(midById).filter(([, list]) => list.length >= 3).sort((a, b) => b[1].length - a[1].length)[0];
    if (cluster) {
      const [clusterTotal, clusterTeams] = cluster;
      const count = clusterTeams.length;
      const word = { 3: 'TRIPLE', 4: 'CUÁDRUPLE', 5: 'QUÍNTUPLE', 6: 'SÉXTUPLE' }[count] || `${count} VÍAS`;
      stories.push({ pin: true, priority: -1, tag: 'EL PELOTÓN', mood: 'papelon', emoji: '🟰', actors: clusterTeams, title: pickOne([
        `🟰 ${word} EMPATE EN EL FANGO: ${whoList(clusterTeams)} — todos pegados en ${clusterTotal} puntos. Ninguno se anima a despegar`,
        `🚜 ATASCADOS EN EL BARRO: ${count} equipos clavados en ${clusterTotal} puntos (${whoList(clusterTeams)}). Pelotón de la mediocridad, abrazo de náufragos`,
      ]), detail: 'Tanta paridad que da sueño. Alguno tendría que arriesgar, ¿no?' });
    }

    // Persecución: portada propia cuando Victor lidera y lo persigue La Scaloneta
    // (esté 2°, 3°, donde sea: la imagen es Victor vs Ezequiel).
    const chaser = standings.find((item) => item.team === CHASE_COVER.second && item.team !== leader.team);
    if (gap >= 6) {
      // Coronación anticipada: el líder arrasa, que el resto entregue las medallas.
      stories.push({ priority: 1, tag: 'CORONACIÓN', mood: 'exclusivo', emoji: '👑', actors: [leader.team], title: pickOne([
        `👑 QUE DEJEN DE JUGAR EL RESTO: ${who(leader.team)} YA GANÓ EL PRODE. ${leader.total} puntos, ${leader.exacts} exactos y +${gap} de luz. Entreguen las medallas, apaguen la cancha y váyanse a casa`,
        `🏆 SE TERMINÓ EL TORNEO (FALTANDO MEDIO MUNDIAL): ${who(leader.team)} es CAMPEÓN con ${gap} puntos de ventaja. El resto que pelee el segundo puesto... si le da el cuero`,
        `📢 COMUNICADO OFICIAL: ${who(leader.team)} solicita que el resto deje de hacer el ridículo. ${leader.total} pts. No lo alcanzan ni en un Mundial paralelo`,
      ]), detail: 'Reserven la copa, graben su nombre. Esto ya está liquidado.' });
    } else if (leader.team === CHASE_COVER.leader && chaser) {
      const chaseGap = leader.total - chaser.total;
      stories.push({ priority: 0, tag: 'LA PERSECUCIÓN', mood: 'exclusivo', emoji: '🏃', actors: [leader.team, chaser.team], cover: CHASE_COVER.image, title: pickOne([
        `🏃 LE PISA LOS TALONES: ${who(chaser.team)} a ${chaseGap} ${chaseGap === 1 ? 'punto' : 'puntos'} del líder ${who(leader.team)}. "Lo alcanzo aunque sea en palomita", promete entre lágrimas`,
        `💨 LA CACERÍA DEL AÑO: ${who(chaser.team)} corre desesperado detrás de ${who(leader.team)}, que se aleja flotando en su trono con la copa. ${chaseGap} ${chaseGap === 1 ? 'punto' : 'puntos'} de diferencia`,
        `🔥 ${who(chaser.team)} NO AFLOJA: a ${chaseGap} de ${who(leader.team)} y jurando que "esto todavía no terminó". El líder ni se da vuelta`,
      ]), detail: 'El perseguidor transpira; el líder saluda. Por ahora.' });
    } else if (leader.team === ORACLE_COVER.team && (leader.exacts || 0) >= 3) {
      stories.push({ priority: 0, tag: 'EL ORÁCULO', mood: 'exclusivo', emoji: '🔮', actors: [leader.team], cover: ORACLE_COVER.image, title: pickOne([
        `🔮 ESCALOFRIANTE: ${who(leader.team)} clavó ${leader.exacts} resultados EXACTOS y lidera con ${leader.total} puntos. ¿Vidente, brujo o tiene línea directa con la FIFA?`,
        `👑 NADIE LO PARA: ${who(leader.team)} la ve TODA — ${leader.exacts} exactos, ${leader.total} puntos y el resto rezando para que falle`,
      ]), detail: 'El oráculo del prode. La liga exige control antidopaje.' });
    } else {
      stories.push({ priority: 4, tag: 'EXCLUSIVO', mood: 'exclusivo', emoji: '👑', actors: gap === 0 ? [leader.team, second.team] : [leader.team], title: gap === 0
        ? `🔥 INFARTO EN LA CIMA: ${who(leader.team)} y ${who(second.team)} empatados en ${leader.total}. Esto se define a las piñas`
        : pickOne([
            `👑 ${who(leader.team)} manda con ${leader.total} puntos y ya pidió que le filmen el documental. ${who(second.team)} a ${gap} y transpirando`,
            `📊 ${who(leader.team)} pisa fuerte: ${leader.total} puntos y mirando a todos por encima del hombro. Insoportable`,
          ]), detail: 'La tabla no miente. Por ahora.' });
    }
    if (last && last.team !== leader.team && last.total < leader.total) {
      stories.push({ priority: 2, tag: 'CRISIS', mood: 'crisis', emoji: '🚑', actors: [last.team], title: pickOne([
        `🚑 ${who(last.team)} EN TERAPIA INTENSIVA: último de la tabla con ${last.total} puntos. Monitores titilando, suero al palo y pronóstico reservado`,
        `🪦 CRISIS TERMINAL: ${who(last.team)} farolito rojo con ${last.total} puntos. Los hinchas piden la renuncia del DT (que es él mismo)`,
        `📉 ${who(last.team)} en zona de descenso espiritual: ${last.total} puntos y el vestuario en llamas`,
      ]), detail: '¿Hay proyecto? La dirigencia no responde llamados.' });
    }

    // El creador en llamas: el que programó el prode, hundido en la tabla.
    const creator = standings.find((item) => item.team === CREATOR_TEAM);
    const creatorPos = creator ? standings.indexOf(creator) + 1 : 0;
    if (creator && creator.team !== last?.team && creatorPos >= Math.ceil(standings.length * 0.6)) {
      stories.push({ priority: 2, tag: 'EL CREADOR', mood: 'papelon', emoji: '🤡', actors: [creator.team], title: pickOne([
        `🤡 EL COLMO: ${who(creator.team)} PROGRAMÓ todo este prode... y va ${creatorPos}° de ${standings.length}. El sistema anda perfecto; el dueño, no tanto`,
        `💻 PAPELÓN DEL ARQUITECTO: ${who(creator.team)} creó la app, las reglas y el arbitraje. Lo único que no logró: acertar. Puesto ${creatorPos} de ${standings.length}`,
      ]), detail: 'Zapatero a tus zapatos. Hizo la cancha pero no la mete ni de penal.' });
    }

    // El amarrete: el que junta puntos al signo pero nunca arriesga un exacto.
    const stingy = standings
      .map((row) => ({ row, m: byTeam[row.team] }))
      .filter(({ m }) => m && (m.exact_results_count || 0) === 0 && (m.correct_winners_count || 0) >= 4)
      .sort((a, b) => (b.m.correct_winners_count || 0) - (a.m.correct_winners_count || 0))[0];
    if (stingy) {
      stories.push({ priority: 3, tag: 'EL AMARRETE', mood: 'exclusivo', emoji: '🐔', actors: [stingy.row.team], cover: stingy.row.team === STINGY_COVER.team ? STINGY_COVER.image : undefined, title: pickOne([
        `🐔 EL REY DEL PUNTITO: ${who(stingy.row.team)} acertó ${stingy.m.correct_winners_count} ganadores y CERO exactos. Juega al 1-0 como si le pagaran por aburrir`,
        `🧤 MÍSTER AMARRETE: ${who(stingy.row.team)} nunca arriesga un resultado. ${stingy.m.correct_winners_count} signos, 0 exactos: el contador del prode`,
      ]), detail: 'Especialista en el resultadito seguro. Riesgo: cero. Adrenalina: menos.' });
    }

    // El oráculo humano: el líder también pifia. Busca un partido cerrado donde sacó 0.
    const leaderMiss = (facts.lockedPicks || []).find((m) => {
      if (m.home_score === null || m.away_score === null) return false;
      const p = (m.picks || []).find((x) => x.team === leader.team);
      return p && scoreMatch({ home_score: p.home, away_score: p.away }, m) === 0;
    });
    if (leaderMiss) {
      const lp = leaderMiss.picks.find((x) => x.team === leader.team);
      stories.push({ priority: 3, tag: 'BOLA PINCHADA', mood: 'crisis', emoji: '🔮', actors: [leader.team], title: pickOne([
        `🔮💨 SE LE PINCHÓ LA BOLA: hasta ${who(leader.team)} es humano — puso ${lp.home}-${lp.away} en ${leaderMiss.home} vs ${leaderMiss.away} y terminó ${leaderMiss.home_score}-${leaderMiss.away_score}. 0 puntos para el "vidente"`,
        `😈 EL ORÁCULO FALLA: ${who(leader.team)} se comió un ${leaderMiss.home_score}-${leaderMiss.away_score} en ${leaderMiss.home} vs ${leaderMiss.away}. La liga festeja que no es de otro planeta`,
      ]), detail: 'Hasta el mejor pincha. La esperanza de los demás renace.' });
    }

    // HISTORIA 1: El rey de los exactos (el que más acertó resultado exacto)
    const exactsSorted = [...standings].sort((a, b) => (b.exacts || 0) - (a.exacts || 0));
    const exactKing = exactsSorted[0];
    const exactRunner = exactsSorted[1];
    if (exactKing && (exactKing.exacts || 0) >= 2 && (exactKing.exacts || 0) > (exactRunner?.exacts || 0) + 2) {
      stories.push({ pin: true, priority: -2, tag: 'EL EXACTÍSIMO', mood: 'exclusivo', emoji: '🎯', actors: [exactKing.team], cover: EXACTO_COVER, title: pickOne([
        `🎯 ESCÁNDALO ESTADÍSTICO: ${who(exactKing.team)} tiene ${exactKing.exacts} EXACTOS. El segundo tiene ${exactRunner?.exacts ?? 0}. No es suerte, es conspiración. Pidan la VAR del prode`,
        `🧠 SOBREHUMANO: ${who(exactKing.team)} lleva ${exactKing.exacts} resultados exactos mientras el resto festeja con ${exactRunner?.exacts ?? 0}. Le mandaron el fixture impreso de antemano`,
        `🔮 NADIE LO EXPLICA: ${exactKing.exacts} exactos para ${who(exactKing.team)}. El runner-up tiene ${exactRunner?.exacts ?? 0}. Diferencia abismal. Se exige control antidopaje inmediato`,
      ]), detail: 'La exactitud de este nivel no existe en la naturaleza. Investiguen.' });
    }

    // HISTORIA 2: Los que no pusieron clasificados de grupos (0 pts de grupos)
    const hasGroupPts = standings.some((s) => (s.groupPts || 0) > 0);
    const forgotten = standings.filter((s) => (s.groupPts || 0) === 0);
    if (hasGroupPts && forgotten.length > 0) {
      const forgetNames = forgotten.map((s) => s.team);
      stories.push({ pin: true, priority: -2, tag: 'LOS DESMEMORIADOS', mood: 'escandalo', emoji: '🤦', actors: forgetNames, cover: DESMEMORIADOS_COVER, title: pickOne([
        `🤦 SE OLVIDARON: ${whoList(forgetNames)} no pusieron clasificados de grupos y ahora regalan hasta 35 puntos gratis. Los demás tampoco pueden creerlo`,
        `😱 PAPELÓN COLECTIVO: ${whoList(forgetNames)} no completaron los clasificados de grupos. Mientras el resto suma hasta 35 puntos de bonus, ellos miran el cielo`,
        `🙈 INCREÍBLE: ${whoList(forgetNames)} leen esto por primera vez y recién se enteran que había que poner clasificados. Tarde. Muy tarde`,
      ]), detail: 'Se habilitó la sección. Se mandó el link. Nadie tiene excusa. Y sin embargo.' });
    }

    // HISTORIA 3: El rey de los ganadores (más signos correctos pero pocas exactas)
    const winnerKing = [...standings]
      .filter((s) => (s.winners || 0) > 0 && s.team !== leader.team)
      .sort((a, b) => (b.winners || 0) - (a.winners || 0))[0];
    if (winnerKing && (winnerKing.winners || 0) >= 15) {
      stories.push({ pin: true, priority: -2, tag: 'EL SIGNO VIVIENTE', mood: 'exclusivo', emoji: '✅', actors: [winnerKing.team], cover: SIGNO_COVER, title: pickOne([
        `✅ SABE QUIÉN GANA, NUNCA EL RESULTADO: ${who(winnerKing.team)} acertó ${winnerKing.winners} ganadores — el récord de la liga — pero apenas ${winnerKing.exacts} exactos. Ve el futuro a medias`,
        `🧩 LE FALTA LA MITAD: ${who(winnerKing.team)} lleva ${winnerKing.winners} signos correctos (nadie más en el prode) y solo ${winnerKing.exacts} exactos. Sabe quién gana pero nunca el marcador. Talento raro`,
        `📡 ${who(winnerKing.team).toUpperCase()} CAPTA LA SEÑAL A MEDIAS: ${winnerKing.winners} ganadores acertados y ${winnerKing.exacts} exactos. El resultado le llega con interferencia`,
      ]), detail: 'Intuición pura, precisión ausente. Un fenómeno incomprendido.' });
    }
  } else if (leader && leader.total === 0) {
    stories.push({ priority: 4, tag: 'URGENTE', mood: 'urgente', emoji: '⚔️', actors: [], title: '⚔️ TODOS EN CERO: arranca la guerra del prode y nadie quiere ser el primero en quedar pagando', detail: 'La calma antes de la tormenta.' });
  }

  const chosen = [];
  const usedTags = new Set();
  // Orden: primero las fijadas (pin), después las que tienen portada IA, luego prioridad.
  const ordered = stories
    .map((story) => ({ ...story, jitter: rng() }))
    .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (a.cover ? 0 : 1) - (b.cover ? 0 : 1) || a.priority - b.priority || a.jitter - b.jitter);
  for (const story of ordered) {
    if (chosen.length >= 3) break;
    if (usedTags.has(story.tag) && ordered.length > 3) continue;
    usedTags.add(story.tag);
    chosen.push(story);
  }
  for (const story of ordered) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(story)) chosen.push(story);
  }
  return chosen;
}

function PressScene({ sleeping, byTeam, members }) {
  // Portada ilustrada (generada con IA a partir de los avatares); si no existe
  // o no carga, cae a la escena armada con los avatares reales.
  const [coverOk, setCoverOk] = useState(true);
  const sleepers = sleeping.map((team) => byTeam[team]).filter(Boolean);
  const sleeperIds = new Set(sleepers.map((member) => member.id));
  const party = (members || []).filter((member) => !sleeperIds.has(member.id)).slice(0, 8);
  if (coverOk) {
    return (
      <img
        className="sceneCover"
        src={`${import.meta.env.BASE_URL}press-cover.webp`}
        alt="Los dormidos del prode"
        loading="lazy"
        onError={() => setCoverOk(false)}
      />
    );
  }
  return (
    <div className="pressScene">
      <div className="sceneParty">
        {party.map((member) => <Avatar key={member.id} profile={member} small />)}
      </div>
      <span className="sceneConfetti">🎉</span>
      <span className="sceneConfetti two">🥳</span>
      <span className="sceneConfetti three">🪩</span>
      <div className="sceneSleep">
        {sleepers.slice(0, 4).map((member) => (
          <div key={member.id} className="sceneSleeper">
            <Avatar profile={member} />
            <em>💤</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function PressFigure({ story, byTeam }) {
  const actors = (story.actors || []).map((team) => byTeam[team]).filter(Boolean).slice(0, 3);
  return (
    <div className={`pressFigure mood-${story.mood}${actors.length > 1 ? ' multi' : ''}`}>
      {actors.length ? (
        actors.map((member) => <Avatar key={member.id} profile={member} />)
      ) : (
        <span className="pressEmojiBig">{story.emoji}</span>
      )}
      {actors.length > 0 && <em className="pressBadge">{story.emoji}</em>}
    </div>
  );
}

// Fixture solo de desarrollo: permite ver la Crónica sin la función SQL.
// import.meta.env.DEV es false en producción, así que este bloque no llega al build.
const DEV_FACTS = import.meta.env.DEV
  ? {
      standings: [
        { team: 'Victor', total: 9, exacts: 3 },
        { team: 'La Scaloneta papá!!', total: 7, exacts: 2 },
        { team: 'El Diego FC', total: 4, exacts: 1 },
        { team: 'ElmedijoGorda', total: 0, exacts: 0 },
      ],
      lockedPicks: [
        {
          home: 'Mexico', away: 'South Africa', home_score: 1, away_score: 0,
          picks: [
            { team: 'El Diego FC', home: 1, away: 0 },
            { team: 'Clota FC', home: 2, away: 0 },
            { team: 'ElmedijoGorda', home: 0, away: 2 },
          ],
        },
      ],
      todayMissing: [{ home: 'Argentina', away: 'Australia', absent: ['La Tanoneta'] }],
      earlyMatches: [
        { home: 'Mexico', away: 'South Africa' },
        { home: 'South Korea', away: 'Czech Republic' },
        { home: 'Argentina', away: 'Australia' },
      ],
      earlyMissing: ['La Tanoneta', 'ElmedijoGorda'],
    }
  : null;

function PressRoom({ members }) {
  const [facts, setFacts] = useState(null);
  useEffect(() => {
    supabase.rpc('prode_news_facts').then(({ data, error }) => {
      // En desarrollo el fixture rellena los campos que falten; en producción DEV_FACTS es null.
      if (!error) setFacts(DEV_FACTS ? { ...DEV_FACTS, ...data } : data);
      else if (DEV_FACTS) setFacts(DEV_FACTS);
    });
  }, []);
  const byTeam = useMemo(() => {
    const map = {};
    (members || []).forEach((member) => {
      if (member.team_name) map[member.team_name] = member;
      if (member.real_name) map[member.real_name] = member;
    });
    return map;
  }, [members]);
  const headlines = useMemo(() => buildProdeHeadlines(facts, byTeam), [facts, byTeam]);
  if (!headlines.length) return null;
  return (
    <section className="panel">
      <h2>🗞️ Crónica del Prode</h2>
      <div className="pressList">
        {headlines.map((story) => (
          <article key={story.title} className={`pressItem${story.scene || story.cover ? ' withScene' : ''}`}>
            <div className="pressBody">
              <span className="pressTag">{story.tag}</span>
              <b>{story.title}</b>
              {story.detail && <small>{story.detail}</small>}
            </div>
            {story.cover
              ? (
                <div className="sceneCoverWrap">
                  <img className="sceneCover" src={`${import.meta.env.BASE_URL}${story.cover}`} alt={story.title} loading="lazy" />
                  {(story.actors || []).length > 0 && (
                    <div className="namePlates">
                      {(story.actors || []).map((team) => {
                        const member = byTeam[team];
                        return <span key={team} className="namePlate">{member?.real_name || team}</span>;
                      })}
                    </div>
                  )}
                </div>
              )
              : story.scene
                ? <PressScene sleeping={story.scene.sleeping} byTeam={byTeam} members={members} />
                : <PressFigure story={story} byTeam={byTeam} />}
          </article>
        ))}
      </div>
    </section>
  );
}

function useNews() {
  const [news, setNews] = useState(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}news.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setNews)
      .catch(() => setNews(null));
  }, []);
  return news;
}

function scoreMatch(prediction, match) {
  if (match.home_score === null || match.away_score === null || !prediction) return 0;
  const ph = Number(prediction.home_score);
  const pa = Number(prediction.away_score);
  const rh = Number(match.home_score);
  const ra = Number(match.away_score);
  if (ph === rh && pa === ra) return 3;
  const predictedSign = Math.sign(ph - pa);
  const realSign = Math.sign(rh - ra);
  return predictedSign === realSign ? 1 : 0;
}

function resultKind(prediction, match) {
  const points = scoreMatch(prediction, match);
  if (points === 3) return 'exact';
  if (points === 1) return 'winner';
  return 'miss';
}

function canEditMatch(match) {
  return match.kickoff_at && new Date(match.kickoff_at).getTime() > Date.now();
}

function getMatchdayOpen(matches) {
  const started = matches
    .filter((match) => match.kickoff_at && new Date(match.kickoff_at).getTime() <= Date.now())
    .sort((a, b) => new Date(b.kickoff_at) - new Date(a.kickoff_at));
  return started[0]?.matchday ?? null;
}

function ordinalMatchLabel(number) {
  if (!number) return 'partido de grupo';
  if (number === 1) return '1er partido de grupo';
  if (number === 2) return '2do partido de grupo';
  if (number === 3) return '3er partido de grupo';
  return `${number}° partido`;
}

function annotateTeamMatchNumbers(matches) {
  const counters = {};
  return [...matches]
    .sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0))
    .map((match) => {
      const isGroup = match.stage === 'group' && match.home_team_id && match.away_team_id;
      const homeNumber = isGroup ? (counters[match.home_team_id] || 0) + 1 : null;
      const awayNumber = isGroup ? (counters[match.away_team_id] || 0) + 1 : null;
      if (isGroup) {
        counters[match.home_team_id] = homeNumber;
        counters[match.away_team_id] = awayNumber;
      }
      return { ...match, homeMatchNumber: homeNumber, awayMatchNumber: awayNumber };
    });
}

function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

function App() {
  const { session, loading } = useSession();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profile, setProfile] = useState(null);
  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [groupPredictions, setGroupPredictions] = useState([]);
  const [topScorerPick, setTopScorerPick] = useState(null);
  const [championPick, setChampionPick] = useState(null);
  const [scorerStats, setScorerStats] = useState([]);
  const [settings, setSettings] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = async (silent = false) => {
    if (!session || !supabase) return;
    if (!silent) setBusy(true);
    try {
      const [
        profileRes,
        leagueRes,
        teamsRes,
        playersRes,
        matchesRes,
        predictionsRes,
        groupRes,
        topRes,
        championRes,
        scorersRes,
        settingsRes,
      ] = await Promise.all([
        supabase.from('prode_profiles').select('*, prode_avatars(*)').eq('id', session.user.id).single(),
        supabase.from('prode_leagues').select('*').eq('name', LEAGUE_NAME).single(),
        supabase.from('prode_teams').select('*').order('name'),
        supabase.from('prode_players').select('*, prode_teams(name, flag)').order('name'),
        supabase.from('prode_matches').select('*, home_team:prode_teams!prode_matches_home_team_id_fkey(name, flag), away_team:prode_teams!prode_matches_away_team_id_fkey(name, flag)').order('kickoff_at', { nullsFirst: false }),
        supabase.from('prode_predictions').select('*').eq('user_id', session.user.id),
        supabase.from('prode_group_qualifier_predictions').select('*').eq('user_id', session.user.id),
        supabase.from('prode_top_scorer_predictions').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('prode_champion_predictions').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('prode_scorer_stats').select('*, prode_players(name, prode_teams(name, flag))').order('goals', { ascending: false }),
        supabase.from('prode_admin_settings').select('*').eq('key', 'world_cup').maybeSingle(),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (leagueRes.error) throw leagueRes.error;
      setProfile(profileRes.data);
      setLeague(leagueRes.data);
      setTeams(teamsRes.data || []);
      setPlayers(playersRes.data || []);
      setMatches(matchesRes.data || []);
      setPredictions(predictionsRes.data || []);
      setGroupPredictions(groupRes.data || []);
      setTopScorerPick(topRes.data || null);
      setChampionPick(championRes.data || null);
      setScorerStats(scorersRes.data || []);
      setSettings(settingsRes.data?.value || null);

      const membersRes = await supabase
        .from('prode_league_members')
        .select('prode_profiles(*, prode_avatars(*))')
        .eq('league_id', leagueRes.data.id);
      setMembers((membersRes.data || []).map((row) => row.prode_profiles).filter(Boolean));
    } catch (error) {
      setNotice(error.message || 'No se pudo cargar Prode Amigos.');
    } finally {
      if (!silent) setBusy(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session?.user?.id]);

  // Refresco automático: resultados y puntos entran solos, sin recargar la página.
  // Realtime para enterarse al instante + intervalo y focus como respaldo.
  useEffect(() => {
    if (!session) return undefined;
    const refresh = () => loadData(true);
    const timer = setInterval(refresh, 180000);
    window.addEventListener('focus', refresh);
    const channel = supabase
      .channel('prode-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prode_matches' }, refresh)
      .subscribe();
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const firstKickoffAt = settings?.first_kickoff_at || matches.filter((match) => match.kickoff_at).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))[0]?.kickoff_at;
  // Los especiales cierran en el primer kickoff, salvo prórroga (specials_deadline).
  // Postgres serializa la zona horaria como "+00", que JS no parsea: se normaliza a "+00:00".
  const parseTs = (value) => {
    if (!value) return null;
    const date = new Date(String(value).replace(/([+-]\d{2})$/, '$1:00'));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const specialsCloseAt = [parseTs(firstKickoffAt), parseTs(settings?.specials_deadline)]
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
  const specialLocked = specialsCloseAt ? specialsCloseAt.getTime() <= Date.now() : false;
  const profileReady = Boolean(profile?.team_name);

  const predictionByMatch = useMemo(
    () => Object.fromEntries(predictions.map((prediction) => [prediction.match_id, prediction])),
    [predictions],
  );

  // Fuente única de verdad: los totales que recalcula la base al cargar cada
  // resultado. (Antes se sumaba además un cálculo local de los propios
  // pronósticos, lo que duplicaba los puntos del usuario logueado.)
  const ranking = useMemo(() => {
    return members
      .map((member) => {
        const groupPoints = member.group_qualifier_points || 0;
        const topBonus = member.top_scorer_bonus || 0;
        const championBonus = member.champion_bonus || 0;
        const total = (member.match_points_total || 0) + groupPoints + topBonus + championBonus;
        return {
          ...member,
          exacts: member.exact_results_count || 0,
          winners: member.correct_winners_count || 0,
          groupPoints,
          topBonus,
          championBonus,
          specialPoints: topBonus + championBonus,
          total,
        };
      })
      .sort((a, b) => b.total - a.total || b.exacts - a.exacts || b.specialPoints - a.specialPoints || a.real_name.localeCompare(b.real_name));
  }, [members]);

  if (!hasSupabaseConfig) return <ConfigMissing />;
  if (loading) return <ShellLoader />;
  if (!session) return <Login />;
  if (profile && !profileReady) return <Onboarding profile={profile} onDone={loadData} />;

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <div className="topbar__meta">
          <span>{league?.name || LEAGUE_NAME}</span>
          <button className="iconButton" aria-label="Cerrar sesión" onClick={() => supabase.auth.signOut()}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {notice && <div className="toast" onClick={() => setNotice('')}>{notice}</div>}

      <main className="layout">
        <section className="screen">
          {activeTab === 'dashboard' && <Dashboard profile={profile} ranking={ranking} matches={matches} firstKickoffAt={firstKickoffAt} />}
          {activeTab === 'predictions' && <Predictions matches={matches} predictionByMatch={predictionByMatch} members={members} onSaved={loadData} setNotice={setNotice} />}
          {activeTab === 'points' && <MyPoints matches={matches} predictionByMatch={predictionByMatch} />}
          {activeTab === 'ranking' && <Ranking ranking={ranking} setNotice={setNotice} />}
          {activeTab === 'fixture' && <Fixture matches={matches} />}
          {activeTab === 'rules' && <Rules />}
          {activeTab === 'qualifiers' && (
            <Specials
              league={league}
              teams={teams}
              players={players}
              groupPredictions={groupPredictions}
              topScorerPick={topScorerPick}
              championPick={championPick}
              locked={specialLocked}
              closesAt={specialsCloseAt}
              onSaved={loadData}
              setNotice={setNotice}
            />
          )}
          {activeTab === 'scorers' && <Scorers scorerStats={scorerStats} topScorerPick={topScorerPick} players={players} teams={teams} />}
          {activeTab === 'profile' && (
            <ProfileCard profile={profile} rankingItem={ranking.find((item) => item.id === profile?.id)} championPick={championPick} topScorerPick={topScorerPick} teams={teams} players={players} matches={matches} predictionByMatch={predictionByMatch} />
          )}
          {activeTab === 'admin' && profile?.is_admin && <AdminPanel league={league} teams={teams} matches={matches} players={players} onSaved={loadData} setNotice={setNotice} />}
        </section>
      </main>

      <nav className="bottomNav" aria-label="Navegación principal">
        {tabs.concat(profile?.is_admin ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []).map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      {profile && league && <ChatDock profile={profile} members={members} league={league} />}
      {busy && <div className="loadingLine" />}
    </div>
  );
}

const fmtTime = (value) => new Intl.DateTimeFormat('es-AR', { timeStyle: 'short' }).format(new Date(value));

function ChatDock({ profile, members, league }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const listRef = useRef(null);
  const openRef = useRef(false);
  openRef.current = open;
  const memberById = useMemo(() => Object.fromEntries(members.map((member) => [member.id, member])), [members]);

  useEffect(() => {
    if (!league?.id) return undefined;
    let active = true;
    supabase
      .from('prode_chat_messages')
      .select('*')
      .eq('league_id', league.id)
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) return; // tabla todavía no creada: el chat queda oculto
        setMessages((data || []).reverse());
        setReady(true);
      });
    const channel = supabase
      .channel(`prode-chat-${league.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'prode_chat_messages', filter: `league_id=eq.${league.id}` },
        (payload) => {
          setMessages((prev) => (prev.some((item) => item.id === payload.new.id) ? prev : [...prev, payload.new]));
          if (!openRef.current && payload.new.user_id !== profile.id) setUnread((count) => count + 1);
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [league?.id, profile.id]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const send = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    const { error } = await supabase.from('prode_chat_messages').insert({ league_id: league.id, user_id: profile.id, content });
    if (error) setDraft(content);
  };

  if (!ready) return null;

  // Portal al body: .app tiene perspective, que rompe position:fixed adentro.
  return createPortal(
    <>
      <button
        className="chatFab"
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
        onClick={() => {
          setOpen(!open);
          setUnread(0);
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {unread > 0 && <em>{unread > 9 ? '9+' : unread}</em>}
      </button>
      <aside className={`chatPanel${open ? ' open' : ''}`} aria-label="Chat de la liga">
        <header className="chatHeader">
          <MessageCircle size={16} />
          <b>Chat de la liga</b>
          <button className="chatClose" aria-label="Cerrar" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </header>
        <div className="chatMessages" ref={listRef}>
          {messages.map((message) => {
            const author = memberById[message.user_id];
            const own = message.user_id === profile.id;
            return (
              <div key={message.id} className={`chatMsg${own ? ' own' : ''}`}>
                <Avatar profile={author} small />
                <div className="chatBubble">
                  <small>
                    <b>{own ? 'Vos' : author?.team_name || author?.real_name || 'Jugador'}</b> · {fmtTime(message.created_at)}
                  </small>
                  <p>{message.content}</p>
                </div>
              </div>
            );
          })}
          {!messages.length && <p className="muted chatEmpty">Todavía no hay mensajes. ¡Abrí el debate! ⚽</p>}
        </div>
        <form className="chatForm" onSubmit={send}>
          <input
            value={draft}
            maxLength={500}
            placeholder="Escribí algo..."
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="primary chatSend" aria-label="Enviar" disabled={!draft.trim()}>
            <Send size={17} />
          </button>
        </form>
      </aside>
    </>,
    document.body,
  );
}

function ConfigMissing() {
  return (
    <div className="centered">
      <Logo />
      <div className="panel">
        <h1>Falta conectar Supabase</h1>
        <p>Creá un archivo .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Después reiniciá la app.</p>
      </div>
    </div>
  );
}

function ShellLoader() {
  return (
    <div className="centered">
      <Logo />
      <p className="muted">Cargando el vestuario...</p>
    </div>
  );
}

function Logo() {
  return (
    <div className="logo" aria-label="Prode Amigos">
      <div className="logo__mark">PA</div>
      <div>
        <strong>Prode Amigos</strong>
        <small>2P Mundial 2026</small>
      </div>
    </div>
  );
}

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const login = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (authError) setError('Usuario o contraseña incorrectos.');
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="loginHero">
        <Logo />
        <h1>La mesa chica del Mundial.</h1>
        <p>Entrá con tu usuario, cargá tus resultados y peleá el ranking de 2P Mundial 2026.</p>
      </div>
      <form className="authCard sticker" onSubmit={login}>
        <label>
          Usuario
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="chino" autoComplete="username" />
        </label>
        <label>
          Contraseña
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Entrando...' : 'Entrar al prode'}</button>
      </form>
    </div>
  );
}

function Onboarding({ profile, onDone }) {
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault();
    setError('');
    const { error: updateError } = await supabase
      .from('prode_profiles')
      .update({ team_name: teamName.trim() })
      .eq('id', profile.id);
    if (updateError) {
      setError(updateError.message.includes('duplicate') ? 'Ese nombre de equipo ya está usado.' : updateError.message);
      return;
    }
    onDone();
  };
  return (
    <div className="centered">
      <Logo />
      <form className="panel onboarding" onSubmit={save}>
        <Sparkles size={30} />
        <h1>Bienvenido, {profile.real_name}</h1>
        <p>Elegí el nombre de tu equipo. Queda fijo para todo el torneo.</p>
        <input value={teamName} onChange={(event) => setTeamName(event.target.value)} minLength={3} maxLength={32} placeholder="Ej: La Scaloneta 2P" required />
        {error && <p className="error">{error}</p>}
        <button className="primary">Guardar equipo</button>
      </form>
    </div>
  );
}

function Dashboard({ profile, ranking, matches, firstKickoffAt }) {
  const position = ranking.findIndex((item) => item.id === profile?.id) + 1;
  const nextMatch = matches.find((match) => canEditMatch(match));
  const news = useNews();
  return (
    <div className="stack">
      <ProfileSticker profile={profile} compact />
      <div className="statsGrid">
        <Stat label="Posición" value={position ? `#${position}` : '-'} />
        <Stat label="Puntos" value={ranking.find((item) => item.id === profile?.id)?.total ?? 0} />
        <Stat label="Primer partido" value={firstKickoffAt ? fmtDate(firstKickoffAt) : 'A cargar'} />
      </div>
      <PressRoom members={ranking} />
      <section className="panel">
        <h2>Próximo partido</h2>
        {nextMatch ? <MatchTitle match={nextMatch} /> : <p className="muted">Todavía no hay partidos abiertos cargados.</p>}
      </section>
      {news?.items?.length ? (
        <section className="panel">
          <h2>Noticias del Mundial</h2>
          <div className="newsList">
            {news.items.map((item) => (
              <a key={item.url} className={`newsItem${item.image ? ' hasImage' : ''}`} href={item.url} target="_blank" rel="noreferrer">
                <div className="newsBody">
                  <span className={`newsTag${item.tag === 'Argentina' ? ' arg' : ''}`}>{item.tag}</span>
                  <b>{item.title}</b>
                  <small>{item.source} · {timeAgo(item.publishedAt)}</small>
                </div>
                {item.image ? (
                  <img
                    className="newsThumb"
                    src={item.image}
                    alt=""
                    loading="lazy"
                    onError={(event) => { event.currentTarget.closest('.newsItem')?.classList.remove('hasImage'); event.currentTarget.remove(); }}
                  />
                ) : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <section className="panel">
        <h2>Top 5</h2>
        <div className="miniRanking">
          {ranking.slice(0, 5).map((item, index) => (
            <div key={item.id}>
              <span>#{index + 1}</span>
              <b>{item.team_name || 'Sin equipo'}</b>
              <em>{item.total} pts</em>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Predictions({ matches, predictionByMatch, members, onSaved, setNotice }) {
  const annotatedMatches = useMemo(() => annotateTeamMatchNumbers(matches), [matches]);
  const days = [...new Set(annotatedMatches.map((match) => dateKey(match.kickoff_at)))].sort();
  // Día de arranque: hoy si hay partidos, si no el próximo día con partidos.
  const today = dateKey(nowIso());
  const defaultDay = days.includes(today) ? today : (days.find((value) => value >= today) || days[days.length - 1] || 'sin-fecha');
  const [day, setDay] = useState(defaultDay);
  const visible = annotatedMatches.filter((match) => dateKey(match.kickoff_at) === day);
  const segmentedRef = useRef(null);

  useEffect(() => {
    if (days.length && !days.includes(day)) setDay(defaultDay);
  }, [days.join('|')]);

  // Al montar, scroll vertical a la barra de fechas para mostrar los partidos de hoy.
  useEffect(() => {
    if (segmentedRef.current) segmentedRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, []);

  // Re-render periódico: bloquea las tarjetas en vivo cuando llega la hora del partido.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNowTick((tick) => tick + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="stack">
      <Header title="Mi prode" subtitle="Todos arrancan 0-0. Podés editar hasta el horario de inicio. Horarios en tu hora local (🇦🇷 entre paréntesis)." />
      <div ref={segmentedRef}><Segmented options={days} value={day} onChange={setDay} render={(item) => fmtDay(item)} /></div>
      {visible.map((match) => (
        <PredictionEditor key={match.id} match={match} prediction={predictionByMatch[match.id]} members={members} onSaved={onSaved} setNotice={setNotice} />
      ))}
      {!visible.length && <Empty text="Cuando el admin cargue partidos, aparecen acá." />}
    </div>
  );
}

function PredictionEditor({ match, prediction, members, onSaved, setNotice }) {
  const [home, setHome] = useState(prediction?.home_score ?? 0);
  const [away, setAway] = useState(prediction?.away_score ?? 0);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [leaguePicks, setLeaguePicks] = useState(null);
  const [showPicks, setShowPicks] = useState(false);
  const editable = canEditMatch(match);
  const saved = Boolean(prediction);
  const dirty = !saved || Number(home) !== Number(prediction.home_score) || Number(away) !== Number(prediction.away_score);
  const memberById = useMemo(() => Object.fromEntries((members || []).map((member) => [member.id, member])), [members]);
  const finished = match.home_score !== null && match.away_score !== null;

  const togglePicks = async () => {
    if (!showPicks && leaguePicks === null) {
      const { data, error } = await supabase.rpc('prode_match_picks', { match_uuid: match.id });
      if (error) {
        setNotice('No se pudieron cargar los prodes de la liga.');
        return;
      }
      setLeaguePicks(data || []);
    }
    setShowPicks(!showPicks);
  };

  const sortedPicks = useMemo(() => {
    if (!leaguePicks) return [];
    return [...leaguePicks].sort((a, b) => {
      if (finished) {
        const diff = scoreMatch({ home_score: b.home, away_score: b.away }, match) - scoreMatch({ home_score: a.home, away_score: a.away }, match);
        if (diff) return diff;
      }
      const nameA = memberById[a.user_id]?.team_name || '';
      const nameB = memberById[b.user_id]?.team_name || '';
      return nameA.localeCompare(nameB);
    });
  }, [leaguePicks, finished, match, memberById]);

  useEffect(() => {
    setHome(prediction?.home_score ?? 0);
    setAway(prediction?.away_score ?? 0);
  }, [prediction?.id, prediction?.home_score, prediction?.away_score]);

  const save = async () => {
    if (!canEditMatch(match)) {
      setNotice('Ese partido ya está cerrado.');
      return;
    }
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from('prode_predictions').upsert({
      id: prediction?.id,
      user_id: user.user.id,
      league_id: match.league_id,
      match_id: match.id,
      home_score: Number(home),
      away_score: Number(away),
    });
    setSaving(false);
    if (error) {
      setNotice(error.message.includes('locked') ? 'Ese partido ya está cerrado.' : error.message);
      return;
    }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2600);
    onSaved();
  };

  return (
    <article className={`matchCard ${!editable ? 'locked' : ''}`}>
      <div className="matchMeta">
        <span>{fmtKickoff(match.kickoff_at)}</span>
        <strong>{editable ? 'Abierto' : match.status === 'finished' ? 'Finalizado' : 'Cerrado'}</strong>
      </div>
      <div className="matchRound">{match.homeMatchNumber === match.awayMatchNumber ? ordinalMatchLabel(match.homeMatchNumber) : `${match.home_team?.name || 'Local'}: ${ordinalMatchLabel(match.homeMatchNumber)} · ${match.away_team?.name || 'Visitante'}: ${ordinalMatchLabel(match.awayMatchNumber)}`}</div>
      <MatchTitle match={match} />
      <div className="scoreEditor">
        <input aria-label="Goles local" type="number" min="0" value={home} disabled={!editable} onChange={(event) => setHome(event.target.value)} />
        <span>-</span>
        <input aria-label="Goles visitante" type="number" min="0" value={away} disabled={!editable} onChange={(event) => setAway(event.target.value)} />
      </div>
      <button
        className={`secondary saveButton${(saved && !dirty) || justSaved ? ' saved' : ''}`}
        disabled={!editable || saving || (saved && !dirty)}
        onClick={save}
      >
        {!editable ? (
          <><Lock size={17} /> Partido iniciado</>
        ) : justSaved || (saved && !dirty) ? (
          <><Check size={17} strokeWidth={3} /> {justSaved ? '¡Guardado!' : 'Guardado'}</>
        ) : saving ? (
          'Guardando...'
        ) : saved ? (
          <><Save size={17} /> Modificar resultado</>
        ) : (
          <><Save size={17} /> Guardar</>
        )}
      </button>
      {!editable && (
        <>
          <button className="secondary picksToggle" onClick={togglePicks}>
            <Users size={16} /> {showPicks ? 'Ocultar prodes de la liga' : 'Ver qué puso la liga'}
          </button>
          {showPicks && (
            <div className="leaguePicks">
              {sortedPicks.map((pick) => {
                const member = memberById[pick.user_id];
                const points = finished ? scoreMatch({ home_score: pick.home, away_score: pick.away }, match) : null;
                const kind = points === 3 ? 'exact' : points === 1 ? 'winner' : 'miss';
                const own = prediction && pick.user_id === prediction.user_id;
                return (
                  <div key={pick.user_id} className={`leaguePickRow${own ? ' own' : ''}${finished ? ` ${kind}` : ''}`}>
                    <Avatar profile={member} small />
                    <div className="leaguePickName">
                      <b>{member?.team_name || member?.real_name || 'Jugador'}</b>
                      {own && <small>vos</small>}
                    </div>
                    <strong>{pick.home}-{pick.away}</strong>
                    {finished && <em>{points === 3 ? '🎯 3 pts' : points === 1 ? '✓ 1 pt' : '0 pts'}</em>}
                  </div>
                );
              })}
              {!sortedPicks.length && <p className="muted">Nadie cargó pronóstico para este partido.</p>}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function MyPoints({ matches, predictionByMatch }) {
  const played = matches.filter((match) => match.home_score !== null && match.away_score !== null);
  const total = played.reduce((acc, match) => acc + scoreMatch(predictionByMatch[match.id], match), 0);
  return (
    <div className="stack">
      <Header title="Mis puntos" subtitle={`${total} puntos por resultados de partidos.`} />
      {played.map((match) => {
        const prediction = predictionByMatch[match.id];
        const kind = resultKind(prediction, match);
        return (
          <article key={match.id} className={`pointsRow ${kind}`}>
            <MatchTitle match={match} />
            <div>
              <span>Tu prode: {prediction ? `${prediction.home_score}-${prediction.away_score}` : '0-0'}</span>
              <b>Real: {match.home_score}-{match.away_score}</b>
              <strong>{scoreMatch(prediction, match)} pts</strong>
            </div>
          </article>
        );
      })}
      {!played.length && <Empty text="Los puntos aparecen cuando haya resultados cargados." />}
    </div>
  );
}

function Ranking({ ranking, setNotice }) {
  const [expandedId, setExpandedId] = useState(null);
  const [picksByUser, setPicksByUser] = useState({});

  const toggle = async (member) => {
    if (expandedId === member.id) {
      setExpandedId(null);
      return;
    }
    if (!picksByUser[member.id]) {
      const { data, error } = await supabase.rpc('prode_user_picks', { target_user: member.id });
      if (error) {
        setNotice('No se pudo cargar el historial de ese equipo.');
        return;
      }
      setPicksByUser((prev) => ({ ...prev, [member.id]: data || [] }));
    }
    setExpandedId(member.id);
  };

  return (
    <div className="stack">
      <Header title="Ranking" subtitle="👆 Tocá un equipo para ver su goleador, su campeón y sus pronósticos partido a partido." />
      <div className="rankingList">
        {ranking.map((item, index) => (
          <article
            key={item.id}
            className={`rankingCard expandable${index < 3 ? ` podium-${index + 1}` : ''}${expandedId === item.id ? ' open' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => toggle(item)}
            onKeyDown={(event) => { if (event.key === 'Enter') toggle(item); }}
          >
            <span className="rank">{index === 0 ? <Crown size={19} strokeWidth={2.4} /> : `#${index + 1}`}</span>
            <Avatar profile={item} />
            <div className="rankName">
              <b>{item.team_name || 'Sin equipo'}</b>
              <small>{item.real_name}</small>
            </div>
            <div className="rankStats">
              <span>{item.exacts} exactos</span>
              <span>{item.winners} {item.winners === 1 ? 'ganador' : 'ganadores'}</span>
              <strong>{item.total} pts</strong>
            </div>
            {item.groupPoints > 0 && (
              <div className="rankGroupBadge">🏟️ +{item.groupPoints} pts por grupos clasificados</div>
            )}
            {expandedId === item.id && (
              <div className="rankDetail" onClick={(event) => event.stopPropagation()}>
                {(() => {
                  const detail = picksByUser[item.id];
                  const specials = Array.isArray(detail) ? {} : detail || {};
                  const groups = specials.groupQualifiers || [];
                  if (!groups.length) return null;
                  const totalGroupPts = groups.reduce((sum, g) => sum + (g.points || 0), 0);
                  const pickStatus = (predictedPos, actualPos, groupDecided) => {
                    if (actualPos === predictedPos) return '✅';
                    if (actualPos !== null) return '↔️';
                    if (groupDecided) return '❌';
                    return '⏳';
                  };
                  return (
                    <div className="groupQualNotif">
                      <div className={`groupQualBadge${totalGroupPts > 0 ? ' hasPoints' : ''}`}>
                        🏟️ <b>+{totalGroupPts} pts</b> por clasificados
                      </div>
                      {groups.map((g) => (
                        <div key={g.group_code} className="groupQualRow">
                          <span className="groupQualCode">Gr. {g.group_code}</span>
                          <span>{pickStatus(1, g.first_actual_pos, g.group_decided)} 1° {g.first_team}</span>
                          <span>{pickStatus(2, g.second_actual_pos, g.group_decided)} 2° {g.second_team}</span>
                          <b className={g.points > 0 ? 'groupQualPtsPos' : 'groupQualPtsZero'}>{g.points > 0 ? `+${g.points}` : '0'} pts</b>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {(() => {
                  const detail = picksByUser[item.id];
                  const specials = Array.isArray(detail) ? {} : detail || {};
                  if (!specials.topScorer && !specials.champion) return null;
                  return (
                    <div className="rankSpecials">
                      {specials.topScorer && (
                        <span className="specialChip">
                          🥅 Goleador: <b>{specials.topScorer.player}</b> ({specials.topScorer.team})
                          {item.topBonus > 0 && <b className="specialBonusPts"> +{item.topBonus} pts</b>}
                        </span>
                      )}
                      {specials.champion && (
                        <span className="specialChip">
                          🏆 Campeón: <b>{specials.champion.team}</b>
                          {item.championBonus > 0 && <b className="specialBonusPts"> +{item.championBonus} pts</b>}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {(Array.isArray(picksByUser[item.id]) ? picksByUser[item.id] : picksByUser[item.id]?.matches || []).map((pick) => {
                  const played = pick.home_score !== null && pick.away_score !== null;
                  const points = played ? scoreMatch({ home_score: pick.pick_home, away_score: pick.pick_away }, pick) : null;
                  const kind = points === 3 ? 'exact' : points === 1 ? 'winner' : 'miss';
                  const flag = (value) => (value?.startsWith?.('http') ? <img src={value} alt="" /> : value ? <em>{value}</em> : null);
                  return (
                    <div key={`${pick.home}-${pick.away}-${pick.kickoff_at}`} className={`rankDetailRow${played ? ` ${kind}` : ''}`}>
                      <span className="rankDetailMatch">
                        {flag(pick.home_flag)} {pick.home} {played ? `${pick.home_score}-${pick.away_score}` : 'vs'} {pick.away} {flag(pick.away_flag)}
                      </span>
                      <strong>puso {pick.pick_home}-{pick.pick_away}</strong>
                      <em>{!played ? 'en juego' : points === 3 ? '🎯 3 pts' : points === 1 ? '✓ 1 pt' : '0 pts'}</em>
                    </div>
                  );
                })}
                {!(Array.isArray(picksByUser[item.id]) ? picksByUser[item.id] : picksByUser[item.id]?.matches || []).length && (
                  <p className="muted">Todavía no hay partidos cerrados para mostrar.</p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function Rules() {
  const matchRules = [
    ['Resultado exacto', '3 pts', 'Ejemplo: pronosticás 2-1 y termina 2-1.'],
    ['Ganador correcto', '1 pt', 'Ejemplo: ponés 1-0 y gana 3-1.'],
    ['Empate correcto', '1 pt', 'Ejemplo: ponés 2-2 y termina 0-0.'],
    ['Incorrecto', '0 pts', 'No acertaste ni el ganador ni el resultado exacto.'],
  ];
  const specialRules = [
    ['Clasificados por grupo', '1 o 2 pts', 'Equipo correcto en puesto equivocado: 1. Equipo y puesto correcto: 2.'],
    ['Goleador fase de grupos', '5 pts', 'Vale si termina como máximo goleador de grupos. Si hay empate, todos cuentan.'],
    ['Campeón del mundo', '7 pts', 'Se elige antes del primer partido y no se puede cambiar.'],
  ];
  return (
    <div className="stack">
      <Header title="Reglas" subtitle="Puntaje oficial de Prode Amigos para 2P Mundial 2026." />
      <section className="panel">
        <h2>Partidos</h2>
        <div className="rulesGrid">
          {matchRules.map(([title, points, text]) => (
            <article className="ruleCard" key={title}>
              <strong>{points}</strong>
              <b>{title}</b>
              <span>{text}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Especiales</h2>
        <div className="rulesGrid">
          {specialRules.map(([title, points, text]) => (
            <article className="ruleCard" key={title}>
              <strong>{points}</strong>
              <b>{title}</b>
              <span>{text}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Bloqueos y visibilidad</h2>
        <ul className="plainList">
          <li>Cada partido arranca 0-0 para todos.</li>
          <li>Podés modificar el resultado que pusiste todas las veces que quieras hasta el horario de inicio de ese partido.</li>
          <li>Cuando empieza el partido, ese resultado queda bloqueado y ya no se puede cambiar.</li>
          <li>Los prodes de otros se ven cuando empieza la fecha correspondiente.</li>
          <li>Campeón del mundo, goleador de fase de grupos y clasificados de cada grupo se guardan una sola vez.</li>
          <li>Una vez guardados campeón, goleador o clasificados, no se pueden modificar.</li>
        </ul>
      </section>
      <section className="panel">
        <h2>Desempates</h2>
        <ol className="plainList">
          <li>Más resultados exactos.</li>
          <li>Más puntos por clasificados de grupos.</li>
          <li>Más puntos especiales.</li>
          <li>Empate oficial.</li>
        </ol>
      </section>
    </div>
  );
}

function getWinnerTeam(match) {
  if (!match || match.home_score === null || match.away_score === null || match.home_score === match.away_score) return null;
  return Number(match.home_score) > Number(match.away_score) ? match.home_team : match.away_team;
}

function getLoserTeam(match) {
  if (!match || match.home_score === null || match.away_score === null || match.home_score === match.away_score) return null;
  return Number(match.home_score) > Number(match.away_score) ? match.away_team : match.home_team;
}

function byKickoffThenId(a, b) {
  return new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0) || Number(a.external_id || 0) - Number(b.external_id || 0);
}

function buildBracket(matches) {
  const stageNames = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final'];
  const indexedStages = [...stageNames, 'Final'];
  const labels = {
    'Round of 32': '16avos',
    'Round of 16': 'Octavos',
    'Quarter-final': 'Cuartos',
    'Semi-final': 'Semis',
    Final: 'Final',
  };
  const byStage = Object.fromEntries(indexedStages.map((stage) => [stage, matches.filter((match) => match.stage === stage).sort(byKickoffThenId)]));
  const rounds = [];
  let previousWinners = [];
  for (const stage of stageNames) {
    const games = byStage[stage].map((match, index) => ({
      ...match,
      displayHome: match.home_team || previousWinners[index * 2] || null,
      displayAway: match.away_team || previousWinners[index * 2 + 1] || null,
    }));
    rounds.push({ stage, label: labels[stage], games });
    previousWinners = games.map(getWinnerTeam);
  }
  const thirdPlace = matches.find((match) => match.stage === 'Match for third place');
  if (thirdPlace) {
    const semis = rounds.find((round) => round.stage === 'Semi-final')?.games || [];
    rounds.push({
      stage: 'Match for third place',
      label: '3er puesto',
      games: [{
        ...thirdPlace,
        displayHome: thirdPlace.home_team || getLoserTeam(semis[0]) || null,
        displayAway: thirdPlace.away_team || getLoserTeam(semis[1]) || null,
      }],
    });
  }
  rounds.push({
    stage: 'Final',
    label: labels.Final,
    games: byStage.Final.map((match, index) => ({
      ...match,
      displayHome: match.home_team || previousWinners[index * 2] || null,
      displayAway: match.away_team || previousWinners[index * 2 + 1] || null,
    })),
  });
  return rounds;
}

function Fixture({ matches }) {
  const groupMatches = matches.filter((match) => match.stage === 'group');
  const bracket = useMemo(() => buildBracket(matches), [matches]);
  return (
    <div className="stack">
      <Header title="Fixture" subtitle="Fase de grupos y árbol desde 16avos. El cuadro se completa cuando hay ganadores cargados." />
      <section className="panel">
        <h2>Fase de grupos</h2>
        <div className="fixtureSummary">
          <Stat label="Partidos" value={groupMatches.length} />
          <Stat label="Grupos" value="12" />
          <Stat label="Clasifican" value="32" />
        </div>
      </section>
      <section className="panel bracketPanel">
        <h2>Árbol de eliminación</h2>
        <div className="bracket">
          {bracket.map((round) => (
            <div className="bracketRound" key={round.stage}>
              <h3>{round.label}</h3>
              {round.games.map((match) => <BracketMatch key={match.id} match={match} />)}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BracketMatch({ match }) {
  const winner = getWinnerTeam(match);
  return (
    <article className="bracketMatch">
      <div className="bracketMeta">
        <span>{match.external_id ? `#${match.external_id}` : 'Partido'}</span>
        <span>{fmtDay(dateKey(match.kickoff_at))}</span>
      </div>
      <BracketTeam team={match.displayHome || match.home_team} score={match.home_score} winner={winner && winner?.name === (match.displayHome || match.home_team)?.name} />
      <BracketTeam team={match.displayAway || match.away_team} score={match.away_score} winner={winner && winner?.name === (match.displayAway || match.away_team)?.name} />
    </article>
  );
}

function BracketTeam({ team, score, winner }) {
  return (
    <div className={`bracketTeam ${winner ? 'winner' : ''}`}>
      <TeamName team={team} fallback="Por definir" />
      <strong>{score ?? '-'}</strong>
    </div>
  );
}

function Specials({ league, teams, players, groupPredictions, topScorerPick, championPick, locked, closesAt, onSaved, setNotice }) {
  const groups = [...new Set(teams.map((team) => team.group_code).filter(Boolean))].sort();
  const [groupDraft, setGroupDraft] = useState({});
  const [playerId, setPlayerId] = useState(topScorerPick?.player_id || '');
  const [championTeamId, setChampionTeamId] = useState(championPick?.team_id || '');
  const selectedPlayer = players.find((player) => player.id === playerId);
  const selectedChampion = teams.find((team) => team.id === championTeamId);

  // Cerrado para todos una vez vencida la ventana.
  const champLocked = locked;
  const scorerLocked = locked;

  const lockedMessage = (message) => (message.includes('locked') ? 'Los especiales ya cerraron.' : message);

  const saveGroup = async (groupCode) => {
    const { data: user } = await supabase.auth.getUser();
    const existing = groupPredictions.find((item) => item.group_code === groupCode);
    const first = groupDraft[`${groupCode}-1`] ?? existing?.first_team_id;
    const second = groupDraft[`${groupCode}-2`] ?? existing?.second_team_id;
    if (!first || !second || first === second) {
      setNotice('Elegí dos equipos distintos.');
      return;
    }
    const { error } = await supabase.from('prode_group_qualifier_predictions').upsert({
      user_id: user.user.id,
      league_id: league.id,
      group_code: groupCode,
      first_team_id: first,
      second_team_id: second,
    }, { onConflict: 'user_id,league_id,group_code' });
    if (error) setNotice(lockedMessage(error.message));
    else {
      setNotice('Grupo guardado.');
      onSaved();
    }
  };

  const saveTopScorer = async () => {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('prode_top_scorer_predictions')
      .upsert({ user_id: user.user.id, league_id: league.id, player_id: playerId }, { onConflict: 'user_id,league_id' });
    if (error) setNotice(lockedMessage(error.message));
    else {
      setNotice('Goleador guardado.');
      onSaved();
    }
  };

  const saveChampion = async () => {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('prode_champion_predictions')
      .upsert({ user_id: user.user.id, league_id: league.id, team_id: championTeamId }, { onConflict: 'user_id,league_id' });
    if (error) setNotice(lockedMessage(error.message));
    else {
      setNotice('Campeón guardado.');
      onSaved();
    }
  };

  return (
    <div className="stack">
      <Header
        title="Predicciones especiales"
        subtitle={locked
          ? '🔒 Cerrados para el Mundial. El que no cargó, se quedó afuera.'
          : closesAt
            ? `⏰ Podés elegir o modificar hasta el ${fmtDate(closesAt)}.`
            : 'Se guardan una sola vez.'}
      />
      <section className="panel">
        <h2>Campeón</h2>
        {champLocked ? <PickLabel id={championPick.team_id} items={teams} /> : (
          <div className="pickerForm">
            {championPick && <p className="selectedPick">Tu elección actual: <PickLabel id={championPick.team_id} items={teams} /></p>}
            <SearchPicker
              disabled={champLocked}
              items={teams}
              placeholder="Buscar país..."
              selectedId={championTeamId}
              onSelect={setChampionTeamId}
              getTitle={(team) => team.name}
              getSubtitle={(team) => `Grupo ${team.group_code || '-'}`}
              getIcon={(team) => team.flag}
              getSearchText={(team) => `${team.name} ${team.group_code || ''}`}
              emptyText="No encontramos ese país."
            />
            {selectedChampion && <p className="selectedPick">Elegido: <PickLabel id={selectedChampion.id} items={teams} /></p>}
            <button className="secondary" disabled={champLocked || !championTeamId} onClick={saveChampion}>
              {championPick ? 'Modificar campeón' : 'Guardar'}
            </button>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Goleador de grupos</h2>
        {scorerLocked ? <PickLabel id={topScorerPick.player_id} items={players} /> : (
          <div className="pickerForm">
            {topScorerPick && <p className="selectedPick">Tu elección actual: <PickLabel id={topScorerPick.player_id} items={players} /></p>}
            <SearchPicker
              disabled={scorerLocked}
              items={players}
              placeholder="Buscar jugador o país..."
              selectedId={playerId}
              onSelect={setPlayerId}
              getTitle={(player) => player.name}
              getSubtitle={(player) => [player.position, player.prode_teams?.name].filter(Boolean).join(' · ')}
              getIcon={(player) => player.prode_teams?.flag}
              getSearchText={(player) => `${player.name} ${player.position || ''} ${player.prode_teams?.name || ''}`}
              emptyText="No encontramos ese jugador."
            />
            {selectedPlayer && <p className="selectedPick">Elegido: <PickLabel id={selectedPlayer.id} items={players} /></p>}
            <button className="secondary" disabled={scorerLocked || !playerId} onClick={saveTopScorer}>
              {topScorerPick ? 'Modificar goleador' : 'Guardar'}
            </button>
          </div>
        )}
      </section>
      {groups.map((groupCode) => {
        const existing = groupPredictions.find((item) => item.group_code === groupCode);
        const groupTeams = teams.filter((team) => team.group_code === groupCode);
        const groupLocked = locked;
        return (
          <section className="panel" key={groupCode}>
            <h2>Grupo {groupCode}</h2>
            {groupLocked ? (
              <p><PickLabel id={existing.first_team_id} items={teams} /> y <PickLabel id={existing.second_team_id} items={teams} /></p>
            ) : (
              <div className="qualifierForm">
                <select disabled={groupLocked} value={groupDraft[`${groupCode}-1`] ?? existing?.first_team_id ?? ''} onChange={(event) => setGroupDraft({ ...groupDraft, [`${groupCode}-1`]: event.target.value })}>
                  <option value="">1° puesto</option>
                  {groupTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <select disabled={groupLocked} value={groupDraft[`${groupCode}-2`] ?? existing?.second_team_id ?? ''} onChange={(event) => setGroupDraft({ ...groupDraft, [`${groupCode}-2`]: event.target.value })}>
                  <option value="">2° puesto</option>
                  {groupTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <button className="secondary" disabled={groupLocked} onClick={() => saveGroup(groupCode)}>{existing ? 'Modificar grupo' : 'Guardar grupo'}</button>
              </div>
            )}
          </section>
        );
      })}
      {!groups.length && <Empty text="El admin todavía no cargó los grupos." />}
    </div>
  );
}

function SearchPicker({ items, selectedId, onSelect, placeholder, disabled, getTitle, getSubtitle, getIcon, getSearchText, emptyText }) {
  const selected = items.find((item) => item.id === selectedId);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const pool = normalizedQuery
      ? items.filter((item) => getSearchText(item).toLowerCase().includes(normalizedQuery))
      : items;
    return pool.slice(0, 12);
  }, [items, normalizedQuery, getSearchText]);

  useEffect(() => {
    if (selected && !query) setQuery(getTitle(selected));
  }, [selectedId]);

  return (
    <div className="searchPicker">
      <input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          if (selectedId) onSelect('');
        }}
      />
      <div className="searchResults">
        {filtered.map((item) => {
          const icon = getIcon(item);
          const active = item.id === selectedId;
          return (
            <button key={item.id} type="button" className={active ? 'active' : ''} disabled={disabled} onClick={() => {
              onSelect(item.id);
              setQuery(getTitle(item));
            }}>
              <span className="searchIcon">{icon?.startsWith?.('http') ? <img src={icon} alt="" /> : icon}</span>
              <span>
                <b>{getTitle(item)}</b>
                <small>{getSubtitle(item)}</small>
              </span>
            </button>
          );
        })}
        {!filtered.length && <div className="searchEmpty">{emptyText}</div>}
      </div>
    </div>
  );
}

function useScorers() {
  const [scorers, setScorers] = useState(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      // Fuente principal: la base (el robot la refresca cada 10 min sola).
      const { data } = await supabase.from('prode_admin_settings').select('value').eq('key', 'scorers').maybeSingle();
      if (active && data?.value?.items?.length) {
        setScorers(data.value);
        return;
      }
      // Respaldo: el JSON estático del workflow diario.
      const fallback = await fetch(`${import.meta.env.BASE_URL}scorers.json`).then((res) => (res.ok ? res.json() : null)).catch(() => null);
      if (active && fallback) setScorers(fallback);
    };
    load();
    const timer = setInterval(load, 300000);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, []);
  return scorers;
}

const FLAG_ALIASES = { czechia: 'czech republic', 'united states': 'usa', 'korea republic': 'south korea', 'ir iran': 'iran', 'türkiye': 'turkey' };

function Scorers({ scorerStats, topScorerPick, players, teams }) {
  const scorers = useScorers();
  const flagFor = (teamName) => {
    const key = (teamName || '').toLowerCase();
    const normalized = FLAG_ALIASES[key] || key;
    const flag = (teams || []).find((team) => team.name?.toLowerCase() === normalized)?.flag;
    return flag?.startsWith?.('http') ? <img src={flag} alt="" /> : flag ? <em>{flag}</em> : null;
  };
  return (
    <div className="stack">
      <Header title="Goleadores" subtitle="Tabla oficial del Mundial. Para el bonus cuenta solo la fase de grupos." />
      {topScorerPick && <section className="panel"><h2>Tu elegido</h2><PickLabel id={topScorerPick.player_id} items={players} /></section>}
      {(scorers?.items || []).map((row, index) => (
        <article className="rankingCard scorerRow" key={`${row.name}-${row.team}`}>
          <span className="rank">#{index + 1}</span>
          <div className="rankName">
            <b>{row.name}</b>
            <small>{flagFor(row.team)} {row.team}</small>
          </div>
          <strong className="scorerGoals">{row.goals} {row.goals === 1 ? 'gol' : 'goles'}</strong>
        </article>
      ))}
      {scorers?.updatedAt && <p className="muted scorerUpdated">Actualizado {timeAgo(scorers.updatedAt)} · fuente oficial ESPN</p>}
      {!scorers?.items?.length && scorerStats.map((row, index) => (
        <article className="rankingCard" key={row.id}>
          <span className="rank">#{index + 1}</span>
          <div className="rankName">
            <b>{row.prode_players?.name}</b>
            <small>{row.prode_players?.prode_teams?.name}</small>
          </div>
          <strong>{row.goals} goles</strong>
        </article>
      ))}
      {!scorers?.items?.length && !scorerStats.length && <Empty text="Todavía no hay goles en el Mundial." />}
    </div>
  );
}

function ProfileCard({ profile, rankingItem, championPick, topScorerPick, teams, players, matches, predictionByMatch }) {
  const startedDay = getMatchdayOpen(matches);
  const visibleMatches = matches.filter((match) => match.matchday <= startedDay);
  return (
    <div className="stack">
      <ProfileSticker profile={profile} />
      <div className="statsGrid">
        <Stat label="Exactos" value={rankingItem?.exacts || 0} />
        <Stat label="Signos" value={rankingItem?.winners || 0} />
        <Stat label="Grupos" value={rankingItem?.groupPoints || 0} />
        <Stat label="Total" value={rankingItem?.total || 0} />
      </div>
      <section className="panel">
        <h2>Especiales</h2>
        <p>Campeón: {championPick ? <PickLabel id={championPick.team_id} items={teams} /> : 'Sin elegir'}</p>
        <p>Goleador: {topScorerPick ? <PickLabel id={topScorerPick.player_id} items={players} /> : 'Sin elegir'}</p>
      </section>
      <section className="panel">
        <h2>Prodes visibles</h2>
        {visibleMatches.map((match) => <p key={match.id}>{match.home_team?.name} vs {match.away_team?.name}: {predictionByMatch[match.id]?.home_score ?? 0}-{predictionByMatch[match.id]?.away_score ?? 0}</p>)}
        {!visibleMatches.length && <p className="muted">Se ven cuando arranca la fecha.</p>}
      </section>
    </div>
  );
}

function AdminPanel({ league, teams, matches, players, onSaved, setNotice }) {
  const [teamName, setTeamName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerTeam, setPlayerTeam] = useState('');
  const [match, setMatch] = useState({ home_team_id: '', away_team_id: '', kickoff_at: '', matchday: 1 });

  const addTeam = async () => {
    const { error } = await supabase.from('prode_teams').insert({ name: teamName, group_code: groupCode.toUpperCase() });
    if (error) setNotice(error.message);
    else {
      setTeamName('');
      setGroupCode('');
      onSaved();
    }
  };
  const addPlayer = async () => {
    const { error } = await supabase.from('prode_players').insert({ name: playerName, team_id: playerTeam || null });
    if (error) setNotice(error.message);
    else {
      setPlayerName('');
      setPlayerTeam('');
      onSaved();
    }
  };
  const addMatch = async () => {
    const { error } = await supabase.from('prode_matches').insert({ ...match, league_id: league.id, kickoff_at: match.kickoff_at ? new Date(match.kickoff_at).toISOString() : null });
    if (error) setNotice(error.message);
    else onSaved();
  };

  return (
    <div className="stack">
      <Header title="Admin" subtitle="Carga manual para que el prode funcione sin API paga." />
      <section className="panel">
        <h2>Equipo</h2>
        <div className="inlineForm">
          <input placeholder="Argentina" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
          <input placeholder="Grupo" value={groupCode} maxLength={1} onChange={(event) => setGroupCode(event.target.value)} />
          <button className="secondary" onClick={addTeam}><Plus size={16} /> Agregar</button>
        </div>
      </section>
      <section className="panel">
        <h2>Jugador</h2>
        <div className="inlineForm">
          <input placeholder="Lionel Messi" value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
          <select value={playerTeam} onChange={(event) => setPlayerTeam(event.target.value)}>
            <option value="">Equipo</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <button className="secondary" onClick={addPlayer}><Plus size={16} /> Agregar</button>
        </div>
      </section>
      <section className="panel">
        <h2>Partido</h2>
        <div className="qualifierForm">
          <select value={match.home_team_id} onChange={(event) => setMatch({ ...match, home_team_id: event.target.value })}>
            <option value="">Local</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select value={match.away_team_id} onChange={(event) => setMatch({ ...match, away_team_id: event.target.value })}>
            <option value="">Visitante</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <input type="datetime-local" value={match.kickoff_at} onChange={(event) => setMatch({ ...match, kickoff_at: event.target.value })} />
          <input type="number" min="1" value={match.matchday} onChange={(event) => setMatch({ ...match, matchday: Number(event.target.value) })} />
          <button className="secondary" onClick={addMatch}>Crear partido</button>
        </div>
      </section>
      <section className="panel">
        <h2>Partidos cargados</h2>
        {matches.slice(0, 10).map((item) => <p key={item.id}>{item.home_team?.name} vs {item.away_team?.name} · {fmtDate(item.kickoff_at)}</p>)}
      </section>
    </div>
  );
}

function Header({ title, subtitle }) {
  return <div className="sectionHeader"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function ProfileSticker({ profile, compact = false }) {
  return (
    <article className={`profileSticker sticker ${compact ? 'compact' : ''}`}>
      <Avatar profile={profile} large />
      <div>
        <small>{profile?.real_name}</small>
        <h1>{profile?.team_name || 'Sin equipo'}</h1>
      </div>
    </article>
  );
}

function Avatar({ profile, large = false, small = false }) {
  const imageUrl = profile?.username ? `${import.meta.env.BASE_URL}avatars/${profile.username}.webp?v=2` : null;
  const initials = profile?.prode_avatars?.code || profile?.avatar_code || profile?.team_name?.slice(0, 2) || AVATAR_FALLBACK;
  return (
    <div className={`avatar ${imageUrl ? 'photo' : ''} ${large ? 'large' : ''} ${small ? 'small' : ''}`}>
      {imageUrl ? <img src={imageUrl} alt={profile?.real_name || 'Avatar'} onError={(event) => { event.currentTarget.remove(); }} /> : initials}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function MatchTitle({ match }) {
  return (
    <div className="matchTitle">
      <TeamName team={match.home_team} fallback="Local" />
      <b>vs</b>
      <TeamName team={match.away_team} fallback="Visitante" alignRight />
    </div>
  );
}

function TeamName({ team, fallback, alignRight = false }) {
  const flag = team?.flag;
  return (
    <span className={`teamName ${alignRight ? 'right' : ''}`}>
      {flag?.startsWith?.('http') ? <img src={flag} alt="" /> : flag ? <em>{flag}</em> : null}
      <span>{team?.name || fallback}</span>
    </span>
  );
}

function Segmented({ options, value, onChange, render }) {
  const activeRef = useRef(null);
  useEffect(() => {
    if (activeRef.current) activeRef.current.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
  }, [value]);
  if (!options.length) return null;
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option} ref={option === value ? activeRef : null} className={value === option ? 'active' : ''} onClick={() => onChange(option)}>
          {render(option)}
        </button>
      ))}
    </div>
  );
}

function PickLabel({ id, items }) {
  const item = items.find((entry) => entry.id === id);
  return <strong>{item?.flag ? `${item.flag} ` : ''}{item?.name || 'Sin dato'}</strong>;
}

createRoot(document.getElementById('root')).render(<App />);
