import L from 'leaflet';

/**
 * Standard High-Performance TileLayer
 * Leverages native browser/WebKit HTTP cache without memory leaks or unrevoked Blob ObjectURLs.
 */
export function createCachedTileLayer(urlTemplate: string, options: L.TileLayerOptions): L.TileLayer {
  return L.tileLayer(urlTemplate, {
    ...options,
    keepBuffer: 4,
    updateWhenIdle: true,
    updateWhenZooming: false,
  });
}

export function autoPreCacheViewport(_map: L.Map, _tileUrlTemplate: string) {
  // Native HTTP cache handles tile caching safely without memory pressure
}
