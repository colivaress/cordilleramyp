/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer <Image> no acepta ni usa `alt` */
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

/** Ítem de checklist modo 'estado' — Conforme/No conforme/No aplica (como siempre). */
export type ItemEstadoPDF = {
  modo: "estado";
  n: number;
  nombre: string;
  estado: string;
  esNoConforme: boolean;
  observacion: string | null;
  fotoDataUri: string | null;
};

/**
 * Ítem de checklist modo 'fotos' (hoy, únicamente Exportación Chimolsa) — sin
 * Conforme/No conforme/No aplica, solo N fotos obligatorias (N =
 * checklist_items.fotos_requeridas, no es una constante fija).
 */
export type ItemFotosPDF = {
  modo: "fotos";
  n: number;
  nombre: string;
  fotos: string[];
};

export type ItemPDF = ItemEstadoPDF | ItemFotosPDF;

export type FirmasPDF = {
  conductor: { nombre: string; fecha: string; dataUri: string | null };
  fiscalizador: { nombre: string; fecha: string; dataUri: string | null };
};

/** Una revisión del ticket para el informe (§4). */
export type RevisionPDF = {
  numeroRevision: number;
  fechaRevision: string;
  estadoResultante: string;
  conductor: string;
  vencimiento: string;
  items: ItemPDF[];
  firmas: FirmasPDF;
  /**
   * Fase "tipos de inspección" §5/§7 — solo relevante cuando TODOS los ítems
   * de esta revisión son modo 'fotos' (hoy, Exportación Chimolsa): una única
   * observación para toda la revisión, en vez de una por ítem.
   */
  observacionGeneral: string | null;
};

export type InformePDFDatos = {
  numeroInspeccion: number;
  /** Estado a mostrar en la cabecera: la revisión seleccionada ("una") o el
   *  estado actual del ticket ("todas"). */
  estado: string;
  /** §8: logo real de la empresa, embebido como data URI (o null si no carga). */
  logoDataUri: string | null;
  emitidoEl: string;
  /** §4: "una" = una revisión puntual; "todas" = historial completo. */
  modo: "una" | "todas";
  /** Fase "tipos de inspección" — clave de tipos_inspeccion (p. ej. "control_salida"). */
  tipoInspeccion: string;
  /**
   * Título del documento SEGÚN EL TIPO — tipos_inspeccion.titulo, nunca
   * compuesto en código (ya cambió de redacción una vez en esta fase).
   */
  tituloInforme: string;
  cabecera: {
    transporte: string;
    fecha: string;
    procedencia: string;
    tipoCamion: string;
    patenteCamion: string;
    patenteRampla: string;
    supervisor: string;
    /** Campos condicionales — Control de Salida. */
    nombreEncarpador?: string | null;
    nombreGuardia?: string | null;
    /** Campo condicional — Exportación Chimolsa. */
    nroContenedor?: string | null;
  };
  /** modo "una" -> exactamente 1 revisión; modo "todas" -> todas, en orden. */
  revisiones: RevisionPDF[];
};

/**
 * Texto de declaración — SOLO Control de Salida, SOLO cuando la revisión
 * queda sin ningún ítem no conforme. Texto literal, no se parafrasea.
 */
const DECLARACION_CONTROL_SALIDA =
  "Declaro que el aseguramiento de la carga esta realizado conforme al instructivo de encarpe y amarre, por tanto certifico que se puede realizar el traslado seguro de esta carga a destino.";

// §6 en clave documento imprimible: fondo blanco, azul de marca sobrio, slate para texto.
const C = {
  marca: "#1e40af",
  texto: "#0f172b",
  suave: "#475569",
  linea: "#cbd5e1",
  lineaSuave: "#e2e8f0",
  noConforme: "#b91c1c",
  fondoNoConforme: "#fef2f2",
  fondoDeclaracion: "#f0f9ff",
  bordeDeclaracion: "#93c5fd",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: C.texto,
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: C.marca,
    paddingBottom: 10,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTextCol: { flexShrink: 1, paddingRight: 12 },
  logo: { width: 192, height: 96, objectFit: "contain", flexShrink: 0 },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.marca },
  sub: { fontSize: 9, color: C.suave, marginTop: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  celda: { width: "33.33%", marginBottom: 7, paddingRight: 8 },
  etiqueta: {
    fontSize: 7.5,
    color: C.suave,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  valor: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  seccion: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  revTitulo: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.marca,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.linea,
    paddingBottom: 4,
  },
  revMeta: { fontSize: 8.5, color: C.suave, marginBottom: 10 },
  filaHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.linea,
    paddingBottom: 4,
    marginBottom: 2,
  },
  fila: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.lineaSuave,
    paddingVertical: 5,
  },
  cN: { width: "7%", fontSize: 8.5, color: C.suave },
  cElemento: { width: "30%", paddingRight: 6 },
  cResultado: { width: "16%", paddingRight: 6 },
  cObs: { width: "47%" },
  headTxt: { fontSize: 7.5, color: C.suave, textTransform: "uppercase" },
  noConformeTxt: { color: C.noConforme, fontFamily: "Helvetica-Bold" },
  fotoWrap: {
    marginTop: 5,
    padding: 4,
    backgroundColor: C.fondoNoConforme,
    borderRadius: 3,
  },
  foto: { width: 200, height: 150, objectFit: "cover", borderRadius: 2 },
  fotoCaption: { fontSize: 7, color: C.suave, marginTop: 2 },
  declaracion: {
    marginTop: 12,
    marginBottom: 4,
    padding: 10,
    backgroundColor: C.fondoDeclaracion,
    borderWidth: 1,
    borderColor: C.bordeDeclaracion,
    borderRadius: 4,
  },
  declaracionTexto: { fontSize: 9, fontFamily: "Helvetica-Oblique" },
  // Exportación Chimolsa: sin tabla — fotos agrupadas por ítem.
  grupoFoto: { marginBottom: 12 },
  grupoFotoTitulo: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  grupoFotoFilas: { flexDirection: "row", flexWrap: "wrap" },
  fotoGrande: {
    width: 230,
    height: 172,
    objectFit: "cover",
    borderRadius: 3,
    marginRight: 10,
    marginBottom: 6,
  },
  observacionGeneralBox: {
    marginTop: 6,
    marginBottom: 4,
    padding: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: C.lineaSuave,
    borderRadius: 4,
  },
  firmasRow: {
    flexDirection: "row",
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: C.linea,
    paddingTop: 14,
  },
  firmaBox: { width: "50%", paddingRight: 16 },
  firmaImg: {
    width: "100%",
    height: 70,
    objectFit: "contain",
    borderWidth: 1,
    borderColor: C.lineaSuave,
    borderRadius: 3,
  },
  firmaPlaceholder: {
    width: "100%",
    height: 70,
    borderWidth: 1,
    borderColor: C.lineaSuave,
    borderStyle: "dashed",
    borderRadius: 3,
  },
  firmaNombre: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 4 },
  firmaFecha: { fontSize: 7.5, color: C.suave },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: C.suave,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: C.lineaSuave,
    paddingTop: 6,
  },
});

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.celda}>
      <Text style={s.etiqueta}>{k}</Text>
      <Text style={s.valor}>{v || "—"}</Text>
    </View>
  );
}

/** Tabla de Conforme/No conforme/No aplica — ítems modo 'estado' (como siempre). */
function TablaChecklist({ items }: { items: ItemEstadoPDF[] }) {
  return (
    <>
      <View style={s.filaHead}>
        <Text style={[s.cN, s.headTxt]}>#</Text>
        <Text style={[s.cElemento, s.headTxt]}>Elemento</Text>
        <Text style={[s.cResultado, s.headTxt]}>Resultado</Text>
        <Text style={[s.cObs, s.headTxt]}>Observación</Text>
      </View>

      {items.map((it) => (
        <View key={it.n} style={s.fila} wrap={false}>
          <Text style={s.cN}>{it.n}</Text>
          <Text style={s.cElemento}>{it.nombre}</Text>
          <Text style={[s.cResultado, it.esNoConforme ? s.noConformeTxt : {}]}>
            {it.estado}
          </Text>
          <View style={s.cObs}>
            {it.esNoConforme ? (
              <>
                <Text>{it.observacion || "—"}</Text>
                {it.fotoDataUri ? (
                  <View style={s.fotoWrap}>
                    <Image style={s.foto} src={it.fotoDataUri} />
                    <Text style={s.fotoCaption}>Foto de la falla</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text>—</Text>
            )}
          </View>
        </View>
      ))}
    </>
  );
}

/**
 * Exportación Chimolsa — sin Conforme/No conforme: fotos agrupadas por ítem
 * (nombre del ítem encima, sus N fotos debajo) y, al final, la observación
 * general de la revisión (§4/§7 de la fase).
 */
function FotosPorItem({
  items,
  observacionGeneral,
}: {
  items: ItemFotosPDF[];
  observacionGeneral: string | null;
}) {
  return (
    <>
      {items.map((it) => (
        <View key={it.n} style={s.grupoFoto} wrap={false}>
          <Text style={s.grupoFotoTitulo}>
            {it.n}. {it.nombre}
          </Text>
          <View style={s.grupoFotoFilas}>
            {it.fotos.length > 0 ? (
              it.fotos.map((uri, i) => (
                <Image key={i} style={s.fotoGrande} src={uri} />
              ))
            ) : (
              <Text style={s.etiqueta}>Sin fotos</Text>
            )}
          </View>
        </View>
      ))}

      <Text style={s.seccion}>Observaciones</Text>
      <View style={s.observacionGeneralBox}>
        <Text>{observacionGeneral?.trim() || "Sin observaciones."}</Text>
      </View>
    </>
  );
}

/** Checklist + firmas de UNA revisión (mismo layout que el informe de siempre). */
function BloqueRevision({
  r,
  tipoInspeccion,
  conSubtitulo,
  quiebre,
}: {
  r: RevisionPDF;
  tipoInspeccion: string;
  conSubtitulo: boolean;
  quiebre: boolean;
}) {
  // Derivado de los ítems, no de la clave del tipo — un checklist es "todo
  // fotos" cuando ninguno de sus ítems tiene Conforme/No conforme/No aplica.
  const esSoloFotos =
    r.items.length > 0 && r.items.every((it) => it.modo === "fotos");
  const itemsEstado = r.items.filter(
    (it): it is ItemEstadoPDF => it.modo === "estado",
  );

  // §2 de la fase: SOLO Control de Salida, y solo si esta revisión no tiene
  // ningún ítem no conforme.
  const mostrarDeclaracion =
    tipoInspeccion === "control_salida" &&
    !esSoloFotos &&
    !itemsEstado.some((it) => it.esNoConforme);

  return (
    <View break={quiebre}>
      {conSubtitulo && (
        <>
          <Text style={s.revTitulo}>
            Revisión {r.numeroRevision} — {r.fechaRevision} — {r.estadoResultante}
          </Text>
          <Text style={s.revMeta}>
            Conductor: {r.conductor || "—"}   ·   Vencimiento corrección:{" "}
            {r.vencimiento || "—"}
          </Text>
        </>
      )}

      <Text style={s.seccion}>Elementos a Fiscalizar</Text>
      {esSoloFotos ? (
        <FotosPorItem
          items={r.items.filter(
            (it): it is ItemFotosPDF => it.modo === "fotos",
          )}
          observacionGeneral={r.observacionGeneral}
        />
      ) : (
        <TablaChecklist items={itemsEstado} />
      )}

      {mostrarDeclaracion && (
        <View style={s.declaracion} wrap={false}>
          <Text style={s.declaracionTexto}>{DECLARACION_CONTROL_SALIDA}</Text>
        </View>
      )}

      <View style={s.firmasRow} wrap={false}>
        <View style={s.firmaBox}>
          <Text style={s.etiqueta}>Firma Conductor</Text>
          {r.firmas.conductor.dataUri ? (
            <Image style={s.firmaImg} src={r.firmas.conductor.dataUri} />
          ) : (
            <View style={s.firmaPlaceholder} />
          )}
          <Text style={s.firmaNombre}>{r.firmas.conductor.nombre}</Text>
          <Text style={s.firmaFecha}>{r.firmas.conductor.fecha}</Text>
        </View>
        <View style={s.firmaBox}>
          <Text style={s.etiqueta}>Firma Fiscalizador/Supervisor</Text>
          {r.firmas.fiscalizador.dataUri ? (
            <Image style={s.firmaImg} src={r.firmas.fiscalizador.dataUri} />
          ) : (
            <View style={s.firmaPlaceholder} />
          )}
          <Text style={s.firmaNombre}>{r.firmas.fiscalizador.nombre}</Text>
          <Text style={s.firmaFecha}>{r.firmas.fiscalizador.fecha}</Text>
        </View>
      </View>
    </View>
  );
}

export function InformePDF({ datos }: { datos: InformePDFDatos }) {
  const { cabecera: c } = datos;
  const esTodas = datos.modo === "todas";
  const rev0 = datos.revisiones[0];

  return (
    <Document
      title={
        esTodas
          ? `${datos.tituloInforme} - Nro Inspección ${datos.numeroInspeccion} - Todas las revisiones`
          : `${datos.tituloInforme} - Nro Inspección ${datos.numeroInspeccion} Rev ${rev0.numeroRevision}`
      }
      author="Cordillera M&P"
    >
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View style={s.headerRow}>
            {/* §8: título + datos a la izquierda; logo a la derecha.
                Fase "tipos de inspección": el título ya no es un texto fijo
                — sale de tipos_inspeccion.titulo según el tipo del ticket. */}
            <View style={s.headerTextCol}>
              <Text style={s.titulo}>{datos.tituloInforme}</Text>
              <Text style={s.sub}>
                Nro de Inspección {datos.numeroInspeccion} ·{" "}
                {esTodas
                  ? `Todas las revisiones (${datos.revisiones.length})`
                  : `Nro de Revisión ${rev0.numeroRevision}`}{" "}
                · {datos.estado}
              </Text>
            </View>
            {datos.logoDataUri ? (
              <Image style={s.logo} src={datos.logoDataUri} />
            ) : null}
          </View>
        </View>

        <View style={s.grid}>
          <Dato k="Transporte" v={c.transporte} />
          {!esTodas && <Dato k="Conductor" v={rev0.conductor} />}
          <Dato k="Fecha" v={c.fecha} />
          <Dato k="Procedencia" v={c.procedencia} />
          <Dato k="Tipo de camión" v={c.tipoCamion} />
          <Dato k="Patente camión" v={c.patenteCamion} />
          <Dato k="Patente rampla" v={c.patenteRampla} />
          <Dato k="Supervisor" v={c.supervisor} />
          {!esTodas && <Dato k="Vencimiento corrección" v={rev0.vencimiento} />}
          {/* Fase "tipos de inspección" §3: campos condicionales por tipo. */}
          {datos.tipoInspeccion === "control_salida" && (
            <>
              <Dato k="Nombre Encarpador" v={c.nombreEncarpador ?? ""} />
              <Dato k="Nombre Guardia" v={c.nombreGuardia ?? ""} />
            </>
          )}
          {datos.tipoInspeccion === "exportacion_chimolsa" && (
            <Dato k="Nro de Contenedor" v={c.nroContenedor ?? ""} />
          )}
        </View>

        {datos.revisiones.map((r, i) => (
          <BloqueRevision
            key={r.numeroRevision}
            r={r}
            tipoInspeccion={datos.tipoInspeccion}
            conSubtitulo={esTodas}
            quiebre={esTodas && i > 0}
          />
        ))}

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Cordillera M&P · ${datos.tituloInforme} · emitido ${datos.emitidoEl} · pág. ${pageNumber}/${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
