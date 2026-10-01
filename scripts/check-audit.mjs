#!/usr/bin/env node
// Verificador de auditoría de dependencias con excepciones explícitas y con
// vencimiento. Reemplaza a `npm audit --audit-level=high` en el paso
// "Auditoría de dependencias" del CI.
//
// El problema que resuelve: `npm audit --audit-level=high` no distingue una
// advisory ya evaluada (como las de nodemailer, que requieren un salto de
// versión mayor con su propia verificación) de una advisory nueva — cada
// vez que algo cambia en el árbol de dependencias, vuelve a bloquear el
// pipeline por completo, aunque el equipo ya haya decidido convivir con esa
// vulnerabilidad puntual por un tiempo acotado.
//
// Esto NO es silenciar la auditoría: cada excepción se declara acá, con
// motivo y fecha de vencimiento, y el script vuelve a exigir una decisión
// pasada esa fecha — además de fallar si la excepción queda obsoleta
// (porque la advisory ya no aparece) o si aparece una advisory nueva no
// contemplada.
//
// Sin dependencias nuevas: solo Node (child_process, Date) y el propio npm.

import { execSync } from "node:child_process";

/**
 * Cada excepción se identifica por el ID de la advisory de GitHub (GHSA),
 * nunca por el nombre del paquete — una advisory nueva en nodemailer (o en
 * cualquier otro paquete que ya tenga una excepción vigente) tiene que
 * seguir bloqueando el pipeline igual, aunque ese mismo paquete ya esté
 * exceptuado para otra advisory distinta.
 *
 * Campos: ghsa, paquete (solo informativo, no se usa para matchear),
 * severidad (la de la advisory puntual, no la del paquete), motivo, y
 * vence ("YYYY-MM-DD") — pasada esa fecha el script falla hasta que se
 * resuelva la vulnerabilidad de verdad o se renueve la fecha a propósito.
 */
const ALLOWLIST = [
  {
    ghsa: "GHSA-6vj9-mwq6-2f5v",
    paquete: "nodemailer",
    severidad: "moderate",
    motivo:
      "salto de versión mayor; nodemailer envía informes y alertas, requiere PR y verificación propios",
    vence: "2026-11-15",
  },
  {
    ghsa: "GHSA-8vvx-rff5-p5rq",
    paquete: "nodemailer",
    severidad: "moderate",
    motivo:
      "salto de versión mayor; nodemailer envía informes y alertas, requiere PR y verificación propios",
    vence: "2026-11-15",
  },
  {
    ghsa: "GHSA-g57g-f23g-4646",
    paquete: "nodemailer",
    severidad: "moderate",
    motivo:
      "salto de versión mayor; nodemailer envía informes y alertas, requiere PR y verificación propios",
    vence: "2026-11-15",
  },
  {
    ghsa: "GHSA-v53p-9fqp-m79j",
    paquete: "nodemailer",
    severidad: "high",
    motivo:
      "salto de versión mayor; nodemailer envía informes y alertas, requiere PR y verificación propios",
    vence: "2026-11-15",
  },
  {
    ghsa: "GHSA-prgh-xp8r-p3m5",
    paquete: "nodemailer",
    severidad: "high",
    motivo:
      "salto de versión mayor; nodemailer envía informes y alertas, requiere PR y verificación propios",
    vence: "2026-11-15",
  },
];

function extraerGhsaDeUrl(url) {
  const m = /GHSA-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}/.exec(url ?? "");
  return m ? m[0] : null;
}

function esAltaOCritica(severidad) {
  return severidad === "high" || severidad === "critical";
}

function obtenerReporteAuditoria() {
  try {
    const salida = execSync("npm audit --json", {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });
    return JSON.parse(salida);
  } catch (error) {
    // `npm audit` termina con código de salida distinto de 0 en cuanto
    // encuentra cualquier vulnerabilidad (sin importar la severidad) — eso
    // no es un fallo de ESTE script, el JSON igual queda disponible en
    // stdout. Solo se trata como error real si no se puede parsear nada.
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        console.error("No se pudo interpretar la salida de `npm audit --json`.");
        console.error(error.stdout);
        process.exit(1);
      }
    }
    console.error("No se pudo ejecutar `npm audit --json`:", error.message);
    process.exit(1);
  }
}

/**
 * Junta, de todas las entradas de `vulnerabilities`, cada advisory
 * individual encontrada en su campo `via` (los elementos de tipo string de
 * `via` son referencias a OTRO paquete de la cadena, no una advisory en sí
 * — se ignoran acá porque esa dependencia referenciada tiene su propia
 * entrada con sus propios objetos de advisory).
 *
 * Si una advisory high/critical no trae una URL de la que se pueda extraer
 * un GHSA, NO se descarta en silencio — queda identificada por su título,
 * así el chequeo (a) de abajo la sigue bloqueando. Un portón que se queda
 * callado ante algo que no sabe nombrar es peor que no tener portón.
 */
function advisoriesDetectadas(reporte) {
  const vistas = new Map();
  for (const [paquete, vuln] of Object.entries(reporte.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || via === null) continue;
      const ghsa = extraerGhsaDeUrl(via.url) ?? `SIN-GHSA:${via.title ?? paquete}`;
      if (!vistas.has(ghsa)) {
        vistas.set(ghsa, {
          ghsa,
          paquete,
          severidad: via.severity,
          url: via.url ?? "(sin URL)",
          titulo: via.title ?? "(sin título)",
        });
      }
    }
  }
  return [...vistas.values()];
}

function diasRestantes(vence) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaVencimiento = new Date(`${vence}T00:00:00`);
  return Math.round((fechaVencimiento.getTime() - hoy.getTime()) / 86_400_000);
}

function main() {
  const reporte = obtenerReporteAuditoria();
  const advisories = advisoriesDetectadas(reporte);
  const porGhsa = new Map(ALLOWLIST.map((entrada) => [entrada.ghsa, entrada]));
  const ghsaDetectados = new Set(advisories.map((a) => a.ghsa));

  const errores = [];

  // (a) vulnerabilidad high/critical sin excepción declarada.
  for (const a of advisories) {
    if (esAltaOCritica(a.severidad) && !porGhsa.has(a.ghsa)) {
      errores.push(
        `Vulnerabilidad ${a.severidad.toUpperCase()} sin excepción: ${a.ghsa} (${a.paquete}) — ${a.titulo}\n` +
          `    ${a.url}\n` +
          `    Agregarla a la ALLOWLIST de scripts/check-audit.mjs con motivo y fecha de vencimiento, o actualizar la dependencia.`,
      );
    }
  }

  // (b) excepciones vencidas.
  for (const entrada of ALLOWLIST) {
    const dias = diasRestantes(entrada.vence);
    if (dias < 0) {
      errores.push(
        `Excepción vencida: ${entrada.ghsa} (${entrada.paquete}) venció el ${entrada.vence} (hace ${-dias} día(s)).\n` +
          `    Motivo original: ${entrada.motivo}\n` +
          `    Hay que resolver la vulnerabilidad de verdad o renovar la fecha de vencimiento a propósito, no de forma automática.`,
      );
    }
  }

  // (c) excepciones muertas — ya no aparecen en el reporte.
  for (const entrada of ALLOWLIST) {
    if (!ghsaDetectados.has(entrada.ghsa)) {
      errores.push(
        `Excepción muerta: ${entrada.ghsa} (${entrada.paquete}) ya no aparece en \`npm audit\` — hay que borrarla de la ALLOWLIST en scripts/check-audit.mjs.`,
      );
    }
  }

  if (errores.length > 0) {
    console.error("AUDITORIA DE DEPENDENCIAS: FALLO\n");
    for (const e of errores) console.error(`- ${e}\n`);
    process.exit(1);
  }

  console.log("AUDITORIA DE DEPENDENCIAS: OK\n");
  if (ALLOWLIST.length === 0) {
    console.log("Sin excepciones activas.");
  } else {
    console.log("Excepciones activas:");
    for (const entrada of ALLOWLIST) {
      const dias = diasRestantes(entrada.vence);
      console.log(
        `  - ${entrada.ghsa} (${entrada.paquete}, ${entrada.severidad}) — vence ${entrada.vence} (${dias} día(s) restantes)\n` +
          `    Motivo: ${entrada.motivo}`,
      );
    }
  }
}

main();
