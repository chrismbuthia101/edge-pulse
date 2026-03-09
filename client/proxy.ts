import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value }) =>
            res.cookies.set(name, value)
          ),
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  const { pathname } = req.nextUrl;
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(pathname);
  const isResetPage = pathname === "/reset-password";

  // Redirect unauthenticated users away from protected routes
  if (!user && pathname.startsWith("/dashboard")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
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
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return res
}