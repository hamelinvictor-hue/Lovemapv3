import L from 'leaflet';

/**
 * Intelligent & Transparent Leaflet TileLayer Cache
 * Uses Stale-While-Revalidate caching pattern with CacheStorage API.
 * 
 * Features:
 * - 0ms instant tile loading from local device cache
 * - Background tile revalidation & pre-fetching of adjacent area
 * - Automatic LRU eviction (limits cache size to ~3200 tiles / ~100MB)
 * - 100% silent and transparent to the user
 */

const TILE_CACHE_NAME = 'lovemap-tiles-v2';
const MAX_CACHED_TILES = 3200; // Auto eviction limit (~100 MB of map tiles)

// FIFO/LRU tracker queue
const tileQueue: string[] = [];

/**
 * Perform background tile revalidation and caching
 */
async function cacheTileInBackground(tileUrl: string) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const res = await fetch(tileUrl, { mode: 'cors' });
    if (res.ok) {
      await cache.put(tileUrl, res);
      
      if (!tileQueue.includes(tileUrl)) {
        tileQueue.push(tileUrl);
      }

      // Automatic eviction if cache exceeds max tiles limit
      if (tileQueue.length > MAX_CACHED_TILES) {
        const oldestUrl = tileQueue.shift();
        if (oldestUrl) {
          cache.delete(oldestUrl).catch(() => {});
        }
      }
    }
  } catch {
    // Silent fail if network offline or fetch aborted
  }
}

export const CachedTileLayer = L.TileLayer.extend({
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.setAttribute('role', 'presentation');
    tile.alt = '';

    const tileUrl = this.getTileUrl(coords);
    let isCancelled = false;

    if ('caches' in window) {
      caches
        .open(TILE_CACHE_NAME)
        .then((cache) => cache.match(tileUrl))
        .then((cachedResponse) => {
          if (isCancelled) return;

          if (cachedResponse) {
            // Serve immediately from cache (0ms delay)
            cachedResponse.blob().then((blob) => {
              if (isCancelled) return;
              const objectUrl = URL.createObjectURL(blob);
              tile.src = objectUrl;
              done(undefined, tile);

              // Background revalidation (Stale-While-Revalidate)
              if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(() => cacheTileInBackground(tileUrl));
              } else {
                setTimeout(() => cacheTileInBackground(tileUrl), 1000);
              }
            });
          } else {
            // Not in cache -> Fetch network & save
            fetch(tileUrl, { mode: 'cors' })
              .then((res) => {
                if (!res.ok) throw new Error('Network error');
                const clone = res.clone();
                caches.open(TILE_CACHE_NAME).then((c) => {
                  c.put(tileUrl, clone).catch(() => {});
                  if (!tileQueue.includes(tileUrl)) tileQueue.push(tileUrl);
                });
                return res.blob();
              })
              .then((blob) => {
                if (isCancelled) return;
                const objectUrl = URL.createObjectURL(blob);
                tile.src = objectUrl;
                done(undefined, tile);
              })
              .catch(() => {
                // Direct fallback image load
                tile.src = tileUrl;
                L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));
                L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile));
              });
          }
        })
        .catch(() => {
          tile.src = tileUrl;
          L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));
          L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile));
        });
    } else {
      tile.src = tileUrl;
      L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));
      L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile));
    }

    return tile;
  },
});

export function createCachedTileLayer(urlTemplate: string, options: L.TileLayerOptions): L.TileLayer {
  return new (CachedTileLayer as any)(urlTemplate, options);
}

/**
 * Transparently pre-fetch surrounding viewport tiles when map stops moving
 */
export function autoPreCacheViewport(map: L.Map, tileUrlTemplate: string) {
  if (!('caches' in window) || !map) return;

  const scheduleJob = 'requestIdleCallback' in window ? (window as any).requestIdleCallback : (fn: Function) => setTimeout(fn, 1500);

  scheduleJob(async () => {
    try {
      const bounds = map.getBounds();
      const zoom = Math.floor(map.getZoom());
      const cache = await caches.open(TILE_CACHE_NAME);

      const nw = map.project(bounds.getNorthWest(), zoom).divideBy(256).floor();
      const se = map.project(bounds.getSouthEast(), zoom).divideBy(256).floor();

      // Pre-fetch 1 ring outside current viewport
      const minX = Math.min(nw.x, se.x) - 1;
      const maxX = Math.max(nw.x, se.x) + 1;
      const minY = Math.min(nw.y, se.y) - 1;
      const maxY = Math.max(nw.y, se.y) + 1;

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const url = tileUrlTemplate
            .replace('{z}', String(zoom))
            .replace('{x}', String(x))
            .replace('{y}', String(y))
            .replace('{s}', ['a', 'b', 'c'][Math.abs(x + y) % 3])
            .replace('{r}', '');

          if (url && !tileQueue.includes(url)) {
            const match = await cache.match(url);
            if (!match) {
              fetch(url, { mode: 'cors' })
                .then((res) => {
                  if (res.ok) cache.put(url, res);
                })
                .catch(() => {});
            }
          }
        }
      }
    } catch {
      // Silent error ignore
    }
  });
}
