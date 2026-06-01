# UI Enhancements — Research Report

## 1. Summary

OmniTool ships a mature, cohesive design system: shadcn/ui + Radix primitives, Tailwind CSS with HSL CSS-variable theming, `next-themes` dark mode, and a polished Notion-aligned Notes editor. The component library (15 shadcn components in `packages/ui/src/components/`) is built on Radix, so it inherits strong baseline accessibility (correct ARIA roles, focus traps, label association).

The strongest, code-verified opportunities are **not** the headline-grabbing ones. Several research claims were overstated or factually wrong and are dropped below. After verifying against the actual codebase, the highest-value, lowest-risk enhancements cluster around:

1. **No app-wide `prefers-reduced-motion` fallback** — only `page-transition.tsx` honors it; every other `animate-in`/`animate-pulse`/`animate-spin` usage ignores the user setting. This is a real, verified WCAG 2.3.3 gap and a one-file fix.
2. **No `aria-invalid` / `aria-describedby` support in form components** — verified: zero occurrences in source. Input/Textarea/Select pass props through but offer no error-state wiring pattern.
3. **Inconsistent `aria-label` on icon-only buttons** — partially covered (24 files use `aria-label`), but no enforced pattern across the 11 `size="icon"` button sites.
4. **Sparse `Suspense` / `useTransition` usage** — verified: `Suspense` only in the login page; `useTransition` in just two source components (`sidebar.tsx`, `mobile-nav.tsx`). Opportunity for non-blocking heavy updates and streaming.

Refuted claims (focus-ring contrast "failure", "only one onOpenAutoFocus instance") are corrected and excluded from the recommendations.

## 2. Current State in OmniTool

### Design system foundation
- Component library: `packages/ui/src/components/` — verified 15 components: `avatar, badge, button, card, dialog, input, label, popover, resizable, select, separator, sheet, tabs, textarea, tooltip`.
- Theme tokens: `apps/web/app/globals.css` (HSL CSS variables, light + `.dark`); 175 lines total including BlockNote editor overrides.
- Tailwind config: `apps/web/tailwind.config.ts`.
- Deps (`apps/web/package.json`): `lucide-react ^0.460.0`, `next-themes ^0.4.6`, `tailwindcss-animate ^1.0.7`. **No `framer-motion`/`motion`** dependency present.

### Focus / interactive styling (verified)
- `packages/ui/src/components/button.tsx` line 7 uses `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` at **full opacity** — not the `ring-ring/50` the research claimed.
- `packages/ui/src/components/input.tsx` line 12 mirrors the same full-opacity 2px ring.
- `packages/ui/src/components/dialog.tsx` `DialogClose` (line 43) uses `focus:ring-2 focus:ring-ring focus:ring-offset-2`.

### Form components (verified gap)
- `input.tsx`, `textarea.tsx`, `select.tsx` are thin pass-throughs with **no `aria-invalid` / `aria-describedby`** support. A repo-wide source grep for `aria-invalid`/`aria-describedby` returns **zero matches** (only present in build artifacts under `.next/`).
- `label.tsx` correctly wraps Radix `LabelPrimitive.Root`, so `htmlFor` association works.
- `aria-label` is present in 24 component files but there is no component-level enforcement; 11 `size="icon"` button call-sites exist (`topbar.tsx`, `sidebar-note-tree.tsx`, `note-comments-panel.tsx`, `task-card.tsx`, `notes-calendar-view.tsx`, etc.).

### Dialog focus management (verified)
- `onOpenAutoFocus` is used in **6 source files** (corrected from the claim of "1"): `github-import-dialog.tsx`, `notes/blocks/project-card-block.tsx`, `notes/blocks/linear-issue-block.tsx`, `notes/blocks/note-embed-block.tsx`, `notes/blocks/github-pr-block.tsx`, `notes/ai/ask-ai-toolbar-button.tsx`. All call `e.preventDefault()` (suppress default autofocus) without programmatically focusing a target element.

### Motion / animation (verified)
- `apps/web/components/layout/page-transition.tsx` correctly applies `motion-reduce:animate-none`.
- `apps/web/app/globals.css` contains **no** `@media (prefers-reduced-motion)` block — verified by grep. So `animate-spin`, `animate-pulse`, `animate-ping`, and other `animate-in/out` usages outside the page transition do not respect the OS reduce-motion preference.

### Suspense / concurrent React (verified)
- `Suspense` is used in source only at `apps/web/app/(auth)/login/page.tsx`.
- `useTransition`/`startTransition` appear in source only in `apps/web/components/layout/sidebar.tsx` and `apps/web/components/notes/mobile-nav.tsx`.

### Layout chrome (per code map)
- `apps/web/components/layout/topbar.tsx`, `sidebar.tsx`, `mobile-drawer.tsx`, `notes/mobile-nav.tsx`, `breadcrumbs.tsx` form the navigation chrome; Notes editor stack in `apps/web/components/notes/note-block-editor.tsx`, with `blocks/note-embed-block.tsx` and `blocks/embed-picker.tsx` for inline page references.

## 3. Findings & Best Practices

### Confirmed / actionable

- **App-wide reduced-motion is incomplete.** WCAG 2.1 SC 2.3.3 (Animation from Interactions) and the `prefers-reduced-motion` query recommend an app-level fallback. Only `page-transition.tsx` honors it; everything else animates regardless. A global CSS guard is the standard mitigation. ([Tailwind animation docs](https://tailwindcss.com/docs/animation), [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion))
- **Form components lack `aria-invalid` / `aria-describedby` wiring.** Verdict: **confirmed** (with nuance — `aria-label` *is* used in app code, but the component library has no built-in error-state attributes). Standardizing this enables screen readers to announce validation errors. ([Building accessible forms with shadcn/ui](https://blog.openreplay.com/create-accessible-forms-shadcn-ui/), [WAI-ARIA: aria-invalid](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-invalid))
- **Icon-only buttons need a consistent accessible-name pattern.** Verdict: **confirmed**. Coverage exists but isn't enforced; a lint rule or shared `IconButton` wrapper closes the gap. ([WAI-ARIA APG: button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/))
- **Streaming + `Suspense` is underused.** Login wraps `useSearchParams` in `Suspense` (correct). Main dashboard routes could add granular Suspense boundaries around async tRPC reads to stream a static shell first. ([Next.js 15 streaming + Suspense guide](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming))
- **`useTransition` for non-urgent heavy updates.** Verified only 2 source usages. Search filtering, team switching, and view transitions are good candidates to keep typing responsive while expensive re-renders run as non-urgent. ([React: useTransition](https://react.dev/reference/react/useTransition))
- **Dialog focus could be task-aware.** Verdict: **confirmed-with-inversion** — the `onOpenAutoFocus` *pattern* already exists in 6 dialogs, but each only suppresses default focus. The WAI-ARIA dialog pattern recommends moving focus to a meaningful element (first input, or Cancel for destructive dialogs). This is an enhancement, not a baseline failure. ([WAI-ARIA APG: dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog))
- **Animation token library / micro-interactions.** Tailwind + `tailwindcss-animate` already cover spin/pulse/ping/animate-in. Custom animation tokens (staggered list reveals, blurred fade-in) can be added in CSS before adding any dependency. ([Tailwind animations plugin overview](https://www.blog.brightcoding.dev/2026/03/10/tailwind-animations-the-revolutionary-plugin-for-effortless-ui-motion/))

### Refuted / dropped (do not action as stated)

- **DROPPED — "Focus ring fails WCAG 3:1 contrast (ring-ring/50)".** Verdict: **refuted** (confidence 0.92). The code uses `focus-visible:ring-2 focus-visible:ring-ring` at full opacity, **not** `ring-ring/50`. Also, the 3:1 figure is WCAG 2.2 **Level AAA** (SC 2.4.13 Focus Appearance), not Level AA; Level AA only requires SC 2.4.7 (Focus Visible) with no contrast ratio. The 2px full-opacity ring with offset is very likely compliant. ([WCAG 2.2 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html), [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)) — *Optional, low priority: still worth a one-time contrast spot-check of the ring token in both themes, but no code change is justified by the original claim.*
- **CORRECTED — "Only one onOpenAutoFocus instance".** Verdict: **refuted** (confidence 0.95). There are **6** instances. The real (minor) opportunity is making them task-aware, not adding the handler.

### Uncertain

- **Framer Motion adoption for "15–20% more responsive" spring motion.** The cited perception figure is unverified marketing-grade evidence; adding a runtime animation library is a non-trivial bundle/maintenance cost against a CSS-only baseline that already works. Treat as a deliberate, later decision, not a near-term recommendation. ([Framer Motion vs CSS opinion piece](https://theekshanachamodhya.medium.com/why-framer-motion-still-beats-css-animations-in-2025-16b3d74eccbd/))

## 4. Recommendations Mapped to OmniTool

1. **Add a global `prefers-reduced-motion` guard** in `apps/web/app/globals.css` that neutralizes animation/transition durations and scroll-behavior for all users who request reduced motion. Closes the verified WCAG 2.3.3 gap repo-wide in one file; complements the existing `page-transition.tsx` handling. *(Top pick — see below.)*
2. **Add `aria-invalid` + `aria-describedby` support to form primitives.** Extend `input.tsx`, `textarea.tsx`, `select.tsx` to apply an error ring when `aria-invalid` is set and pass through `aria-describedby`; document the error-message wiring pattern. Low risk (additive, prop-driven).
3. **Introduce a shared `IconButton` wrapper (or ESLint rule)** that requires an accessible name for `size="icon"` buttons, then migrate the 11 call-sites. Medium effort, low risk.
4. **Add granular `Suspense` boundaries + `loading.tsx`** to heavy dashboard routes (notes list, team data) to stream the shell first.
5. **Wrap expensive non-urgent updates in `startTransition`** (search filtering, team switch, view switching) to keep input responsive.
6. **Make dialog `onOpenAutoFocus` task-aware** in the 6 existing dialogs (focus first input; focus Cancel for destructive actions).
7. **Optional:** add custom animation tokens (stagger, blur-fade) in CSS for richer list/card reveals before considering any animation library; revisit Framer Motion only if spring physics becomes a concrete product need.

## 5. Prioritized Implementation Plan

| Item | Files | Risk | Effort | Rationale |
|------|-------|------|--------|-----------|
| Global `prefers-reduced-motion` guard | `apps/web/app/globals.css` | low | S | Verified gap (no media query exists); single-file, app-wide WCAG 2.3.3 fix; complements existing page-transition handling |
| `aria-invalid` / `aria-describedby` in form primitives | `packages/ui/src/components/input.tsx`, `textarea.tsx`, `select.tsx` | low | M | Verified zero source coverage; additive prop-driven change improves screen-reader error UX without behavior change |
| Shared `IconButton` + migrate icon buttons | `packages/ui/src/components/button.tsx` (or new `icon-button.tsx`), 11 `size="icon"` call-sites | low | M | Enforces accessible names; current coverage is inconsistent (24 files use aria-label, no enforcement) |
| Granular Suspense + `loading.tsx` on heavy routes | `apps/web/app/(dashboard)/**/loading.tsx`, note/team pages | medium | M | Streams static shell first; only login uses Suspense today |
| `startTransition` for non-urgent updates | search components, team switcher, view-switch components | medium | M | Keeps typing/UI responsive during heavy re-renders; only 2 source usages today |
| Task-aware dialog focus | `github-import-dialog.tsx`, `notes/blocks/{project-card,linear-issue,note-embed,github-pr}-block.tsx`, `notes/ai/ask-ai-toolbar-button.tsx` | low | S | Pattern already present; upgrade from suppress-only to meaningful focus placement |
| Custom animation tokens (optional) | `apps/web/app/globals.css`, `tailwind.config.ts` | low | M | Richer micro-interactions without a new dependency; defer Framer Motion |

## Top Pick

**Add a global `prefers-reduced-motion` guard to `apps/web/app/globals.css`.** It is low-risk, single-file, well-scoped, and fixes a *verified* accessibility gap (grep confirms no such media query exists today) across every animation in the app at once — without touching component logic. It directly complements the existing, correct `motion-reduce:animate-none` in `page-transition.tsx`.
