/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AboutRouteImport } from './routes/about'
import { Route as CreatorRouteImport } from './routes/creator'
import { Route as LibraryRouteImport } from './routes/library'
import { Route as LoginRouteImport } from './routes/login'
import { Route as OpenRouteImport } from './routes/open'
import { Route as ResearchRouteImport } from './routes/research'
import { Route as SkillRouteImport } from './routes/skill'
import { Route as ApiMediaRouteImport } from './routes/api/media'
import { Route as ApiReadRouteImport } from './routes/api/read'
import { Route as WatchIdRouteImport } from './routes/watch.$id'
import { Route as ApiAuthSplatRouteImport } from './routes/api/auth/$'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const AboutRoute = AboutRouteImport.update({ id: '/about', path: '/about', getParentRoute: () => rootRouteImport } as any)
const CreatorRoute = CreatorRouteImport.update({ id: '/creator', path: '/creator', getParentRoute: () => rootRouteImport } as any)
const LibraryRoute = LibraryRouteImport.update({ id: '/library', path: '/library', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const OpenRoute = OpenRouteImport.update({ id: '/open', path: '/open', getParentRoute: () => rootRouteImport } as any)
const ResearchRoute = ResearchRouteImport.update({ id: '/research', path: '/research', getParentRoute: () => rootRouteImport } as any)
const SkillRoute = SkillRouteImport.update({ id: '/skill', path: '/skill', getParentRoute: () => rootRouteImport } as any)
const ApiMediaRoute = ApiMediaRouteImport.update({ id: '/api/media', path: '/api/media', getParentRoute: () => rootRouteImport } as any)
const ApiReadRoute = ApiReadRouteImport.update({ id: '/api/read', path: '/api/read', getParentRoute: () => rootRouteImport } as any)
const WatchIdRoute = WatchIdRouteImport.update({ id: '/watch/$id', path: '/watch/$id', getParentRoute: () => rootRouteImport } as any)
const ApiAuthSplatRoute = ApiAuthSplatRouteImport.update({ id: '/api/auth/$', path: '/api/auth/$', getParentRoute: () => rootRouteImport } as any)

export interface FileRouteTypes {
  fileRoutesByFullPath: any
  fullPaths: string
  fileRoutesByTo: any
  to: string
  id: string
  fileRoutesById: any
}
declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/about': { id: '/about'; path: '/about'; fullPath: '/about'; preLoaderRoute: typeof AboutRouteImport; parentRoute: typeof rootRouteImport }
    '/creator': { id: '/creator'; path: '/creator'; fullPath: '/creator'; preLoaderRoute: typeof CreatorRouteImport; parentRoute: typeof rootRouteImport }
    '/library': { id: '/library'; path: '/library'; fullPath: '/library'; preLoaderRoute: typeof LibraryRouteImport; parentRoute: typeof rootRouteImport }
    '/login': { id: '/login'; path: '/login'; fullPath: '/login'; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport }
    '/open': { id: '/open'; path: '/open'; fullPath: '/open'; preLoaderRoute: typeof OpenRouteImport; parentRoute: typeof rootRouteImport }
    '/research': { id: '/research'; path: '/research'; fullPath: '/research'; preLoaderRoute: typeof ResearchRouteImport; parentRoute: typeof rootRouteImport }
    '/skill': { id: '/skill'; path: '/skill'; fullPath: '/skill'; preLoaderRoute: typeof SkillRouteImport; parentRoute: typeof rootRouteImport }
    '/api/media': { id: '/api/media'; path: '/api/media'; fullPath: '/api/media'; preLoaderRoute: typeof ApiMediaRouteImport; parentRoute: typeof rootRouteImport }
    '/api/read': { id: '/api/read'; path: '/api/read'; fullPath: '/api/read'; preLoaderRoute: typeof ApiReadRouteImport; parentRoute: typeof rootRouteImport }
    '/watch/$id': { id: '/watch/$id'; path: '/watch/$id'; fullPath: '/watch/$id'; preLoaderRoute: typeof WatchIdRouteImport; parentRoute: typeof rootRouteImport }
    '/api/auth/$': { id: '/api/auth/$'; path: '/api/auth/$'; fullPath: '/api/auth/$'; preLoaderRoute: typeof ApiAuthSplatRouteImport; parentRoute: typeof rootRouteImport }
  }
}
const rootRouteChildren = { IndexRoute, AboutRoute, CreatorRoute, LibraryRoute, LoginRoute, OpenRoute, ResearchRoute, SkillRoute, ApiMediaRoute, ApiReadRoute, WatchIdRoute, ApiAuthSplatRoute }
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()
