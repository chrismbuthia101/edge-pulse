import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/auth/reset-password",
    "/auth/accept-invite/:path*",
    "/auth/mfa/:path*",
  ],
};

const PLATFORM_ADMIN_ROUTES = ["/admin"];
const ORG_ADMIN_ROUTES = ["/dashboard/users", "/dashboard/assignments"];

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + "/");
}

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
  const isAcceptInvite = pathname.startsWith("/auth/accept-invite");
  if (!user && pathname.startsWith("/dashboard")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .schema("organization")
      .from("profiles")
      .select("account_status, role, mfa_enrolled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileError && profile) {
      if (profile.account_status === "PENDING" && !isAcceptInvite) {
        if (profile.role === "ORG_ADMIN") {
          const { data: orgData } = await supabase
            .schema("organization")
            .from("profiles")
            .select("organizations(name)")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!orgData?.organizations?.[0]?.name) {
            const redirectUrl = req.nextUrl.clone();
            redirectUrl.pathname = "/onboarding/setup-organization";
            return NextResponse.redirect(redirectUrl);
          }
        }

        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/onboarding/setup-profile";
        return NextResponse.redirect(redirectUrl);
      }

      if (isAuthPage) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }

      if (isAcceptInvite && profile.account_status === "ACTIVE") {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }

      if (
        pathname.startsWith("/dashboard") &&
        ORG_ADMIN_ROUTES.some((route) => matchesRoute(pathname, route))
      ) {
        if (profile.role !== "ORG_ADMIN") {
          const redirectUrl = req.nextUrl.clone();
          redirectUrl.pathname = "/dashboard";
          return NextResponse.redirect(redirectUrl);
        }
      }

      if (
        pathname.startsWith("/admin") &&
        PLATFORM_ADMIN_ROUTES.some((route) => matchesRoute(pathname, route))
      ) {
        if (profile.role !== "PLATFORM_ADMIN") {
          const redirectUrl = req.nextUrl.clone();
          redirectUrl.pathname = "/auth/login";
          return NextResponse.redirect(redirectUrl);
        }
      }

      const isMfaEnrollPage = pathname === "/auth/mfa/enroll";
      const isMfaVerifyPage = pathname === "/auth/mfa/verify";

      if (
        profile.role === "ORG_ADMIN" &&
        !profile.mfa_enrolled &&
        !isMfaEnrollPage &&
        !isMfaVerifyPage &&
        profile.account_status === "ACTIVE"
      ) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/auth/mfa/enroll";
        return NextResponse.redirect(redirectUrl);
      }

      if (isMfaEnrollPage && profile.mfa_enrolled) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return res;
}
