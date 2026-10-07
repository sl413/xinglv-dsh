import { useEffect, useState } from 'react'

/**
 * 极简路径路由
 * ---------------------------------------------------------------------------
 * 只有三条路，不值得引入一个路由库：
 *   /           我的星空
 *   /lives      群星列传（人物列表）
 *   /life/:id   某位人物的星空 —— 这是一个可以直接分享、刷新也能打开的网址
 *   /admin      管理端（需要登录）
 * 服务器对未知路径回退到 index.html，所以这些地址刷新之后依然可用。
 */

export type Route =
  | { name: 'sky' }
  | { name: 'lives' }
  | { name: 'life'; id: string }
  | { name: 'admin' }

/**
 * 部署子路径。
 * ---------------------------------------------------------------------------
 * base 只影响 Vite 生成的资源地址，**不会**改 location.pathname。
 * 部署到 username.github.io/仓库名/ 时，地址栏是 /仓库名/lives，
 * 而路由只认 /lives —— 于是「群星列传」整个打不开，只剩星空。
 * 实测过一次：静态站上 lifeCards = 0，就是这么来的。
 * 所以这里进出都要过一道前缀换算。
 */
const BASE = import.meta.env.BASE_URL || '/'

/** 去掉部署前缀：/repo/lives -> /lives */
export function stripBase(pathname: string): string {
  if (BASE === '/' || BASE === '') return pathname
  const prefix = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE
  if (pathname === prefix) return '/'
  if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length)
  return pathname
}

/** 加上部署前缀：/lives -> /repo/lives */
export function withBase(path: string): string {
  if (BASE === '/' || BASE === '') return path
  const prefix = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE
  return path === '/' ? `${prefix}/` : `${prefix}${path}`
}

export function parsePath(pathname: string): Route {
  const clean = stripBase(pathname).replace(/\/+$/, '') || '/'
  if (clean === '/lives') return { name: 'lives' }
  if (clean === '/admin') return { name: 'admin' }
  const m = /^\/life\/([A-Za-z0-9-]{1,64})$/.exec(clean)
  if (m) return { name: 'life', id: m[1] }
  return { name: 'sky' }
}

export function pathOf(route: Route): string {
  switch (route.name) {
    case 'lives':
      return '/lives'
    case 'life':
      return `/life/${route.id}`
    case 'admin':
      return '/admin'
    default:
      return '/'
  }
}

export function navigate(route: Route, { replace = false } = {}): void {
  // 写进地址栏的必须是带前缀的完整路径，否则刷新就 404
  const path = withBase(pathOf(route))
  if (window.location.pathname === path) return
  if (replace) window.history.replaceState({}, '', path)
  else window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** 订阅当前路由。任何 pushState / 浏览器前进后退都会触发更新。 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname))
  useEffect(() => {
    const onChange = () => setRoute(parsePath(window.location.pathname))
    window.addEventListener('popstate', onChange)
    return () => window.removeEventListener('popstate', onChange)
  }, [])
  return route
}

export function shareUrl(id: string): string {
  // 分享出去的地址也要带部署前缀，否则别人打开直接 404
  return `${window.location.origin}${withBase(`/life/${id}`)}`
}
