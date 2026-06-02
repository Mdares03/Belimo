import { NextResponse } from "next/server";
import { auth } from "./auth";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const pathname = nextUrl.pathname;
  const scope = session?.user?.scope;

  const homeByScope = scope === "CLIENT"
    ? "/"
    : scope === "BUILDING"
      ? "/owner/resumen"
      : "/admin/estado";

  if (pathname.startsWith("/login") && session?.user) {
    return NextResponse.redirect(new URL(homeByScope, nextUrl));
  }

  if (pathname.startsWith("/admin")) {
    if (!session?.user) return NextResponse.redirect(new URL("/login", nextUrl));
    if (scope === "CLIENT") return NextResponse.redirect(new URL("/", nextUrl));
    if (scope === "BUILDING") return NextResponse.redirect(new URL("/owner/resumen", nextUrl));
  }

  if (pathname.startsWith("/owner")) {
    if (!session?.user) return NextResponse.redirect(new URL("/login", nextUrl));
    if (scope !== "BUILDING") return NextResponse.redirect(new URL(homeByScope, nextUrl));
  }

  if (pathname === "/" || pathname.startsWith("/facturas")) {
    if (!session?.user) return NextResponse.redirect(new URL("/login", nextUrl));
    if (scope !== "CLIENT") return NextResponse.redirect(new URL(homeByScope, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/facturas/:path*", "/admin/:path*", "/owner/:path*", "/login"],
};
