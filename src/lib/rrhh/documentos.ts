/**
 * Documentos del trabajador (spec RRHH §16.2). Lógica pura: qué archivos se
 * aceptan y en qué ruta del bucket `documentos-rrhh` quedan.
 *
 * Los mismos límites están en el bucket (file_size_limit y
 * allowed_mime_types, ver la migración): esto avisa antes de subir; el
 * bucket es el que de verdad rechaza.
 */

export const BUCKET_DOCUMENTOS = "documentos-rrhh";
export const MAX_BYTES_DOCUMENTO = 15 * 1024 * 1024;

/** Extensión → tipo con el que se sube. Igual a allowed_mime_types del bucket. */
const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

export const ACCEPT_DOCUMENTOS = Object.keys(MIME_POR_EXTENSION)
  .map((e) => `.${e}`)
  .join(",");

/**
 * Tipo con el que se sube el archivo, decidido por la EXTENSIÓN: el tipo que
 * informa el navegador varía (un .csv llega como "application/vnd.ms-excel"
 * en Windows, o vacío), y el bucket lo compara contra su lista. `null` si la
 * extensión no está permitida.
 */
export function mimeDocumento(nombre: string): string | null {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  return nombre.includes(".") ? MIME_POR_EXTENSION[ext] ?? null : null;
}

/** Mensaje de por qué no se puede subir, o null si se puede. */
export function problemaDocumento(a: { nombre: string; tamano: number }): string | null {
  if (!mimeDocumento(a.nombre))
    return `"${a.nombre}": tipo de archivo no permitido (PDF, Word, Excel, PowerPoint, imágenes, TXT, CSV o ZIP).`;
  if (a.tamano <= 0) return `"${a.nombre}" está vacío.`;
  if (a.tamano > MAX_BYTES_DOCUMENTO) return `"${a.nombre}" pesa más de 15 MB.`;
  return null;
}

/**
 * Nombre seguro para la ruta del bucket: sin tildes ni caracteres raros. El
 * nombre original se guarda aparte (rrhh_documentos.nombre_archivo) para
 * mostrarlo tal cual.
 */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "");
  return (limpio || "archivo").slice(-100);
}

/** `{personal_id}/{id}-{nombre}`: la primera carpeta decide quién la ve (RLS). */
export function rutaDocumento(personalId: string, id: string, nombre: string): string {
  return `${personalId}/${id}-${nombreSeguro(nombre)}`;
}

/** ¿La ruta pertenece a ese trabajador? (la Server Action no confía en el cliente). */
export function rutaEsDe(ruta: string, personalId: string): boolean {
  return ruta.startsWith(`${personalId}/`) && !ruta.includes("..") && ruta.split("/").length === 2;
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
