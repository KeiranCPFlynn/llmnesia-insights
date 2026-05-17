# LLMnesia — Project Brief

> Grounding context for the weekly PM/revenue strategist. Founder-maintained —
> keep this current; the strategist reads it verbatim every run. Edit freely as
> the product, pricing, and positioning evolve.

## What the product is

LLMnesia is a **local-first Chrome extension** that gives you instant search
across your AI chat history on 13+ platforms (ChatGPT, Claude, Gemini,
Perplexity, DeepSeek, Grok, Mistral, Copilot, etc.). Cmd/Ctrl+Shift+9 opens a
search overlay over all past conversations. It indexes transcripts into
on-device IndexedDB; **no conversation data ever leaves the device** — there is
no server, no account, no sync backend.

Positioning: "your AI conversations, finally searchable — privately." The wedge
is the pain of losing useful answers across many AI tools and no good
cross-tool history/search.

## Hard constraints (do not violate)

- **Privacy is the core promise.** The **free tier must stay fully local** —
  no account required, no data leaves the device by default, ever. That local
  experience must remain genuinely great, not a crippled teaser.
- Cloud features are allowed **only as opt-in and private**: a paid,
  user-initiated sync must be end-to-end encrypted (provider can't read
  conversations), never on by default, never used to train anything, easy to
  turn off / delete. "We silently store your chats in our cloud" is off the
  table; "you choose to enable encrypted cross-device sync" is fine.
- Desktop Chrome extension; not mobile.
- Solo founder, limited time — prefer the smallest change that yields signal.

## Current state & the plan

- **100% free. No pricing, no paid tier, no payment integration anywhere.**
  Introducing revenue is greenfield.
- **Deliberate sequence: grow the user base on a great free local product
  first, then layer monetization on top.** Don't assume "paywall now" — weigh
  whether growth/retention is strong enough to justify monetizing yet, and say
  so honestly. Monetization should not damage the free product or the trust
  that drives word-of-mouth.
- **Stage: very early / small user base.** Top-of-funnel growth (more
  qualified installs) plus activation and week-1 retention is the immediate
  priority. Monetization is a design-ahead track, not a this-week launch —
  pricing pages / pre-orders at this scale produce noise, not signal.
- Distribution: Chrome Web Store (free listing).
- Light email capture (newsletter/feature-notify) on the marketing site and
  extension welcome screen — currently the only "conversion" beyond install.

## The repos (where changes land)

- **`llmnesia-site`** — Next.js marketing site (llmnesia.com). Landing copy +
  CTAs live in `content/index.template.html`; blog/use-cases in MDX; install CTA
  is a Chrome Web Store link component. Tiny codebase; all positioning/pricing
  copy changes happen here.
- **`LLMnesia`** — the Chrome extension itself (Vite + TS, MV3). The product
  surface: search overlay, popup, options, backfill/indexing. Paywalled
  features, upgrade prompts, and in-product monetization land here.
- **`llmnesia-insights`** — this analytics dashboard (where you, the strategist,
  run). Rarely the target of a revenue recommendation.

## The funnel & what each metric means

`marketing site / Chrome Web Store → install → activation → retention → (email)`

- **Installs** (PostHog `extension_installed`) — top of funnel.
- **Activation** — performed a search within 24h of install. The key "did they
  get the aha" gate; low activation = onboarding/value-discovery problem.
- **W1 / W4 retention** — rolling: came back 1 / 4 weeks later. Stickiness;
  steep W1→W4 drop = curiosity not habit.
- **WAU / searches per WAU** — engagement depth among the active.
- **Search quality** — click rate (found something useful), zero-result rate
  (rising = indexing/coverage gap, often instrumentation noise).
- **GA4** — website + Chrome Web Store listing traffic and acquisition
  channels: discovery sources, site→install conversion, listing strength.

## Revenue thinking (direction, not decisions — challenge it)

- **Leading hypothesis (founder's current thinking, not locked in):** a paid,
  opt-in **encrypted cloud-synced database** as the premium tier — your AI
  history available across devices/machines. It's no longer "local-only", but
  it stays *private* (end-to-end encrypted, user-initiated). This is the
  natural upgrade because the free product is single-device by nature.
- This is **explicitly open** — the founder wants other revenue ideas too.
  Pressure-test cloud-sync (will privacy-first users pay to put data in *any*
  cloud, even encrypted? what's the trust/perception risk? pricing?) AND
  propose alternatives, e.g.: one-time license / lifetime, Pro features that
  stay fully local (advanced/semantic search, unlimited backfill depth,
  saved searches, bulk export), team/multi-seat, "supporter" pricing, sponsor
  or B2B angles. Rank by fit with the privacy promise and the growth-first plan.
- Model is almost certainly **freemium**: the free local tier must stay
  genuinely great (it's the growth engine and the trust); paid = sync + power.
- Keep pressure-testing the timing question: is growth/retention strong enough
  to monetize yet, or does that come after more user-base growth?
