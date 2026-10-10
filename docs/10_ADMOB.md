# 10 — AdMob

> **Not part of the original brief.** AdMob was requested separately, so it is scoped narrowly (`D-014`) and kept out of every money, door, and treasurer flow. Verify the current AdMob program policies and store requirements before each release; they change.

## 1. Where it applies
- AdMob serves **mobile apps** (Android / iOS). It does not run on the React website. Web ads would need AdSense, which is out of scope.
- Phase 2 only: ads exist in the Expo app (`mobile/`), never in the API or database.

## 2. Setup checklist
1. Create an AdMob account. Decide who owns it and who receives payouts (`D-015`).
2. Register the Android and iOS apps; note the two **App IDs** (`ca-app-pub-XXXX~YYYY`).
3. Create ad units (below); note each **Ad Unit ID** (`ca-app-pub-XXXX/ZZZZ`).
4. Host `app-ads.txt` at the root of the developer website listed in the store listings, with the AdMob publisher line from the AdMob console.
5. Configure content rating and blocking controls in AdMob (see §6).
6. Complete the Google Play Data safety form and the App Store privacy details to match actual data use.

## 3. Ad units (v1)
| Name | Format | Screen | Notes |
|---|---|---|---|
| `banner_events_list` | Adaptive banner, bottom | Events list | Below the list, never between a card and its price |
| `banner_announcements_list` | Adaptive banner, bottom | Announcements list | |
| `banner_shop_list` | Adaptive banner, bottom | Shop product list | Not on product page or checkout |

Not used in v1: interstitial, app-open, rewarded, native. Reason: the app is used at time-pressured moments (door, payment) and the club's audience is its own members.

## 4. Placement rules
**Allowed:** the three list screens above, bottom-anchored, clearly separated from content, labelled by the SDK.
**Never show ads on:**
- Door check-in and any officer manage screen
- Event detail, ticket purchase, checkout, payment status
- My tickets (the QR must be instantly readable)
- Finance, treasurer, expenses, outstanding
- Sign-in and sign-up
Also: no ad near buttons that could cause accidental taps, no ad that overlaps content, no text that nudges taps, never click your own live ads.

## 5. Implementation notes (Expo)
- Library: `react-native-google-mobile-ads`. It needs native code, so use **EAS development builds**, not Expo Go.
- Add the config plugin in `app.json` / `app.config.ts` with the Android and iOS **App IDs**. Missing App IDs crash the app at start.
- One wrapper component `<AdBanner unit="events" />` in `mobile/src/ads/`:
  - Reads unit IDs from `EXPO_PUBLIC_ADMOB_BANNER_EVENTS` etc.
  - Uses Google's **test ad unit IDs** whenever `__DEV__` is true or `APP_ENV != production`.
  - Renders nothing when `ads_enabled` is false, consent is not obtained, or loading fails (the layout must not jump).
  - Uses an adaptive banner size.
- Ad IDs are not secrets, but real IDs are injected only by the production EAS profile.
- **Kill switch:** the app reads `GET /config` → `ads_enabled` on launch. Turning it off needs no app release.
- Initialise the SDK only after consent is resolved (§6).

## 6. Consent, age, and privacy
- Use Google's **User Messaging Platform (UMP)** consent form for regions that require consent (EEA/UK, and as configured in the AdMob console).
- iOS: if personalised ads are enabled, add the App Tracking Transparency prompt and a clear `NSUserTrackingUsageDescription`.
- Set a conservative maximum ad content rating (start with **PG**) and block sensitive ad categories in the AdMob console.
- The club's members are mostly adults, but minors may join. Do not enable personalised ads for users known to be under the age of consent; revisit if the signup collects date of birth (it does not today).
- The app shares no Oddoskyline data (names, emails, orders) with ad networks. Only the SDK's standard ad request data leaves the device.
- Disclose ads and data use in the privacy policy and store forms.

## 7. Revenue handling
- AdMob revenue is paid to the AdMob account holder, **not** recorded in the Oddoskyline database (the schema has no category for it by design).
- Decide and record in `15_DECISIONS.md` (`D-015`) who owns the account and how ad income reaches the club. If it should appear in treasurer totals, that needs a proposal to extend `payments.category`, which is a schema change.

## 8. Testing
| Check | How |
|---|---|
| Test ads show in debug and staging builds | Use Google's test unit IDs; the SDK labels test ads |
| Real IDs only in production profile | Inspect the EAS profile and built config |
| No ads on forbidden screens | Component test + manual checklist |
| Layout stable when an ad fails | Simulate no-fill / offline |
| Consent flow | Test with UMP debug geography; verify ads wait for consent |
| Kill switch | Set `ADS_ENABLED=false`, relaunch, confirm no ad requests |
| Register test devices | Add device IDs in the SDK request configuration for QA phones |

## 9. Monitoring
Check AdMob for invalid-traffic warnings and policy notices weekly after launch. Review fill rate and eCPM monthly. If a policy violation notice arrives, flip the kill switch first, then fix.

## 10. Release gates (also in `13_PRODUCTION_CHECKLIST.md`)
- [ ] `app-ads.txt` live and verified in AdMob
- [ ] Production App IDs and Ad Unit IDs set in the production EAS profile only
- [ ] No test device registered in the production build
- [ ] Consent flow verified
- [ ] Store privacy forms updated
- [ ] Kill switch tested
