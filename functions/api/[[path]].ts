/**
 * Cloudflare Pages Function: every request to /api/* on the Pages site is
 * forwarded to the API. Cloudflare looks for Functions in `functions/` at the
 * root of the Pages project, which is the repository root (the build output
 * is dist/apps/web). The logic and its tests are in
 * apps/web/src/edge/api-proxy.ts; this file only connects it.
 *
 * Bindings (Pages project settings): API_ORIGIN (variable) and PROXY_SECRET
 * (secret). They exist only here, on Cloudflare's servers.
 */
import {
  proxyApiRequest,
  type ApiProxyEnv,
} from '../../apps/web/src/edge/api-proxy';

export const onRequest = ({
  request,
  env,
}: {
  request: Request;
  env: ApiProxyEnv;
}): Promise<Response> => proxyApiRequest(request, env);
