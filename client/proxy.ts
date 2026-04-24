import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
  ],
};

// Role-based route protection
const ADMIN_ONLY_ROUTES = [
  "/dashboard/users",
  "/dashboard/reports",
];

const ANALYST_OR_ADMIN_ROUTES = [
  "/dashboard/cases",
  "/dashboard/logs",
];

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options ?? {})
          ),
      },
    }
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

  // Redirect unauthenticated users away from protected routes
  if (!user && pathname.startsWith("/dashboard")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthPage) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  // Allow /reset-password only for authenticated users (Supabase sets session via magic link)
  if (!user && isResetPage) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    return NextResponse.redirect(redirectUrl);
  }

  // Role-based access control for authenticated users
  if (user && pathname.startsWith("/dashboard")) {
    const { data: analystData } = await supabase
      .from("analyst_users")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const userRole = analystData?.role;

    // Check admin-only routes
    if (ADMIN_ONLY_ROUTES.some(route => pathname.startsWith(route))) {
      if (userRole !== "ADMINISTRATOR") {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Check analyst or admin routes
    if (ANALYST_OR_ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      if (!["ANALYST", "ADMINISTRATOR"].includes(userRole || "")) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return res;
}