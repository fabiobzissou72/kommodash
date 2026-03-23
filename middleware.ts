import { NextRequest, NextResponse } from "next/server";

// Rotas que NÃO precisam de autenticação
const PUBLIC_PATHS = ["/", "/api/auth"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Libera rotas públicas
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isPublic) return NextResponse.next();

  // Verifica cookie de sessão
  const auth = req.cookies.get("auth");
  if (!auth?.value || auth.value.trim() === "") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Adiciona header interno para as rotas saberem que estão autenticadas
  const res = NextResponse.next();
  res.headers.set("x-user-id", auth.value);
  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/kommo/:path*",
    "/api/accounts/:path*",
    "/api/leads/:path*",
    "/api/history/:path*",
    "/api/analyze/:path*",
  ],
};
