import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
  ],
};

const ADMIN_ROUTES = ["/dashboard/users", "/dashboard/assignments"];

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options ?? {}),
          ),
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  const isAuthPage = [
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
  ].includes(pathname);
  const isResetPage = pathname === "/auth/reset-password";

  if (!user && pathname.startsWith("/dashboard")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  if (!user && isResetPage) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .schema("organization")
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const userRole = profile?.role;

    if (ADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
      if (userRole !== "ORG_ADMIN" && userRole !== "PLATFORM_ADMIN") {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return res;
}
