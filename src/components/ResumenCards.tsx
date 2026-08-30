import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { calcularResumen } from "@/lib/dashboard";

export function ResumenCard({
  titulo,
  valor,
  tono,
}: {
  titulo: string;
  valor: number;
  tono?: "amarillo" | "naranja" | "rojo" | "verde";
}) {
  const clase =
    tono === "rojo"
      ? "text-danger-700"
      : tono === "naranja"
        ? "text-alert-700"
        : tono === "amarillo"
          ? "text-warning-700"
          : tono === "verde"
            ? "text-success-700"
            : "text-foreground";
  return (
    <Card>
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className={cn("text-3xl", clase)}>{valor}</CardTitle>
      </CardHeader>
    </Card>
  );
}

/** Las 5 tarjetas de resumen del dashboard / analítica — §2.6 / §2.11. */
export function ResumenCards({
  resumen,
}: {
  resumen: ReturnType<typeof calcularResumen>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <ResumenCard titulo="Inspecciones" valor={resumen.total} />
      <ResumenCard
        titulo="Por vencer (≤48h)"
        valor={resumen.porVencer}
        tono="amarillo"
      />
      <ResumenCard titulo="Vencidos" valor={resumen.vencidos} tono="rojo" />
      <ResumenCard
        titulo="En reparación"
        valor={resumen.enReparacion}
        tono="naranja"
      />
      <ResumenCard
        titulo="Finalizadas"
        valor={resumen.finalizadas}
        tono="verde"
      />
    </div>
  );
}
