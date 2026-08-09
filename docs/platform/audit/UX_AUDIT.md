# UX AUDIT

**Scope:** `frontend/src/platform/**`  
**Date:** 2026-08-09  
**Method:** Static UI review (no browser automation suite in this audit)

---

## Positives

- Shared `BuilderShell` gives consistent chrome across builders  
- Overview page lists all builders with clear links  
- Empty states exist in several builders  
- Form preview mode toggles (device width / dark) exist  

---

## Defects / incomplete UX

| Issue | Evidence | Severity |
|-------|----------|----------|
| Stub page still routable conceptually | `MetadataBuilderStubPage.tsx` | P2 |
| Runtime create ignores published forms | Hardcoded `SAMPLE_SCHEMA` | P0 product honesty |
| Formula fields show empty “Calculated” | `MetadataFormRenderer.tsx` | P1 |
| Dashboard “Drag-style” claim false | Button-add cards only | P1 marketing/UX mismatch |
| Report CSV export is JSON | `EnterpriseBuilders.tsx` | P1 |
| AI lists real cloud providers without backend | Misleading | P1 |
| Signature pad is a text input | “Signature pad (capture on submit)” | P2 |
| `Math.random()` keys in layout renderer | Remount flicker risk | P1 |
| Assignment/Notification use fake demo data | Asha / MD-100 | P2 |
| No accessibility audit (WCAG 2.2 AA) | No axe/playwright a11y run | Gap |
| No verified keyboard-only flows | — | Gap |
| No console-error free browser pass documented | — | Gap |
| Layout shift / animation polish | Minimal | P2 |
| Autosave absent | Explicit save/publish only | P2 |
| VersionPanel missing on Dashboard/Report | Inconsistent | P2 |

---

## Placeholder / TODO scan

- Input `placeholder=` attributes (normal) — OK  
- Product “stub” language still in Email Parser / AI copy — **honest but incomplete**  
- Deprecated stub page remains  

---

## UX score: **40 / 100**

Professional shell with many incomplete interactions and several false capability claims.
