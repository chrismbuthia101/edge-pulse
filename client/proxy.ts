import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const config = {
  matcher: ["/dashboard/:path*"],
}

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", req.url))
  }

  return res
}