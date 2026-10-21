/** Errores de validación de un formulario RRHH, tal cual los devuelve la
 *  función pura (los mismos que repite el servidor). */
export function ListaErrores({ errores }: { errores: string[] }) {
  if (errores.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
    >
      <p className="font-medium">No se guardó. Corrige esto:</p>
      <ul className="mt-1 list-disc pl-5">
        {errores.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
