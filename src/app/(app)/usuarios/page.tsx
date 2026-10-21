import { redirect } from "next/navigation";

// /usuarios dejó de existir: la cuenta de cada persona (rol, tipos de
// inspección, correo) se administra desde su ficha en RRHH. La ruta vieja
// solo redirige — no hay acciones ni datos acá, y /rrhh tiene su propia
// guarda (requireModuloRrhh), así que quien llegue sin permiso sigue
// afuera.
export default function UsuariosPage() {
  redirect("/rrhh");
}
