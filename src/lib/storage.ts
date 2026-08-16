import { Spot, CouplePair, NotificationItem, PartnerId, CriteriaKey, GlobalCriteriaStats, PartnerRating, AppMode } from '../types';
import { INITIAL_SPOTS, INITIAL_COUPLE, INITIAL_NOTIFICATIONS, RATING_CRITERIA } from '../data/initialData';

const SPOTS_KEY = 'lovemap_spots_v1';
const COUPLE_KEY = 'lovemap_couple_v1';
const NOTIFS_KEY = 'lovemap_notifs_v1';
const ACTIVE_PARTNER_KEY = 'lovemap_active_partner_v1';
const APP_MODE_KEY = 'lovemap_app_mode_v1';
const THEME_KEY = 'lovemap_theme_v1';
const ONBOARDING_KEY = 'lovemap_onboarding_completed_v2';
const LAUNCH_COUNT_KEY = 'lovemap_launch_count_v2';
const ATT_CONSENT_KEY = 'lovemap_att_consent_v2';
const LOCATION_PROMPT_KEY = 'lovemap_location_prompt_seen_v2';
const RATED_APP_KEY = 'lovemap_has_rated_app_v2';
const FIRST_SPOT_RATING_PROMPTED_KEY = 'lovemap_first_spot_rating_prompted_v2';
const NOTIFICATION_PROMPT_KEY = 'lovemap_notification_prompt_seen_v2';
const NOTIFICATION_PERMISSION_KEY = 'lovemap_notification_permission_v2';
const TRIAL_URGENCY_NOTIF_KEY = 'lovemap_trial_urgency_notif_sent_v2';

export type ThemeMode = 'light' | 'dark';

export function getHasSeenNotificationPrompt(): boolean {
  try {
    return localStorage.getItem(NOTIFICATION_PROMPT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveHasSeenNotificationPrompt(seen: boolean): void {
  try {
    localStorage.setItem(NOTIFICATION_PROMPT_KEY, seen ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to save notification prompt state', err);
  }
}

export function getStoredNotificationPermission(): 'granted' | 'denied' | 'default' {
  try {
    const val = localStorage.getItem(NOTIFICATION_PERMISSION_KEY);
    if (val === 'granted' || val === 'denied' || val === 'default') return val;
    return 'default';
  } catch {
    return 'default';
  }
}

export function saveStoredNotificationPermission(perm: 'granted' | 'denied' | 'default'): void {
  try {
    localStorage.setItem(NOTIFICATION_PERMISSION_KEY, perm);
  } catch (err) {
    console.error('Failed to save notification permission', err);
  }
}

export function getHasSentTrialUrgencyNotification(): boolean {
  try {
    return localStorage.getItem(TRIAL_URGENCY_NOTIF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveHasSentTrialUrgencyNotification(sent: boolean): void {
  try {
    localStorage.setItem(TRIAL_URGENCY_NOTIF_KEY, sent ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to save trial urgency notification state', err);
  }
}

export function getAppLaunchCount(): number {
  try {
    const val = localStorage.getItem(LAUNCH_COUNT_KEY);
    return val ? parseInt(val, 10) || 1 : 1;
  } catch (err) {
    return 1;
  }
}

export function incrementAppLaunchCount(): number {
  try {
    // Ensure we only count once per browser session
    if (sessionStorage.getItem('lovemap_session_started_v1')) {
      return getAppLaunchCount();
    }
    sessionStorage.setItem('lovemap_session_started_v1', 'true');
    const current = getAppLaunchCount();
    const next = current + 1;
    localStorage.setItem(LAUNCH_COUNT_KEY, next.toString());
    return next;
  } catch (err) {
    return 1;
  }
}

export function getAttConsent(): 'authorized' | 'denied' | null {
  try {
    const val = localStorage.getItem(ATT_CONSENT_KEY);
    if (val === 'authorized' || val === 'denied') return val;
    return null;
  } catch (err) {
    return null;
  }
}

export function saveAttConsent(status: 'authorized' | 'denied'): void {
  try {
    localStorage.setItem(ATT_CONSENT_KEY, status);
  } catch (err) {
    console.error('Failed to save ATT consent', err);
  }
}

export function getHasSeenLocationPrompt(): boolean {
  try {
    return localStorage.getItem(LOCATION_PROMPT_KEY) === 'true';
  } catch (err) {
    return false;
  }
}

export function saveHasSeenLocationPrompt(seen: boolean): void {
  try {
    localStorage.setItem(LOCATION_PROMPT_KEY, seen ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to save location prompt state', err);
  }
}

export function getHasRatedApp(): boolean {
  try {
    return localStorage.getItem(RATED_APP_KEY) === 'true';
  } catch (err) {
    return false;
  }
}

export function saveHasRatedApp(rated: boolean): void {
  try {
    localStorage.setItem(RATED_APP_KEY, rated ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to save app rating state', err);
  }
}

export function getHasPromptedFirstSpotRating(): boolean {
  try {
    return localStorage.getItem(FIRST_SPOT_RATING_PROMPTED_KEY) === 'true';
  } catch (err) {
    return false;
  }
}

export function saveHasPromptedFirstSpotRating(prompted: boolean): void {
  try {
    localStorage.setItem(FIRST_SPOT_RATING_PROMPTED_KEY, prompted ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to save first spot rating state', err);
  }
}

export function resetAppToFreshInstall(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
    localStorage.removeItem(ATT_CONSENT_KEY);
    localStorage.removeItem(LAUNCH_COUNT_KEY);
    localStorage.removeItem(LOCATION_PROMPT_KEY);
    localStorage.removeItem(RATED_APP_KEY);
    localStorage.removeItem(FIRST_SPOT_RATING_PROMPTED_KEY);
    sessionStorage.clear();
  } catch (err) {
    console.error('Failed to reset app storage', err);
  }
}

export function getHasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch (err) {
    return false;
  }
}

export function saveHasCompletedOnboarding(completed: boolean): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, completed ? 'true' : 'false');
  } catch (err) {
    console.error('Failed to save onboarding state', err);
  }
}

export function getStoredTheme(): ThemeMode {
  try {
    const val = localStorage.getItem(THEME_KEY);
    if (val === 'dark' || val === 'light') return val;
    // Default match device system theme (matchMedia)
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  } catch (err) {
    return 'dark';
  }
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.error('Failed to save theme', err);
  }
}

export function getStoredAppMode(): AppMode {
  try {
    const val = localStorage.getItem(APP_MODE_KEY);
    if (val === 'solo' || val === 'duo') {
      return val;
    }
    return 'duo';
  } catch (err) {
    return 'duo';
  }
}

export function saveAppMode(mode: AppMode): void {
  try {
    localStorage.setItem(APP_MODE_KEY, mode);
  } catch (err) {
    console.error('Failed to save app mode', err);
  }
}

export function computeSpotScores(spot: Spot): Spot {
  const pA = spot.ratings?.partner_a;
  const pB = spot.ratings?.partner_b;

  if (!pA && !pB) {
    return spot;
  }

  const keys: CriteriaKey[] = ['comfort', 'thrill', 'romance', 'intensity', 'setting'];
  const avgScores: Record<CriteriaKey, number> = {
    comfort: 0,
    thrill: 0,
    romance: 0,
    intensity: 0,
    setting: 0,
  };

  keys.forEach((key) => {
    const valA = pA?.scores?.[key];
    const valB = pB?.scores?.[key];

    if (valA !== undefined && valB !== undefined) {
      avgScores[key] = Math.round(((valA + valB) / 2) * 10) / 10;
    } else if (valA !== undefined) {
      avgScores[key] = valA;
    } else if (valB !== undefined) {
      avgScores[key] = valB;
    }
  });

  const sum = keys.reduce((acc, k) => acc + avgScores[k], 0);
  const overall = Math.round((sum / keys.length) * 10) / 10;

  return {
    ...spot,
    averageScores: avgScores,
    overallScore: overall,
  };
}

export function getStoredSpots(): Spot[] {
  try {
    const data = localStorage.getItem(SPOTS_KEY);
    if (!data) {
      localStorage.setItem(SPOTS_KEY, JSON.stringify([]));
      return [];
    }
    const parsed: Spot[] = JSON.parse(data);
    return parsed.map(computeSpotScores);
  } catch (err) {
    console.error('Failed to load spots', err);
    return [];
  }
}

export function saveSpots(spots: Spot[]): void {
  try {
    const updated = spots.map(computeSpotScores);
    localStorage.setItem(SPOTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save spots', err);
  }
}

export function getStoredCouple(): CouplePair {
  try {
    const data = localStorage.getItem(COUPLE_KEY);
    if (!data) {
      localStorage.setItem(COUPLE_KEY, JSON.stringify(INITIAL_COUPLE));
      return INITIAL_COUPLE;
    }
    return JSON.parse(data);
  } catch (err) {
    return INITIAL_COUPLE;
  }
}

export function saveCouple(couple: CouplePair): void {
  try {
    localStorage.setItem(COUPLE_KEY, JSON.stringify(couple));
  } catch (err) {
    console.error('Failed to save couple', err);
  }
}

export function getStoredNotifications(): NotificationItem[] {
  try {
    const data = localStorage.getItem(NOTIFS_KEY);
    if (!data) {
      localStorage.setItem(NOTIFS_KEY, JSON.stringify(INITIAL_NOTIFICATIONS));
      return INITIAL_NOTIFICATIONS;
    }
    return JSON.parse(data);
  } catch (err) {
    return INITIAL_NOTIFICATIONS;
  }
}

export function saveNotifications(notifs: NotificationItem[]): void {
  try {
    localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifs));
  } catch (err) {
    console.error('Failed to save notifications', err);
  }
}

export function getActivePartner(): PartnerId {
  try {
    const val = localStorage.getItem(ACTIVE_PARTNER_KEY);
    if (val === 'partner_a' || val === 'partner_b') {
      return val;
    }
    return 'partner_a';
  } catch (err) {
    return 'partner_a';
  }
}

export function setActivePartner(id: PartnerId): void {
  try {
    localStorage.setItem(ACTIVE_PARTNER_KEY, id);
  } catch (err) {
    console.error('Failed to set active partner', err);
  }
}

const AUTH_USER_KEY = 'lovemap_auth_user_v1';

export interface StoredAuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  providerId: string;
  isAnonymous?: boolean;
}

export function getStoredAuthUser(): StoredAuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStoredAuthUser(user: StoredAuthUser | null): void {
  try {
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch (err) {
    console.error('Failed to save stored auth user', err);
  }
}

export function calculateGlobalCriteriaStats(spots: Spot[]): GlobalCriteriaStats[] {
  const processedSpots = spots.map(computeSpotScores);
  const ratedSpots = processedSpots.filter(
    (s) => s.averageScores && (s.status === 'validated' || s.isSolo || (s.overallScore !== undefined && s.overallScore > 0))
  );

  return RATING_CRITERIA.map((criteria) => {
    if (ratedSpots.length === 0) {
      return {
        key: criteria.key,
        label: criteria.label,
        averageScore: 0,
        count: 0,
        icon: criteria.icon,
      };
    }

    const total = ratedSpots.reduce((acc, spot) => {
      const score = spot.averageScores?.[criteria.key] ?? 0;
      return acc + score;
    }, 0);

    const avg = Math.round((total / ratedSpots.length) * 10) / 10;

    return {
      key: criteria.key,
      label: criteria.label,
      averageScore: avg,
      count: ratedSpots.length,
      icon: criteria.icon,
    };
  });
}
