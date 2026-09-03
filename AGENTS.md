# Architecture & Directives d'Authentification (LoveMap)

Ce fichier consigne les règles architecturales critiques pour l'authentification afin de ne jamais casser le fonctionnement existant.

## 1. Séparation stricte Native iOS (Capacitor) vs Web
- **Détection** : L'environnement natif DOIT être détecté via `isCapacitorNative()` (qui vérifie `Capacitor.isNativePlatform()`).
- **iOS Natif (Xcode / TestFlight / App Store)** :
  - **Google** : Utilise le plugin `@capawesome/capacitor-google-sign-in`.
    - La configuration iOS dans `ios/App/App/Info.plist` contient le `GIDClientID` (`1056586071442-9v0rscq6pbf4s23485n8n4520u5v8j3r.apps.googleusercontent.com`) et le schéma inversé `CFBundleURLSchemes` (`com.googleusercontent.apps.1056586071442-9v0rscq6pbf4s23485n8n4520u5v8j3r`). **Ne jamais altérer ces valeurs**.
  - **Apple** : Utilise le plugin `@capacitor-community/apple-sign-in` avec la capability "Sign in with Apple" active dans Xcode (`com.lovemap.duo`).
  - La passerelle native convertit les tokens (ID token, raw nonce) en credentials Firebase via `GoogleAuthProvider.credential` ou `appleProvider.credential` puis appelle `signInWithCredential(auth, credential)`.
- **Web (Navigateur desktop, iframe AI Studio, mobile Safari / Chrome)** :
  - Utilise Firebase Auth standard avec `getAuth(app)` et `browserPopupRedirectResolver`.
  - **Règle absolue** : Les appels à `signInWithPopup`, `signInWithRedirect` et `getRedirectResult` DOIVENT inclure `browserPopupRedirectResolver` pour éviter l'erreur Firebase `auth/argument-error`.
  - En cas de blocage de popup sur navigateur mobile, bascule automatique vers `signInWithRedirect`.

## 2. Git & Synchronisation
- Ne jamais écraser `ios/App/App/Info.plist`.
- Toujours vérifier avec `npm run build` et `npx cap sync ios` après toute modification des dépendances ou du code web pour synchroniser le dossier iOS.
