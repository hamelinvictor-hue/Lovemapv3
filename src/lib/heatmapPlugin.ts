import L from './leafletInit';
import 'leaflet.heat';

export function createHeatLayer(
  points: Array<[number, number, number]>,
  options: {
    radius?: number;
    blur?: number;
    maxZoom?: number;
    minOpacity?: number;
    gradient?: Record<number, string>;
  }
) {
  if (typeof (L as any).heatLayer === 'function') {
    return (L as any).heatLayer(points, options);
  }
  
  // Safe fallback if heatLayer plugin is not attached
  console.warn('L.heatLayer not available, falling back to circle gradient group');
  const group = L.layerGroup();
  points.forEach(([lat, lng, weight]) => {
    const opacity = Math.min(0.4, (options.minOpacity || 0.2) + weight * 0.15);
    const radius = (options.radius || 30) * 400; // in meters approx
    const circle = L.circle([lat, lng], {
      color: '#f59e0b',
      fillColor: weight > 1 ? '#e11d48' : weight > 0.8 ? '#f97316' : '#10b981',
      fillOpacity: opacity,
      radius: radius,
      weight: 1,
    });
    group.addLayer(circle);
  });
  return group;
}

export default L;
