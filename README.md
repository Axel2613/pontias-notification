# Le Pontias — publicité « notification de réouverture »

Vidéo verticale en motion design 3D : un iPhone posé sur un fond blanc studio reçoit
la notification annonçant la réouverture du Bistrot du Pontias.

**Vidéo finale : [`out/le-pontias-notification.mp4`](out/le-pontias-notification.mp4)**
— 1080 × 1920 (9:16), H.264, 30 fps, 9 secondes.

## Déroulé

| Temps | Plan |
|---|---|
| 0 – 1,4 s | L'iPhone se pose dans le décor blanc (fondu depuis le blanc, ombres qui se resserrent) |
| 0 – 4,3 s | Travelling orbital lent autour du téléphone |
| 3,3 s | Double vibration haptique |
| 3,5 s | La notification monte avec un ressort façon iOS (verre dépoli, ombre portée) |
| 4,3 – 7,6 s | Rapprochement de la caméra sur la notification |
| 7,6 – 9 s | Plan final, message parfaitement lisible |

## Technique

- **Remotion 4** pour le temps, l'orchestration et l'export MP4.
- **Three.js / React Three Fiber** pour la 3D :
  - un iPhone modélisé avec un cadre en titane biseauté, des boutons latéraux et un verre en clearcoat ;
  - des reflets d'environnement studio (RoomEnvironment) et un reflet glissant sur la vitre.
- **Écran** : une texture canvas de 1415 × 3067 px qui contient la photo, l'heure, la Dynamic Island et la notification (Inter et Noto Color Emoji).
- **Ombres** : une ombre de contact et une ombre douce, floutées et animées pendant la pose du téléphone.

Fichiers : `src/PontiasAd.tsx` (scène, caméra, animation), `src/screen.ts` (écran
de verrouillage + notification), `public/wallpaper.png` (photo).

## Rendu

```bash
npm install
# image fixe de contrôle
./render-stills.sh 260
# vidéo complète
npx remotion render src/index.ts PontiasNotification out/le-pontias-notification.mp4 \
  --gl=swangle --codec=h264 --crf=14 --pixel-format=yuv420p
```

Le texte de la notification est modifiable dans `NOTIF_TEXT` (`src/screen.ts`).
