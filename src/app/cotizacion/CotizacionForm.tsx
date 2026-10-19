"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { formatearRut, rutValido } from "@/lib/rut";
import { normalizarTelefonoCl } from "@/lib/telefono";
import { enviarSolicitudCotizacion } from "./actions";

type Tipo = "particular" | "empresa";

/** Hoy en Chile, "YYYY-MM-DD" — para el `min` del campo de fecha. Mismo
 *  criterio que usa la Server Action al validar: la zona horaria del
 *  servidor de Vercel no es la de Chile. */
function hoyEnChile(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
}

const etiqueta = "mb-1.5 block text-[14px] font-medium text-landing-charcoal";
const ayuda = "mt-1 text-[12.5px] text-landing-steel";
const grupo = "mb-4";
const grid2 = "grid grid-cols-1 gap-4 min-[700px]:grid-cols-2";
const tituloBloque =
  "mb-4 font-landing-heading text-[22px] font-bold tracking-[0.01em] text-landing-charcoal";

export function CotizacionForm() {
  const idBase = useId();
  const guardado = useEstadoGuardado();

  const [tipo, setTipo] = useState<Tipo>("particular");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [rut, setRut] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tieneWhatsapp, setTieneWhatsapp] = useState(false);

  const [razonSocial, setRazonSocial] = useState("");
  const [rutEmpresa, setRutEmpresa] = useState("");
  const [giro, setGiro] = useState("");
  const [direccionComercial, setDireccionComercial] = useState("");

  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [tipoCarga, setTipoCarga] = useState("");
  const [peso, setPeso] = useState("");
  const [fechaEstimada, setFechaEstimada] = useState("");
  const [requiereEncarpe, setRequiereEncarpe] = useState<boolean | null>(null);
  const [comentarios, setComentarios] = useState("");

  // Honeypot: fuera de la vista y fuera del orden de tabulación, con
  // autocomplete apagado para que el navegador tampoco lo rellene solo.
  const [sitioWeb, setSitioWeb] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [numeroSolicitud, setNumeroSolicitud] = useState<number | null>(null);

  const esEmpresa = tipo === "empresa";
  const enviando = guardado.pendiente;

  /** Misma validación que la Server Action, para avisar antes de enviar. La
   *  del servidor es la que manda; esta solo evita un viaje de ida y vuelta. */
  function primerProblema(): string | null {
    if (!nombre.trim()) return "Falta el nombre.";
    if (!apellido.trim()) return "Falta el apellido.";
    if (!rutValido(rut)) return "El RUT no es válido.";
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(correo.trim())) {
      return "El correo no es válido.";
    }
    if (!normalizarTelefonoCl(telefono)) {
      return "El teléfono no es válido. Ejemplo: +56 9 1234 5678.";
    }
    if (esEmpresa) {
      if (!razonSocial.trim()) return "Falta la razón social.";
      if (!rutValido(rutEmpresa)) return "El RUT de la empresa no es válido.";
      if (!giro.trim()) return "Falta el giro.";
      if (!direccionComercial.trim()) return "Falta la dirección comercial.";
    }
    if (!origen.trim()) return "Falta la dirección de origen.";
    if (!destino.trim()) return "Falta la dirección de destino.";
    if (!tipoCarga.trim()) return "Falta el tipo de carga.";
    if (!peso.trim()) return "Falta el peso o tonelaje.";
    if (!fechaEstimada) return "Falta la fecha estimada.";
    if (fechaEstimada < hoyEnChile()) {
      return "La fecha estimada no puede ser anterior a hoy.";
    }
    if (requiereEncarpe === null) {
      return "Indica si la carga requiere encarpe.";
    }
    return null;
  }

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problema = primerProblema();
    if (problema) {
      setError(problema);
      return;
    }

    // `ejecutar` relanza lo que falle dentro (así marca su estado "error"),
    // así que el try/catch no es opcional: sin él, una caída de red deja la
    // promesa rechazada sin que nadie se lo diga a la persona.
    let resultado: Awaited<ReturnType<typeof enviarSolicitudCotizacion>>;
    try {
      resultado = await guardado.ejecutar(() =>
        enviarSolicitudCotizacion({
          tipoSolicitante: tipo,
          nombre,
          apellido,
          rut,
          correo,
          telefono,
          tieneWhatsapp,
          razonSocial,
          rutEmpresa,
          giro,
          direccionComercial,
          origen,
          destino,
          tipoCarga,
          peso,
          fechaEstimada,
          requiereEncarpe,
          comentarios,
          sitioWeb,
        }),
      );
    } catch {
      setError(
        "No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.",
      );
      return;
    }

    if (!resultado.ok) {
      setError(resultado.mensaje);
      return;
    }
    setNumeroSolicitud(resultado.numeroSolicitud);
  }

  if (numeroSolicitud !== null) {
    return (
      <div className="border border-landing-line bg-white p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-landing-orange/10">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-landing-orange"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="mb-2.5 font-landing-heading text-[28px] font-bold tracking-[0.01em] text-landing-charcoal">
          Recibimos su solicitud
        </h2>
        {/* numeroSolicitud 0 = el honeypot se activó. No se le dice nada
            distinto a quien lo gatilló: ve exactamente esta pantalla. */}
        {numeroSolicitud > 0 && (
          <p className="mb-2.5 text-[15px] text-landing-steel">
            Quedó registrada con el número{" "}
            <strong className="text-landing-charcoal">{numeroSolicitud}</strong>.
          </p>
        )}
        <p className="mb-6 text-[15px] text-landing-steel">
          Le enviamos una copia a <strong>{correo.trim()}</strong>. Un ejecutivo
          revisará los datos y se pondrá en contacto para entregarle la
          cotización.
        </p>
        <Link
          href="/"
          className="inline-block cursor-pointer rounded-[3px] bg-landing-orange px-[26px] py-3.5 font-landing-body text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-landing-orange-deep"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={alEnviar}
      noValidate
      className="border border-landing-line bg-white p-5 min-[700px]:p-8"
    >
      {/* ---------- Tipo de solicitante ---------- */}
      <fieldset className={grupo}>
        <legend className={etiqueta}>¿Quién solicita la cotización?</legend>
        <div className="flex gap-2.5">
          {(["particular", "empresa"] as const).map((t) => (
            <label
              key={t}
              className={`flex-1 cursor-pointer rounded-[3px] border px-4 py-3 text-center text-[15px] font-semibold transition-colors duration-150 ${
                tipo === t
                  ? "border-landing-orange bg-landing-orange text-white"
                  : "border-landing-line bg-white text-landing-steel hover:border-landing-charcoal"
              }`}
            >
              <input
                type="radio"
                name={`${idBase}-tipo`}
                value={t}
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="sr-only"
              />
              {t === "particular" ? "Particular" : "Empresa"}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ---------- Datos de contacto ---------- */}
      <h2 className={`${tituloBloque} mt-8`}>Sus datos</h2>

      <div className={`${grid2} ${grupo}`}>
        <div>
          <Label htmlFor={`${idBase}-nombre`} className={etiqueta}>
            Nombre
          </Label>
          <Input
            id={`${idBase}-nombre`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="given-name"
            maxLength={120}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${idBase}-apellido`} className={etiqueta}>
            Apellido
          </Label>
          <Input
            id={`${idBase}-apellido`}
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            autoComplete="family-name"
            maxLength={120}
            required
          />
        </div>
      </div>

      <div className={`${grid2} ${grupo}`}>
        <div>
          <Label htmlFor={`${idBase}-rut`} className={etiqueta}>
            RUT
          </Label>
          <Input
            id={`${idBase}-rut`}
            value={rut}
            // Se formatea al salir del campo, no mientras se escribe: dar
            // formato en cada tecla mueve el cursor y pelea con quien borra.
            onChange={(e) => setRut(e.target.value)}
            onBlur={() => setRut((v) => (rutValido(v) ? formatearRut(v) : v))}
            placeholder="12.345.678-9"
            inputMode="text"
            maxLength={13}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${idBase}-correo`} className={etiqueta}>
            Correo
          </Label>
          <Input
            id={`${idBase}-correo`}
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            maxLength={120}
            required
          />
          <p className={ayuda}>Acá le enviamos la copia de su solicitud.</p>
        </div>
      </div>

      <div className={grupo}>
        <Label htmlFor={`${idBase}-telefono`} className={etiqueta}>
          Teléfono
        </Label>
        <div className="min-[700px]:max-w-[calc(50%-0.5rem)]">
          <Input
            id={`${idBase}-telefono`}
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            autoComplete="tel"
            placeholder="+56 9 1234 5678"
            maxLength={20}
            required
          />
        </div>
        <label className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-[14px] text-landing-charcoal">
          <Checkbox
            checked={tieneWhatsapp}
            onCheckedChange={(v) => setTieneWhatsapp(v === true)}
          />
          Este número tiene WhatsApp
        </label>
      </div>

      {/* ---------- Datos de la empresa ---------- */}
      {esEmpresa && (
        <>
          <h2 className={`${tituloBloque} mt-8`}>Datos de la empresa</h2>
          <div className={`${grid2} ${grupo}`}>
            <div>
              <Label htmlFor={`${idBase}-razon`} className={etiqueta}>
                Razón social
              </Label>
              <Input
                id={`${idBase}-razon`}
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                autoComplete="organization"
                maxLength={120}
                required
              />
            </div>
            <div>
              <Label htmlFor={`${idBase}-rut-empresa`} className={etiqueta}>
                RUT de la empresa
              </Label>
              <Input
                id={`${idBase}-rut-empresa`}
                value={rutEmpresa}
                onChange={(e) => setRutEmpresa(e.target.value)}
                onBlur={() =>
                  setRutEmpresa((v) => (rutValido(v) ? formatearRut(v) : v))
                }
                placeholder="76.543.210-K"
                maxLength={13}
                required
              />
            </div>
          </div>
          <div className={`${grid2} ${grupo}`}>
            <div>
              <Label htmlFor={`${idBase}-giro`} className={etiqueta}>
                Giro
              </Label>
              <Input
                id={`${idBase}-giro`}
                value={giro}
                onChange={(e) => setGiro(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div>
              <Label htmlFor={`${idBase}-dir-comercial`} className={etiqueta}>
                Dirección comercial
              </Label>
              <Input
                id={`${idBase}-dir-comercial`}
                value={direccionComercial}
                onChange={(e) => setDireccionComercial(e.target.value)}
                autoComplete="street-address"
                maxLength={400}
                required
              />
            </div>
          </div>
        </>
      )}

      {/* ---------- El flete ---------- */}
      <h2 className={`${tituloBloque} mt-8`}>El flete</h2>

      <div className={`${grid2} ${grupo}`}>
        <div>
          <Label htmlFor={`${idBase}-origen`} className={etiqueta}>
            Dirección de origen
          </Label>
          <Input
            id={`${idBase}-origen`}
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            placeholder="Calle, número, comuna"
            maxLength={400}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${idBase}-destino`} className={etiqueta}>
            Dirección de destino
          </Label>
          <Input
            id={`${idBase}-destino`}
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Calle, número, comuna"
            maxLength={400}
            required
          />
        </div>
      </div>

      <div className={`${grid2} ${grupo}`}>
        <div>
          <Label htmlFor={`${idBase}-tipo-carga`} className={etiqueta}>
            Tipo de carga
          </Label>
          <Input
            id={`${idBase}-tipo-carga`}
            value={tipoCarga}
            onChange={(e) => setTipoCarga(e.target.value)}
            placeholder="Pallets, bobinas, maquinaria…"
            maxLength={120}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${idBase}-peso`} className={etiqueta}>
            Peso o tonelaje
          </Label>
          <Input
            id={`${idBase}-peso`}
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            placeholder="20 toneladas, 8 pallets…"
            maxLength={120}
            required
          />
          <p className={ayuda}>
            Si no lo sabe exacto, una estimación nos sirve igual.
          </p>
        </div>
      </div>

      <div className={`${grid2} ${grupo}`}>
        <div>
          <Label htmlFor={`${idBase}-fecha`} className={etiqueta}>
            Fecha estimada
          </Label>
          <Input
            id={`${idBase}-fecha`}
            type="date"
            value={fechaEstimada}
            min={hoyEnChile()}
            onChange={(e) => setFechaEstimada(e.target.value)}
            required
          />
        </div>
        <fieldset>
          <legend className={etiqueta}>¿La carga requiere encarpe?</legend>
          <div className="flex gap-5 pt-2">
            {[
              { v: true, t: "Sí" },
              { v: false, t: "No" },
            ].map((o) => (
              <label
                key={o.t}
                className="flex cursor-pointer items-center gap-2 text-[15px] text-landing-charcoal"
              >
                <input
                  type="radio"
                  name={`${idBase}-encarpe`}
                  checked={requiereEncarpe === o.v}
                  onChange={() => setRequiereEncarpe(o.v)}
                  className="h-4 w-4 accent-landing-orange"
                  required
                />
                {o.t}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className={grupo}>
        <Label htmlFor={`${idBase}-comentarios`} className={etiqueta}>
          Comentarios{" "}
          <span className="font-normal text-landing-steel">(opcional)</span>
        </Label>
        <Textarea
          id={`${idBase}-comentarios`}
          value={comentarios}
          onChange={(e) => setComentarios(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Cualquier detalle que nos ayude a cotizar mejor."
        />
      </div>

      {/* Honeypot — invisible para una persona, irresistible para un bot.
          `aria-hidden` + tabIndex -1 lo sacan del lector de pantalla y del
          tabulador, así que nadie lo completa por accidente. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] h-px w-px overflow-hidden"
      >
        <label htmlFor={`${idBase}-sitio-web`}>Sitio web</label>
        <input
          id={`${idBase}-sitio-web`}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={sitioWeb}
          onChange={(e) => setSitioWeb(e.target.value)}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={enviando}
        className="h-auto w-full rounded-[3px] bg-landing-orange px-[26px] py-3.5 font-landing-body text-[15px] font-semibold text-white hover:bg-landing-orange-deep min-[700px]:w-auto"
      >
        <ContenidoBoton
          pendiente={enviando}
          texto="Enviar solicitud"
          textoPendiente="Enviando…"
        />
      </Button>

      <p className="mt-4 text-[12.5px] text-landing-steel">
        Usamos sus datos solo para responder esta cotización.
      </p>
    </form>
  );
}
