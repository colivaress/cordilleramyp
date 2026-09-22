"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChecklistItemRow,
  respuestaVacia,
  type FotoSlot,
  type RespuestaEditable,
} from "@/components/ChecklistItemRow";
import { SignaturePad } from "@/components/SignaturePad";
import { ChecklistProgreso } from "@/components/ChecklistProgreso";
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { OverlayBloqueante } from "@/components/ui/overlay-bloqueante";
import { nativeSelectClassName } from "@/components/ui/native-select";
import {
  useEstadoGuardado,
  useEstadoGuardadoPorClave,
} from "@/hooks/use-estado-guardado";
import { useAccionLarga } from "@/hooks/use-accion-larga";
import {
  NavegacionNoConfirmadaError,
  useEsperaNavegacion,
} from "@/hooks/use-espera-navegacion";
import { createClient } from "@/lib/supabase/client";
import {
  iniciarInspeccion,
  iniciarReinspeccion,
  finalizarInspeccion,
  finalizarReinspeccion,
  guardarRespuestaItem,
  marcarItemsConforme,
  guardarFirmaRevision,
  guardarFotoChecklistItem,
  guardarObservacionGeneral,
  obtenerEstadoRevision,
} from "@/app/(app)/tickets/actions";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import {
  ETIQUETA_TIPO_INSPECCION,
  ORDEN_TIPOS_INSPECCION,
  type ChecklistItem,
  type ItemEstado,
  type TipoInspeccion,
} from "@/lib/tipos";

type Cabecera = {
  transporte: string;
  conductor: string;
  fecha: string; // datetime-local
  fechaVencimiento: string; // datetime-local
  procedencia: string;
  tipo_camion: string;
  patente_camion: string;
  patente_rampla: string;
};

const cabeceraVacia = (): Cabecera => ({
  transporte: "",
  conductor: "",
  // §1: la fecha/hora de inspección NO es editable — se fija al abrir el
  // formulario. `fechaVencimiento` se precarga según el tipo elegido (§8 de
  // la fase "tipos de inspección"), editable siempre.
  fecha: aDatetimeLocal(new Date()),
  fechaVencimiento: vencimientoPorDefecto(10),
  procedencia: "",
  tipo_camion: "",
  patente_camion: "",
  patente_rampla: "",
});

// §2.7: campos obligatorios de "Datos de Inspección" (validación de cliente).
// §1: `fecha` NO va acá — no es un input, se carga sola y siempre tiene valor.
const CAMPOS_CABECERA: { key: keyof Cabecera; label: string; type?: string }[] = [
  { key: "transporte", label: "Transporte" },
  { key: "conductor", label: "Conductor" },
  {
    key: "fechaVencimiento",
    label: "Fecha de vencimiento de la corrección",
    type: "datetime-local",
  },
  { key: "procedencia", label: "Procedencia" },
  { key: "tipo_camion", label: "Tipo de camión" },
  { key: "patente_camion", label: "Patente camión" },
  { key: "patente_rampla", label: "Patente rampla" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const aDatetimeLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
const isoADatetimeLocal = (iso: string | null | undefined) =>
  iso ? aDatetimeLocal(new Date(iso)) : "";
/** datetime-local + N días → datetime-local. */
function sumarDias(datetimeLocal: string, dias: number): string {
  const d = new Date(datetimeLocal);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + dias);
  return aDatetimeLocal(d);
}
const vencimientoPorDefecto = (dias: number) => sumarDias(aDatetimeLocal(new Date()), dias);

/**
 * Fase "tipos de inspección" — parte 2/4, §8. Control de Salida vence en 1
 * día; los otros tres tipos siguen con 10 días, como hasta ahora. Solo cambia
 * el valor precargado — el campo sigue siendo editable por el supervisor.
 */
function diasVencimientoPorTipo(tipo: string): number {
  return tipo === "control_salida" ? 1 : 10;
}

/**
 * Fase "tipos de inspección" — cantidad de fotos obligatorias de un ítem de
 * modo 'fotos', leída de checklist_items.fotos_requeridas — ya no es una
 * constante del código (algunos ítems piden 1, otros 2).
 */
function cantidadFotosItem(item: ChecklistItem): number {
  return item.modo === "fotos" ? item.fotos_requeridas ?? 0 : 0;
}

async function subirArchivo(
  bucket: string,
  path: string,
  file: Blob,
  contentType: string,
) {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });
  if (error) throw new Error(`Error subiendo ${path}: ${error.message}`);
  return path;
}

const dataUrlABlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());

/** Nombre de archivo único para la foto de una falla (fuera del render). */
function nombreFoto(ext: string) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/**
 * §4.1: comprime/redimensiona la foto ANTES de subirla al bucket `fallas`
 * (máx. 1600px de ancho, JPEG ~80%). Una foto de celular sin comprimir pesa
 * varios MB y hace lento tanto el informe por correo como el lightbox del
 * detalle. Si el navegador no puede decodificar el formato (p. ej. HEIC en
 * Android/Chrome), se sube el archivo original sin tocar.
 */
async function comprimirImagen(
  file: File,
  maxAncho = 1600,
  calidad = 0.8,
): Promise<{ blob: Blob; ext: string }> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const escala = Math.min(1, maxAncho / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin contexto 2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", calidad),
    );
    if (!blob) throw new Error("toBlob devolvió null");
    return { blob, ext: "jpg" };
  } catch {
    return {
      blob: file,
      ext: file.name.split(".").pop()?.toLowerCase() || "jpg",
    };
  }
}

// §2.8 — recuperación tras recargar: en modo "nueva" el ticketId nace como un
// UUID generado en el cliente, sin URL propia (a diferencia de reinspección,
// que vive en /tickets/[id]/reinspeccion). Sin esto, una recarga a mitad de
// camino generaba un UUID NUEVO, dejando el ticket ya creado (con checklist,
// firmas, todo) inalcanzable desde este formulario — no es "se pierde lo que
// no se guardó", es "el ticket entero queda huérfano". Se persiste apenas se
// genera (no recién al crear el ticket) para cubrir también una recarga en
// el paso 1, antes de "Realizar revisión".
const CLAVE_TICKET_EN_PROGRESO = "cordillera-inspeccion-en-progreso";

function ticketIdRecuperadoONuevo(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const guardado = window.localStorage.getItem(CLAVE_TICKET_EN_PROGRESO);
    if (guardado) return guardado;
  } catch {
    // localStorage puede fallar (modo privado, cuota) — degradar a "sin
    // recuperación" en vez de romper la creación de la inspección.
  }
  const nuevo = crypto.randomUUID();
  try {
    window.localStorage.setItem(CLAVE_TICKET_EN_PROGRESO, nuevo);
  } catch {
    /* ver arriba */
  }
  return nuevo;
}

export function InspeccionForm({
  modo,
  items,
  tipos,
  ticketId: ticketIdProp,
  numeroRevision = 1,
  numeroInspeccion = null,
  conductorInicial = "",
  fechaVencimientoInicial = null,
  tipoInspeccionInicial = null,
}: {
  modo: "nueva" | "reinspeccion";
  /**
   * En modo "nueva": TODOS los ítems del checklist, de los 4 tipos, sin
   * filtrar — se filtra acá según el tipo que elija el supervisor. En modo
   * "reinspeccion": ya vienen filtrados por el tipo fijo del ticket.
   */
  items: ChecklistItem[];
  /** Solo modo "nueva" — puebla el combo "Tipo de inspección". */
  tipos?: TipoInspeccion[];
  ticketId?: string;
  numeroRevision?: number;
  /** §2.6: correlativo legible del ticket (solo lectura). Null en inspección nueva sin guardar. */
  numeroInspeccion?: number | null;
  conductorInicial?: string;
  fechaVencimientoInicial?: string | null;
  /** Solo modo "reinspeccion" — el tipo es fijo desde que se creó el ticket. */
  tipoInspeccionInicial?: string | null;
}) {
  const router = useRouter();

  // §2.8: el id del ticket y el nro de revisión se fijan al montar, así cada
  // firma/foto/respuesta se guarda con una ruta estable ANTES de "Finalizar
  // revisión".
  const [ticketId] = useState(
    () => ticketIdProp ?? ticketIdRecuperadoONuevo(),
  );
  const rev = modo === "nueva" ? 1 : numeroRevision;

  const [paso, setPaso] = useState<1 | 2>(1);
  // El paso 2 se monta una sola vez y NO se desmonta al volver atrás (§2.8) — se
  // oculta con CSS para que el <canvas> de las firmas conserve su contenido.
  const [pasoMaxVisto, setPasoMaxVisto] = useState<1 | 2>(1);
  // Nivel 1 — "Realizar revisión" es rápido (una fila), no necesita overlay.
  const guardadoIniciar = useEstadoGuardado();
  // §2.6: en inspección nueva el numero_inspeccion se conoce recién al crear el
  // ticket (al pasar de la cabecera al checklist). En re-inspección viene por prop.
  const [numInsp, setNumInsp] = useState<number | null>(numeroInspeccion);

  const [cabecera, setCabecera] = useState<Cabecera>(cabeceraVacia);

  // Fase "tipos de inspección" — parte 2/4. Combo obligatorio, arranca sin
  // preseleccionar ("Seleccionar…"). Solo aplica en modo "nueva" — en
  // reinspección el tipo es fijo (tipoInspeccionInicial, §3 de la fase).
  const [tipoSeleccionado, setTipoSeleccionado] = useState("");
  const tipoInspeccion =
    modo === "nueva" ? tipoSeleccionado : tipoInspeccionInicial ?? "";
  const [nombreEncarpador, setNombreEncarpador] = useState("");
  const [nombreGuardia, setNombreGuardia] = useState("");
  const [nroContenedor, setNroContenedor] = useState("");

  // §2.6: conductor de ESTA revisión (solo re-inspección), prellenado con el de
  // la revisión anterior. §2.7: la fecha de vencimiento también es por revisión.
  const [conductorRevision, setConductorRevision] = useState(conductorInicial);
  const [vencRevision, setVencRevision] = useState(
    () => isoADatetimeLocal(fechaVencimientoInicial) || vencimientoPorDefecto(10),
  );

  // "Abrir no debe escribir" — en los DOS modos: ni el ticket (modo "nueva")
  // ni la fila de ticket_revisiones (modo "reinspeccion") se crean al pasar
  // de la cabecera al checklist — se crean recién en el PRIMER guardado real
  // (ver asegurarRevision más abajo). Arranca en `null` siempre; el efecto
  // de recuperación al montar lo deja resuelto en `{ok:true}` si ya existía
  // (ticket recuperado de localStorage con progreso real, o revisión de
  // reinspección ya abierta).
  //
  // Guarda la PROMESA en vuelo, no un booleano — bug real, reportado y
  // medido: con un booleano (`revisionAseguradaRef.current`, marcado `true`
  // recién cuando el `await` de iniciarInspeccion/iniciarReinspeccion
  // resuelve), varios guardados disparados casi juntos (ej. "Marcar los
  // pendientes como conforme", que hasta hace poco lanzaba N guardados en
  // paralelo) alcanzaban a leer el booleano en `false` ANTES de que el
  // primero terminara — cada uno disparaba su propio iniciarInspeccion. Como
  // `tickets.numero_inspeccion` es `generated always as identity`, Postgres
  // evalúa `nextval()` para CADA upsert antes de poder resolver el
  // conflicto (aunque termine en UPDATE, no INSERT) — cada llamada de más
  // desperdiciaba un número de secuencia (14-17 por inspección, medido en
  // producción) y varias competían por el mismo candado de fila en
  // `tickets`, explicando buena parte de los 45-60s de espera. Guardando la
  // promesa (no un booleano) y asignándola de forma SÍNCRONA antes de
  // cualquier `await`, la llamada 2 a la N reciben la MISMA promesa en
  // vuelo y esperan su resultado — no disparan una segunda red. Si la
  // promesa termina en error (rechazo o `{ok:false}`), se limpia la
  // referencia para que el próximo guardado pueda reintentar en vez de
  // quedar con un fracaso cacheado para siempre.
  const revisionPromesaRef = useRef<Promise<ResultadoAccion> | null>(null);

  const opcionesTipo = useMemo(() => {
    if (!tipos || tipos.length === 0) return ORDEN_TIPOS_INSPECCION;
    const claves = new Set(tipos.map((t) => t.clave));
    return ORDEN_TIPOS_INSPECCION.filter((c) => claves.has(c));
  }, [tipos]);

  // Ítems del checklist DEL TIPO elegido, ordenados — §4 de la fase.
  const itemsDelTipo = useMemo(() => {
    if (modo === "reinspeccion")
      return [...items].sort((a, b) => a.orden - b.orden);
    if (!tipoSeleccionado) return [];
    return items
      .filter((i) => i.tipo === tipoSeleccionado)
      .sort((a, b) => a.orden - b.orden);
  }, [items, modo, tipoSeleccionado]);

  // §7 de la fase: si TODO el checklist de este tipo es modo 'fotos' (hoy,
  // solo exportacion_chimolsa), no hay Conforme/No conforme por ítem — la
  // observación general (declarada más abajo, ahora común a los 4 tipos) es
  // el único canal para señalar un problema, y por eso ahí sí define el
  // estado resultante (ver cerrarRevision). En el resto de los tipos es solo
  // una nota libre que no toca el estado.
  const esSoloFotos = useMemo(
    () =>
      itemsDelTipo.length > 0 &&
      itemsDelTipo.every((i) => i.modo === "fotos"),
    [itemsDelTipo],
  );

  const [respuestas, setRespuestas] = useState<Record<string, RespuestaEditable>>(
    () =>
      Object.fromEntries(
        itemsDelTipo.map((i) => [i.key, respuestaVacia(cantidadFotosItem(i))]),
      ),
  );
  // Espejo para leer el estado más reciente dentro de callbacks async.
  const respuestasRef = useRef(respuestas);
  useEffect(() => {
    respuestasRef.current = respuestas;
  }, [respuestas]);

  // Para ChecklistProgreso y la validación de "Finalizar revisión" — cuenta
  // ítems modo 'estado' con `estado` real (no null), no una heurística de
  // foco. Con el valor preseleccionado eliminado (§2.7), esto es un hecho:
  // "respondido" significa que hay un valor guardado. Los ítems modo 'fotos'
  // no tienen este campo (se validan por cantidad de fotos, no por estado) —
  // se excluyen acá para no contarlos como "pendientes" para siempre.
  const itemsPendientes = useMemo(
    () =>
      itemsDelTipo.filter(
        (i) => i.modo !== "fotos" && respuestas[i.key]?.estado == null,
      ),
    [itemsDelTipo, respuestas],
  );

  const [observacionGeneral, setObservacionGeneral] = useState("");

  // Retroalimentación visual — nivel 1. Una sola pieza reutilizable
  // (useEstadoGuardado/useEstadoGuardadoPorClave, ver src/hooks): `guardadoItems`
  // cubre los 18 ítems del checklist (una clave por ítem para el select +
  // observación + foto única de modo 'estado'; clave compuesta `key:orden`
  // para cada foto de un ítem modo 'fotos'), y `guardadoObsGeneral` cubre el
  // textarea de observación general — antes no tenía NINGUNA retroalimentación.
  const guardadoItems = useEstadoGuardadoPorClave();
  const guardadoObsGeneral = useEstadoGuardado();
  const guardadoPendientes = useEstadoGuardado();
  const claveFotoModo = (key: string, orden: number) => `${key}:${orden}`;

  // El checklist a mostrar depende del tipo elegido — mientras el supervisor
  // no haya avanzado al paso 2, cambiar el tipo reinicia las respuestas
  // locales (nada se persistió todavía) y vuelve a precargar el vencimiento
  // por defecto de ese tipo (§8 de la fase). Se hace en el propio handler del
  // combo, no en un efecto — es una reacción directa a la elección del
  // usuario, no una sincronización con un sistema externo.
  function onCambiarTipo(nuevoTipo: string) {
    setTipoSeleccionado(nuevoTipo);
    const nuevosItems = nuevoTipo
      ? items
          .filter((i) => i.tipo === nuevoTipo)
          .sort((a, b) => a.orden - b.orden)
      : [];
    setRespuestas(
      Object.fromEntries(
        nuevosItems.map((i) => [i.key, respuestaVacia(cantidadFotosItem(i))]),
      ),
    );
    setObservacionGeneral("");
    if (nuevoTipo) {
      setCabecera((prev) => ({
        ...prev,
        fechaVencimiento: sumarDias(
          prev.fecha,
          diasVencimientoPorTipo(nuevoTipo),
        ),
      }));
    }
  }

  // Nivel 1 (botón) + nivel 2 (overlay bloqueante, no descartable): "Finalizar
  // revisión" puede tardar en el teléfono con mala señal — el overlay evita
  // que el supervisor toque cualquier otra cosa mientras tanto. Un segundo
  // envío acá cerraría la inspección dos veces, no solo un correo de más.
  const guardadoFinalizar = useEstadoGuardado();
  const overlayFinalizar = useAccionLarga();
  const esperarNavegacionInforme = useEsperaNavegacion();

  // §2.8: firmas persistidas en el estado del formulario (sobreviven a navegar
  // entre pasos) + subidas a Storage y a ticket_revisiones apenas se capturan.
  const [firmaConductorUrl, setFirmaConductorUrl] = useState<string | null>(null);
  const [firmaFiscalizadorUrl, setFirmaFiscalizadorUrl] = useState<string | null>(
    null,
  );

  // Recuperación tras recargar — ver ticketIdRecuperadoONuevo() y el
  // comentario de obtenerEstadoRevision(). Corre una sola vez al montar: si
  // el ticket ya existe con progreso guardado (se creó en una carga anterior
  // de esta misma sesión, o es una re-inspección ya empezada antes de esta
  // recarga), reconstruye cabecera, checklist, observación general y firmas
  // — y salta directo al paso 2 si había algo real que mostrar, en vez de
  // forzar a re-completar "Datos de Inspección" para algo que ya existe.
  //
  // Si no hay nada que recuperar (ticket recién creado en esta misma carga,
  // o no existe todavía porque nunca se llegó a "Realizar revisión"),
  // `obtenerEstadoRevision` devuelve `ok: false` y no se toca nada — ese no
  // es un error que el supervisor deba ver.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const res = await obtenerEstadoRevision({ ticketId, revisionNumero: rev });
      if (cancelado || !res.ok) return;

      // Si esto tuvo éxito, autorizarRevisionEnCurso (adentro de
      // obtenerEstadoRevision) ya confirmó que la fila de ticket_revisiones
      // existe y el ticket está en_revision — no hace falta (ni corresponde)
      // volver a llamar iniciarReinspeccion en el próximo guardado.
      revisionPromesaRef.current = Promise.resolve({ ok: true });

      const itemsDeEsteTipo = items
        .filter((i) => i.tipo === res.tipoInspeccion)
        .sort((a, b) => a.orden - b.orden);
      const nuevasRespuestas: Record<string, RespuestaEditable> = Object.fromEntries(
        itemsDeEsteTipo.map((i) => [i.key, respuestaVacia(cantidadFotosItem(i))]),
      );

      let huboAlgo = false;
      for (const it of res.items) {
        const base = nuevasRespuestas[it.itemKey];
        if (!base) continue;
        if (it.estado != null || it.observacion || it.fotoPath || it.fotos.length > 0)
          huboAlgo = true;
        nuevasRespuestas[it.itemKey] = {
          ...base,
          estado: it.estado,
          observacion: it.observacion,
          fotoPath: it.fotoPath,
          fotoNombre: it.fotoPath ? "Foto guardada" : null,
          fotoPreviewUrl: it.fotoUrlFirmada,
          fotos: base.fotos.map((slot, idx) => {
            const guardada = it.fotos.find((f) => f.orden === idx + 1);
            return guardada
              ? {
                  path: guardada.path,
                  nombre: "Foto guardada",
                  previewUrl: guardada.urlFirmada,
                }
              : slot;
          }),
        };
      }
      setRespuestas(nuevasRespuestas);

      if (res.observacionGeneral) {
        setObservacionGeneral(res.observacionGeneral);
        huboAlgo = true;
      }
      if (res.firmaConductorUrl) {
        setFirmaConductorUrl(res.firmaConductorUrl);
        huboAlgo = true;
      }
      if (res.firmaFiscalizadorUrl) {
        setFirmaFiscalizadorUrl(res.firmaFiscalizadorUrl);
        huboAlgo = true;
      }

      if (modo === "nueva") {
        setTipoSeleccionado(res.tipoInspeccion);
        setNumInsp(res.numeroInspeccion);
        // Sin esto, "Volver a los datos" tras recuperar la sesión mostraría
        // el paso 1 en blanco, y reenviarlo pisaría con blancos la cabecera
        // real del ticket (mismo upsert que lo creó) — ver el comentario en
        // obtenerEstadoRevision.
        setCabecera({
          transporte: res.cabecera.transporte,
          conductor: res.cabecera.conductor,
          fecha: isoADatetimeLocal(res.cabecera.fecha),
          fechaVencimiento: isoADatetimeLocal(res.fechaVencimientoRevision),
          procedencia: res.cabecera.procedencia,
          tipo_camion: res.cabecera.tipo_camion,
          patente_camion: res.cabecera.patente_camion,
          patente_rampla: res.cabecera.patente_rampla,
        });
        setNombreEncarpador(res.nombreEncarpador ?? "");
        setNombreGuardia(res.nombreGuardia ?? "");
        setNroContenedor(res.nroContenedor ?? "");
      }

      if (huboAlgo) {
        setPaso(2);
        setPasoMaxVisto(2);
      }
    })();
    return () => {
      cancelado = true;
    };
    // Deliberadamente solo al montar — ticketId/rev son estables durante toda
    // la vida del formulario (§2.8), no hace falta re-ejecutar esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const obsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const obsGeneralTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const timers = obsTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      if (obsGeneralTimer.current) clearTimeout(obsGeneralTimer.current);
    };
  }, []);

  // iOS Safari: tras cerrar el teclado virtual (al salir de un campo de texto),
  // el hit-test de los elementos no siempre se recalcula hasta el próximo
  // scroll — un botón puede quedar "clickeable visualmente" pero sin responder
  // al primer toque hasta que el usuario scrollea. Forzamos un scroll de 1px
  // (con demora, para dar tiempo a la animación de cierre del teclado) apenas
  // se sale de cualquier campo del formulario, para que Safari recalcule solo.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onFocusOut = () => {
      window.setTimeout(() => {
        window.scrollBy(0, 1);
        window.scrollBy(0, -1);
      }, 300);
    };
    form.addEventListener("focusout", onFocusOut);
    return () => form.removeEventListener("focusout", onFocusOut);
  }, []);

  const rutaFirma = (quien: "conductor" | "fiscalizador") =>
    `${ticketId}/${rev}/${quien}.png`;

  const patchResp = useCallback(
    (key: string, patch: Partial<RespuestaEditable>) => {
      setRespuestas((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    },
    [],
  );

  /**
   * "Abrir no debe escribir" — ahora en LOS DOS modos, no solo reinspección:
   * ni `iniciarInspeccion` (crea `tickets` + revisión #1 + siembra el
   * checklist) ni `iniciarReinspeccion` (crea la revisión siguiente) se
   * llaman al avanzar de paso (ver irAlChecklist, que en los dos modos es
   * ahora un simple cambio de paso de cliente). Se llaman acá, envolviendo
   * el PRIMER guardado real (el primer ítem respondido o la primera firma),
   * nunca antes. Si el supervisor entra y sale sin guardar nada, no queda
   * ticket ni revisión a medias — en modo "nueva" eso significa además que
   * `numero_inspeccion` (bigint identity) no avanza: la secuencia solo se
   * consume cuando el INSERT realmente ocurre.
   *
   * `iniciarReinspeccion` deja `tickets.estado` en
   * `en_reparacion_de_observaciones` — NO en `en_revision` — y se queda ahí
   * durante TODA la revisión (ver el comentario grande en esa función,
   * tickets/actions.ts): es lo que mantiene el ticket visible para el
   * resto de los supervisores mientras dura, no solo antes del primer
   * guardado. `iniciarInspeccion` no tiene ese problema — nace en
   * `en_revision` y no hay "otro supervisor" que pueda tomarlo antes de que
   * exista.
   *
   * Idempotente por partida doble: las dos funciones ya lo son
   * (`iniciarInspeccion` hace upsert sobre `tickets` con
   * `onConflict:"id"`; `prepararRevision` hace upsert/insert-ignore sobre
   * `ticket_revisiones`), y este wrapper además evita el viaje de red de
   * más en cada guardado siguiente una vez que revisionPromesaRef ya está
   * resuelta en éxito (seteada acá, o en el efecto de recuperación al
   * montar si ya existía).
   *
   * Este wrapper es una conveniencia, no la barrera real: si algún guardado
   * futuro se agrega sin pasar por acá, `autorizarRevisionEnCurso`
   * (server-side, dentro de cada guardarX) igual lo rechaza con un mensaje
   * claro en vez de escribir mal — compara `tickets.revision_actual` contra
   * el número de revisión recibido, que no va a coincidir si la revisión
   * nunca se creó. Ver el comentario de esa función.
   *
   * 🔴 Storage es la excepción — no la cubre este wrapper. Las políticas RLS
   * de `storage.objects` (migración 20260908210559,
   * `private.puede_editar_ticket`) exigen que la fila de `tickets` YA EXISTA
   * para permitir el INSERT del objeto — si el ticket no existe todavía, la
   * subida misma falla por RLS, antes de llegar a ningún guardarX. En
   * reinspección esto nunca fue un problema (el ticket ya existe desde la
   * inspección original), pero en "nueva" con creación diferida, si el
   * PRIMER guardado real es una foto o una firma, hay que asegurar el
   * ticket ANTES de subir, no después. Por eso `persistirFirma`,
   * `onFotoItem`, `onFotoModoItem` y el re-guardado de firmas en `onSubmit`
   * NO llaman `subirArchivo` directo — usan `subirArchivoAsegurando` (ver
   * más abajo), que llama `asegurarRevision()` primero.
   *
   * 🔴 NO es `async function` a propósito — tiene que ser una función común
   * que devuelve una promesa, para que la asignación a `revisionPromesaRef`
   * ocurra de forma SÍNCRONA, antes de cualquier `await`. Si esto fuera
   * `async` con `await iniciarInspeccion(...)` seguido de la asignación al
   * ref (como era antes, con un booleano), dos llamadas disparadas casi
   * juntas (ej. `Promise.all` de N guardados) verían el ref todavía vacío
   * cada una y arrancarían su propio `iniciarInspeccion` — la carrera que
   * este cambio cierra. Con la asignación síncrona, la llamada 2 a la N
   * encuentran la promesa de la llamada 1 ya en el ref y esperan por ELLA,
   * sin disparar red de más.
   */
  function asegurarRevision(): Promise<ResultadoAccion> {
    if (revisionPromesaRef.current) return revisionPromesaRef.current;
    const promesa: Promise<ResultadoAccion> = (async () => {
      if (modo === "nueva") {
        const res = await iniciarInspeccion({
          ticketId,
          cabecera: {
            transporte: cabecera.transporte,
            conductor: cabecera.conductor,
            fecha: new Date(cabecera.fecha).toISOString(),
            procedencia: cabecera.procedencia,
            tipo_camion: cabecera.tipo_camion,
            patente_camion: cabecera.patente_camion,
            patente_rampla: cabecera.patente_rampla,
          },
          fechaVencimientoISO: new Date(cabecera.fechaVencimiento).toISOString(),
          tipoInspeccion: tipoSeleccionado,
          nombreEncarpador:
            tipoSeleccionado === "control_salida" ? nombreEncarpador : null,
          nombreGuardia:
            tipoSeleccionado === "control_salida" ? nombreGuardia : null,
          nroContenedor:
            tipoSeleccionado === "exportacion_chimolsa" ? nroContenedor : null,
        });
        if (res.ok) setNumInsp(res.numeroInspeccion);
        return res;
      }
      return iniciarReinspeccion({
        ticketId,
        conductor: conductorRevision.trim(),
        fechaVencimientoISO: new Date(vencRevision).toISOString(),
      });
    })()
      .then((res) => {
        // Fracaso de negocio (`{ok:false}`, no una excepción): no queda
        // "asegurada" — limpiar el ref para que el próximo guardado pueda
        // reintentar, en vez de recibir para siempre el mismo fracaso
        // cacheado.
        if (!res.ok) revisionPromesaRef.current = null;
        return res;
      })
      .catch((e) => {
        revisionPromesaRef.current = null;
        throw e;
      });
    revisionPromesaRef.current = promesa;
    return promesa;
  }

  async function conRevisionAsegurada<T>(
    fn: () => Promise<ResultadoAccion<T>>,
  ): Promise<ResultadoAccion<T>> {
    const aseg = await asegurarRevision();
    if (!aseg.ok) return aseg;
    return fn();
  }

  /**
   * `subirArchivo`, pero asegurando el ticket/revisión ANTES de subir — ver
   * el comentario grande de arriba (asegurarRevision). Usar SIEMPRE esta
   * función para subir a Storage desde este formulario, nunca `subirArchivo`
   * directo — es la única forma de que el orden (asegurar → subir) no
   * dependa de que cada call site se acuerde de hacerlo en el orden
   * correcto.
   */
  async function subirArchivoAsegurando(
    bucket: string,
    path: string,
    file: Blob,
    contentType: string,
  ): Promise<string> {
    const aseg = await asegurarRevision();
    if (!aseg.ok) throw new Error(aseg.mensaje);
    return subirArchivo(bucket, path, file, contentType);
  }

  const patchFotoSlot = useCallback(
    (key: string, orden: number, patch: Partial<FotoSlot>) => {
      setRespuestas((prev) => {
        const actual = prev[key];
        if (!actual) return prev;
        const fotos = [...actual.fotos];
        fotos[orden - 1] = { ...fotos[orden - 1], ...patch };
        return { ...prev, [key]: { ...actual, fotos } };
      });
    },
    [],
  );

  async function persistirFirma(
    quien: "conductor" | "fiscalizador",
    dataUrl: string | null,
  ) {
    if (quien === "conductor") setFirmaConductorUrl(dataUrl);
    else setFirmaFiscalizadorUrl(dataUrl);

    try {
      let path: string | null = null;
      if (dataUrl) {
        path = await subirArchivoAsegurando(
          "firmas",
          rutaFirma(quien),
          await dataUrlABlob(dataUrl),
          "image/png",
        );
      } else {
        const supabase = createClient();
        await supabase.storage.from("firmas").remove([rutaFirma(quien)]);
      }
      // §2.8: la ruta queda en ticket_revisiones al instante — sobrevive a una
      // falla de "Finalizar revisión".
      const res = await conRevisionAsegurada(() =>
        guardarFirmaRevision({
          ticketId,
          revisionNumero: rev,
          quien,
          path,
        }),
      );
      if (!res.ok) throw new Error(res.mensaje);
    } catch {
      // Subida diferida: se reintenta sí o sí en onSubmit antes de cerrar.
      toast.warning(
        "No se pudo guardar la firma todavía; se reintentará al finalizar.",
      );
    }
  }

  // §2.7: validación de cliente real — todos los campos deben estar completos.
  // Fase "tipos de inspección": además, el tipo es obligatorio y los campos
  // condicionales de su tipo (§3 de la fase) también.
  const cabeceraCompleta = useMemo(() => {
    if (modo !== "nueva") return true;
    if (!tipoSeleccionado) return false;
    if (!CAMPOS_CABECERA.every((c) => cabecera[c.key].trim() !== "")) return false;
    if (tipoSeleccionado === "control_salida")
      return nombreEncarpador.trim() !== "" && nombreGuardia.trim() !== "";
    if (tipoSeleccionado === "exportacion_chimolsa")
      return nroContenedor.trim() !== "";
    return true;
  }, [modo, tipoSeleccionado, cabecera, nombreEncarpador, nombreGuardia, nroContenedor]);
  const datosRevisionCompletos =
    conductorRevision.trim() !== "" && vencRevision.trim() !== "";
  const puedeAvanzar =
    modo === "nueva" ? cabeceraCompleta : datosRevisionCompletos;

  const noConformes = useMemo(
    () =>
      itemsDelTipo.filter(
        (i) => i.modo === "estado" && respuestas[i.key]?.estado === "no_conforme",
      ),
    [itemsDelTipo, respuestas],
  );

  function setCampoCabecera(key: keyof Cabecera, value: string) {
    setCabecera((prev) => ({ ...prev, [key]: value }));
  }

  function irAlChecklist() {
    if (!puedeAvanzar || guardadoIniciar.pendiente) return;
    // "Abrir no debe escribir" — en LOS DOS modos ahora: avanzar de paso es
    // puro estado de cliente, sin llamada de red. En modo "nueva", la
    // cabecera completa queda en memoria (`cabecera`, `tipoSeleccionado`,
    // etc.) y se manda recién en el primer guardado real, vía
    // asegurarRevision/conRevisionAsegurada — igual que conductor/vencimiento
    // en reinspección. Si el supervisor entra y sale sin tocar nada, no se
    // escribe ni una fila (ni se consume un numero_inspeccion).
    setPaso(2);
    setPasoMaxVisto(2);
  }

  // §2.8: cada respuesta se guarda apenas se marca — no todas juntas al final.
  // Solo para ítems de modo 'estado'. Retroalimentación visual: el select es
  // un control sin debounce, así que arranca directo en "guardando" — no
  // hace falta pasar por marcarCambio().
  async function onEstadoItem(key: string, estado: ItemEstado) {
    patchResp(key, { estado });
    const actual = respuestasRef.current[key];
    try {
      await guardadoItems.ejecutar(key, async () => {
        const res = await conRevisionAsegurada(() =>
          guardarRespuestaItem({
            ticketId,
            revisionNumero: rev,
            itemKey: key,
            estado,
            observacion: actual.observacion,
            fotoPath: actual.fotoPath,
          }),
        );
        if (!res.ok) throw new Error(res.mensaje);
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo guardar el elemento.",
      );
    }
  }

  /**
   * Para no obligar a 18 toques cuando lo normal es que todo esté bien.
   * 🔴 Solo rellena los que están SIN responder (itemsPendientes) — nunca
   * toca un ítem que ya tiene valor, así sea "no conforme". Que este botón
   * pudiera pisar un hallazgo ya registrado sería peor que el problema que
   * viene a resolver (§2.7 de la fase).
   *
   * UNA sola llamada de red para todos los ítems pendientes, no N en
   * paralelo — bug real, reportado y medido: la versión anterior hacía
   * `Promise.all(claves.map(key => onEstadoItem(key, "conforme")))`, es
   * decir, N llamadas a `guardarRespuestaItem` en paralelo, cada una
   * disparando su propio `asegurarRevision()` (ver el comentario grande de
   * esa función) — con 15-18 ítems pendientes, eso son 15-18 upserts
   * concurrentes peleando por el mismo candado de fila en `tickets`,
   * causando tanto los saltos de `numero_inspeccion` como buena parte de
   * los 45-60s de espera medidos en producción. `marcarItemsConforme`
   * (tickets/actions.ts) guarda todos los ítems en un solo upsert; acá se
   * llama UNA vez (vía `conRevisionAsegurada`, no una por ítem) y su
   * resultado se refleja en el indicador de cada fila sin volver a llamar
   * al servidor por cada una — `guardadoItems.ejecutar` recibe la MISMA
   * promesa compartida, no una nueva por ítem.
   */
  async function marcarPendientesConforme() {
    const claves = itemsPendientes.map((i) => i.key);
    if (claves.length === 0) return;
    for (const key of claves) patchResp(key, { estado: "conforme" });
    try {
      await guardadoPendientes.ejecutar(async () => {
        const promesaCompartida = conRevisionAsegurada(() =>
          marcarItemsConforme({ ticketId, revisionNumero: rev, itemKeys: claves }),
        );
        await Promise.all(
          claves.map((key) =>
            guardadoItems.ejecutar(key, async () => {
              const res = await promesaCompartida;
              if (!res.ok) throw new Error(res.mensaje);
            }),
          ),
        );
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo guardar el elemento.",
      );
    }
  }

  function onObservacionItem(key: string, texto: string) {
    // Instantáneo: responde "registré tu toque" antes de programar el
    // debounce, no cuando la request sale (esa es la queja que originó esto).
    guardadoItems.marcarCambio(key);
    patchResp(key, { observacion: texto });
    clearTimeout(obsTimers.current[key]);
    obsTimers.current[key] = setTimeout(async () => {
      const r = respuestasRef.current[key];
      // Solo se persiste si el ítem es no_conforme y ya tiene foto (constraint).
      // Si no, no hay nada que guardar todavía — limpiar el indicador en vez
      // de dejarlo pegado en "cambiando" para siempre.
      if (r.estado !== "no_conforme" || !r.fotoPath) {
        guardadoItems.limpiar(key);
        return;
      }
      try {
        await guardadoItems.ejecutar(key, async () => {
          const res = await conRevisionAsegurada(() =>
            guardarRespuestaItem({
              ticketId,
              revisionNumero: rev,
              itemKey: key,
              // El guard de arriba ya garantiza no_conforme — literal en vez
              // de r.estado para no depender de que el narrowing sobreviva
              // el cierre de la arrow function pasada a ejecutar().
              estado: "no_conforme",
              observacion: texto,
              fotoPath: r.fotoPath,
            }),
          );
          if (!res.ok) throw new Error(res.mensaje);
        });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo guardar la observación.",
        );
      }
    }, 700);
  }

  async function onFotoItem(key: string, file: File | null) {
    if (!file) return;
    // §2.8: solo imágenes fotográficas (rechaza PDF, video, etc.).
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen (JPG, PNG, WEBP o HEIC).");
      return;
    }
    try {
      await guardadoItems.ejecutar(key, async () => {
        const { blob, ext } = await comprimirImagen(file);
        const path = await subirArchivoAsegurando(
          "fallas",
          `${ticketId}/${key}/${nombreFoto(ext)}`,
          blob,
          blob.type || "image/jpeg",
        );
        const previewUrl = URL.createObjectURL(blob);
        patchResp(key, {
          fotoPath: path,
          fotoNombre: file.name,
          fotoPreviewUrl: previewUrl,
        });
        // Ya con foto, la fila no_conforme completa se puede persistir.
        const r = respuestasRef.current[key];
        const res = await conRevisionAsegurada(() =>
          guardarRespuestaItem({
            ticketId,
            revisionNumero: rev,
            itemKey: key,
            estado: "no_conforme",
            observacion: r.observacion,
            fotoPath: path,
          }),
        );
        if (!res.ok) throw new Error(res.mensaje);
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo subir la foto.",
      );
    }
  }

  async function onQuitarFotoItem(key: string) {
    const r = respuestasRef.current[key];
    if (r.fotoPreviewUrl) URL.revokeObjectURL(r.fotoPreviewUrl);
    try {
      await guardadoItems.ejecutar(key, async () => {
        if (r.fotoPath) {
          const supabase = createClient();
          await supabase.storage
            .from("fallas")
            .remove([r.fotoPath])
            .catch(() => {});
        }
        patchResp(key, {
          fotoPath: null,
          fotoNombre: null,
          fotoPreviewUrl: null,
        });
        // Sin foto, la fila no_conforme deja de ser válida: se borra en la BD.
        const res = await conRevisionAsegurada(() =>
          guardarRespuestaItem({
            ticketId,
            revisionNumero: rev,
            itemKey: key,
            estado: "no_conforme",
            observacion: r.observacion,
            fotoPath: null,
          }),
        );
        if (!res.ok) throw new Error(res.mensaje);
      });
    } catch {
      /* no bloquea: "Finalizar revisión" vuelve a validar */
    }
  }

  // Fase "tipos de inspección" — parte 2/4. Fotos de un ítem modo 'fotos':
  // misma lógica de subida inmediata que onFotoItem, pero contra
  // ticket_checklist_fotos (orden explícito, de 1 a fotos_requeridas del
  // ítem), no contra foto_url directamente.
  async function onFotoModoItem(key: string, orden: number, file: File | null) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen (JPG, PNG, WEBP o HEIC).");
      return;
    }
    const clave = claveFotoModo(key, orden);
    try {
      await guardadoItems.ejecutar(clave, async () => {
        const { blob, ext } = await comprimirImagen(file);
        const path = await subirArchivoAsegurando(
          "fallas",
          `${ticketId}/${key}/${orden}-${nombreFoto(ext)}`,
          blob,
          blob.type || "image/jpeg",
        );
        const previewUrl = URL.createObjectURL(blob);
        patchFotoSlot(key, orden, { path, nombre: file.name, previewUrl });
        const res = await conRevisionAsegurada(() =>
          guardarFotoChecklistItem({
            ticketId,
            revisionNumero: rev,
            itemKey: key,
            orden,
            path,
          }),
        );
        if (!res.ok) throw new Error(res.mensaje);
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto.");
    }
  }

  async function onQuitarFotoModoItem(key: string, orden: number) {
    const slot = respuestasRef.current[key]?.fotos[orden - 1];
    if (!slot) return;
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    const clave = claveFotoModo(key, orden);
    try {
      await guardadoItems.ejecutar(clave, async () => {
        if (slot.path) {
          const supabase = createClient();
          await supabase.storage
            .from("fallas")
            .remove([slot.path])
            .catch(() => {});
        }
        patchFotoSlot(key, orden, { path: null, nombre: null, previewUrl: null });
        const res = await conRevisionAsegurada(() =>
          guardarFotoChecklistItem({
            ticketId,
            revisionNumero: rev,
            itemKey: key,
            orden,
            path: null,
          }),
        );
        if (!res.ok) throw new Error(res.mensaje);
      });
    } catch {
      /* no bloquea: "Finalizar revisión" vuelve a validar */
    }
  }

  // Observación general — una sola por revisión, para los 4 tipos. Mismo
  // patrón cambiando→guardando→guardado que el checklist por ítem — antes
  // este campo no tenía ninguna retroalimentación, ni durante ni después.
  function onObservacionGeneral(texto: string) {
    guardadoObsGeneral.marcarCambio();
    setObservacionGeneral(texto);
    if (obsGeneralTimer.current) clearTimeout(obsGeneralTimer.current);
    obsGeneralTimer.current = setTimeout(async () => {
      try {
        await guardadoObsGeneral.ejecutar(async () => {
          const res = await conRevisionAsegurada(() =>
            guardarObservacionGeneral({
              ticketId,
              revisionNumero: rev,
              texto,
            }),
          );
          if (!res.ok) throw new Error(res.mensaje);
        });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo guardar la observación.",
        );
      }
    }, 700);
  }

  /**
   * Devuelve el mensaje de error Y la clave del ítem que lo causó (cuando
   * aplica), para que onSubmit pueda desplazar hasta ahí — con 18 ítems en
   * ~4,5 pantallas, decir "falta uno" no alcanza si el supervisor tiene que
   * buscarlo bajando a mano (ver §9 de la fase).
   */
  function validarChecklist(): { mensaje: string; itemKey?: string } | null {
    // Primero: ¿queda algún ítem modo 'estado' sin responder? Antes esto no
    // existía como caso — todo ítem arrancaba en "Conforme" (§2.7). Se
    // revisa antes que el resto porque lógicamente precede: no tiene sentido
    // validar la observación de un no_conforme si ni siquiera se respondió.
    if (itemsPendientes.length > 0) {
      const primero = itemsPendientes[0];
      return {
        mensaje:
          itemsPendientes.length === 1
            ? `Falta responder "${primero.nombre}".`
            : `Faltan ${itemsPendientes.length} elementos por responder — te llevamos al primero.`,
        itemKey: primero.key,
      };
    }
    for (const item of itemsDelTipo) {
      const r = respuestas[item.key];
      if (!r) return { mensaje: `Falta completar "${item.nombre}".`, itemKey: item.key };
      if (item.modo === "fotos") {
        const requeridas = cantidadFotosItem(item);
        if (r.fotos.length < requeridas || r.fotos.some((f) => !f.path))
          return {
            mensaje: `Faltan fotos en "${item.nombre}" (se requiere${requeridas === 1 ? "" : "n"} ${requeridas}).`,
            itemKey: item.key,
          };
      } else if (r.estado === "no_conforme") {
        if (!r.observacion.trim())
          return { mensaje: `Falta la observación en "${item.nombre}".`, itemKey: item.key };
        if (!r.fotoPath)
          return { mensaje: `Falta la foto de la falla en "${item.nombre}".`, itemKey: item.key };
      }
    }
    if (!firmaConductorUrl) return { mensaje: "Falta la firma del conductor." };
    if (!firmaFiscalizadorUrl)
      return { mensaje: "Falta la firma del fiscalizador/supervisor." };
    return null;
  }

  /** Baja hasta el ítem y enfoca su select — ver validarChecklist. */
  function irAlItemPendiente(itemKey: string) {
    const fila = document.getElementById(`checklist-item-${itemKey}`);
    if (!fila) return;
    fila.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    fila.querySelector("select")?.focus();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validarChecklist();
    if (err) {
      toast.error(err.mensaje);
      if (err.itemKey) irAlItemPendiente(err.itemKey);
      return;
    }
    try {
      await guardadoFinalizar.ejecutar(() =>
        overlayFinalizar.ejecutar(async () => {
          // §2.8: las firmas ya se subieron al capturarse; acá se re-suben con
          // el trazo actual y se re-guarda la ruta, para dejar todo
          // consistente sí o sí antes de cerrar.
          //
          // subirArchivoAsegurando (no subirArchivo directo) acá es defensa en
          // profundidad, no el camino esperado: para llegar hasta acá,
          // validarChecklist() ya exigió ambas firmas y todos los ítems
          // respondidos, así que algún guardado anterior (onEstadoItem/
          // persistirFirma/...) ya debería haber asegurado el ticket/revisión.
          // Pero esos campos son estado de CLIENTE (firmaConductorUrl/
          // firmaFiscalizadorUrl se setean antes del guardado real, no
          // después) — si todos los guardados anteriores fallaron en red
          // (ej. el supervisor trabajó offline y recién ahora hay señal) es
          // posible llegar hasta acá con el ticket todavía sin crear. Sin
          // asegurar primero, esta subida chocaría contra la RLS de
          // storage.objects (exige que `tickets` ya exista, ver el comentario
          // grande en asegurarRevision) antes de llegar a ningún guardarX.
          const firmaConductorPath = await subirArchivoAsegurando(
            "firmas",
            rutaFirma("conductor"),
            await dataUrlABlob(firmaConductorUrl as string),
            "image/png",
          );
          const firmaFiscalizadorPath = await subirArchivoAsegurando(
            "firmas",
            rutaFirma("fiscalizador"),
            await dataUrlABlob(firmaFiscalizadorUrl as string),
            "image/png",
          );
          const resFirmaConductor = await conRevisionAsegurada(() =>
            guardarFirmaRevision({
              ticketId,
              revisionNumero: rev,
              quien: "conductor",
              path: firmaConductorPath,
            }),
          );
          if (!resFirmaConductor.ok) throw new Error(resFirmaConductor.mensaje);
          const resFirmaFiscalizador = await conRevisionAsegurada(() =>
            guardarFirmaRevision({
              ticketId,
              revisionNumero: rev,
              quien: "fiscalizador",
              path: firmaFiscalizadorPath,
            }),
          );
          if (!resFirmaFiscalizador.ok)
            throw new Error(resFirmaFiscalizador.mensaje);

          // §2.8: "Finalizar revisión" solo CIERRA sobre datos ya guardados.
          // finalizarInspeccion/finalizarReinspeccion ya llaman revalidatePath
          // en el servidor sobre /dashboard y /tickets/[id] — un router.refresh()
          // acá duplicaría la carga completa de /report (dos requests a la
          // misma ruta, cada una con su propia revalidación de sesión) sin
          // invalidar nada que no esté invalidado ya.
          let ticketIdInforme: string;
          if (modo === "nueva") {
            const res = await finalizarInspeccion({ ticketId });
            if (!res.ok) throw new Error(res.mensaje);
            // Ya cerrada — dejar de intentar recuperarla en la próxima
            // "Nueva inspección" (ver ticketIdRecuperadoONuevo()).
            try {
              window.localStorage.removeItem(CLAVE_TICKET_EN_PROGRESO);
            } catch {
              /* no crítico: en el peor caso, la próxima carga intenta
                 recuperar un ticket ya cerrado y obtenerEstadoRevision
                 devuelve ok:false — no rompe nada, solo no hidrata. */
            }
            toast.success(
              `Inspección guardada (Nro ${res.numeroInspeccion}). Generar y enviar el informe.`,
            );
            ticketIdInforme = res.ticketId;
          } else {
            const res = await finalizarReinspeccion({
              ticketId,
              revisionNumero: rev,
            });
            if (!res.ok) throw new Error(res.mensaje);
            toast.success("Revisión guardada. Generar y enviar el informe.");
            ticketIdInforme = res.ticketId;
          }
          router.push(`/tickets/${ticketIdInforme}/report`);
          // El overlay se queda visible hasta que el informe esté en
          // pantalla, no hasta acá — ver useEsperaNavegacion: esta promesa
          // no se resuelve sola, la abandona el desmontaje de este
          // componente cuando la navegación real se confirma. Si nunca se
          // confirma, el timeout de adentro se encarga de rendirse.
          await esperarNavegacionInforme();
        }, "Finalizando inspección…"),
      );
    } catch (error) {
      // NavegacionNoConfirmadaError: la inspección SÍ se cerró bien — solo
      // falló mostrar el informe. Un toast.error con lenguaje de "falló"
      // acá haría que el supervisor reintente "Finalizar revisión", y el
      // guard del servidor lo rechazaría con "ya fue finalizada" — dos
      // avisos seguidos por algo que en realidad salió bien.
      if (error instanceof NavegacionNoConfirmadaError) {
        toast.warning(error.message, { duration: 10000 });
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Error al cerrar la revisión. El checklist ya quedó guardado; se puede reintentar desde el ticket.",
        );
      }
    }
  }

  // Fase "tipos de inspección" — §2: el resto de los campos queda
  // deshabilitado hasta elegir un tipo (solo aplica a modo "nueva").
  const camposDeshabilitados =
    paso === 2 || (modo === "nueva" && !tipoSeleccionado);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-6">
      <Card className={cn(paso === 2 && "hidden")}>
        <CardHeader>
          <CardTitle>
            {modo === "nueva" ? "1. Datos de Inspección" : "Datos de esta revisión"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {modo === "nueva" ? (
            <>
              {/* §2.6: el "Nro de Inspección" NO se muestra en este paso — el
                  ticket todavía no existe. Aparece recién en el paso 2 (título
                  "Inspección Nro X"), en el detalle, el informe y la tabla. */}
              {/* Fase "tipos de inspección": primer campo de esta sección,
                  obligatorio, sin valor preseleccionado. */}
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="tipo-inspeccion">Tipo de inspección</Label>
                {/* w-fit + justify-self-start: en una grilla CSS los <select>
                    se estiran a ocupar toda la columna por defecto
                    (justify-items: stretch) — acá se lo dimensiona según su
                    contenido (la opción más larga, "Exportación (Chimolsa)")
                    en vez de a las dos columnas de la grilla. El padding
                    derecho (pr-8) deja lugar cómodo para la flecha nativa
                    del combo, que no debe quedar pegada al texto. */}
                <select
                  id="tipo-inspeccion"
                  required
                  disabled={paso === 2}
                  value={tipoSeleccionado}
                  onChange={(e) => onCambiarTipo(e.target.value)}
                  className={cn(
                    nativeSelectClassName,
                    "w-fit min-w-0 justify-self-start pr-8",
                  )}
                >
                  <option value="">Seleccionar…</option>
                  {opcionesTipo.map((clave) => (
                    <option key={clave} value={clave}>
                      {ETIQUETA_TIPO_INSPECCION[clave]}
                    </option>
                  ))}
                </select>
              </div>
              {/* §1: la fecha/hora de inspección se registra sola, solo lectura. */}
              <div className="grid gap-1.5">
                <Label htmlFor="fecha-inspeccion">
                  Fecha y hora de inspección
                </Label>
                <Input
                  id="fecha-inspeccion"
                  type="text"
                  readOnly
                  disabled
                  value={
                    cabecera.fecha
                      ? new Date(cabecera.fecha).toLocaleString("es-CL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""
                  }
                />
                <span className="text-xs text-muted-foreground">
                  Se registra automáticamente al abrir la inspección.
                </span>
              </div>
              {CAMPOS_CABECERA.map((c) => (
                <div key={c.key} className="grid gap-1.5">
                  <Label htmlFor={c.key}>{c.label}</Label>
                  <Input
                    id={c.key}
                    type={c.type ?? "text"}
                    required
                    disabled={camposDeshabilitados}
                    value={cabecera[c.key]}
                    onChange={(e) => setCampoCabecera(c.key, e.target.value)}
                    // Solo visual — la normalización real (mayúsculas, sin
                    // guiones/puntos, espacios colapsados) la hace el
                    // servidor en iniciarInspeccion (src/lib/patentes.ts),
                    // esto no cambia el valor que se envía.
                    className={
                      c.key === "patente_camion" || c.key === "patente_rampla"
                        ? "uppercase"
                        : undefined
                    }
                  />
                  {c.key === "fechaVencimiento" && (
                    <span className="text-xs text-muted-foreground">
                      {tipoSeleccionado === "control_salida"
                        ? "Se precarga como la fecha de inspección + 1 día. Editable."
                        : "Se precarga como la fecha de inspección + 10 días. Editable."}
                    </span>
                  )}
                </div>
              ))}
              {/* Fase "tipos de inspección" — §3: campos condicionales por tipo. */}
              {tipoSeleccionado === "control_salida" && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nombre-encarpador">Nombre Encarpador</Label>
                    <Input
                      id="nombre-encarpador"
                      required
                      disabled={camposDeshabilitados}
                      value={nombreEncarpador}
                      onChange={(e) => setNombreEncarpador(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nombre-guardia">Nombre Guardia</Label>
                    <Input
                      id="nombre-guardia"
                      required
                      disabled={camposDeshabilitados}
                      value={nombreGuardia}
                      onChange={(e) => setNombreGuardia(e.target.value)}
                    />
                  </div>
                </>
              )}
              {tipoSeleccionado === "exportacion_chimolsa" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="nro-contenedor">Nro de Contenedor</Label>
                  <Input
                    id="nro-contenedor"
                    required
                    disabled={camposDeshabilitados}
                    value={nroContenedor}
                    onChange={(e) => setNroContenedor(e.target.value)}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {numeroInspeccion != null && (
                <div className="grid gap-1.5">
                  <Label htmlFor="numero-inspeccion-re">Nro de Inspección</Label>
                  <Input
                    id="numero-inspeccion-re"
                    readOnly
                    disabled
                    value={String(numeroInspeccion)}
                  />
                </div>
              )}
              {tipoInspeccionInicial && (
                <div className="grid gap-1.5">
                  <Label htmlFor="tipo-inspeccion-re">Tipo de inspección</Label>
                  <Input
                    id="tipo-inspeccion-re"
                    readOnly
                    disabled
                    value={
                      ETIQUETA_TIPO_INSPECCION[tipoInspeccionInicial] ??
                      tipoInspeccionInicial
                    }
                  />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="conductor-revision">Conductor</Label>
                <Input
                  id="conductor-revision"
                  required
                  disabled={paso === 2}
                  value={conductorRevision}
                  onChange={(e) => setConductorRevision(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  Prellenado con el de la revisión anterior. Confirmarlo o
                  ingresar el chofer que se presentó ahora — no cambia el
                  conductor de las revisiones previas.
                </span>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="venc-revision">
                  Fecha de vencimiento de la corrección
                </Label>
                <Input
                  id="venc-revision"
                  type="datetime-local"
                  required
                  disabled={paso === 2}
                  value={vencRevision}
                  onChange={(e) => setVencRevision(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Button
              type="button"
              disabled={!puedeAvanzar || guardadoIniciar.pendiente}
              onClick={irAlChecklist}
            >
              <ContenidoBoton
                pendiente={guardadoIniciar.pendiente}
                texto="Realizar revisión"
                textoPendiente="Preparando revisión…"
              />
            </Button>
            {!puedeAvanzar && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {modo === "nueva" && !tipoSeleccionado
                  ? "Elegir un tipo de inspección para continuar."
                  : "Completar todos los campos para avanzar."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {paso === 2 && !esSoloFotos && itemsDelTipo.length > 0 && (
        <ChecklistProgreso
          respondidos={itemsDelTipo.length - itemsPendientes.length}
          total={itemsDelTipo.length}
        />
      )}

      {pasoMaxVisto === 2 && (
        <div className={cn("grid gap-6", paso === 1 && "hidden")}>
          <Card>
            <CardHeader>
              <CardTitle>
                2. Elementos a Fiscalizar
                {modo === "reinspeccion" ? ` — Revisión #${numeroRevision}` : ""}
              </CardTitle>
              {/* §2.13: el Nro de Inspección se conoce apenas se crea el ticket
                  ("Realizar revisión") — se muestra acá de inmediato. */}
              {(numInsp != null || tipoInspeccion) && (
                <CardDescription>
                  {numInsp != null ? `Inspección Nro ${numInsp}` : ""}
                  {numInsp != null && tipoInspeccion ? " — " : ""}
                  {tipoInspeccion ? ETIQUETA_TIPO_INSPECCION[tipoInspeccion] : ""}
                </CardDescription>
              )}
              {itemsPendientes.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-fit"
                  disabled={guardadoPendientes.pendiente}
                  onClick={marcarPendientesConforme}
                >
                  <ContenidoBoton
                    pendiente={guardadoPendientes.pendiente}
                    texto="Marcar los pendientes como conforme"
                    textoPendiente="Marcando…"
                  />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <div className="px-3">
                  {itemsDelTipo.map((item, idx) => (
                    <ChecklistItemRow
                      key={item.key}
                      indice={idx + 1}
                      item={item}
                      valor={respuestas[item.key]}
                      estadoGuardado={guardadoItems.estadoDe(item.key)}
                      onEstado={(v) => onEstadoItem(item.key, v)}
                      onObservacion={(t) => onObservacionItem(item.key, t)}
                      onFoto={(f) => onFotoItem(item.key, f)}
                      onQuitarFoto={() => onQuitarFotoItem(item.key)}
                      onFotoModo={(orden, f) => onFotoModoItem(item.key, orden, f)}
                      onQuitarFotoModo={(orden) =>
                        onQuitarFotoModoItem(item.key, orden)
                      }
                      estadoGuardadoFoto={(orden) =>
                        guardadoItems.estadoDe(claveFotoModo(item.key, orden))
                      }
                    />
                  ))}
                </div>
              </div>

              {!esSoloFotos && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {noConformes.length === 0
                    ? "Sin elementos no conformes: la revisión finalizará sin observaciones."
                    : `${noConformes.length} elemento(s) no conforme(s): la revisión finalizará con observaciones.`}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Cada elemento se guarda apenas se marca — si algo falla al
                finalizar, el checklist no se pierde.
              </p>

              {/* Observación general — siempre visible, uno por inspección
                  (no por ítem), opcional. Para lo que no encaja en ningún
                  ítem del checklist: algo raro, un detalle del camión o del
                  contenedor, una anotación para quien lea el informe
                  después. NO es el resumen de las fallas — eso ya lo dan
                  las observaciones por ítem (obligatorias en los
                  no_conforme, arriba). Su efecto sobre el estado resultante
                  es asimétrico entre tipos — ver guardarObservacionGeneral /
                  cerrarRevision, no acá. */}
              <div className="mt-4 grid gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="observacion-general">
                    Observación general (opcional)
                  </Label>
                  <IndicadorGuardado estado={guardadoObsGeneral.estado} />
                </div>
                <Textarea
                  id="observacion-general"
                  rows={3}
                  value={observacionGeneral}
                  onChange={(e) => onObservacionGeneral(e.target.value)}
                  placeholder="Algo fuera del checklist: un detalle del camión, de la carga, una anotación para quien lea el informe. No es el resumen de las fallas."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Firmas digitales</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <SignaturePad
                label="Firma Conductor"
                visible={paso === 2}
                initialDataUrl={firmaConductorUrl}
                onChange={(d) => persistirFirma("conductor", d)}
              />
              <SignaturePad
                label="Firma Fiscalizador/Supervisor"
                visible={paso === 2}
                initialDataUrl={firmaFiscalizadorUrl}
                onChange={(d) => persistirFirma("fiscalizador", d)}
              />
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" disabled={guardadoFinalizar.pendiente}>
              <ContenidoBoton
                pendiente={guardadoFinalizar.pendiente}
                texto="Finalizar revisión"
                textoPendiente="Guardando…"
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={guardadoFinalizar.pendiente}
              onClick={() => setPaso(1)}
            >
              Volver a los datos
            </Button>
          </div>
        </div>
      )}
      <OverlayBloqueante
        visible={overlayFinalizar.visible}
        mensaje={overlayFinalizar.mensaje}
      />
    </form>
  );
}
