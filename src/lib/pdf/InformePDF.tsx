/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer <Image> no acepta ni usa `alt` */
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

export type InformePDFDatos = {
  numeroInspeccion: number;
  numeroRevision: number;
  estado: string;
  emitidoEl: string;
  cabecera: {
    transporte: string;
    conductor: string;
    fecha: string;
    procedencia: string;
    tipoCamion: string;
    patenteCamion: string;
    patenteRampla: string;
    supervisor: string;
    vencimiento: string;
  };
  items: {
    n: number;
    nombre: string;
    estado: string;
    esNoConforme: boolean;
    observacion: string | null;
    fotoDataUri: string | null;
  }[];
  firmas: {
    conductor: { nombre: string; fecha: string; dataUri: string | null };
    fiscalizador: { nombre: string; fecha: string; dataUri: string | null };
  };
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
  empresa: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.marca },
  titulo: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
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

export function InformePDF({ datos }: { datos: InformePDFDatos }) {
  const { cabecera: c, firmas } = datos;
  return (
    <Document
      title={`Informe de Inspección - Nro Inspección ${datos.numeroInspeccion} Rev ${datos.numeroRevision}`}
      author="Cordillera M&P"
    >
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.empresa}>Cordillera M&amp;P</Text>
          <Text style={s.titulo}>Informe de Inspección</Text>
          <Text style={s.sub}>
            Nro de Inspección {datos.numeroInspeccion} · Nro de Revisión{" "}
            {datos.numeroRevision} · {datos.estado}
          </Text>
        </View>

        <View style={s.grid}>
          <Dato k="Transporte" v={c.transporte} />
          <Dato k="Conductor" v={c.conductor} />
          <Dato k="Fecha" v={c.fecha} />
          <Dato k="Procedencia" v={c.procedencia} />
          <Dato k="Tipo de camión" v={c.tipoCamion} />
          <Dato k="Patente camión" v={c.patenteCamion} />
          <Dato k="Patente rampla" v={c.patenteRampla} />
          <Dato k="Supervisor" v={c.supervisor} />
          <Dato k="Vencimiento corrección" v={c.vencimiento} />
        </View>

        <Text style={s.seccion}>Elementos a Fiscalizar</Text>
        <View style={s.filaHead}>
          <Text style={[s.cN, s.headTxt]}>#</Text>
          <Text style={[s.cElemento, s.headTxt]}>Elemento</Text>
          <Text style={[s.cResultado, s.headTxt]}>Resultado</Text>
          <Text style={[s.cObs, s.headTxt]}>Observación</Text>
        </View>

        {datos.items.map((it) => (
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
            {firmas.conductor.dataUri ? (
              <Image style={s.firmaImg} src={firmas.conductor.dataUri} />
            ) : (
              <View style={s.firmaPlaceholder} />
            )}
            <Text style={s.firmaNombre}>{firmas.conductor.nombre}</Text>
            <Text style={s.firmaFecha}>{firmas.conductor.fecha}</Text>
          </View>
          <View style={s.firmaBox}>
            <Text style={s.etiqueta}>Firma Fiscalizador/Supervisor</Text>
            {firmas.fiscalizador.dataUri ? (
              <Image style={s.firmaImg} src={firmas.fiscalizador.dataUri} />
            ) : (
              <View style={s.firmaPlaceholder} />
            )}
            <Text style={s.firmaNombre}>{firmas.fiscalizador.nombre}</Text>
            <Text style={s.firmaFecha}>{firmas.fiscalizador.fecha}</Text>
          </View>
        </View>

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
