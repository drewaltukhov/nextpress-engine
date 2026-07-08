<p align="center">
  <img src="assets/nextpress-logo.svg" alt="NextPress" width="360">
</p>

<p align="center">
  <strong>Built sharp. Stays sharp.</strong>
</p>

<p align="center">
  <em>Concepts you know. Code you can trust.</em>
</p>

---

## What is NextPress?

NextPress is a posting engine that keeps everything you love about WordPress — posts, taxonomies, hooks, plugins, themes — and throws away everything you don't. No PHP. No plugin compatibility roulette. No "your site is offline because an auto-update collided with your theme."

It's the same publishing model, rebuilt for an era where speed, type safety, and SEO survival are non-negotiable.

---

## Why it's better than WordPress

**It's fast — by default.** No render-blocking plugin chains. No "let's install a caching plugin to fix the caching plugin." Pages stream, server-first, in the time WordPress spends bootstrapping.

**SEO is core, not a Yoast subscription.** Sitemaps, structured data, RSS, robots, redirects, internal linking — built in, always on, even when every optional plugin is disabled. SEO-first architecture is in the bones, not in a marketplace tab.

**Security is the baseline.** Brute-force lockout, audit log, secret redaction, encrypted credentials, append-only forensics — shipped in core. You don't bolt on Wordfence and hope.

**Plugins that don't take down your site.** Plugin failures are isolated at boot, migration, and hook level. One broken plugin can't drag the whole site down. There's a kill switch, a safe mode, and a real failure log.

**Privacy by default.** No tracking pixels. No third-party analytics injected into your pages. No data collection you didn't ask for. The data you store is your data.

**Updates that don't break Tuesday.** Engine upgrades are a clean pull. Your project stays a normal repo — your customizations live in plugins and themes, not in patched core files. No "rolled back the update because something exploded."

**It's yours.** Single repo. Single deploy. No sprawling marketplace dependencies, no opaque vendor SaaS, no half-abandoned plugins from 2014 lurking in your stack.

---

## What carries over from WordPress

The mental model. If you've built sites on WordPress, you already know how NextPress thinks:

- **Posts and post types** — the unit of content, with revisions, terms, and meta
- **Hooks (actions + filters)** — the same extension model, now type-safe
- **Plugins** — drop-in modules with their own data, settings, and surfaces
- **Themes** — pluggable presentation layer, swappable per site
- **Options / settings** — central registry of site-level configuration
- **Permissions and roles** — admin / editor / author / contributor, plus your own

The shape is familiar. The implementation is modern.

---

## Pillars

1. **Plugin-first.** Posts, users, taxonomies, media — even auth providers — flow through a typed plugin contract.
2. **SEO survives the apocalypse.** SEO output ships in an essential-tier plugin that loads even when everything else fails.
3. **Pillar-Spike content DNA.** First-class topic graphs drive internal linking, sitemap clustering, and topic landing pages out of the box.
4. **Core stability is non-negotiable.** Plugin failures are sandboxed. There's always a way back.
5. **Data is priceless.** Privacy and security beat ergonomics every time.
6. **Migratable core.** Pulling a new engine release is a `git pull` away.

---

## Status

In active development by [Drew](https://github.com/drewaltukhov). v1 is being built engine-first — the data layer, security, and SEO foundations land before any user-facing admin screens.

For user-facing help, see [`docs/`](./docs/).

---

<p align="center">
  <img src="assets/nextpress-mark.svg" alt="" width="32">
</p>
