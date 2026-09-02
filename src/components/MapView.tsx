import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import L, { createHeatLayer } from '../lib/heatmapPlugin';
import { createCachedTileLayer, autoPreCacheViewport } from '../lib/cachedTileLayer';
import { getNativeCurrentPosition, watchNativePosition, triggerNativeGeolocation } from '../lib/nativePermissions';
import { Spot, PartnerId, AppMode } from '../types';
import { CATEGORIES } from '../data/initialData';
import { triggerHaptic } from '../lib/feedback';
import { useTranslation } from '../i18n/LanguageContext';
import { generateFlameSvgString } from '../lib/flameIcon';
import {
  Search,
  Compass,
  Navigation,
  Heart,
  CheckCircle2,
  Clock,
  Globe,
  Moon,
  Map as MapIcon,
  Filter,
  Flame,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Sparkles,
  Layers,
  X,
} from 'lucide-react';

interface MapViewProps {
  spots: Spot[];
  activePartnerId: PartnerId;
  userAvatar?: string;
  userName?: string;
  onSelectSpot: (spot: Spot) => void;
  onOpenValidation?: (spot: Spot) => void;
  onAddSpotAtCoords: (lat: number, lng: number, addressName?: string) => void;
  selectedSpotId?: string;
  appMode?: AppMode;
  theme?: 'light' | 'dark';
}

export const MapView: React.FC<MapViewProps> = ({
  spots,
  activePartnerId,
  userAvatar,
  userName,
  onSelectSpot,
  onOpenValidation,
  onAddSpotAtCoords,
  selectedSpotId,
  appMode = 'duo',
  theme = 'dark',
}) => {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<any>(null);

  // Real-time live user geolocation tracking (simulated position in France for testing)
  const SIMULATED_FRANCE_COORDS = { lat: 48.8566, lng: 2.3522, accuracy: 25 }; // Paris, France
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(SIMULATED_FRANCE_COORDS);
  const [isLocating, setIsLocating] = useState(false);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userCircleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'validated' | 'pending'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tileMode, setTileMode] = useState<'french' | 'satellite' | 'dark'>(() => (theme === 'light' ? 'french' : 'dark'));
  const [showCategoryBar, setShowCategoryBar] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isHeatmapVisible, setIsHeatmapVisible] = useState(true);
  const [isControlsExpanded, setIsControlsExpanded] = useState(false);

  // Synchronize tile mode when global theme switches, unless user explicitly selected satellite
  useEffect(() => {
    if (tileMode !== 'satellite') {
      setTileMode(theme === 'dark' ? 'dark' : 'french');
    }
  }, [theme]);

  // Continuous real-time GPS tracking across Apple iOS native & Web
  useEffect(() => {
    // Initial fetch of exact position
    getNativeCurrentPosition().then((pos) => {
      if (pos) {
        setUserCoords({ lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy });
      }
    });

    const cleanupWatch = watchNativePosition(
      (pos) => {
        setUserCoords({ lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy });
      },
      (err) => {
        console.warn('Realtime geolocation watch notice:', err);
      }
    );

    return () => {
      cleanupWatch();
    };
  }, []);

  const onAddSpotAtCoordsRef = useRef(onAddSpotAtCoords);
  onAddSpotAtCoordsRef.current = onAddSpotAtCoords;

  const userCoordsRef = useRef(userCoords);
  userCoordsRef.current = userCoords;

  // Render or update live user position marker with user photo in a clean blue circular frame
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!userCoords) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userCircleRef.current) {
        map.removeLayer(userCircleRef.current);
        userCircleRef.current = null;
      }
      return;
    }

    // Clean up any legacy circle overlay
    if (userCircleRef.current) {
      map.removeLayer(userCircleRef.current);
      userCircleRef.current = null;
    }

    const { lat, lng, accuracy } = userCoords;
    const avatarSrc = userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
    const displayName = userName || 'Moi';

    const liveUserIcon = L.divIcon({
      className: 'user-live-gps-marker',
      html: `
        <div style="width: 44px; height: 44px; position: relative; cursor: pointer;">
          <div style="width: 44px; height: 44px; border-radius: 50%; border: 3px solid #2563eb; background-color: #ffffff; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4); overflow: hidden; box-sizing: border-box;">
            <img src="${avatarSrc}" alt="${displayName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'" />
          </div>
          <div style="position: absolute; bottom: 0px; right: 0px; width: 12px; height: 12px; border-radius: 50%; background-color: #10b981; border: 2px solid #ffffff; z-index: 20;"></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    const popupHtml = `
      <div style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 6px 4px; min-width: 170px;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px;">
          <img src="${avatarSrc}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid #2563eb;" />
          <strong style="color: #0f172a; font-size: 13px;">${displayName}</strong>
        </div>
        <button
          id="btn-add-spot-at-my-location"
          type="button"
          data-action="add-spot-at-my-location"
          style="width: 100%; padding: 9px 12px; background: linear-gradient(135deg, #e11d48, #be123c); color: white; border: none; border-radius: 12px; font-weight: 800; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4); transition: transform 0.1s;"
        >
          📍 ${t.map.addSpotHere}
        </button>
      </div>
    `;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lng]);
      userMarkerRef.current.setIcon(liveUserIcon);
      userMarkerRef.current.setPopupContent(popupHtml);
    } else {
      const marker = L.marker([lat, lng], {
        icon: liveUserIcon,
        zIndexOffset: 3000,
        interactive: true,
      }).addTo(map);

      marker.bindPopup(popupHtml, {
        closeButton: true,
      });

      userMarkerRef.current = marker;
    }
  }, [userCoords, userAvatar, userName, t.map.addSpotHere]);

  // Robust Global listener for clicks on popup buttons (avoids Leaflet event swallowing)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleAddClick = (e: Event) => {
      const target = (e.target as HTMLElement)?.closest('#btn-add-spot-at-my-location, [data-action="add-spot-at-my-location"]');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic('medium');
        if (userCoordsRef.current) {
          onAddSpotAtCoordsRef.current(userCoordsRef.current.lat, userCoordsRef.current.lng, 'Ma position actuelle');
        }
        if (mapInstanceRef.current) {
          mapInstanceRef.current.closePopup();
        }
      }
    };

    container.addEventListener('click', handleAddClick, true);
    container.addEventListener('touchend', handleAddClick, true);

    return () => {
      container.removeEventListener('click', handleAddClick, true);
      container.removeEventListener('touchend', handleAddClick, true);
    };
  }, []);

  // Strictly isolate Solo mode spots vs Duo mode spots
  const modeSpots = spots.filter((spot) => (appMode === 'solo' ? spot.isSolo === true : !spot.isSolo));

  const filteredSpots = modeSpots.filter((spot) => {
    if (statusFilter === 'validated' && spot.status !== 'validated') return false;
    if (statusFilter === 'pending' && spot.status !== 'pending_validation') return false;
    if (categoryFilter !== 'all' && spot.categoryId !== categoryFilter) return false;
    return true;
  });

  // Helper to compute zoom-based heatmap parameters
  const getHeatmapParams = (zoom: number) => {
    if (zoom <= 6) {
      return { radius: 60, blur: 40, minOpacity: 0.35 };
    } else if (zoom <= 9) {
      return { radius: 45, blur: 30, minOpacity: 0.30 };
    } else if (zoom <= 12) {
      return { radius: 32, blur: 22, minOpacity: 0.25 };
    } else {
      return { radius: 24, blur: 16, minOpacity: 0.20 };
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [46.603354, 1.888334],
      zoom: 5.8,
      minZoom: 3,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
      zoomControl: false,
    });

    // Map initialized without default zoom control clutter
    const markersGroup = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      onAddSpotAtCoordsRef.current(lat, lng);
    });

    mapInstanceRef.current = map;
    markersLayerRef.current = markersGroup;

    // Responsive Auto-Resize Handler (iPhone Mini -> iPad Pro 13" -> Desktop PC)
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    const handleWindowResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Map Tile Switching (Mapbox / CartoDB / Esri Satellite / OSM France)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapInstanceRef.current?.removeLayer(layer);
      }
    });

    // MapTiler / CartoDB / Esri Satellite layer configuration
    const maptilerKey = 
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MAPTILER_KEY?.trim() ||
      (window as any).__MAPTILER_KEY__?.trim() ||
      '';
    const hasValidMaptilerKey = Boolean(
      maptilerKey &&
      maptilerKey.length > 5 &&
      maptilerKey !== '""' &&
      maptilerKey !== "''" &&
      !maptilerKey.includes('your_') &&
      !maptilerKey.includes('undefined')
    );

    let tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

    if (hasValidMaptilerKey) {
      attribution = '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
      if (tileMode === 'satellite') {
        tileUrl = `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${maptilerKey}`;
      } else if (tileMode === 'dark') {
        tileUrl = `https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${maptilerKey}`;
      } else {
        tileUrl = `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${maptilerKey}`;
      }
    } else {
      if (tileMode === 'satellite') {
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        attribution = '&copy; <a href="https://www.esri.com/" target="_blank">Esri World Imagery</a>';
      } else if (tileMode === 'dark') {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
      } else {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        attribution = '&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
      }
    }

    createCachedTileLayer(tileUrl, {
      attribution,
      maxZoom: 20,
      minZoom: 2,
      subdomains: 'abcd',
      crossOrigin: true,
      detectRetina: true,
    }).addTo(mapInstanceRef.current);

    // Silently pre-cache surrounding tiles when map stops moving
    const onMapMoveEnd = () => {
      if (mapInstanceRef.current) {
        autoPreCacheViewport(mapInstanceRef.current, tileUrl);
      }
    };

    mapInstanceRef.current.on('moveend', onMapMoveEnd);
    // Initial silent pre-cache
    autoPreCacheViewport(mapInstanceRef.current, tileUrl);

    return () => {
      mapInstanceRef.current?.off('moveend', onMapMoveEnd);
    };
  }, [tileMode]);

  // Update High-Contrast Gradient Heatmap Layer (Zoom-adaptive halo size)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (!map.getPane('heatHaloPane')) {
      const heatPane = map.createPane('heatHaloPane');
      heatPane.style.zIndex = '350';
      heatPane.style.pointerEvents = 'none';
    }

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (!isHeatmapVisible || filteredSpots.length === 0) return;

    const heatGroup = L.layerGroup().addTo(map);

    const renderHalos = () => {
      heatGroup.clearLayers();
      const zoom = map.getZoom();

      // Scaled halo size according to zoom level
      let baseSize = 40;
      if (zoom <= 5) baseSize = 30;
      else if (zoom <= 7) baseSize = 48;
      else if (zoom <= 9) baseSize = 75;
      else if (zoom <= 11) baseSize = 110;
      else if (zoom <= 13) baseSize = 150;
      else baseSize = 190;

      filteredSpots.forEach((spot) => {
        let isHot = spot.status === 'validated';
        let haloSize = isHot ? Math.round(baseSize * 1.4) : baseSize;
        let blurVal = Math.max(3, Math.round(haloSize * 0.12));

        // High contrast vivid gradients
        const gradientCss = isHot
          ? 'radial-gradient(circle, rgba(244, 63, 94, 0.95) 0%, rgba(236, 72, 153, 0.85) 25%, rgba(245, 158, 11, 0.7) 55%, rgba(16, 185, 129, 0.35) 80%, transparent 100%)'
          : 'radial-gradient(circle, rgba(225, 29, 72, 0.85) 0%, rgba(249, 115, 22, 0.75) 35%, rgba(234, 179, 8, 0.5) 65%, rgba(34, 197, 94, 0.2) 85%, transparent 100%)';

        const haloHtml = `
          <div style="
            width: ${haloSize}px;
            height: ${haloSize}px;
            border-radius: 50%;
            background: ${gradientCss};
            transform: translate(-50%, -50%);
            pointer-events: none;
            filter: blur(${blurVal}px) saturate(2.2) contrast(1.6);
            mix-blend-mode: hard-light;
          "></div>
        `;

        const haloIcon = L.divIcon({
          className: 'spot-heat-halo',
          html: haloHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker([spot.lat, spot.lng], {
          icon: haloIcon,
          interactive: false,
          pane: 'heatHaloPane',
        });

        heatGroup.addLayer(marker);
      });
    };

    renderHalos();

    map.on('zoomend', renderHalos);
    heatLayerRef.current = heatGroup;

    return () => {
      map.off('zoomend', renderHalos);
      if (heatLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [filteredSpots, isHeatmapVisible]);

  // Update Spot Markers with Automatic Clustering when zoomed out
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    const renderClusteredMarkers = () => {
      markersGroup.clearLayers();
      if (filteredSpots.length === 0) return;

      const currentZoom = map.getZoom();
      // Distance radius in pixels to group markers together.
      // At zoom 16+ (street view), radius is 0 (no clustering).
      const CLUSTER_RADIUS_PX = currentZoom >= 16 ? 0 : 70;

      interface SpotCluster {
        spots: Spot[];
        avgLat: number;
        avgLng: number;
        pixelX: number;
        pixelY: number;
      }

      const clusters: SpotCluster[] = [];

      filteredSpots.forEach((spot) => {
        const containerPoint = map.latLngToContainerPoint([spot.lat, spot.lng]);

        let matchedCluster: SpotCluster | null = null;
        if (CLUSTER_RADIUS_PX > 0) {
          for (const cl of clusters) {
            const dx = cl.pixelX - containerPoint.x;
            const dy = cl.pixelY - containerPoint.y;
            if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_RADIUS_PX) {
              matchedCluster = cl;
              break;
            }
          }
        }

        if (matchedCluster) {
          matchedCluster.spots.push(spot);
          const count = matchedCluster.spots.length;
          matchedCluster.avgLat = matchedCluster.spots.reduce((sum, s) => sum + s.lat, 0) / count;
          matchedCluster.avgLng = matchedCluster.spots.reduce((sum, s) => sum + s.lng, 0) / count;
          const newPoint = map.latLngToContainerPoint([matchedCluster.avgLat, matchedCluster.avgLng]);
          matchedCluster.pixelX = newPoint.x;
          matchedCluster.pixelY = newPoint.y;
        } else {
          clusters.push({
            spots: [spot],
            avgLat: spot.lat,
            avgLng: spot.lng,
            pixelX: containerPoint.x,
            pixelY: containerPoint.y,
          });
        }
      });

      clusters.forEach((cluster) => {
        const isDarkMap = tileMode === 'dark' || tileMode === 'satellite';

        if (cluster.spots.length === 1) {
          // SINGLE SPOT MARKER
          const spot = cluster.spots[0];
          const isSelected = spot.id === selectedSpotId;
          const scoreFormatted = spot.overallScore ? spot.overallScore.toFixed(1) : undefined;

          let borderAccent = 'border-rose-500 shadow-rose-500/30';
          let tagHtml = '';

          let markerFlameHtml = '';
          if (spot.status === 'pending_validation') {
            borderAccent = 'border-amber-400 shadow-amber-500/30';
            markerFlameHtml = '<span class="text-sm leading-none shrink-0">⏳</span>';
            tagHtml = `<span class="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">Attente</span>`;
          } else {
            if (appMode === 'solo' || spot.isSolo) {
              borderAccent = 'border-emerald-500 shadow-emerald-500/30';
            }
            markerFlameHtml = generateFlameSvgString({
              score: spot.overallScore,
              isSelected,
              size: 19,
              isDarkMap,
              idSuffix: `map-${spot.id}`,
            });
          }

          if (scoreFormatted && spot.status !== 'pending_validation') {
            const scoreBg = (appMode === 'solo' || spot.isSolo) ? 'bg-emerald-600' : 'bg-rose-600';
            tagHtml = `<span class="px-1.5 py-0.5 rounded-full ${scoreBg} text-white text-[10px] font-mono font-bold">${scoreFormatted}★</span>`;
          }

          const cardBg = isDarkMap
            ? 'bg-slate-950 text-white shadow-2xl'
            : 'bg-white text-slate-900 shadow-xl';

          const titleColor = isDarkMap ? 'text-white' : 'text-slate-900';

          const iconHtml = `
            <div class="relative cursor-pointer select-none whitespace-nowrap" style="transform: translate(-50%, -50%);">
              <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 ${borderAccent} ${cardBg} ${
                isSelected ? 'scale-110 ring-4 ring-rose-500/50' : 'hover:scale-105'
              } transition-all duration-200 shadow-xl">
                ${markerFlameHtml}
                <span class="font-extrabold text-xs tracking-tight ${titleColor}">${spot.title}</span>
                ${tagHtml}
              </div>
            </div>
          `;

          const customIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-spot-marker',
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const marker = L.marker([spot.lat, spot.lng], { icon: customIcon, zIndexOffset: 1000 });
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            triggerHaptic('light');
            if (spot.status === 'pending_validation' && spot.creatorId !== activePartnerId && onOpenValidation) {
              onOpenValidation(spot);
            } else {
              onSelectSpot(spot);
            }
          });

          markersGroup.addLayer(marker);
        } else {
          // CLUSTER MARKER (> 1 spots fused together)
          const hasPendingSpot = cluster.spots.some((s) => s.status === 'pending_validation');
          const isSoloCluster = appMode === 'solo' || cluster.spots.every((s) => s.isSolo);
          const isSelected = cluster.spots.some((s) => s.id === selectedSpotId);

          let borderAccent = isSoloCluster
            ? 'border-emerald-500 shadow-emerald-500/40'
            : 'border-rose-500 shadow-rose-500/40';

          let badgeBg = isSoloCluster ? 'bg-emerald-500' : 'bg-rose-500';
          let clusterFlameHtml = '';

          // Pending validation spots take priority in the fused cluster icon
          if (hasPendingSpot) {
            clusterFlameHtml = '<span class="text-base leading-none shrink-0">⏳</span>';
            borderAccent = 'border-amber-400 shadow-amber-500/50 ring-2 ring-amber-400/40';
            badgeBg = 'bg-amber-400 text-slate-950';
          } else {
            const avgScore =
              cluster.spots.reduce((sum, s) => sum + (s.overallScore || 8), 0) / cluster.spots.length;
            clusterFlameHtml = generateFlameSvgString({
              score: avgScore,
              isSelected,
              size: 21,
              isDarkMap,
              idSuffix: `cluster-${cluster.spots[0].id}`,
            });
          }

          const cardBg = isDarkMap
            ? 'bg-slate-950 text-white shadow-2xl'
            : 'bg-white text-slate-900 shadow-xl';

          const iconHtml = `
            <div class="relative cursor-pointer select-none whitespace-nowrap z-[1000]" style="transform: translate(-50%, -50%);">
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 ${borderAccent} ${cardBg} ${
                isSelected ? 'scale-115 ring-4 ring-rose-500/50' : 'hover:scale-110'
              } transition-all duration-200 shadow-2xl">
                ${clusterFlameHtml}
                <span class="px-2 py-0.5 rounded-full ${badgeBg} font-black text-xs shadow-xs">
                  ${cluster.spots.length}
                </span>
              </div>
            </div>
          `;

          const customIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-spot-marker',
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const marker = L.marker([cluster.avgLat, cluster.avgLng], { icon: customIcon, zIndexOffset: 1000 });
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            triggerHaptic('medium');
            // Zoom into cluster location
            const targetZoom = Math.min(map.getZoom() + 3, 17);
            map.flyTo([cluster.avgLat, cluster.avgLng], targetZoom, { duration: 0.6 });
          });

          markersGroup.addLayer(marker);
        }
      });
    };

    renderClusteredMarkers();

    map.on('zoomend moveend', renderClusteredMarkers);

    return () => {
      map.off('zoomend moveend', renderClusteredMarkers);
    };
  }, [filteredSpots, selectedSpotId, appMode, tileMode, activePartnerId, onOpenValidation, onSelectSpot]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const first = data[0];
        const lat = parseFloat(first.lat);
        const lon = parseFloat(first.lon);
        mapInstanceRef.current?.flyTo([lat, lon], 12);
      }
    } catch (err) {
      console.error('Search error', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleGeolocate = async () => {
    triggerHaptic('medium');
    setIsLocating(true);

    if (userCoords && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([userCoords.lat, userCoords.lng], 16, { duration: 1 });
    }

    try {
      const pos = await getNativeCurrentPosition();
      if (pos) {
        setUserCoords({ lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy });
        mapInstanceRef.current?.flyTo([pos.latitude, pos.longitude], 16, { duration: 1 });
      } else {
        await triggerNativeGeolocation();
      }
    } catch (err) {
      console.warn('Geolocation trigger error:', err);
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] bg-slate-900 flex flex-col overflow-hidden">
      {/* Search Top Overlay Bar */}
      <div className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 z-[500] max-w-lg mx-auto pointer-events-auto">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center shadow-xl rounded-2xl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.map.searchPlaceholder}
            className="w-full pl-8 sm:pl-9 pr-20 py-2 sm:py-2.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-white text-xs placeholder-slate-400 dark:placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500 backdrop-blur-md font-medium"
          />
          <Search className="absolute left-2.5 sm:left-3 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />

          <button
            type="submit"
            disabled={isSearching}
            className="absolute right-1 px-3 py-1 sm:py-1.5 rounded-xl bg-slate-900 dark:bg-rose-600 hover:bg-black dark:hover:bg-rose-700 text-white text-[11px] sm:text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            {isSearching ? '...' : t.map.searchButton}
          </button>
        </form>
      </div>

      {/* Floating Map Controls (Collapsible Stack with Safe-Area Clearance) */}
      <div
        className="absolute right-3 z-[500] pointer-events-auto flex flex-col items-end gap-2.5 transition-all duration-300"
        style={{
          bottom: 'calc(5.75rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Standalone Direct Quick Geolocate GPS Button */}
        <button
          type="button"
          onClick={handleGeolocate}
          disabled={isLocating}
          className={`p-3 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center justify-center transition-all cursor-pointer active:scale-90 relative ${
            userCoords
              ? 'bg-slate-900/95 text-blue-400 border-blue-500/50 hover:bg-slate-800 ring-2 ring-blue-500/30'
              : 'bg-slate-900/95 text-white border-white/15 hover:bg-slate-800'
          }`}
          title={t.map.myPosition}
        >
          {userCoords && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-slate-900 animate-pulse"></span>
          )}
          <Navigation className={`w-5 h-5 ${isLocating ? 'animate-spin text-blue-300' : userCoords ? 'text-blue-400 fill-blue-500/20' : 'text-white'}`} />
        </button>

        {/* Expanded Stack Items */}
        <AnimatePresence>
          {isControlsExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col items-end gap-2 mb-1"
            >
              {/* Vue Satellite Button */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setTileMode(tileMode === 'satellite' ? 'french' : 'satellite');
                }}
                className={`px-3 py-2 rounded-2xl border shadow-xl backdrop-blur-xl transition-all active:scale-95 flex items-center gap-2 text-xs font-extrabold cursor-pointer ${
                  tileMode === 'satellite'
                    ? 'bg-emerald-600 text-white border-emerald-500 ring-2 ring-emerald-500/40'
                    : 'bg-slate-900/90 text-white border-white/15 hover:bg-slate-800'
                }`}
                title={tileMode === 'satellite' ? t.map.standardView : t.map.satelliteView}
              >
                <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{tileMode === 'satellite' ? t.map.standardView : t.map.satelliteView}</span>
              </button>

              {/* Map Theme Switcher */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setTileMode(tileMode === 'dark' ? 'french' : 'dark');
                }}
                className={`px-3 py-2 rounded-2xl border shadow-xl backdrop-blur-xl transition-all active:scale-95 flex items-center gap-2 text-xs font-extrabold cursor-pointer ${
                  tileMode === 'dark'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                    : 'bg-slate-900/90 text-white border-white/15 hover:bg-slate-800'
                }`}
                title={tileMode === 'dark' ? t.map.dayView : t.map.nightView}
              >
                {tileMode === 'dark' ? (
                  <Moon className="w-4 h-4 text-slate-950 shrink-0 fill-current" />
                ) : (
                  <MapIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                )}
                <span>{tileMode === 'dark' ? t.map.dayView : t.map.nightView}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Stack Toggle Button */}
        <button
          onClick={() => {
            triggerHaptic('light');
            setIsControlsExpanded(!isControlsExpanded);
          }}
          className={`px-3 py-2.5 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center gap-2 text-xs font-black transition-all cursor-pointer active:scale-95 ${
            isControlsExpanded
              ? 'bg-rose-600 text-white border-rose-500 ring-2 ring-rose-500/30'
              : 'bg-slate-900/95 text-white border-white/15 hover:bg-slate-800'
          }`}
          title={t.map.mapOptions}
        >
          {isControlsExpanded ? (
            <>
              <X className="w-4 h-4 text-white" />
              <span>{t.map.close}</span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4 text-rose-400 animate-pulse" />
              <span>{t.map.mapOptions}</span>
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            </>
          )}
        </button>
      </div>

      {/* Gradient Overlay Container for Leaflet Map */}
      <div className="relative w-full h-full flex-1">
        {/* Subtle Ambient Map Atmosphere Overlay */}
        <div className="absolute inset-0 pointer-events-none z-10 bg-cyan-900/10 mix-blend-overlay" />
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
