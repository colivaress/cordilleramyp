/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer <Image> no acepta ni usa `alt` */
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { calcularTotales, formatearCLP, TASA_IVA } from "../dinero";

export type CotizacionPDFDatos = {
  numeroSolicitud: number;
  /** §8: logo de la empresa como data URI (o null si no cargó). */
  logoDataUri: string | null;
  emitidoEl: string;
  valeHasta: string;

  /** A quién se le cotiza. */
  cliente: string;
  rut: string;
  correo: string;
  telefono: string;
  /** Solo si es empresa; si no, null y no se imprime la línea. */
  razonSocial: string | null;
  giro: string | null;
  direccionComercial: string | null;

  /** Qué se cotiza. */
  origen: string;
  destino: string;
  tipoCarga: string;
  peso: string;
  fechaEstimada: string;
  requiereEncarpe: boolean;

  valorNeto: number;
  observaciones: string | null;
  emitidaPor: string;
};

// Misma paleta que el informe de inspección — los dos documentos salen de la
// misma empresa y no tienen por qué verse de familias distintas.
const C = {
  marca: "#1e40af",
  texto: "#0f172b",
  suave: "#475569",
  linea: "#cbd5e1",
  lineaSuave: "#e2e8f0",
  fondoTotal: "#eff6ff",
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
    marginBottom: 18,
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

  seccion: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: C.marca,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.linea,
    paddingBottom: 3,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  celda: { width: "50%", marginBottom: 7, paddingRight: 8 },
  celdaAncha: { width: "100%", marginBottom: 7, paddingRight: 8 },
  etiqueta: {
    fontSize: 7.5,
    color: C.suave,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  valor: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },

  filaMonto: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.lineaSuave,
  },
  filaTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: C.fondoTotal,
    borderWidth: 1,
    borderColor: C.marca,
  },
  montoEtiqueta: { fontSize: 10 },
  montoValor: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalEtiqueta: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: C.marca },
  totalValor: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.marca },

  obs: {
    marginTop: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: C.lineaSuave,
  },
  condiciones: { marginTop: 18 },
  condicion: { fontSize: 8.5, color: C.suave, marginBottom: 3 },
  pie: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: C.suave,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: C.lineaSuave,
    paddingTop: 7,
  },
});

function Dato({ etiqueta, valor, ancho }: { etiqueta: string; valor: string; ancho?: boolean }) {
  return (
    <View style={ancho ? s.celdaAncha : s.celda}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <Text style={s.valor}>{valor}</Text>
    </View>
  );
}

/**
 * Cotización de flete en PDF. Deliberadamente SIN código documental ni
 * número de versión — misma restricción global del proyecto que ya aplica al
 * informe de inspección. El `N° de solicitud` sí va: es el correlativo
 * legible por el que el cliente y Jaime se refieren al caso.
 */
export function CotizacionPDF({ datos: d }: { datos: CotizacionPDFDatos }) {
  const t = calcularTotales(d.valorNeto);
  const esEmpresa = d.razonSocial !== null;

  return (
    <Document
      title={`Cotización de Flete N° ${d.numeroSolicitud}`}
      author="Sociedad Cordillera M&P SPA"
    >
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerRow}>
            <View style={s.headerTextCol}>
              <Text style={s.titulo}>Cotización de Flete</Text>
              <Text style={s.sub}>N° de solicitud {d.numeroSolicitud}</Text>
              <Text style={s.sub}>Emitida el {d.emitidoEl}</Text>
              <Text style={s.sub}>Válida hasta el {d.valeHasta}</Text>
            </View>
            {d.logoDataUri && <Image src={d.logoDataUri} style={s.logo} />}
          </View>
        </View>

        <Text style={s.seccion}>Cliente</Text>
        <View style={s.grid}>
          {esEmpresa && <Dato etiqueta="Razón social" valor={d.razonSocial!} ancho />}
          <Dato etiqueta="Contacto" valor={d.cliente} />
          <Dato etiqueta="RUT" valor={d.rut} />
          <Dato etiqueta="Correo" valor={d.correo} />
          <Dato etiqueta="Teléfono" valor={d.telefono} />
          {esEmpresa && d.giro && <Dato etiqueta="Giro" valor={d.giro} />}
          {esEmpresa && d.direccionComercial && (
            <Dato etiqueta="Dirección comercial" valor={d.direccionComercial} />
          )}
        </View>

        <Text style={s.seccion}>Servicio cotizado</Text>
        <View style={s.grid}>
          <Dato etiqueta="Origen" valor={d.origen} ancho />
          <Dato etiqueta="Destino" valor={d.destino} ancho />
          <Dato etiqueta="Tipo de carga" valor={d.tipoCarga} />
          <Dato etiqueta="Peso / tonelaje" valor={d.peso} />
          <Dato etiqueta="Fecha estimada" valor={d.fechaEstimada} />
          <Dato
            etiqueta="Encarpe"
            valor={d.requiereEncarpe ? "Incluido" : "No requerido"}
          />
        </View>

        <Text style={s.seccion}>Valor</Text>
        <View style={s.filaMonto}>
          <Text style={s.montoEtiqueta}>Neto</Text>
          <Text style={s.montoValor}>{formatearCLP(t.neto)}</Text>
        </View>
        <View style={s.filaMonto}>
          <Text style={s.montoEtiqueta}>
            IVA ({Math.round(TASA_IVA * 100)}%)
          </Text>
          <Text style={s.montoValor}>{formatearCLP(t.iva)}</Text>
        </View>
        <View style={s.filaTotal}>
          <Text style={s.totalEtiqueta}>Total</Text>
          <Text style={s.totalValor}>{formatearCLP(t.total)}</Text>
        </View>

        {d.observaciones && (
          <View style={s.obs}>
            <Text style={s.etiqueta}>Observaciones</Text>
            <Text>{d.observaciones}</Text>
          </View>
        )}

        <View style={s.condiciones}>
          <Text style={s.seccion}>Condiciones</Text>
          <Text style={s.condicion}>
            • Valores expresados en pesos chilenos, IVA incluido en el total.
          </Text>
          <Text style={s.condicion}>
            • Esta cotización es válida hasta el {d.valeHasta}.
          </Text>
          <Text style={s.condicion}>
            • El valor corresponde al servicio descrito. Cambios de origen,
            destino, tipo de carga o fecha pueden modificarlo.
          </Text>
          <Text style={s.condicion}>
            • La programación del servicio queda sujeta a disponibilidad de
            flota al momento de la confirmación.
          </Text>
          <Text style={s.condicion}>• Emitida por {d.emitidaPor}.</Text>
        </View>

        <Text style={s.pie} fixed>
          Sociedad Cordillera M&amp;P SPA — Puente Alto, Región Metropolitana,
          Chile
        </Text>
      </Page>
    </Document>
  );
}
