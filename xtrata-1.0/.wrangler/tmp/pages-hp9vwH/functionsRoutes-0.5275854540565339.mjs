import { onRequest as __collections__collectionId__assets_ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/collections/[collectionId]/assets.ts"
import { onRequest as __collections__collectionId__publish_ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/collections/[collectionId]/publish.ts"
import { onRequest as __collections__collectionId__reserve_ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/collections/[collectionId]/reserve.ts"
import { onRequest as __collections__collectionId__upload_url_ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/collections/[collectionId]/upload-url.ts"
import { onRequest as __hiro__network____path___ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/hiro/[network]/[[path]].ts"
import { onRequest as __collections_health_ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/collections/health.ts"
import { onRequest as __collections__collectionId__ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/collections/[collectionId].ts"
import { onRequest as __bns___path___ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/bns/[[path]].ts"
import { onRequest as __collections_ts_onRequest } from "/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/functions/collections.ts"

export const routes = [
    {
      routePath: "/collections/:collectionId/assets",
      mountPath: "/collections/:collectionId",
      method: "",
      middlewares: [],
      modules: [__collections__collectionId__assets_ts_onRequest],
    },
  {
      routePath: "/collections/:collectionId/publish",
      mountPath: "/collections/:collectionId",
      method: "",
      middlewares: [],
      modules: [__collections__collectionId__publish_ts_onRequest],
    },
  {
      routePath: "/collections/:collectionId/reserve",
      mountPath: "/collections/:collectionId",
      method: "",
      middlewares: [],
      modules: [__collections__collectionId__reserve_ts_onRequest],
    },
  {
      routePath: "/collections/:collectionId/upload-url",
      mountPath: "/collections/:collectionId",
      method: "",
      middlewares: [],
      modules: [__collections__collectionId__upload_url_ts_onRequest],
    },
  {
      routePath: "/hiro/:network/:path*",
      mountPath: "/hiro/:network",
      method: "",
      middlewares: [],
      modules: [__hiro__network____path___ts_onRequest],
    },
  {
      routePath: "/collections/health",
      mountPath: "/collections",
      method: "",
      middlewares: [],
      modules: [__collections_health_ts_onRequest],
    },
  {
      routePath: "/collections/:collectionId",
      mountPath: "/collections",
      method: "",
      middlewares: [],
      modules: [__collections__collectionId__ts_onRequest],
    },
  {
      routePath: "/bns/:path*",
      mountPath: "/bns",
      method: "",
      middlewares: [],
      modules: [__bns___path___ts_onRequest],
    },
  {
      routePath: "/collections",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__collections_ts_onRequest],
    },
  ]