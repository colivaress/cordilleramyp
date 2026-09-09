import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Tras cerrar sesión, vuelve a la portada pública — no al login.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
