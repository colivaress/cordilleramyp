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
// La decisión de FALLAR usa el árbol de producción (`npm audit --omit=dev`):
// la mayoría de los paquetes de este proyecto (`shadcn`, el CLI que arrastra
// `@modelcontextprotocol/sdk`/`express`/`proxy-addr`, y las herramientas de
// build que arrastra `fast-glob`/`micromatch`/`braces`) nunca corren en el
// servidor que atiende tráfico — solo en la máquina de quien hace `npm run
// build` o en el propio CI. Bloquear el pipeline por una vulnerabilidad que
// nunca se ejecuta en producción no agrega seguridad real, y en la práctica
// termina entrenando a mirar el check en rojo como "ruido" en vez de una
// señal real.
//
// Dicho eso, una dependencia de build comprometida (supply-chain) puede
// exfiltrar secretos del entorno de CI con la misma facilidad que una de
// producción — así que el árbol de desarrollo NUNCA se descarta en
// silencio: cada hallazgo que solo aparece ahí se imprime igual, como
// advertencia, para que alguien lo mire — simplemente no bloquea el merge
// por sí solo.
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

function obtenerReporteAuditoria(comando) {
  try {
    const salida = execSync(comando, {
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
        console.error(`No se pudo interpretar la salida de \`${comando}\`.`);
        console.error(error.stdout);
        process.exit(1);
      }
    }
    console.error(`No se pudo ejecutar \`${comando}\`:`, error.message);
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
  // Dos árboles: el de producción (`--omit=dev`) es el que decide si el
  // pipeline falla — es el único que puede llegar a ejecutarse en el
  // servidor que atiende tráfico real. El completo (dev + producción) es
  // solo para informar: nunca bloquea por sí solo, pero tampoco se calla.
  const reporteProduccion = obtenerReporteAuditoria("npm audit --omit=dev --json");
  const reporteCompleto = obtenerReporteAuditoria("npm audit --json");
  const advisoriesProduccion = advisoriesDetectadas(reporteProduccion);
  const advisoriesCompletas = advisoriesDetectadas(reporteCompleto);
  const porGhsa = new Map(ALLOWLIST.map((entrada) => [entrada.ghsa, entrada]));
  const ghsaProduccion = new Set(advisoriesProduccion.map((a) => a.ghsa));

  const errores = [];

  // (a) vulnerabilidad high/critical sin excepción declarada — solo cuenta
  // si es alcanzable desde el árbol de producción.
  for (const a of advisoriesProduccion) {
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

  // (c) excepciones muertas — ya no aparecen en el árbol de PRODUCCIÓN. Si
  // una excepción deja de ser alcanzable ahí (por ejemplo porque el paquete
  // que la arrastraba pasó a devDependencies), ya no protege nada y hay que
  // sacarla, aunque siga apareciendo en el árbol completo.
  for (const entrada of ALLOWLIST) {
    if (!ghsaProduccion.has(entrada.ghsa)) {
      errores.push(
        `Excepción muerta: ${entrada.ghsa} (${entrada.paquete}) ya no aparece en el árbol de producción (\`npm audit --omit=dev\`) — hay que borrarla de la ALLOWLIST en scripts/check-audit.mjs.`,
      );
    }
  }

  // Hallazgos que solo existen en el árbol de desarrollo/build (CLIs como
  // `shadcn`, herramientas de build, etc.) — nunca bloquean el pipeline por
  // sí solos, pero se imprimen siempre como advertencia: una dependencia de
  // build comprometida puede exfiltrar los secretos del CI igual que una de
  // producción, así que alguien tiene que verlos.
  const soloEnDesarrollo = advisoriesCompletas.filter((a) => !ghsaProduccion.has(a.ghsa));

  if (errores.length > 0) {
    console.error("AUDITORIA DE DEPENDENCIAS: FALLO\n");
    for (const e of errores) console.error(`- ${e}\n`);
    if (soloEnDesarrollo.length > 0) {
      console.warn("ADVERTENCIA — además, solo en el árbol de desarrollo/build (no bloquean, no se ignoran):\n");
      for (const a of soloEnDesarrollo) {
        console.warn(`  - ${a.severidad.toUpperCase()} ${a.ghsa} (${a.paquete}) — ${a.titulo}\n    ${a.url}\n`);
      }
    }
    process.exit(1);
  }

  console.log("AUDITORIA DE DEPENDENCIAS: OK (árbol de producción, npm audit --omit=dev)\n");
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

  if (soloEnDesarrollo.length > 0) {
    console.warn(
      "\nADVERTENCIA — vulnerabilidades solo en el árbol de desarrollo/build (no ejecutan en producción, " +
        "así que no bloquean el pipeline, pero una dependencia de build comprometida puede exfiltrar los " +
        "secretos del CI igual que una de producción — no se descartan en silencio):\n",
    );
    for (const a of soloEnDesarrollo) {
      console.warn(`  - ${a.severidad.toUpperCase()} ${a.ghsa} (${a.paquete}) — ${a.titulo}\n    ${a.url}\n`);
    }
  }
}

main();
