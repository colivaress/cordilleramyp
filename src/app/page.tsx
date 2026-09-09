import { Barlow_Condensed, Inter } from "next/font/google";
import Image from "next/image";
import { Header } from "@/components/landing/Header";
import { Reveal } from "@/components/landing/Reveal";
import { ScrollToButton } from "@/components/landing/ScrollToButton";

/**
 * Portada pública de Cordillera M&P. Tipografía propia de la portada
 * (Barlow Condensed + Inter) aplicada solo en este árbol vía la clase
 * `.variable` de next/font — el resto de la app (login, dashboard, etc.)
 * sigue con font-sans (Geist) del layout raíz, sin tocarlo.
 */
const barlowCondensed = Barlow_Condensed({
  variable: "--font-landing-heading",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-landing-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const kicker = "mb-2.5 font-landing-body text-[14.5px] font-semibold text-landing-orange";
const sectionTitle =
  "mb-5 max-w-[640px] font-landing-heading text-[clamp(30px,4vw,44px)] font-bold leading-[1.02] tracking-[0.01em] text-landing-charcoal";
const btnPrimary =
  "inline-block cursor-pointer rounded-[3px] border-none bg-landing-orange px-[26px] py-3.5 font-landing-body text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-landing-orange-deep";
const btnGhost =
  "inline-block cursor-pointer rounded-[3px] border-[1.5px] border-white/50 bg-transparent px-[26px] py-3.5 font-landing-body text-[15px] font-semibold text-white transition-colors duration-150 hover:border-white";

export default function Home() {
  return (
    <div className={`${barlowCondensed.variable} ${inter.variable} font-landing-body leading-[1.55] text-landing-charcoal antialiased`}>
      <Header />

      {/* HERO */}
      <section className="relative flex min-h-[520px] items-end overflow-hidden bg-[#111] min-[880px]:min-h-[640px]">
        <Image
          src="/images/hero-camiones.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_38%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,19,21,.15)_0%,rgba(17,19,21,.35)_45%,rgba(17,19,21,.92)_100%)]" />
        <div className="relative z-[2] mx-auto w-full max-w-[1180px] px-5 pb-10 min-[880px]:px-7 min-[880px]:pb-14">
          <div className="mb-3.5 max-w-[520px] text-[14.5px] font-semibold text-landing-paper">
            Puente Alto, Región Metropolitana · Operando desde 2019
          </div>
          <h1 className="mb-5 max-w-[760px] font-landing-heading text-[clamp(40px,6.2vw,74px)] font-bold leading-[1.02] tracking-[0.01em] text-white">
            Su carga, asegurada <em className="text-landing-orange not-italic">de planta a destino</em>.
          </h1>
          <p className="mb-[30px] max-w-[520px] text-[17px] text-[#DCD8CE]">
            Encarpe, amarre técnico y transporte terrestre para la gran industria — con el
            estándar de seguridad que exige cada tramo de la ruta.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <ScrollToButton targetId="servicios" className={btnPrimary}>
              Ver nuestros servicios
            </ScrollToButton>
            <ScrollToButton targetId="nosotros" className={btnGhost}>
              Conocer la empresa
            </ScrollToButton>
          </div>
        </div>
        <div className="absolute right-3.5 bottom-3.5 z-[3] flex items-center justify-center rounded-md bg-white px-3 py-2 shadow-[0_10px_26px_rgba(0,0,0,.28)] min-[880px]:right-7 min-[880px]:bottom-7 min-[880px]:px-6 min-[880px]:py-4">
          <Image
            src="/images/logo-cmpc.png"
            alt="CMPC"
            width={280}
            height={90}
            className="block h-auto w-[110px] min-[880px]:w-[280px]"
          />
        </div>
      </section>

      {/* NOSOTROS */}
      <section id="nosotros" className="scroll-mt-[140px] py-22">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-14 px-5 min-[880px]:grid-cols-[1.05fr_0.95fr] min-[880px]:items-center min-[880px]:px-7">
          <Reveal direccion="left">
            <div className={kicker}>Sobre nosotros</div>
            <h2 className={sectionTitle}>
              Soporte operativo de excelencia para el movimiento y resguardo de mercancías.
            </h2>
            <p className="mb-4 max-w-[520px] text-[16px] text-landing-steel">
              Establecida en <strong className="text-landing-charcoal">2019</strong> en la
              comuna de Puente Alto, Sociedad Cordillera M&amp;P SPA ofrece servicios
              especializados y adaptados a las exigencias de la gran industria, destacando
              tanto en el <strong className="text-landing-charcoal">transporte terrestre
              interurbano</strong> como en soluciones operacionales críticas dentro de
              plantas industriales de alta exigencia.
            </p>
            <p className="mb-4 max-w-[520px] text-[16px] text-landing-steel">
              Nos comprometemos a ser un aliado estratégico confiable, protegiendo los
              activos de nuestros clientes tanto en ruta como en sus propias plantas de
              operaciones.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-px border border-landing-line bg-landing-line">
              {[
                { num: "2019", lab: "Inicio de operaciones" },
                { num: "100%", lab: "Cumplimiento normativo vial y laboral" },
                { num: "RM", lab: "Fletes locales e interurbanos" },
                { num: "EPP", lab: "Personal calificado in-situ" },
              ].map((stat) => (
                <div key={stat.lab} className="bg-landing-cream px-5 py-[22px]">
                  <div className="font-landing-heading text-[38px] leading-none font-bold text-landing-charcoal">
                    {stat.num}
                  </div>
                  <div className="mt-1.5 text-[13.5px] text-landing-steel">{stat.lab}</div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal direccion="right">
            <div className="relative overflow-hidden rounded-[2px]">
              <div className="relative h-[320px] min-[880px]:h-[520px]">
                <Image
                  src="/images/about-bodega.jpg"
                  alt="Descarga de bobinas en planta"
                  fill
                  sizes="(min-width: 880px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(0deg,rgba(17,19,21,.85),transparent)] px-[18px] pt-4 pb-3 text-[13px] text-[#EEE9DD]">
                Maniobra de descarga en planta — personal calificado, EPP completo
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* COMPROMISO */}
      <section id="compromiso" className="scroll-mt-[140px] bg-landing-charcoal py-22 text-landing-cream">
        <div className="mx-auto max-w-[1180px] px-5 min-[880px]:px-7">
          <div className="mb-2.5 font-landing-body text-[14.5px] font-semibold text-landing-paper">
            Nuestro compromiso
          </div>
          <h2 className="mb-5 max-w-[640px] font-landing-heading text-[clamp(30px,4vw,44px)] font-bold leading-[1.02] tracking-[0.01em] text-white">
            Cero accidentes en operación y en ruta.
          </h2>
          <p className="mb-2 max-w-[600px] text-[17px] text-[#B7BEC5]">
            El núcleo de nuestro trabajo es la prevención. El estricto cumplimiento de las
            normativas y estándares exigidos en Chile disminuye drásticamente la tasa de
            accidentes, tanto en las faenas de carga como durante los trayectos en
            carretera.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-px border border-[#33393F] bg-[#33393F] min-[880px]:grid-cols-3">
            {[
              {
                n: "01",
                dir: "left" as const,
                h: "Cero desplazamientos",
                p: "Bloqueo y trincaje técnico de la carga para evitar caídas o desestabilización del camión en ruta.",
              },
              {
                n: "02",
                dir: "right" as const,
                h: "Seguridad laboral activa",
                p: "Protocolos rigurosos de autocuidado para proteger al personal dentro de los patios de carga.",
              },
              {
                n: "03",
                dir: "left" as const,
                h: "Cumplimiento vial",
                p: "Respeto absoluto del peso, dimensiones y condiciones mecánicas exigidas por la ley de tránsito.",
              },
            ].map((card) => (
              <Reveal key={card.n} direccion={card.dir} className="bg-landing-charcoal-soft px-[26px] py-[30px]">
                <div className="mb-3.5 font-landing-heading text-[15px] font-bold tracking-[.02em] text-landing-orange">
                  {card.n}
                </div>
                <h3 className="mb-2.5 text-[22px] font-semibold text-white">{card.h}</h3>
                <p className="text-[14.5px] text-[#AEB4BA]">{card.p}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* VALORES */}
      <section className="py-22">
        <div className="mx-auto max-w-[1180px] px-5 min-[880px]:px-7">
          <div className={kicker}>Nuestros valores</div>
          <h2 className={sectionTitle}>
            Una cultura de trabajo construida sobre cuatro pilares.
          </h2>
          <div className="mt-11 grid grid-cols-1 gap-7 min-[880px]:grid-cols-4">
            {[
              {
                dir: "left" as const,
                h: "Seguridad ante todo",
                p: "Protegemos la vida de las personas y la integridad de la carga mediante la prevención activa de riesgos en cada maniobra.",
              },
              {
                dir: "right" as const,
                h: "Cumplimiento normativo",
                p: "Operamos bajo un estricto respeto a las leyes del tránsito, laborales y de seguridad vigentes en Chile.",
              },
              {
                dir: "left" as const,
                h: "Responsabilidad y compromiso",
                p: "Cuidamos la confianza de nuestros clientes cumpliendo los plazos pactados y resguardando cada activo como si fuera propio.",
              },
              {
                dir: "right" as const,
                h: "Excelencia operacional",
                p: "Capacitamos de forma continua a nuestro personal en técnicas avanzadas de amarre, estiba y conducción segura.",
              },
            ].map((v) => (
              <Reveal key={v.h} direccion={v.dir} className="border-t-[3px] border-landing-orange pt-4">
                <h3 className="mb-2 text-[20px] font-semibold text-landing-charcoal">{v.h}</h3>
                <p className="text-[14.5px] text-landing-steel">{v.p}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICIOS */}
      <section id="servicios" className="scroll-mt-[140px] bg-white py-22">
        <div className="mx-auto max-w-[1180px] px-5 min-[880px]:px-7">
          <div className={kicker}>Nuestras líneas de servicio</div>
          <h2 className={sectionTitle}>Dos formas de trabajar con nosotros.</h2>
        </div>
        <div className="mx-auto mt-10 max-w-[1180px] px-5 min-[880px]:px-7">
          {/* Encarpe y amarre técnico */}
          <div className="mb-[26px] grid grid-cols-1 border border-landing-line min-[880px]:grid-cols-2">
            <Reveal direccion="left" className="relative min-h-[260px] min-[880px]:min-h-[380px]">
              <Image
                src="/images/service-encarpe.jpg"
                alt="Encarpe de camión con lona"
                fill
                sizes="(min-width: 880px) 50vw, 100vw"
                className="object-cover"
              />
            </Reveal>
            <Reveal direccion="right" className="flex flex-col justify-center px-6 py-11 min-[880px]:px-[46px]">
              <div className="mb-1.5 font-landing-body text-[14.5px] font-semibold text-landing-orange">
                Soporte a plantas industriales
              </div>
              <h3 className="mb-3.5 font-landing-heading text-[30px] font-bold text-landing-charcoal">
                Encarpe y amarre técnico
              </h3>
              <p className="mb-[18px] text-[15.5px] text-landing-steel">
                Aseguramiento físico de cargas para terceros directamente en sus centros de
                distribución o plantas de producción, incluyendo plantas de alta producción
                como La Papelera (CMPC).
              </p>
              <ul className="list-none">
                {[
                  "Encarpe industrial con lonas de alta resistencia ante lluvia, humedad y radiación solar",
                  "Amarre y trincaje con eslingas certificadas, fajas y cadenas calculados según el tipo de carga",
                  "Personal calificado in-situ, con EPP completo y entrenamiento específico",
                ].map((item, i) => (
                  <li
                    key={item}
                    className={`flex gap-2.5 py-2.5 text-[14.5px] text-landing-charcoal ${i === 0 ? "" : "border-t border-landing-line"}`}
                  >
                    <span className="shrink-0 font-semibold text-landing-orange">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* Fletes y transporte terrestre */}
          <div className="mb-[26px] grid grid-cols-1 border border-landing-line min-[880px]:grid-cols-2">
            <Reveal direccion="right" className="relative order-none min-h-[260px] min-[880px]:order-2 min-[880px]:min-h-[380px]">
              <Image
                src="/images/service-fletes.jpg"
                alt="Camión cargado con bobinas de papel"
                fill
                sizes="(min-width: 880px) 50vw, 100vw"
                className="object-cover"
              />
            </Reveal>
            <Reveal direccion="left" className="flex flex-col justify-center px-6 py-11 min-[880px]:px-[46px]">
              <div className="mb-1.5 font-landing-body text-[14.5px] font-semibold text-landing-orange">
                Actividad independiente y complementaria
              </div>
              <h3 className="mb-3.5 font-landing-heading text-[30px] font-bold text-landing-charcoal">
                Fletes y transporte terrestre
              </h3>
              <p className="mb-[18px] text-[15.5px] text-landing-steel">
                Una flota preparada para el traslado de mercancías con máxima puntualidad y
                cobertura geográfica flexible.
              </p>
              <ul className="list-none">
                {[
                  "Fletes locales: todas las comunas de la Región Metropolitana",
                  "Fletes interurbanos: rutas óptimas a regiones, con monitoreo constante",
                ].map((item, i) => (
                  <li
                    key={item}
                    className={`flex gap-2.5 py-2.5 text-[14.5px] text-landing-charcoal ${i === 0 ? "" : "border-t border-landing-line"}`}
                  >
                    <span className="shrink-0 font-semibold text-landing-orange">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CONFIANZA / CLIENTES */}
      <section id="confianza" className="scroll-mt-[140px] bg-landing-cream py-22 text-center">
        <div className="mx-auto max-w-[1180px] px-5 min-[880px]:px-7">
          <div className={`${kicker} mx-auto`}>¿Por qué confiar en nosotros?</div>
          <h2 className={`${sectionTitle} mx-auto mb-[46px]`}>
            Experiencia respaldada por la gran industria.
          </h2>
          <div className="mb-16 grid grid-cols-1 gap-[30px] text-left min-[880px]:grid-cols-3">
            {[
              {
                dir: "left" as const,
                h: "Experiencia en grandes industrias",
                p: "Avalados por la confianza de importantes empresas productoras de la zona.",
              },
              {
                dir: "right" as const,
                h: "Cumplimiento normativo estricto",
                p: "Evitamos multas operacionales, siniestros y retrasos logísticos aplicando al 100% las normativas chilenas.",
              },
              {
                dir: "left" as const,
                h: "Flexibilidad de operación",
                p: "Nos hacemos cargo del transporte completo o del aseguramiento técnico de sus mercancías por separado.",
              },
            ].map((w) => (
              <Reveal key={w.h} direccion={w.dir} className="border border-landing-line bg-white p-[30px]">
                <h3 className="mb-2.5 text-[19px] font-semibold text-landing-charcoal">{w.h}</h3>
                <p className="text-[14.5px] text-landing-steel">{w.p}</p>
              </Reveal>
            ))}
          </div>
          <div id="clientes" className="scroll-mt-[140px] border-t border-landing-line pt-11">
            <div className="mb-[26px] text-[13px] tracking-[.02em] text-landing-steel">
              EMPRESAS QUE CONFÍAN EN NUESTRA OPERACIÓN
            </div>
            <Reveal direccion="up" className="flex flex-wrap items-center justify-center gap-[34px] min-[880px]:gap-16">
              <div className="flex flex-col items-center gap-2.5">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-landing-line bg-white p-5 min-[880px]:h-32 min-[880px]:w-32">
                  <Image src="/images/logo-cmpc.png" alt="CMPC" width={128} height={128} className="h-full w-full object-contain" />
                </div>
                <div className="text-[13px] font-semibold text-landing-charcoal">CMPC</div>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-landing-line bg-white p-5 min-[880px]:h-32 min-[880px]:w-32">
                  <Image src="/images/logo-volcan.png" alt="Volcan" width={128} height={128} className="h-full w-full object-contain" />
                </div>
                <div className="text-[13px] font-semibold text-landing-charcoal">Volcan</div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-landing-charcoal px-0 pt-[60px] pb-[26px] text-[#9AA2AB]">
        <div className="mx-auto max-w-[1180px] px-5 min-[880px]:px-7">
          <div className="mb-11 grid grid-cols-1 gap-10 min-[880px]:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Image
                src="/images/logo-cordillera.png"
                alt="Cordillera M&P"
                width={150}
                height={150}
                className="mb-3.5 block h-[150px] w-[150px] bg-white object-contain p-2"
              />
              <p className="max-w-[280px] text-[14px] text-[#8A929A]">
                Soluciones integrales en transporte, logística y aseguramiento de carga
                desde 2019. Puente Alto, Región Metropolitana.
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-[14px] font-semibold text-white">Empresa</h4>
              <ScrollToButton targetId="nosotros" className="mb-[11px] block w-full cursor-pointer border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] hover:text-landing-paper">
                Nosotros
              </ScrollToButton>
              <ScrollToButton targetId="compromiso" className="mb-[11px] block w-full cursor-pointer border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] hover:text-landing-paper">
                Seguridad
              </ScrollToButton>
              <ScrollToButton targetId="servicios" className="mb-[11px] block w-full cursor-pointer border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] hover:text-landing-paper">
                Servicios
              </ScrollToButton>
            </div>
            <div>
              <h4 className="mb-4 text-[14px] font-semibold text-white">Servicios</h4>
              <ScrollToButton targetId="servicios" className="mb-[11px] block w-full cursor-pointer border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] hover:text-landing-paper">
                Encarpe y amarre
              </ScrollToButton>
              <ScrollToButton targetId="servicios" className="mb-[11px] block w-full cursor-pointer border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] hover:text-landing-paper">
                Fletes locales
              </ScrollToButton>
              <ScrollToButton targetId="servicios" className="mb-[11px] block w-full cursor-pointer border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] hover:text-landing-paper">
                Fletes interurbanos
              </ScrollToButton>
            </div>
            <div>
              <h4 className="mb-4 text-[14px] font-semibold text-white">Acceso</h4>
              <button type="button" disabled className="mb-[11px] block w-full cursor-default border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] opacity-60">
                Ingreso trabajadores
              </button>
              <button type="button" disabled className="mb-[11px] block w-full cursor-default border-none bg-none text-left font-landing-body text-[14px] text-[#9AA2AB] opacity-60">
                Ingreso administración
              </button>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2.5 border-t border-[#33393F] pt-[22px] text-[12.5px] text-[#6E767E]">
            <div>© 2026 Sociedad Cordillera M&amp;P SPA. Todos los derechos reservados.</div>
            <div>Puente Alto, Región Metropolitana, Chile</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
