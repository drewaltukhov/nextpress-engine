# Website Specification Checklist

Source: https://specification.website/ — scanned 2026-06-19.

Use this as the baseline checklist when building, reviewing, or auditing the site. Walk the categories that apply and report PASS / FAIL / N/A per item.

---

## Foundations

- [ ] `<!doctype html>` on first line of every HTML document
- [ ] Valid BCP 47 tag on `<html lang>`
- [ ] UTF-8 declared via `<meta charset>` within first 1024 bytes
- [ ] `<meta viewport>` set to device width; user scaling NOT disabled
- [ ] Exactly one non-empty `<title>` in `<head>`
- [ ] `<meta name="description">` with short, unique summary
- [ ] `rel="canonical"` declaring preferred URL
- [ ] SVG favicon + ICO fallback at `/favicon.ico` + apple-touch-icon + maskable PWA icon
- [ ] `<meta name="theme-color">` with light/dark variants
- [ ] `<meta name="color-scheme">` declared
- [ ] Open Graph tags: og:title, og:description, og:image, og:url, og:type
- [ ] `<link rel="alternate">` for RSS/Atom/JSON Feed discovery
- [ ] Feeds well-formed with `atom:link rel="self"` and stable guid (if published)
- [ ] Feed update cadence declared via Syndication module (if published)
- [ ] Prefer native Popover API over ARIA-heavy JS modals

## SEO

- [ ] Plain-text `robots.txt` at site root (RFC 9309)
- [ ] XML sitemap(s) listing canonical URLs with last-modified
- [ ] Sitemap index when >50,000 URLs or split by content type
- [ ] Image / video sitemap extensions where applicable
- [ ] URLs lowercase, hyphenated, descriptive, shallow — treated as public API
- [ ] 301/308 for permanent redirects; 302/307 for temporary; no excessive chains
- [ ] Primary content and metadata rendered server-side (SSR / SSG / prerender)
- [ ] No soft 404s (page says "not found" but returns 200)
- [ ] Explicit indexing policy per page via `meta robots` or `X-Robots-Tag`
- [ ] Proper heading hierarchy; no skipped levels
- [ ] Internal links signal content importance
- [ ] Structured data via JSON-LD with schema.org vocabulary
- [ ] Breadcrumb trails marked as `BreadcrumbList` JSON-LD
- [ ] IndexNow pings to Bing, Yandex, Naver, Seznam on URL changes

## Accessibility

- [ ] Sufficient color contrast for text and meaningful non-text elements
- [ ] Descriptive `alt` on every `<img>`
- [ ] Labels programmatically associated with every form control (not just placeholders)
- [ ] All interactive elements keyboard-reachable in logical order
- [ ] Clear, high-contrast visible focus indicator
- [ ] "Skip to main content" link as first focusable element
- [ ] Semantic HTML + landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`)
- [ ] Prefer native HTML over ARIA; ARIA only when native doesn't fit
- [ ] Descriptive link text (no "click here" / "read more")
- [ ] Every link/button has an accessible name
- [ ] Form errors: identified in text, associated with input, announced to AT
- [ ] No cognitive puzzles for login; password managers + paste allowed
- [ ] Auto-populate info already provided; don't force re-entry
- [ ] Primary language on `<html lang>`; inline foreign content marked with `lang`
- [ ] Respect `prefers-reduced-motion`; avoid decorative animation/autoplay
- [ ] No third-party accessibility overlay widgets
- [ ] Captions for video, transcripts for audio, audio description for visuals
- [ ] Proper `<table>` markup: caption, header cells, `scope`
- [ ] Interactive targets ≥24×24 CSS px (44×44 preferred)
- [ ] `hidden="until-found"` on collapsible content for discoverability
- [ ] Proper `type`, `inputmode`, `enterkeyhint`; input text ≥16px on iOS
- [ ] Prefer native `<button>`, `<a>`, `<details>`, `<dialog>` over divs
- [ ] CSS uses `:has()` with `:user-invalid`, `:user-valid`, `:placeholder-shown`, `:focus-within`

## Security

- [ ] HTTPS-only with TLS 1.2 or 1.3; HTTP redirects to HTTPS
- [ ] Obsolete SSL / early TLS disabled
- [ ] HSTS header: `max-age`, `includeSubDomains`, `preload`
- [ ] All subresources HTTPS; CSP `upgrade-insecure-requests` as safety net
- [ ] Content Security Policy controlling trusted sources for scripts/styles/frames
- [ ] Violation reports sent to Reporting-Endpoints (CSP, COOP, Permissions-Policy)
- [ ] `/.well-known/security.txt` for vulnerability reporting
- [ ] `X-Content-Type-Options: nosniff`
- [ ] Frame-embedding controlled via CSP `frame-ancestors` or `X-Frame-Options`
- [ ] Cross-origin isolation via COOP, COEP, CORP where needed
- [ ] `Referrer-Policy` set (default: `strict-origin-when-cross-origin`)
- [ ] `Permissions-Policy` disabling unused powerful features (camera, mic, geolocation, etc.)
- [ ] Subresource Integrity (SRI) hashes on all third-party scripts/stylesheets
- [ ] Cookies: `Secure`, `HttpOnly` where possible, explicit `SameSite`
- [ ] `__Host-` / `__Secure-` prefixes on session cookies
- [ ] DNS CAA records restricting allowed certificate authorities
- [ ] DNSSEC enabled

## Well-Known URIs

- [ ] `/.well-known/` understood as RFC 8615 standard path
- [ ] `/.well-known/change-password` if site has user accounts
- [ ] `/.well-known/webauthn` if passkeys span multiple origins
- [ ] `/.well-known/openid-configuration` if providing OIDC
- [ ] `/.well-known/api-catalog` per RFC 9727 for machine-readable API index
- [ ] `/.well-known/webfinger` (RFC 7033) if Fediverse-connected
- [ ] `/.well-known/apple-app-site-association` for Universal Links
- [ ] `/.well-known/assetlinks.json` for Android Digital Asset Links
- [ ] `/.well-known/nodeinfo` for federated platform discovery
- [ ] `/.well-known/traffic-advice` for prefetch proxy behavior (optional)

## Agent Readiness

- [ ] Stable URLs preserved after publication
- [ ] `/llms.txt` with curated markdown index
- [ ] `/llms-full.txt` concatenating full markdown of key pages (small sites)
- [ ] Raw Markdown at predictable URLs (`.md` suffix or content negotiation)
- [ ] Explicit allow/disallow per named AI crawler in `robots.txt`
- [ ] Content-Signal directives in `robots.txt` (search/ingest/training)
- [ ] Web Bot Auth (RFC 9421 HTTP Message Signatures) for verifiable bots
- [ ] JSON-LD with schema.org types for agent-readable structure
- [ ] JSON / RSS / plain markdown endpoints offered alongside HTML
- [ ] HTTP `Link` header advertising llms.txt, sitemap, api-catalog
- [ ] MCP server exposing queryable tools where content has filterable structure
- [ ] `/.well-known/agent-card.json` for A2A agent discovery
- [ ] Agent Skills listed via well-known URI
- [ ] SVCB/HTTPS DNS records under `_agents` (DNS-AID)
- [ ] `/.well-known/ai-catalog.json` listing MCP / A2A agents
- [ ] `rel="nlweb"` link for NLWeb conversational interface
- [ ] Tools registered via `navigator.modelContext` for WebMCP
- [ ] `/schemamap.xml` indexing JSON-LD endpoints per resource

## Performance

- [ ] Core Web Vitals at 75th percentile: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1
- [ ] Images in WebP / AVIF at viewport-correct size
- [ ] Explicit dimensions on images
- [ ] `loading="lazy"` on off-screen images/iframes/video — NOT on LCP element
- [ ] LCP image and critical fonts preloaded
- [ ] Preconnect to third-party origins
- [ ] Prefetch next navigation
- [ ] `immutable` + `max-age=31536000` for fingerprinted assets
- [ ] Short/no-cache for HTML
- [ ] ETag or Last-Modified on cacheable responses
- [ ] Honor `If-None-Match` / `If-Modified-Since` → 304
- [ ] `No-Vary-Search` header for non-semantic query params
- [ ] Brotli (primary) + gzip (fallback) or zstd; media not re-compressed
- [ ] WOFF2 fonts self-hosted, subset, `font-display: swap`
- [ ] Preload only critical above-fold font faces
- [ ] Inline above-fold CSS; defer rest
- [ ] `defer` for app scripts, `async` for independent 3p, `type=module` for modern
- [ ] No bare `<script>` in `<head>`
- [ ] HTTP/2 minimum, HTTP/3 where available
- [ ] Speculation Rules for prefetch/prerender
- [ ] Appropriate resource hints (dns-prefetch, preconnect, preload, modulepreload, prefetch)
- [ ] View Transitions for same- and cross-document animations
- [ ] BFCache-eligible pages
- [ ] `content-visibility` + `contain-intrinsic-size` for off-screen
- [ ] Intersection Observer instead of scroll/resize listeners
- [ ] `contain: layout paint style` or `contain: content` on isolated subtrees
- [ ] CSS animations driven by `scroll-timeline` / `view-timeline`
- [ ] `scrollbar-gutter: stable` to prevent shift
- [ ] Dynamic viewport units (dvh, svh, lvh) for mobile heights
- [ ] Compression Dictionary Transport with Brotli/Zstandard
- [ ] `Server-Timing` header with non-sensitive backend metrics

## Privacy

- [ ] Privacy policy: collection, basis, retention, rights
- [ ] Freely-given, informed, specific, unambiguous opt-in for non-essential cookies/storage
- [ ] Honor Global Privacy Control (GPC) where required (California, Colorado)
- [ ] Third-party scripts audited, justified, permissions locked down
- [ ] Aggregate, cookieless, privacy-respecting analytics — not ad-tech
- [ ] Personal data minimized to actual needs
- [ ] Data retained only as long as necessary
- [ ] Personal data redacted from unnecessary leak points

## Resilience

- [ ] Correct HTTP status on custom error pages (404, 500)
- [ ] Error pages explain what went wrong in plain language
- [ ] Error pages offer path forward, no implementation leaks
- [ ] HTTP 503 + `Retry-After` during maintenance
- [ ] Maintenance page explains status + expected return
- [ ] Core content + nav work when JavaScript fails
- [ ] Client-side scripts treated as enhancement, not delivery
- [ ] Service worker with cached offline fallback page
- [ ] Web app manifest: name, icons, start URL, theme color, display mode
- [ ] Monitored from outside own infrastructure; synthetic + RUM combined
- [ ] Status page on separate host

## Internationalisation

- [ ] Single URL pattern for multilingual/multiregional (ccTLD / subdomain / subdirectory)
- [ ] URL slugs optionally localized consistently
- [ ] Reciprocal `hreflang` using BCP 47
- [ ] Every visible head string translated (title, description, OG, JSON-LD)
- [ ] Image `alt` translated
- [ ] Sitemap declares language alternates via `xhtml:link`
- [ ] No automatic IP-based language redirects
- [ ] Inline content differing from doc language marked with `lang` (WCAG 3.1.2)
- [ ] `translate="no"` on brand names, code, identifiers
- [ ] Language switcher lists each locale in its own language with correct `lang`
- [ ] No flags as language indicators
- [ ] `dir="rtl"` + CSS logical properties for Arabic, Hebrew, Persian, Urdu
- [ ] CSS `writing-mode` for vertical text (Japanese, Trad. Chinese, Mongolian)
- [ ] Explicit line/word-break rules for CJK and Thai
- [ ] Dates, numbers, currency, units formatted via `Intl` + locale data
- [ ] CLDR plural categories via `Intl.PluralRules`
- [ ] IDN support with Punycode + Unicode rendering
- [ ] Anti-spoofing rules applied to IDN domains
