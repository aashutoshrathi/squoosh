import { initial, theRest } from './to-cache';

// Give TypeScript the correct global.
declare var self: ServiceWorkerGlobalScope;

export function cacheOrNetwork(event: FetchEvent): void {
  event.respondWith(
    (async function () {
      const cachedResponse = await caches.match(event.request, {
        ignoreSearch: true,
      });
      const response = cachedResponse || (await fetch(event.request));
      if (event.request.mode === 'navigate') {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
      return response;
    })(),
  );
}

export function cacheOrNetworkAndCache(
  event: FetchEvent,
  cacheName: string,
): void {
  event.respondWith(
    (async function () {
      const { request } = event;
      // Return from cache if possible.
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;

      // Else go to the network.
      const response = await fetch(request);
      const responseToCache = response.clone();

      event.waitUntil(
        (async function () {
          // Cache what we fetched.
          const cache = await caches.open(cacheName);
          await cache.put(request, responseToCache);
        })(),
      );

      // Return the network response.
      return response;
    })(),
  );
}

export function serveShareTarget(event: FetchEvent): void {
  const dataPromise = event.request.formData();

  const redirectTarget = new URL('?share-target', self.registration.scope).href;
  event.respondWith(Response.redirect(redirectTarget));

  event.waitUntil(
    (async function () {
      // The page sends this message to tell the service worker it's ready to receive the file.
      await nextMessage('share-ready');
      const client = await self.clients.get(event.resultingClientId);
      const data = await dataPromise;
      const file = data.get('file');
      client!.postMessage({ file, action: 'load-image' });
    })(),
  );
}

export function cleanupCache(
  event: FetchEvent,
  cacheName: string,
  keepAssets: string[],
) {
  event.waitUntil(
    (async function () {
      const cache = await caches.open(cacheName);

      const requests = await cache.keys();
      const scopePath = new URL(self.registration.scope).pathname.replace(
        /^\/+/,
        '',
      );
      const promises = requests.map((cachedRequest) => {
        const assetPath = new URL(cachedRequest.url).pathname.replace(
          /^\/+/,
          '',
        );
        const relPath = assetPath.startsWith(scopePath)
          ? assetPath.slice(scopePath.length).replace(/^\/+/, '')
          : assetPath;
        if (!keepAssets.includes(relPath) && !keepAssets.includes(assetPath)) {
          return cache.delete(cachedRequest);
        }
      });

      await Promise.all<any>(promises);
    })(),
  );
}

function urlsToRequests(urls: string[]): Request[] {
  // Using no-cache, as our hashing aren't updating properly right now.
  return urls.map((url) => new Request(url, { cache: 'no-cache' }));
}

export async function cacheBasics(cacheName: string) {
  const cache = await caches.open(cacheName);
  return cache.addAll(urlsToRequests(initial));
}

export async function cacheAdditionalProcessors(cacheName: string) {
  const cache = await caches.open(cacheName);
  return cache.addAll(urlsToRequests(await theRest));
}

const nextMessageResolveMap = new Map<string, (() => void)[]>();

/**
 * Wait on a message with a particular event.data value.
 *
 * @param dataVal The event.data value.
 */
function nextMessage(dataVal: string): Promise<void> {
  return new Promise((resolve) => {
    if (!nextMessageResolveMap.has(dataVal)) {
      nextMessageResolveMap.set(dataVal, []);
    }
    nextMessageResolveMap.get(dataVal)!.push(resolve);
  });
}

self.addEventListener('message', (event) => {
  const resolvers = nextMessageResolveMap.get(event.data);
  if (!resolvers) return;
  nextMessageResolveMap.delete(event.data);
  for (const resolve of resolvers) resolve();
});
