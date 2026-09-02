/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer <Image> no acepta ni usa `alt` */
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

export type ItemPDF = {
  n: number;
  nombre: string;
  estado: string;
  esNoConforme: boolean;
  observacion: string | null;
  fotoDataUri: string | null;
};

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
  cabecera: {
    transporte: string;
    fecha: string;
    procedencia: string;
    tipoCamion: string;
    patenteCamion: string;
    patenteRampla: string;
    supervisor: string;
  };
  /** modo "una" -> exactamente 1 revisión; modo "todas" -> todas, en orden. */
  revisiones: RevisionPDF[];
};

// §6 en clave documento imprimible: fondo blanco, azul de marca sobrio, slate para texto.
const C = {
  marca: "#1e40af",
  texto: "#0f172b",
  suave: "#475569",
  linea: "#cbd5e1",
  lineaSuave: "#e2e8f0",
  noConforme: "#b91c1c",
  fondoNoConforme: "#fef2f2",
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

/** Checklist + firmas de UNA revisión (mismo layout que el informe de siempre). */
function BloqueRevision({
  r,
  conSubtitulo,
  quiebre,
}: {
  r: RevisionPDF;
  conSubtitulo: boolean;
  quiebre: boolean;
}) {
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
      <View style={s.filaHead}>
        <Text style={[s.cN, s.headTxt]}>#</Text>
        <Text style={[s.cElemento, s.headTxt]}>Elemento</Text>
        <Text style={[s.cResultado, s.headTxt]}>Resultado</Text>
        <Text style={[s.cObs, s.headTxt]}>Observación</Text>
      </View>

      {r.items.map((it) => (
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
          ? `Informe de Inspección - Nro Inspección ${datos.numeroInspeccion} - Todas las revisiones`
          : `Informe de Inspección - Nro Inspección ${datos.numeroInspeccion} Rev ${rev0.numeroRevision}`
      }
      author="Cordillera M&P"
    >
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View style={s.headerRow}>
            {/* §8: título + datos a la izquierda; logo a la derecha.
                §4: título en texto plano, sin "Cordillera M&P" (va en el logo). */}
            <View style={s.headerTextCol}>
              <Text style={s.titulo}>Informe de Inspección</Text>
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
        </View>

        {datos.revisiones.map((r, i) => (
          <BloqueRevision
            key={r.numeroRevision}
            r={r}
            conSubtitulo={esTodas}
            quiebre={esTodas && i > 0}
          />
        ))}

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Cordillera M&P · Informe de Inspección · emitido ${datos.emitidoEl} · pág. ${pageNumber}/${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
