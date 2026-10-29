import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // getUser() makes an Auth network request on every page navigation. Verify
  // the JWT locally with getClaims(); Supabase refreshes it when it is near
  // expiry and the cached signing key keeps routine route loads quick.
  const { data, error } = await supabase.auth.getClaims()
  const isAuthenticated = !error && Boolean(data?.claims?.sub)

  // Protected routes — user must be logged in
  const PROTECTED = ['/scanner', '/studio', '/dashboard', '/internships']
  const path = request.nextUrl.pathname
  const isProtected = PROTECTED.some(p => path.startsWith(p))

  if (!isAuthenticated && isProtected) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthenticated && path === '/login') {
    const requestedNext = request.nextUrl.searchParams.get('next')
    const safeNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/dashboard'
    return NextResponse.redirect(new URL(safeNext, request.url))
  }

  return response
}

export const config = {
  matcher: ['/login', '/scanner/:path*', '/studio/:path*', '/dashboard/:path*', '/internships/:path*'],
}
