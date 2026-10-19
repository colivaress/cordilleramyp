import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * §8: logo real de la empresa como data URI, para embeberlo en un PDF. Se lee
 * y redimensiona UNA sola vez por proceso.
 *
 * El resize no es cosmético: sin él, @react-pdf/renderer decodifica en JS
 * puro el PNG original de 2816×1408 en cada documento, y eso por sí solo
 * aporta varios segundos a la generación (§4.1, el arreglo que bajó el envío
 * del informe de ~60s a ~6s).
 *
 * Vivía dentro de `generarInformePdf.ts`; se extrajo acá cuando la cotización
 * de fletes pasó a necesitar el mismo logo, para no tener dos copias (ni dos
 * cachés) del mismo archivo.
 */
let logoCache: string | null | undefined;

export async function logoDataUri(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const buf = await fs.promises.readFile(
      path.join(process.cwd(), "public", "logo-cordillera-mp.png"),
    );
    const chico = await sharp(buf)
      .resize({ width: 520, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    logoCache = `data:image/png;base64,${chico.toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}
