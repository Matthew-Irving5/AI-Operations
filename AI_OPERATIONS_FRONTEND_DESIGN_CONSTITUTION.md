# AI Operations — Frontend Design Constitution

**Document status:** Authoritative visual, interaction, and frontend-quality specification  
**Intended repository location:** Repository root, alongside `AI_OPERATIONS_BUILD_SPEC.md` and the final Agent Specification  
**Suggested filename:** `AI_OPERATIONS_FRONTEND_DESIGN_CONSTITUTION.md`  
**Primary implementation audience:** GPT-5.6 Luna/Terra coding agents, future staff-level frontend engineers, design-review agents  
**Primary surface:** Desktop web application  
**Primary theme:** Light  
**Secondary theme:** Dark  
**Product character:** Futuristic, elegant, calm, intelligent, spatial, precise, quietly alive  
**Last research pass:** 2026-09-26

---

# 0. Authority, purpose, and how agents must use this document

This document defines the visual system, interaction grammar, information-presentation philosophy, frontend engineering quality bar, and design-governance rules for AI Operations.

It exists because functionally correct AI-generated interfaces frequently converge toward the same visual centroid: generic sans-serif typography, rounded cards, uniform spacing, purple/blue gradients, thin borders, three-column grids, pill-shaped controls, interchangeable icon sets, and decorative animation. AI Operations must not look like a template assembled by a model. It must feel deliberately designed for this product.

This document is **not** a replacement for either functional specification.

## 0.1 Specification precedence

For functionality:

1. The final authoritative **Agent Specification** controls agent behaviour, communication, ownership, state, execution, and domain responsibilities.
2. `AI_OPERATIONS_BUILD_SPEC.md` controls the broader platform, architecture, security, data, integration, and product requirements.
3. This document controls the **presentation, interaction, frontend architecture, frontend quality bar, and visual interpretation** of that functionality.
4. Existing code is implementation evidence, not product authority.

If the current frontend contradicts this document, the frontend should change.

If this document appears to remove, hide, or weaken required functionality from either functional specification, this document is wrong and must be amended.

## 0.2 What this document deliberately does not do

It does **not** prescribe pixel-perfect page mock-ups or say that a particular card must sit at a particular coordinate.

It instead defines:

- design intent;
- hierarchy rules;
- typography;
- colour;
- spacing;
- component behaviour;
- navigation principles;
- animation;
- responsive behaviour;
- information architecture heuristics;
- interaction patterns;
- accessibility;
- empty/loading/error states;
- data visualisation;
- conversation UX;
- agent-state UX;
- implementation architecture;
- testing;
- review standards;
- anti-patterns.

A future agent should be able to create a new screen that does not exist today and still make it look unmistakably like AI Operations.

## 0.3 Mandatory agent workflow before frontend changes

Before changing a product surface, an implementation agent must:

1. Read the relevant functional requirements in the Agent Specification.
2. Read the relevant functional requirements in `AI_OPERATIONS_BUILD_SPEC.md`.
3. Read this document.
4. Inspect the existing page and reusable components.
5. Identify what information is actually important to the user.
6. Identify all required states: normal, loading, empty, stale, partial, degraded, error, success, awaiting user, running, and disabled where relevant.
7. Choose the minimum visual containment necessary.
8. Reuse semantic design-system primitives rather than cloning page-local CSS.
9. Implement keyboard, focus, reduced-motion, and contrast behaviour at the same time as visual styling.
10. Add or update visual, interaction, accessibility, and regression tests.
11. Review the result at realistic desktop sizes using realistic synthetic data.
12. Reject its own work if it looks like a generic AI-generated SaaS dashboard.

---

# 1. Product-specific design thesis

AI Operations is not a marketing website, chat toy, generic admin panel, or observability wall.

It is a **personal operations control plane** that lets one user understand and direct a system of specialist agents without needing to watch every internal event.

The interface should create the sensation that a sophisticated system is continuously working underneath a calm surface.

The governing metaphor is:

> **Still surface, active depth.**

Most of the screen should feel stable. Motion, colour, and emphasis should appear where the system has changed state, needs attention, or can be acted upon.

The interface should feel:

- advanced without looking theatrical;
- premium without looking luxurious for its own sake;
- spacious without wasting screen real estate;
- powerful without exposing all complexity at once;
- alive without making text or controls wander around;
- intelligent without using AI clichés;
- calm during normal operation;
- unmistakably urgent when something genuinely requires intervention.

The user should be able to answer three questions within seconds of arriving:

1. **Is everything broadly okay?**
2. **What needs me now?**
3. **What has changed since I last looked?**

Everything else can be progressively revealed.

---

# 2. Research synthesis: what makes an AI-generated website look AI-generated

The research pass reviewed recent 2026 commentary, design critiques, community discussions, design-system analyses, and measured samples of AI-generated websites.

The strongest recurring detectors were not “bad design”. They were **statistical sameness**.

## 2.1 Common AI-generated visual tells

### A. The purple/indigo AI gradient

Repeated pattern:

- violet-to-blue hero backgrounds;
- glowing purple blobs;
- gradient text;
- indigo primary buttons;
- blurred ambient circles.

**AI Operations rule:** Purple may appear only if semantically required by a future domain palette. Purple-blue gradient branding is prohibited.

### B. The centred marketing hero transplanted into applications

Repeated pattern:

- giant centred heading;
- muted subheading;
- two CTA buttons;
- enormous empty region;
- three equal feature cards below it.

**AI Operations rule:** Application pages are task-oriented. They may use breathing room, but must not mimic a SaaS landing page.

### C. Inter/default-neutral typography with no typographic point of view

Measured and anecdotal sources repeatedly identify Inter and similar neutral sans defaults as a strong AI-site tell.

The problem is not that Inter is poor. The problem is that a model chooses it without making a typographic decision.

**AI Operations rule:** Typography is a designed system, not a browser default.

### D. Card soup

Repeated pattern:

- every datum lives in a rounded rectangle;
- cards nested inside cards;
- every section receives a border;
- every card has identical radius, border and padding;
- hierarchy is represented by more containers instead of composition.

**AI Operations rule:** A card is a semantic containment tool, not the default unit of layout.

### E. The three-equal-column reflex

Models frequently produce three identical cards because it is visually safe.

**AI Operations rule:** Equal grids may be used when the data truly has equal importance. They must not be used merely to make a section look “finished”.

### F. Uniform 12 px / 16 px radius everywhere

Uniform rounding is an easy way for generated UIs to appear polished without hierarchy.

**AI Operations rule:** Radius communicates object type and containment depth.

### G. Pills for everything

Tags, buttons, navigation items, statuses, filters and labels are frequently all rendered as rounded pills.

**AI Operations rule:** Pill geometry is reserved for genuinely compact, atomic objects such as status chips or removable filters. Primary buttons are not pills.

### H. Lucide icon in a tinted rounded square

An icon floating in a pastel square above every card has become a strong template tell.

**AI Operations rule:** Icons must support comprehension or affordance. Decorative icon tiles are prohibited.

### I. Soft shadow + thin border + white card as universal treatment

This creates a clean but anonymous “component-library demo” aesthetic.

**AI Operations rule:** Most hierarchy should come from spacing, typography, alignment and contrast before borders or shadows.

### J. Fade-up-on-scroll animation

Generic generated marketing sites often animate every block from `opacity: 0; transform: translateY(...)`.

**AI Operations rule:** Do not animate content merely because it entered the viewport.

### K. Glassmorphism as a substitute for hierarchy

Blurred translucent panels and glowing outlines are frequently used to signal “AI/futuristic”.

**AI Operations rule:** Backdrop blur is exceptional, not thematic. The product should feel futuristic through behaviour and precision, not fake glass.

### L. Vague “modern clean” design language

The absence of a point of view creates a mathematically average interface.

**AI Operations rule:** Every significant visual decision should be explainable in terms of hierarchy, usability, state, identity, or product character.

### M. Newer AI-template clichés must also be avoided

Merely replacing purple gradients with the latest fashionable “anti-AI” style is not enough.

Emerging repeated patterns include:

- oversized editorial serif display text;
- italic serif accent words;
- cream “paper” backgrounds;
- uppercase eyebrow text everywhere;
- deliberately quirky Bento grids;
- excessive grain/noise;
- decorative hand-drawn arrows.

AI Operations must not chase an anti-template template.

---

# 3. The visual identity: “calm future”

The design direction is **calm future**.

It combines:

- editorial whitespace;
- technical precision;
- engineered typography;
- subtle depth;
- sharp interaction feedback;
- restrained chromatic signals;
- smooth spatial continuity;
- excellent information hierarchy.

It explicitly rejects:

- cyberpunk;
- neon overload;
- sci-fi HUD tropes;
- glowing grids;
- glass everywhere;
- terminal cosplay;
- holographic decoration;
- “AI magic” sparkle icons;
- animated orbs;
- floating particles;
- excessive blur;
- violet gradient branding.

The future should be communicated through **how effortlessly the interface behaves**, not through science-fiction decoration.

---

# 4. The design principles

These principles are ordered. When principles conflict, earlier principles win.

## 4.1 Attention before information

The system may know thousands of facts. The user should see the small number that matter now.

Raw availability of information does not justify visual prominence.

## 4.2 Hierarchy before containment

First use:

1. typography;
2. whitespace;
3. alignment;
4. grouping;
5. subtle tone changes.

Only then introduce a border, panel, card or shadow.

## 4.3 Stable text, moving state

Text should almost never physically move while being read.

The interface may animate:

- selection indicators;
- container geometry;
- state transitions;
- progress;
- insertion/removal;
- focus;
- connection between origin and destination.

Do not animate paragraphs, headings, table text, or labels as decorative objects.

## 4.4 Progressive disclosure over density

AI Operations contains deep operational data. Complexity must be layered.

Default view:
- conclusion;
- status;
- exception;
- next action.

Second layer:
- context;
- explanation;
- supporting trend.

Third layer:
- evidence;
- raw events;
- traces;
- technical details.

## 4.5 Explain causality

When the system changes something, show enough visual continuity that the user understands what changed and why.

A status should not simply disappear and reappear elsewhere.

## 4.6 Calm by default, decisive on exception

Normal operation should be visually quiet.

Warning and failure states must therefore have enough unused visual bandwidth to stand out.

## 4.7 Every pixel earns attention

Bright colour, animation, large type, elevated surfaces, and bold text all consume attention. Use them as a limited budget.

## 4.8 One system, eight specialist identities

The managers should feel related, not like eight separate apps.

Manager identity may affect:
- accent hue;
- small iconographic details;
- charts;
- contextual highlights.

It must not change:
- basic component geometry;
- typography hierarchy;
- navigation behaviour;
- interaction grammar;
- accessibility.

## 4.9 Behaviour is part of branding

Keyboard fluency, near-instant feedback, smooth transitions, thoughtful empty states, and reliable focus behaviour contribute more to premium feel than decorative effects.

## 4.10 Light mode is the primary art direction

Dark mode is supported deliberately but should not dictate the light theme.

---

# 5. Reference-product consensus: the ten-product design council

There is no objective universal “top 10”. This list is a research synthesis from repeated design-system references, respected product-design case studies, award recognition, and products repeatedly cited for excellent interaction or frontend execution.

The purpose is to extract **principles**, not copy appearance.

## 5.1 Linear

Extract:
- ruthless hierarchy;
- strong keyboard model;
- subtle animation;
- clear focus;
- minimal visual noise;
- excellent state transitions;
- compositional consistency.

Do not copy:
- its exact dark palette;
- its typography;
- its issue-tracker density;
- its sidebar verbatim.

## 5.2 Stripe Dashboard

Extract:
- complex data made navigable;
- predictable information architecture;
- high-quality forms;
- progressive disclosure;
- excellent numerical typography;
- consistent action hierarchy;
- sophisticated but restrained data visualisation.

Do not copy:
- Stripe branding;
- payment-centric layouts;
- excessive tabular density where AI Operations needs narrative.

## 5.3 Figma

Extract:
- direct manipulation;
- extremely fast feedback;
- contextual controls;
- preserving canvas context;
- keyboard + pointer coexistence;
- careful focus and selection state.

Do not copy:
- tool-panel density;
- icon-only controls where user recognition would be lower.

## 5.4 Raycast

Extract:
- keyboard-first command interaction;
- excellent command palette;
- polished micro-interaction;
- speed;
- compact contextual actions;
- confident visual identity.

Do not copy:
- desktop-native assumptions that do not translate cleanly to the browser.

## 5.5 Vercel / Geist

Extract:
- semantic tokens;
- crisp borders;
- precise microstates;
- high attention to loading/empty/error states;
- excellent documentation discipline;
- accessible component details.

Do not copy:
- monochrome minimalism wholesale;
- Geist typography merely because it is convenient;
- black/white “developer SaaS” branding as the product identity.

## 5.6 Notion

Extract:
- whitespace;
- editorial content flow;
- context-sensitive chrome;
- progressive disclosure;
- flexible but calm composition;
- low visual weight for secondary controls.

Do not copy:
- document-editor metaphors where operational state needs stronger structure.

## 5.7 GitHub

Extract:
- handling of extremely complex domain objects;
- durable URL/state models;
- clear status semantics;
- rich histories;
- excellent code/evidence linking;
- power-user keyboard flows;
- contextual sidebars.

Do not copy:
- legacy density;
- deeply accumulated navigation complexity.

## 5.8 Attio

Extract:
- light-mode polish;
- subtle data-grid treatment;
- property panels;
- elegant grouping;
- quiet visual hierarchy;
- strong record-to-detail transitions.

Do not copy:
- CRM metaphors that misrepresent agents or operations.

## 5.9 Arc

Extract:
- personality without clutter;
- interaction continuity;
- thoughtful transitions;
- willingness to invent product-specific controls;
- visual identity driven by product philosophy rather than component-library defaults.

Do not copy:
- playful effects that reduce operational clarity.

## 5.10 Google Material 3 Expressive / high-quality Google surfaces

Extract:
- accessible state differentiation;
- expressive motion;
- carefully tuned component states;
- adaptive systems;
- rigorous semantic colour.

Do not copy:
- large rounded geometry indiscriminately;
- Android-native interaction assumptions.

## 5.11 The consensus principles across the council

The strongest products repeatedly do the following:

1. develop a visual system before styling individual pages;
2. use typography as architecture;
3. invest in keyboard interaction;
4. make loading and state change feel intentional;
5. distinguish primary from secondary information sharply;
6. maintain a small set of reliable primitives;
7. use animation to preserve context;
8. expose complexity progressively;
9. build accessibility into components;
10. maintain extraordinary consistency in small details.

---

# 6. The 50 frontend/UI rules

These are mandatory defaults for implementation agents.

## 1. Start with the user’s decision, not the database schema

A page should not be a visual dump of tables and columns.

Ask: what decision or understanding does this surface support?

## 2. Give every screen one dominant question

Examples:
- “What needs my attention?”
- “What is this agent doing?”
- “Why did this run fail?”
- “What changed in my finances?”
- “What am I approving?”

If a screen attempts to answer ten equally prominent questions, recompose it.

## 3. Make the most important information visually obvious without colour

Test the page in grayscale. Hierarchy should survive.

## 4. Prefer fewer, larger conceptual groups over many small cards

A continuous surface with clear subsections is often better than nine boxed modules.

## 5. Use visual containment only when containment is semantic

Good reasons:
- separate interactive record;
- movable/reorderable object;
- independent state;
- temporary overlay;
- materially different surface depth.

Bad reason:
- “this is a section”.

## 6. Keep line lengths comfortable

Narrative prose should generally stay near 60–75 characters per line.

Operational rows and tables can be wider.

## 7. Use real headings, not bold body text pretending to be headings

Headings should create a navigable document outline.

## 8. Avoid centre-aligned application content

Use left alignment for almost all operational content.

Centred alignment is reserved for:
- small empty states;
- authentication;
- genuinely singular moments.

## 9. Treat whitespace as structure

Large whitespace gaps may separate conceptual regions more effectively than borders.

## 10. Keep vertical rhythm predictable

Related items should share a spacing pattern. Avoid random 14/19/23 px gaps chosen page-by-page.

## 11. Do not use all-caps as a universal metadata style

Tiny uppercase can be used very sparingly for machine-like labels, but title case or sentence case is preferred.

## 12. Use sentence case for interface text

Buttons:
- “Run now”
- “View evidence”
- “Ask Finance”

Not:
- “RUN NOW”
- “View Evidence” everywhere.

## 13. Use boldness as a scarce hierarchy tool

Do not make every label 600/700.

Most UI text should be regular or medium.

## 14. Use tabular numerals for comparable numeric data

Costs, dates in columns, durations, token counts, scores and percentages should align.

## 15. Align numbers by meaning

Tables should generally right-align numerical measures and left-align labels.

## 16. Never rely on colour alone for status

Use label, icon, pattern, or shape in addition to hue.

## 17. Avoid icon-only actions unless universally understood

Delete, close and search can be icon-only with accessible names. Domain-specific actions require text.

## 18. Tooltips supplement labels; they do not replace necessary explanation

If a control repeatedly needs a tooltip to be understood, redesign the control.

## 19. Every hover state must have a keyboard-focus equivalent

Pointer polish without keyboard parity is incomplete.

## 20. Every click should acknowledge quickly

Target sub-100 ms visible acknowledgement for local interactions.

If work is slow, transition immediately to an honest pending state.

## 21. Never fake completion

Optimistic updates may show intent, but asynchronous work must clearly distinguish:
- requested;
- queued;
- running;
- confirmed.

## 22. Keep layout stable while data loads

Skeleton geometry should resemble final geometry.

Avoid content jumping.

## 23. Skeletons are not mandatory

For very fast loads, preserving existing content with a subtle pending indicator can be better than flashing a skeleton.

## 24. Loading states should communicate scope

Say what is loading when useful:
- “Refreshing account data…”
- “Building evidence set…”

Not generic spinner-only ambiguity.

## 25. Empty states explain why and what next

An empty state should distinguish:
- nothing exists yet;
- nothing matches filter;
- source disconnected;
- source stale;
- first run not completed;
- permission unavailable.

## 26. Errors preserve useful context

Do not replace an entire page with a generic error if one panel failed.

## 27. Recovery belongs next to failure

If retry, reconnect, edit, or inspect logs is possible, put it near the error.

## 28. Use progressive disclosure for technical detail

Human-readable result first. IDs, trace payloads and raw JSON deeper.

## 29. Keep destructive actions visually calm until relevant

Do not decorate every potential destructive control in red from a distance.

Show strong destructive styling at the decision point.

## 30. Confirmation dialogs explain consequences, not just repeat the button

Bad:
“Are you sure?”

Good:
“This will cancel the queued run. No completed outputs will be deleted.”

## 31. Preserve spatial context when opening detail

Prefer:
- side panel;
- expanding row;
- shared-element transition;
- split view.

Use a full navigation when the object merits a dedicated workspace.

## 32. Use modals for blocking decisions, not browsing

If the user needs to inspect or compare while the surface is open, a sheet/panel is often better.

## 33. Keep primary actions predictable

Most surfaces should have one visually dominant action at most.

## 34. Avoid floating action buttons

They are not appropriate to this desktop control-plane aesthetic unless a future interaction uniquely demands one.

## 35. Prefer explicit filters over clever hidden filtering

Power users appreciate speed, but the current query/filter state must remain understandable.

## 36. Preserve filters and selection through navigation where reasonable

The user should not repeatedly reconstruct context.

## 37. Make keyboard commands discoverable

Show shortcut hints in menus, command palette, and relevant tooltips.

## 38. Build command palette as a first-class navigation layer

It should search:
- destinations;
- agents;
- conversations;
- actions;
- reports;
- runs;
- common commands.

It should not become an unrestricted natural-language replacement for the product.

## 39. Keep scroll behaviour predictable

Avoid scroll-jacking, horizontal wheel hijacking, and animated auto-scroll unless initiated by a clear user action.

## 40. Use sticky positioning strategically

Sticky headers/filter bars are useful only if they reduce context loss.

Do not make half the viewport sticky.

## 41. Do not animate on every scroll

The product is not a portfolio site.

## 42. Motion should explain origin, destination, hierarchy, or state

If the animation answers none of those, remove it.

## 43. Support `prefers-reduced-motion`

Reduced motion must be a first-class variant, not an afterthought.

## 44. Avoid moving text

No marquee, ticker, continuously scrolling log text, animated paragraphs or wobbling labels.

## 45. Design for 200% text spacing overrides without clipping

Components must tolerate user text-spacing adjustments.

## 46. Design sparse, normal and extreme data cases

A component that only looks good with six short fake records is not complete.

## 47. Test absurd strings and large numbers

Long agent names, filenames, URLs, currency values and error descriptions must not destroy layouts.

## 48. Make real-time updates respectful

Do not reorder a list under the pointer because a background event arrived. Mark and reconcile updates predictably.

## 49. Prefer semantic HTML before ARIA patches

Button is a `<button>`. Navigation is `<nav>`. Tabs follow tab semantics.

## 50. A page is not finished until its invisible states are designed

The visual happy path is only one state. Loading, offline, stale, partial, permission, error, empty, reduced-motion and keyboard interaction are all part of design.

---

# 7. Typography system

Typography is one of the main ways AI Operations should stop looking generated.

## 7.1 Primary family

Recommended primary family:

**Mona Sans Variable**

Why:
- open source;
- variable weight;
- variable width;
- optical sizing;
- suitable for product UI;
- enough character to avoid anonymous default-sans appearance;
- allows subtle product-specific tuning without sacrificing readability.

Required use:
```css
font-optical-sizing: auto;
font-synthesis: none;
```

Recommended OpenType readability choices:
- distinguish lowercase `l`, uppercase `I`, and `1`;
- use tabular zero where technical/numeric content benefits;
- use tabular numerals on numerical data.

Fallback stack:
```css
"Mona Sans", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif
```

Do not silently replace with Inter or Arial.

## 7.2 Technical/monospace family

Recommended:
**IBM Plex Mono** or a similarly high-legibility technical mono.

Use only for:
- IDs;
- hashes;
- code;
- trace identifiers;
- machine timestamps where alignment matters;
- model names;
- compact technical metadata.

Do not use monospace for ordinary operational prose merely to look futuristic.

## 7.3 Weight system

Use variable weights deliberately.

Suggested semantic weights:

| Token | Weight | Use |
|---|---:|---|
| `text-regular` | 430 | body text |
| `text-medium` | 520 | controls, important labels |
| `text-semibold` | 620 | section titles, strong values |
| `text-bold` | 720 | exceptional display emphasis only |

The exact variable values may be tuned after browser rendering tests.

Avoid defaulting every component to 600.

## 7.4 Type scale

Default desktop scale:

| Role | Size | Line height | Weight | Tracking |
|---|---:|---:|---:|---:|
| Display / rare | 44 px | 48 px | 620 | -0.035em |
| Page title | 32 px | 38 px | 620 | -0.025em |
| Major section | 24 px | 30 px | 600 | -0.018em |
| Subsection | 19 px | 26 px | 580 | -0.012em |
| Component title | 16 px | 22 px | 560 | -0.006em |
| Body | 15 px | 22 px | 430 | 0 |
| Compact body | 14 px | 20 px | 430 | 0 |
| Metadata | 13 px | 18 px | 450 | 0.005em |
| Micro | 12 px | 16 px | 500 | 0.012em |

Rules:
- 44 px is not a default application headline. It is rare.
- operational pages should usually begin around 32 px;
- avoid 64–80 px “hero” typography in the authenticated application;
- minimum meaningful UI text is generally 12 px;
- never use 10 px as a routine metadata shortcut.

## 7.5 Text hierarchy through colour

In light mode:

- primary text: near-black, not pure black;
- secondary: approximately 68–72% perceived emphasis;
- tertiary: approximately 50–56%;
- disabled: approximately 38–42%, while still meeting relevant contrast for meaningful text.

Do not apply raw `opacity` to a whole component if it contains child borders/icons with different contrast needs. Use semantic tokens.

## 7.6 Paragraph rules

- default body line-height: ~1.47;
- long-form explanatory copy may use 1.55–1.6;
- paragraphs should not exceed roughly 72 characters per line;
- avoid justified text;
- avoid italic for paragraphs;
- avoid dense walls of prose;
- use headings and lists to chunk operational explanations.

## 7.7 Numeric typography

For metrics:
```css
font-variant-numeric: tabular-nums lining-nums;
```

Large values should not become oversized dashboard trophies unless they drive an actual decision.

A value should become large because it matters, not because dashboards conventionally make numbers large.

---

# 8. Colour system

## 8.1 Colour philosophy

Light mode should feel bright, soft, precise and slightly cool without becoming sterile.

The palette must:
- preserve strong text contrast;
- allow white content surfaces to remain meaningful;
- use one recognisable product signal colour;
- reserve semantic colours for state;
- avoid rainbow dashboards;
- avoid purple/indigo AI branding;
- avoid low-contrast grey-on-grey.

## 8.2 Recommended light semantic palette

Initial implementation targets, subject to accessibility verification:

```css
--canvas:            #F6F8FA;
--canvas-elevated:   #FBFCFD;
--surface:           #FFFFFF;
--surface-subtle:    #F1F4F6;
--surface-hover:     #EDF2F4;

--text-primary:      #11181C;
--text-secondary:    #53616A;
--text-tertiary:     #75828A;
--text-disabled:     #98A2A9;

--border-subtle:     rgba(17, 24, 28, 0.08);
--border-default:    rgba(17, 24, 28, 0.13);
--border-strong:     rgba(17, 24, 28, 0.22);

--signal:             #087F8C;
--signal-strong:      #056A74;
--signal-soft:        #E4F5F5;
--signal-ghost:       rgba(8, 127, 140, 0.08);

--focus:              #067A9C;

--success:            #187A54;
--success-soft:       #EAF7F0;
--warning:            #A96500;
--warning-soft:       #FFF4DA;
--danger:             #B43A45;
--danger-soft:        #FDECEE;
--info:               #246B9E;
--info-soft:          #EAF3FA;
```

The exact colours must be tested using the actual font rendering and components.

The signal hue is intentionally teal/cyan-adjacent rather than purple. It suggests active systems and precision without default “AI magic” branding.

## 8.3 Colour allocation

Approximate visual distribution:
- 80–90% neutral canvas/surfaces/text;
- 5–10% subtle structural tones;
- <5% signal or semantic colour.

This is not a literal CSS quota. It is an attention-budget principle.

## 8.4 Agent identity hues

Agents may receive restrained identity accents, but identity colour never replaces a text label.

Suggested family direction:

- Planner: signal teal;
- Finance: deep green;
- Health: blue-cyan;
- Travel: azure;
- Procurement: amber;
- Career: cobalt;
- Digital Estate: rust/red-orange;
- Systems: graphite/technical cyan.

The palette must be tuned so the system does not resemble eight unrelated SaaS products.

Agent identity appears in:
- a 2–3 px marker;
- small icon highlight;
- chart series;
- selected contextual element;
- conversation ownership indicator.

It does **not** flood entire page backgrounds.

## 8.5 Dark theme

Dark mode is not a colour inversion.

Recommended direction:

```css
--canvas:            #0E1215;
--canvas-elevated:   #12181C;
--surface:           #171D21;
--surface-subtle:    #1C2429;
--surface-hover:     #222C31;

--text-primary:      #F2F5F6;
--text-secondary:    #AEB9BF;
--text-tertiary:     #87959C;

--border-subtle:     rgba(242,245,246,0.07);
--border-default:    rgba(242,245,246,0.12);
--border-strong:     rgba(242,245,246,0.20);
```

Signal and semantic colours must be separately tuned for dark contrast.

Dark mode must not resurrect the existing dark-only aesthetic as the design baseline.

## 8.6 Gradients

Default: no decorative gradients.

Allowed:
- very subtle data visualisation interpolation;
- chart heatmaps;
- state transition masks;
- rare background atmospheric treatment at <5% visual dominance;
- intentional domain-specific visualisation.

Prohibited:
- gradient text;
- purple-blue hero gradient;
- gradient buttons;
- full-page glowing radial blobs.

---

# 9. Spatial system

## 9.1 Base unit

Use a 4 px base, but design predominantly on an 8 px rhythm.

Token scale:

```text
2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
```

Use 6/20/40 where optical alignment benefits. Do not prohibit every non-8 value; prohibit arbitrary inconsistency.

## 9.2 Typical spacing roles

- icon-to-label: 6–8 px;
- compact control internals: 8–12 px;
- row vertical padding: 10–14 px;
- component internal padding: 16–24 px;
- related blocks: 16–24 px;
- sections: 32–48 px;
- major conceptual regions: 48–80 px;
- page top breathing room: 40–64 px depending on surface.

## 9.3 Desktop canvas

Primary target widths:
- 1280 px laptop;
- 1440 px standard desktop;
- 1728 px / 1920 px large desktop.

The application must remain functional near 1024 px.

Do not make every page a fixed 1440 px centred column.

Use content modes:

### Reading mode
Max readable width ~760 px.

### Operational mode
Main content ~960–1280 px depending on task.

### Data mode
May use available width up to ~1500–1600 px when the information genuinely benefits.

### Split-context mode
Primary work region + contextual side panel.

## 9.4 Grid

Use a 12-column conceptual grid for large compositions, but avoid forcing every component into equal columns.

Outer page gutters:
- approximately 48 px at 1280;
- 56–72 px at 1440+;
- can reduce toward 32 px near smaller desktop widths.

## 9.5 Optical alignment

Text baseline and edge alignment matter more than mathematically identical boxes.

Icons may need 1 px optical offsets.
Text may need different horizontal padding than icon controls.
Do not make a layout visually worse to obey a simplistic spacing equation.

---

# 10. Shape, radius, border, and depth

## 10.1 Radius system

Recommended:

```css
--radius-xs: 4px;
--radius-sm: 7px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;
--radius-round: 999px;
```

Semantics:
- `xs`: tiny technical controls;
- `sm`: buttons, inputs, menu items;
- `md`: normal contained modules;
- `lg`: sheets/dialogs or stronger standalone surfaces;
- `xl`: very rare;
- round: avatars/status dots/chips only.

Do not apply `12px` to everything.

## 10.2 Borders

Borders should usually be:
- 1 px;
- low contrast;
- neutral;
- increased on hover/focus/selection.

Avoid double borders and decorative strokes.

## 10.3 Shadows

Light mode should use layered, low-opacity shadows only for actual elevation.

Examples:
- menus;
- popovers;
- command palette;
- sheets;
- dialogs;
- draggable/floating objects.

In-flow content usually does not need a shadow.

Suggested elevation direction:

```css
--shadow-1:
  0 1px 2px rgba(17,24,28,.04),
  0 2px 8px rgba(17,24,28,.03);

--shadow-2:
  0 8px 24px rgba(17,24,28,.08),
  0 2px 6px rgba(17,24,28,.05);

--shadow-3:
  0 16px 48px rgba(17,24,28,.12),
  0 4px 12px rgba(17,24,28,.06);
```

These are starting points, not sacred values.

## 10.4 Nested radii

When a child surface sits inside a rounded parent, its radius must visually relate to parent radius minus padding.

Do not use arbitrary equal radii at every nesting level.

---

# 11. Navigation architecture

The existing flat list of roughly nineteen top-level links should not remain the primary navigation model.

It exposes implementation categories rather than user intent and creates a long “admin sidebar”.

## 11.1 Navigation principles

Global navigation should separate:

### Everyday
What the user regularly engages with:
- Home / Overview;
- Conversations;
- Planner / personal operations;
- manager entry points;
- reports if frequently used.

### Attention / work
Surfaces involving:
- approvals;
- active operations;
- blocked/waiting work;
- action queue.

### System
Less frequent infrastructure:
- automations;
- data sources;
- devices;
- traces/audit;
- spend;
- feedback/quality;
- settings.

This is a grouping principle, not a locked exact menu.

## 11.2 Navigation should show current system state subtly

Examples:
- a small count when approvals require action;
- a single warning marker when system health needs attention;
- a running-state indicator when useful.

Do not put live counters on every navigation item.

## 11.3 Collapsibility

The desktop rail may support:
- expanded labelled mode;
- compact icon mode.

The transition should preserve item positions to avoid disorientation.

## 11.4 Global command palette

Mandatory quality target.

Open with:
- `Ctrl/Cmd + K`.

It should support fuzzy search across:
- pages;
- managers;
- reports;
- conversations;
- runs;
- actions;
- settings;
- commands.

Results must be grouped by type.

Command palette must show:
- title;
- context;
- shortcut if any;
- status if relevant.

It should never become a dumping ground for every database record.

## 11.5 Breadcrumbs

Use breadcrumbs only where hierarchy is real.

Do not display:
`Home / Section / Page`
on every screen by habit.

For deep entities:
`Career / Technology radar / Candidate`
may genuinely help.

---

# 12. Home / overview information philosophy

The overview should not become a wall of metrics.

Its job is prioritisation and orientation.

## 12.1 Attention-first ordering

Conceptual order:

1. things requiring user action;
2. meaningful changed state;
3. current plan / near-term operational context;
4. quiet system confidence;
5. deeper status by manager;
6. history.

## 12.2 “Everything is okay” must be compact

Do not show eight green cards saying every manager is healthy.

A single calm system-health statement may collapse successful background state.

Exceptions expand naturally.

## 12.3 Manager summaries

Manager summary should answer:
- what matters;
- what changed;
- what is next;
- whether user attention is needed.

Do not reduce managers to decorative KPI cards.

## 12.4 Recency

The interface should visually distinguish:
- new since last visit;
- current;
- stale;
- historical.

This can use:
- subtle markers;
- timestamps;
- grouping;
- freshness labels.

Do not rely on glowing animated badges.

---

# 13. Agent identity and agent-state UX

Agents are first-class operational actors, but should not become cartoon mascots.

## 13.1 Agent representation

Each manager may have:
- unique concise icon;
- restrained accent;
- name;
- domain subtitle;
- operating state.

Avoid:
- AI-generated portraits;
- anthropomorphic avatars;
- glowing brains;
- robot heads;
- sparkles.

## 13.2 Agent state

The interface should distinguish:
- idle / no relevant activity;
- scheduled;
- queued;
- running;
- waiting on dependency;
- waiting on user;
- succeeded;
- failed;
- degraded;
- paused.

Not every state needs permanent navigation-level visibility.

## 13.3 Running state

Running should feel alive through restrained micro-motion:
- a small directional progress trace;
- gently advancing progress line;
- subtle activity glyph;
- live elapsed time when useful.

Avoid:
- pulsing entire cards;
- spinning brand icons;
- bouncing dots everywhere.

## 13.4 Handoffs

Agent transfer should be understandable.

A transfer visualization may show:
`Finance → Planner`
with:
- reason;
- time;
- current owner.

Use motion once at the moment of transition if visible, then settle into a static state.

## 13.5 Confidence and freshness

Do not turn confidence into fake precision.

Prefer:
- High / Medium / Low when meaningful;
- known/verified/indicative/stale;
- evidence count;
- source recency.

Use numeric confidence only if the underlying system genuinely produces calibrated numbers.

---

# 14. Conversation UX

The web conversation system is not a separate “ChatGPT clone”. It is a viewport into the canonical conversation model shared with Gmail.

## 14.1 Conversation layout

The design should allow:
- conversation list/history;
- central transcript/workspace;
- optional contextual evidence/action panel.

Do not force three columns at all viewport sizes.

## 14.2 Message hierarchy

Messages should communicate:
- author/agent;
- channel when relevant;
- time;
- message;
- related execution state;
- attachments;
- evidence/report/action references.

Avoid large chat bubbles for long agent reports.

Long agent responses can adopt document-like typography within the conversation surface.

## 14.3 User messages

User messages can be visually distinct without becoming giant coloured bubbles.

## 14.4 Agent messages

Agent messages should place the content above the chrome.

The first thing visible should be the answer, finding or request—not a large avatar/name header.

## 14.5 Tool/run activity

Do not stream every internal tool event into the main transcript.

Summarise operational activity:
- “Finance checked 4 data sources”
- “Research completed”
- “Waiting for Planner”

Allow expansion to inspect full trace.

## 14.6 Cross-channel continuity

A message originating from Gmail may have a subtle mail marker and thread link.

A web reply should still look like part of the same conversation.

Channel should be metadata, not a visual wall.

## 14.7 Composer

The composer should:
- clearly show active agent/recipient;
- accept attachments;
- support keyboard submission;
- make multiline entry easy;
- expose command/help affordances;
- remain visually lightweight.

Do not emulate an enormous floating AI input box with gradient glow.

## 14.8 Agent selection

Agent switching should communicate consequence:
- starting with Planner;
- explicitly addressing Finance;
- transferring an existing conversation.

A manager dropdown alone may be insufficient if it obscures thread ownership.

---

# 15. Actions, approvals, and consequences

## 15.1 Approval composition

Every consequential approval should answer:

1. What is proposed?
2. Why?
3. Who/what requested it?
4. What evidence supports it?
5. What exactly will happen?
6. Is it reversible?
7. What happens if I do nothing?
8. Is there a deadline?

## 15.2 Action hierarchy

Primary:
- approve / execute when that is the central task.

Secondary:
- modify;
- defer;
- inspect evidence.

Destructive alternative:
- reject/cancel if semantically destructive to planned work, but do not make rejection look like catastrophic data deletion unless it is.

## 15.3 Receipts

After an action:
- preserve a compact execution receipt;
- show result;
- show time;
- show relevant IDs/evidence;
- link to trace.

The interface should communicate completion, not just remove the item.

---

# 16. Operational runs, queues, and traces

These are technically rich surfaces and high risk for information overload.

## 16.1 Summary before event stream

A run detail should first show:
- objective;
- manager;
- current state;
- start/end/duration;
- outcome;
- cost;
- meaningful problem if any.

Then expose:
- steps;
- evidence;
- calls;
- raw trace.

## 16.2 Timeline

Use timeline only when sequence matters.

Timeline items should distinguish:
- major lifecycle steps;
- AI calls;
- external tool calls;
- retries;
- waits;
- failures.

Default collapsed detail can hide repetitive low-value calls.

## 16.3 Logs

Never auto-scroll logs while the user is selecting/reading historical content.

Offer explicit:
- “Follow live” mode.

Use monospace for logs only.

## 16.4 Queue

Queue display should prioritise:
- blocked;
- retrying;
- overdue;
- user-dependent.

Successful routine work should not dominate.

---

# 17. Reports and evidence

## 17.1 Narrative first

A report should generally open with:
- outcome;
- key findings;
- material change;
- recommendations;
- next actions.

Supporting data follows.

## 17.2 Evidence linkage

Findings should provide evidence affordance inline.

Examples:
- source count;
- date/freshness;
- document;
- transaction set;
- research links.

Do not clutter every sentence with raw provenance IDs.

## 17.3 Long report typography

Long reports should look like high-quality reading surfaces:
- ~720–800 px text column;
- strong section hierarchy;
- generous vertical spacing;
- figures/charts may break wider than text column.

## 17.4 Comparison layouts

For procurement/travel/career comparison:
- align comparable attributes;
- pin decisive criteria;
- allow evidence expansion;
- visibly label unknown/indicative/current values.

Do not use “winner” glow effects.

---

# 18. Tables and data grids

## 18.1 Use tables for comparison, not because data is structured

If scanning across rows/columns helps, table is appropriate.

If each record needs narrative context, use list/detail composition.

## 18.2 Table anatomy

Tables should support:
- sticky header when long;
- clear row hover;
- keyboard row navigation when interactive;
- sort state;
- filter state;
- selected state;
- density appropriate to task;
- aligned numbers;
- truncation with accessible expansion.

## 18.3 Table density

Default operational row height: approximately 44–52 px.

Compact technical tables may use 36–40 px when justified.

Do not force all tables into spreadsheet density.

## 18.4 Zebra striping

Avoid by default.

Use whitespace and subtle row boundaries first.

## 18.5 Horizontal overflow

Prefer:
- column prioritisation;
- user-chosen columns;
- sticky key column;
- detail side panel.

Horizontal scroll is acceptable for genuinely wide analytical tables but must be obvious and usable.

---

# 19. Charts and data visualisation

## 19.1 Chart rule

A chart must answer a question that text or a number cannot answer faster.

## 19.2 Avoid dashboard decoration

No chart should exist simply to fill visual space.

## 19.3 Colour

- one primary series uses product signal or domain accent;
- comparison series use controlled distinct colours;
- muted context series use neutral tones;
- avoid rainbow palettes;
- pair colour with labels/pattern/shape where necessary.

## 19.4 Axes

Never remove axes merely to look minimalist if that harms interpretation.

## 19.5 Tooltips

Chart tooltips must:
- use tabular numerals;
- clearly label date/time;
- include units;
- remain keyboard accessible where possible.

## 19.6 Animation

Initial chart render may use a short restrained reveal.

Live data updates should transition smoothly only when the transition helps compare old/new state.

Respect reduced motion.

---

# 20. Buttons and action controls

## 20.1 Button hierarchy

Three principal levels:

### Primary
Filled signal colour or high-contrast neutral depending on context.

One dominant primary action per region.

### Secondary
Subtle surface with border or tonal fill.

### Tertiary
Text/icon, minimal chrome.

Danger is a semantic variant, not a fourth hierarchy.

## 20.2 Button geometry

Default:
- height 34–38 px for common desktop controls;
- 40–44 px for important forms or dialogs;
- radius ~7 px;
- horizontal padding 12–16 px.

Avoid pill primary buttons.

## 20.3 Button states

Must implement:
- default;
- hover;
- active;
- focus-visible;
- disabled;
- pending/loading;
- success where transient acknowledgement is useful.

Do not remove button label and replace it with only a spinner during loading.

## 20.4 Icon buttons

Minimum hit target should meet accessibility requirements even if visible icon is smaller.

---

# 21. Inputs and forms

## 21.1 Labels

Persistent labels are preferred.

Placeholder is example/hint, not label.

## 21.2 Helper text

Explain constraints before errors when possible.

## 21.3 Validation

- validate at appropriate moments;
- do not show red errors before the user has interacted;
- preserve input;
- focus/scroll to first relevant error on submit;
- show summary for complex forms.

## 21.4 Form width

Do not stretch text inputs to 1200 px simply because the page is wide.

Input width should hint expected data shape.

## 21.5 Settings

Settings pages should group by conceptual impact, not backend service.

High-impact settings should explain consequences.

---

# 22. Status chips, badges, and tags

Use chips for compact atomic metadata only.

Good:
- `Running`
- `Stale`
- `Needs you`
- `Verified`
- `£3.12`

Bad:
- turning every navigation item into a pill;
- wrapping paragraphs in capsules;
- using 10 coloured tags per row.

Status chips should generally be:
- 12–13 px;
- medium weight;
- compact;
- icon or dot + text when colour matters;
- non-pill or modestly rounded where appropriate.

---

# 23. Cards and surfaces

## 23.1 The card test

Before adding a card, ask:

> If I remove the border/background, does the content become ambiguous?

If no, do not use a card.

## 23.2 Card types

Allowed semantic card categories:

- actionable record;
- compact independent summary;
- interactive object;
- external-source preview;
- bounded alert;
- manager snapshot when summaries are peers.

Do not create a universal `.card` class as the primary design abstraction.

## 23.3 Sections

Use section layouts with:
- heading;
- support copy;
- content;
- optional action.

Sections often need no surrounding box.

---

# 24. Sheets, panels, popovers, and dialogs

## 24.1 Side sheets

Use for contextual detail when the underlying page remains useful.

Examples:
- inspect run;
- inspect evidence;
- inspect report metadata;
- inspect agent handoff.

## 24.2 Dialogs

Use for:
- small blocking decisions;
- confirmation;
- short bounded forms;
- critical acknowledgement.

Do not put full workflows in dialogs.

## 24.3 Popovers

Use for:
- compact contextual selection;
- short menus;
- filter controls.

No nested popover labyrinths.

---

# 25. Toasts and notifications

Toasts are ephemeral acknowledgements, not a second inbox.

Appropriate:
- settings saved;
- copy succeeded;
- action queued;
- transient background failure with route to detail.

Inappropriate:
- critical approval;
- detailed errors;
- important results.

Do not stack a dozen toasts.

---

# 26. Search, filtering, and command interaction

## 26.1 Search

Search fields should:
- be clearly scoped;
- expose current scope;
- use immediate results when cheap;
- debounce expensive remote work;
- preserve query on navigation where valuable.

## 26.2 Filtering

Active filters should remain visible.

A user should be able to answer:
“Why am I seeing these records?”

## 26.3 Saved views

If the product later introduces saved views, they should represent a meaningful operational perspective, not duplicate every possible filter combination.

---

# 27. Motion constitution

Motion is central to the “alive” character, but it must be disciplined.

## 27.1 Motion goals

Motion may:

1. acknowledge input;
2. show state change;
3. preserve object continuity;
4. show relationship/origin/destination;
5. help spatial navigation;
6. indicate active processing;
7. make insertion/removal understandable;
8. reduce perceived latency.

Motion must not exist merely to “make the page dynamic”.

## 27.2 Duration tokens

Suggested:

```css
--motion-instant:  80ms;
--motion-fast:    130ms;
--motion-normal:  190ms;
--motion-slow:    280ms;
--motion-scene:   380ms;
```

Anything longer than ~400 ms should be rare and intentional.

## 27.3 Easing

Suggested families:

```css
--ease-out: cubic-bezier(.16, 1, .3, 1);
--ease-standard: cubic-bezier(.2, 0, 0, 1);
--ease-in: cubic-bezier(.7, 0, .84, 0);
```

Use spring physics only for interactions that have a physical metaphor.

Avoid cartoon overshoot.

## 27.4 Micro-interactions

Hover:
- 80–130 ms;
- small tone/border change;
- at most 1 px translation where physicality helps.

Press:
- immediate;
- subtle compression/tone;
- no dramatic scaling.

Focus:
- no animation necessary beyond quick ring appearance.

## 27.5 Page/view transitions

Use shared-element or view transitions selectively:
- list record → detail;
- manager summary → manager workspace;
- conversation → linked report/action;
- navigation rail expand/collapse.

Transitions should preserve orientation.

Default navigation should not fade the entire app to black/white.

## 27.6 Ambient motion

Allowed only in tiny areas.

Examples:
- low-amplitude running indicator;
- progress trace;
- background connection-state shimmer limited to status element.

Never animate the whole page background.

## 27.7 Cursor-reactive “aliveness”

Permitted:
- interactive row surface subtly increases local contrast;
- command surface may reveal a restrained highlight following pointer within bounds;
- chart crosshair follows pointer;
- draggable surface reacts to grip.

Avoid:
- giant spotlight following cursor across page;
- magnetic buttons;
- parallax background;
- floating particles;
- cursor replacement.

## 27.8 Streaming text

Streaming content must not cause aggressive reflow.

Use:
- stable line layout;
- normal text rendering;
- subtle insertion caret or state indicator.

Do not animate each word upward, blur-in letters, or typewriter every response.

## 27.9 Number updates

If an important live value changes:
- use tabular numerals;
- short crossfade or restrained digit transition;
- preserve width;
- do not animate every background metric.

## 27.10 Reduced motion

Under `prefers-reduced-motion: reduce`:
- eliminate spatial travel where possible;
- replace transforms with immediate state or opacity change;
- disable ambient loops;
- disable number rolling;
- reduce chart animation;
- keep necessary state acknowledgement.

Consider an in-product motion setting later if research/user need justifies it.

---

# 28. Making the system feel alive without causing distraction

“Alive” must come from **responsive state**.

Use these mechanisms:

## 28.1 Reactive surfaces

Controls respond instantly to pointer/focus.

## 28.2 State continuity

When an operation changes from queued → running, the same object transforms state rather than disappearing and being replaced.

## 28.3 Temporal awareness

Subtle relative timestamps can update at sensible intervals.

Do not continuously tick seconds everywhere.

## 28.4 Contextual emergence

Secondary actions appear on hover/focus where discoverability remains sufficient.

## 28.5 Meaningful live insertion

New attention items can enter with a restrained highlight that settles within ~1 second.

Do not reorder everything around them.

## 28.6 Presence of background work

A single consolidated system indicator can communicate “3 operations running” without three animated widgets.

## 28.7 Causal visual links

When an agent produces a report/action, contextual transition can connect source run to output.

## 28.8 Gentle persistence

After a change, temporary emphasis helps user locate the changed object, then fades.

---

# 29. Accessibility and cognitive comfort

AI Operations should meet WCAG 2.2 AA and exceed it where practical.

## 29.1 Text and dyslexia-aware principles

Given the stated preference against moving information and walls of text:

- no moving text;
- no justified text;
- generous line-height;
- sections separated by whitespace;
- headings that break content into navigable chunks;
- 60–75 character prose width;
- avoid long uppercase strings;
- avoid large italic passages;
- avoid dense multi-column prose;
- lists for procedural content;
- preserve user text-spacing overrides;
- do not clip at increased line/word spacing.

## 29.2 Motion safety

Respect reduced motion.

Avoid:
- rapid zoom;
- large parallax;
- flashing;
- repeated oscillation;
- high-frequency pulsing.

## 29.3 Focus

Every interactive element must show a clear `:focus-visible` state.

Focus should:
- remain unobscured;
- contrast against adjacent colours;
- follow logical DOM order;
- restore sensibly after dialogs/sheets close.

## 29.4 Target size

Pointer targets must satisfy WCAG requirements.

Small visible icons may have larger invisible hit regions.

## 29.5 Contrast

Test:
- body text;
- secondary text;
- icons;
- form boundaries;
- focus;
- chart elements;
- disabled states where content still matters.

## 29.6 Zoom

Application must remain usable at 200% browser zoom.

Do not hide essential functionality solely because viewport effectively narrows.

## 29.7 Screen readers

Live status updates should use live regions sparingly.

Do not announce every internal run event.

Announce:
- important user-initiated completion;
- blocking error;
- meaningful status change relevant to active task.

---

# 30. Performance is part of the design

Performance is a product characteristic, not a backend concern.

## 30.1 Required web-vitals baseline

At the 75th percentile:
- LCP ≤ 2.5 s;
- INP ≤ 200 ms;
- CLS ≤ 0.1.

Internal ambition should be better on normal desktop connections.

## 30.2 Interaction latency

Targets:
- local control acknowledgement: <100 ms;
- common navigation shell response: perceptually immediate;
- expensive work: pending state immediately, then honest progress.

## 30.3 Preserve old useful content during refresh

Avoid blanking a screen while refetching.

Use stale-while-revalidate patterns where semantically safe.

## 30.4 Avoid frontend overfetching

Do not fetch:
- raw traces;
- huge histories;
- all conversations;
- all chart points;

until the user needs them.

## 30.5 Virtualisation

Use for genuinely large lists/tables.

Do not prematurely virtualise simple 50-row views if it harms accessibility or complexity.

## 30.6 Fonts

Preload critical WOFF2 variable font intelligently.

Provide correct fallback metrics where practical to minimise CLS.

## 30.7 Motion performance

Prefer compositor-friendly opacity/transform animation.

Do not animate expensive layout properties across large DOM trees.

---

# 31. Desktop-first responsive strategy

Desktop-first here means art-direction priority, not “break on smaller screens”.

## 31.1 Primary viewports

Design and test at minimum:
- 1024×768;
- 1280×800;
- 1440×900;
- 1728×1117;
- 1920×1080.

## 31.2 Behaviour near smaller widths

Priorities:
1. preserve core task;
2. collapse secondary panel;
3. compact navigation;
4. reduce gutters;
5. allow data regions to adapt;
6. avoid shrinking text below scale.

## 31.3 Mobile

Gmail is the primary mobile communication surface.

The site should remain safe and usable on a phone for emergency inspection/basic operations, but mobile should not dictate the desktop composition.

Do not spend design complexity making every dense analytical tool feel native-mobile unless product requirements later change.

---

# 32. Theme architecture

Use semantic tokens rather than literal colours in feature components.

Required layers:

```text
primitive palette
    ↓
semantic tokens
    ↓
component tokens
    ↓
feature composition
```

Example:

```css
--color-neutral-950
→ --text-primary
→ --button-primary-text
→ actual button
```

Feature code should not contain arbitrary hex values.

## 32.1 Theme toggle

Provide:
- Light;
- Dark;
- optionally System.

Primary first-use default may follow system preference, but the light theme receives the strongest art-direction focus.

Theme change should be immediate, no full-screen fade.

Persist preference.

---

# 33. Iconography

## 33.1 Style

Choose one coherent icon set or custom subset.

Target:
- 1.5–1.75 px optical stroke at normal sizes;
- restrained geometry;
- rounded joins only where appropriate;
- clear at 16/18/20 px.

## 33.2 Use

Icons should indicate:
- action;
- type;
- state;
- navigation.

Do not decorate every heading.

## 33.3 Manager icons

Manager icons should be distinct but related.

Examples of conceptual motifs:
- Finance: ledger/trajectory;
- Health: pulse/performance;
- Travel: route;
- Procurement: comparison/object;
- Planner: path/time;
- Career: progression/radar;
- Digital Estate: device/file shield;
- Systems: flow/orchestration.

Avoid generic sparkle/robot/brain.

---

# 34. Microcopy

## 34.1 Voice

Interface copy should be:
- direct;
- precise;
- calm;
- human;
- non-theatrical.

Avoid:
- “Magic”;
- “Supercharge”;
- “Unleash”;
- “AI-powered” repeated everywhere;
- “Oops!” for serious failures.

## 34.2 State wording

Prefer:
- “Waiting for Google”
- “Needs your approval”
- “Retry scheduled”
- “Data last verified 2 hours ago”

Over:
- “Pending”
- “Something went wrong”
- “Unknown”

when the system knows the actual state.

## 34.3 Buttons

Use verbs:
- “Review changes”
- “Retry run”
- “Open evidence”
- “Approve action”

Avoid:
- “Submit” where a better verb exists;
- “Yes/No” in consequence dialogs.

---

# 35. Domain-specific presentation principles

## 35.1 Finance

Prioritise:
- financial state;
- meaningful change;
- exceptions;
- opportunities;
- projections;
- upcoming obligations.

Use numeric precision and clear time periods.

Do not make every financial number equally large.

## 35.2 Health

Prioritise:
- plan;
- adherence;
- trend;
- current recommendation;
- training adjustment.

Avoid gamified streak pressure unless explicitly required.

## 35.3 Travel

Prioritise:
- itinerary state;
- current verified vs indicative information;
- cost;
- deadlines;
- disruption;
- readiness.

Use timeline/maps only when they improve understanding.

## 35.4 Procurement

Prioritise:
- requirements;
- shortlist;
- decisive trade-offs;
- live price/evidence;
- confidence.

Use comparison grids with highlighted differences, not giant product cards.

## 35.5 Planner

Planner is the daily orchestration surface.

Prioritise:
- current day;
- attention;
- commitments;
- flexible blocks;
- changes;
- specialist requests.

It should feel calm and practical, not like a packed calendar spreadsheet.

## 35.6 Career

Prioritise:
- trajectory;
- projects;
- exceptional opportunities;
- skills;
- technology radar.

Technology-radar visualisations can be distinctive, but must remain evidence-driven.

## 35.7 Digital Estate

Prioritise:
- posture;
- risk;
- proposed cleanup;
- device state;
- evidence.

Security severity must be semantically rigorous; do not use red merely for visual excitement.

## 35.8 Systems

Prioritise:
- things that need intervention;
- active work;
- health;
- cost;
- degraded integrations;
- capability regression.

Routine successes should collapse.

---

# 36. Information architecture rules for complex AI systems

## 36.1 Separate “work” from “observability”

The user-facing work layer:
- attention;
- conversation;
- approvals;
- reports;
- planned tasks.

The technical observability layer:
- traces;
- tool calls;
- retries;
- queue internals;
- cost breakdown;
- audit.

Do not make users pass through observability surfaces to perform ordinary work.

## 36.2 Preserve provenance without drowning the UI

Every claim may be traceable, but not every provenance field needs to be visible at once.

Use expandable evidence.

## 36.3 Surface unresolved uncertainty

Unknown, stale and inferred are user-relevant states.

Do not visually smooth them into false certainty.

## 36.4 User attention is a first-class resource

Anything that uses:
- red;
- animation;
- badge counts;
- prominent placement;
- notification styling;

must justify why it deserves attention.

---

# 37. Frontend engineering architecture: staff-level expectations

A high-quality UI is not produced by page-specific CSS. It is produced by a system that makes high-quality output the default.

## 37.1 Architecture layers

```text
design tokens
↓
behaviour primitives
↓
visual primitives
↓
composed components
↓
product patterns
↓
feature surfaces
```

## 37.2 Tokens

Centralise:
- colour;
- typography;
- spacing;
- radius;
- border;
- shadow;
- z-index;
- motion;
- control height;
- layout widths.

No feature should invent its own parallel token system.

## 37.3 Behaviour primitives

Use accessible/headless primitives for:
- dialog;
- menu;
- popover;
- tabs;
- tooltip;
- listbox;
- command palette;
- disclosure;
- focus trap.

`shadcn/ui` may provide implementation scaffolding, but its default visual assembly is not the design system.

## 37.4 Visual primitives

Examples:
- `Text`;
- `Heading`;
- `Stack`;
- `Inline`;
- `Divider`;
- `Surface`;
- `Status`;
- `Button`;
- `IconButton`;
- `Field`;
- `EmptyState`.

Do not over-abstract every `<div>`.

## 37.5 Product patterns

Examples:
- attention item;
- agent header;
- execution receipt;
- evidence link;
- run state;
- freshness indicator;
- approval summary;
- conversation message;
- manager snapshot.

These carry semantic rules across features.

## 37.6 CSS strategy

Use Tailwind if required by platform spec, but:
- map Tailwind classes to semantic tokens;
- avoid arbitrary values in feature code;
- avoid 50-class unreadable JSX blobs;
- extract repeated semantic patterns;
- keep global CSS small and foundational.

## 37.7 Component API quality

A component should expose semantic intent, not styling trivia.

Better:
```tsx
<Status tone="warning">Stale</Status>
```

Worse:
```tsx
<Badge className="bg-yellow-50 text-yellow-700 rounded-full ...">
```

## 37.8 State ownership

Keep:
- remote/server state;
- URL state;
- local interaction state;
- form state;

deliberately separated.

Do not duplicate server state into local state without reason.

## 37.9 URL architecture

Filter, selected record, tab, and deep-linked objects should live in URL state when that improves:
- bookmarking;
- back/forward;
- sharing with future agents/tools;
- restoration.

## 37.10 Server components

Use React Server Components where they improve:
- initial payload;
- security;
- data locality;
- static composition.

Do not force interactive client components upward unnecessarily.

## 37.11 Client boundaries

Keep client islands as small as practical.

Large `"use client"` page trees should be questioned.

## 37.12 Design system documentation

Maintain a Storybook-equivalent or dedicated internal component showcase if compatible with repo/tooling.

It should include:
- normal state;
- dark state;
- reduced motion;
- keyboard focus;
- error;
- disabled;
- long text;
- large numbers;
- empty;
- loading.

---

# 38. Staff frontend engineer quality behaviours

The research into staff/principal frontend roles consistently places leverage above page output.

A staff-level implementation approach must:

1. improve shared primitives when a repeated problem appears;
2. create architectural constraints that stop future drift;
3. treat accessibility as engineering;
4. treat performance as engineering;
5. bridge design intention and component APIs;
6. establish testable quality bars;
7. solve state/data-flow problems, not merely CSS;
8. simplify complex user flows;
9. document decisions;
10. consider sparse, normal and extreme states;
11. make future contributors faster without making them less thoughtful;
12. understand browser rendering and interaction performance;
13. preserve product consistency across teams/agents;
14. identify UX debt in existing implementation;
15. prefer maintainable systems over one-off visual heroics.

The goal is not “make this page pretty”.

The goal is:

> **Build a frontend system that keeps producing excellent pages after the original designer leaves.**

---

# 39. Current repository frontend assessment

This section is based on the current `main` branch as inspected on 2026-09-26.

## 39.1 Current theme

`apps/web/app/globals.css` currently sets:

- `color-scheme: dark`;
- dark blue canvas/surface;
- one green accent;
- Arial.

### Classification
**CURRENT IMPLEMENTATION CONFLICTS WITH SPEC**

### Required direction
Replace with:
- semantic light-first token architecture;
- intentional dark theme;
- Mona Sans variable or approved final typography;
- complete interaction-state tokens.

## 39.2 Current shell

`apps/web/app/(app)/layout.tsx` currently renders a flat sidebar containing roughly nineteen top-level links.

### Classification
**EXISTS BUT NEEDS EXTENSION / CURRENT IMPLEMENTATION CONFLICTS WITH SPEC**

### Required direction
Preserve routes/functionality while redesigning navigation around:
- user intent;
- everyday work;
- attention;
- managers;
- system/administration;
- command palette.

## 39.3 Generic `.card`

The global CSS defines one generic `.card`, and current feature pages repeatedly use it for:
- metrics;
- summaries;
- run records;
- empty states;
- setup content;
- approvals;
- domain sections.

### Classification
**DEPRECATED/SHOULD BE REPLACED**

### Required direction
Replace card soup with:
- semantic surfaces;
- sections;
- rows;
- lists;
- panels;
- product patterns.

## 39.4 Generic `.grid`

The current auto-fit `minmax(190px, 1fr)` grid encourages equal KPI-card layouts.

### Classification
**DEPRECATED AS DEFAULT LAYOUT**

Retain generic grid utility only where equal peer objects are genuinely appropriate.

## 39.5 Button styling

Current button styling gives most buttons the same accent border and radius.

### Classification
**EXISTS BUT NEEDS EXTENSION**

Add:
- primary;
- secondary;
- tertiary;
- danger;
- pending;
- focus;
- icon;
- compact/normal sizing.

## 39.6 Status styling

Current status pills are useful semantic beginnings but too close to a universal pill pattern.

### Classification
**EXISTS BUT NEEDS EXTENSION**

Develop status semantics independent of shape and colour.

## 39.7 Motion

The current visual layer does not have a coherent motion token/interaction system.

### Classification
**MISSING**

Add:
- motion tokens;
- reduced-motion variant;
- view transition rules;
- micro-interaction primitives.

## 39.8 Theme switching

The current root is dark-only.

### Classification
**MISSING / CONFLICT**

Implement semantic light and dark themes with persisted preference.

## 39.9 Typography

Arial has no deliberate product voice and no data typography system.

### Classification
**CURRENT IMPLEMENTATION CONFLICTS WITH SPEC**

Implement:
- variable primary font;
- mono;
- typographic tokens;
- tabular numeric utilities;
- optical sizing.

## 39.10 Navigation and hierarchy

The existing route structure contains significant functionality and should not be discarded wholesale.

The visual hierarchy around those routes can change radically.

### Required principle
**Preserve product capability; replace presentation grammar.**

---

# 40. Migration order

No arbitrary dates.

## Phase 0 — Baseline capture

Before visual overhaul:
- capture screenshots of existing key routes;
- ensure functional E2E tests exist;
- record current navigation/routes;
- identify components with business logic mixed into presentation;
- establish visual-regression infrastructure.

## Phase 1 — Foundations

Implement:
- typography;
- semantic colour;
- light/dark theme;
- spacing;
- radius;
- shadow;
- motion;
- focus;
- layout tokens.

No broad page beautification before this is stable.

## Phase 2 — Application shell

Redesign:
- global navigation;
- grouped IA;
- command palette;
- content canvas;
- theme control;
- session/system status;
- keyboard navigation.

## Phase 3 — Core primitives

Implement/rework:
- buttons;
- fields;
- status;
- menus;
- dialogs;
- sheets;
- list rows;
- surfaces;
- tabs;
- empty/error/loading;
- table;
- chart shell;
- typography components.

## Phase 4 — Core AI Operations patterns

Implement:
- manager identity;
- attention item;
- run lifecycle;
- execution receipt;
- evidence block;
- freshness;
- approval;
- conversation message;
- agent handoff;
- operation status.

## Phase 5 — Core work surfaces

Prioritise:
- overview;
- conversation;
- Planner;
- approvals;
- active operations.

These surfaces establish the new product language.

## Phase 6 — Domain surfaces

Migrate:
- Finance;
- Health;
- Travel;
- Procurement;
- Career;
- Digital Estate;
- Systems.

Each domain should reuse the system but receive deliberate domain-specific composition.

## Phase 7 — Technical/administrative surfaces

Migrate:
- traces/audit;
- spend;
- data sources;
- devices;
- automations;
- feedback/quality;
- settings.

Do not let internal/admin screens become a visual quality loophole.

## Phase 8 — Polish and enforcement

- performance pass;
- accessibility pass;
- reduced-motion pass;
- keyboard pass;
- high-data-volume pass;
- long-text pass;
- visual regression;
- remove deprecated CSS;
- remove duplicate primitives;
- create lint/review gates.

---

# 41. Animation implementation guidance

## 41.1 CSS first

Use CSS transitions for simple:
- hover;
- focus;
- colour;
- border;
- opacity;
- small transform.

## 41.2 View Transition API

Use progressively for shared spatial transitions where browser support is acceptable.

Always:
- maintain focus;
- preserve accessibility;
- provide no-motion fallback;
- avoid blocking navigation.

## 41.3 JavaScript animation library

Do not add a heavy animation dependency simply to animate buttons.

If a library is justified by:
- layout transitions;
- gesture interaction;
- complex orchestrated shared elements;

document why.

## 41.4 Animation budget

A typical static screen at rest should contain **zero or one** continuously moving visual element.

This is a strong heuristic.

If the screen has five pulsing indicators, redesign.

---

# 42. Data-change behaviour

Real-time systems can feel chaotic if updates are naïve.

## 42.1 Do not steal focus

Background updates must never move keyboard focus.

## 42.2 Do not reorder under pointer

If sort order changes due live events while the user is interacting, consider:
- marking “new updates available”;
- applying on explicit refresh;
- animating only after safe reconciliation.

## 42.3 Preserve reading position

New conversation/report content should not auto-scroll the user away from older content they are inspecting.

Provide “Jump to latest”.

## 42.4 Highlight changes temporarily

Changed field:
- subtle background emphasis;
- settles within 1–2 seconds;
- reduced-motion users get non-animated emphasis.

---

# 43. Loading, empty, stale, degraded, and error catalogue

Every major component should consider:

## Loading
Data not yet available.

## Refreshing
Useful prior data exists; new data is arriving.

## Empty
No records exist.

## Filter-empty
Records exist, current query hides them.

## Stale
Data exists but freshness contract exceeded.

## Partial
Some sources succeeded.

## Degraded
System can operate with reduced capability.

## Blocked
Execution cannot proceed until dependency.

## Waiting-user
Needs explicit user input/action.

## Error
Operation failed.

## Offline/external outage
Dependency unreachable.

## Permission
Capability unavailable due auth/connection/permission.

A generic “Something went wrong” state is not sufficient if a more specific state is known.

---

# 44. Futuristic detail without gimmicks

Use “future” through:

- variable-font precision;
- instantaneous response;
- subtle state morphing;
- high-quality transitions;
- elegant command palette;
- contextual panels;
- live provenance;
- intelligent progressive disclosure;
- excellent data visualisation;
- consistent semantic colour;
- sophisticated temporal state;
- advanced keyboard behaviour.

Avoid “future” through:

- neon;
- HUD grids;
- hologram effects;
- scan lines;
- glows;
- infinite particle fields;
- robot illustration;
- digital rain;
- overuse of monospace.

---

# 45. Anti-slop compiler: explicit prohibited defaults

Luna/Terra must reject the following unless a clear product reason is documented.

1. Purple/blue AI gradient hero.
2. Gradient headline text.
3. Giant centred app-page title.
4. Three equal feature cards by default.
5. Bento grid for ordinary information.
6. 16 px radius on every surface.
7. Pill buttons as default.
8. Icon in tinted rounded square above every block.
9. Glassmorphism throughout.
10. Blurred glowing blobs.
11. Generic “sparkles” AI icon.
12. Animated orb.
13. Floating particle background.
14. Fade-up animation on every section.
15. Scroll-triggered reveal for normal app content.
16. Uniform shadow on every card.
17. One `.card` class representing every semantic object.
18. Inter chosen without explicit design decision.
19. Arial as final product typography.
20. Entire application in monospace to seem technical.
21. Every secondary label in uppercase letter-spaced text.
22. Every status as a colourful pill.
23. Colour as sole status cue.
24. Icon-only domain actions with tooltips as the only explanation.
25. Skeleton shimmer across whole page on every refresh.
26. Full-page spinner where stale content can remain.
27. Dashboard with 8–12 equally prominent KPI boxes.
28. Decorative pie/donut charts.
29. Auto-playing animated charts.
30. Auto-scrolling logs.
31. Cursor-following global spotlight.
32. Magnetic buttons.
33. Parallax page chrome.
34. Text that moves while being read.
35. Typewriter animation for routine agent responses.
36. “AI-powered” badges everywhere.
37. “Magic”, “supercharge”, “unleash” marketing copy in operations UI.
38. Success confetti.
39. Generic stock illustration empty states.
40. ChatGPT-style layout copied wholesale.
41. Linear copied wholesale.
42. Vercel copied wholesale.
43. A dark theme treated as inherently “more AI”.
44. Invisible hover-only actions with no keyboard/discoverability path.
45. Overuse of modals.
46. Nested cards.
47. Horizontal scroll for ordinary prose.
48. Truncating important errors to one line with no expansion.
49. Putting raw JSON before a human explanation.
50. Shipping a component without loading/empty/error/focus states.

---

# 46. Visual review rubric

Score each substantial surface 0–2 per criterion.

## Hierarchy
0: everything competes  
1: mostly clear  
2: immediate focal hierarchy

## Restraint
0: excessive containers/colour/motion  
1: some clutter  
2: every emphasis feels earned

## Identity
0: generic template  
1: competent but anonymous  
2: recognisably AI Operations

## Readability
0: wall/dense/poor line length  
1: adequate  
2: highly scannable and comfortable

## Interaction
0: static/awkward  
1: works  
2: immediate, coherent, tactile

## States
0: happy path only  
1: most states  
2: complete state model

## Accessibility
0: material failures  
1: AA basics  
2: AA plus cognitive/reduced-motion excellence

## Performance
0: visible jank/layout shifts  
1: acceptable  
2: feels immediate

## System consistency
0: page-local invention  
1: mostly shared  
2: semantically systemised

## Product fit
0: could be any SaaS  
1: somewhat tailored  
2: clearly serves AI Operations workflows

**Minimum merge threshold: 17/20.**  
Any 0 in accessibility, product fit, or states blocks merge.

---

# 47. PR checklist for frontend agents

Before opening a PR:

- [ ] Read both functional specs.
- [ ] Read this constitution.
- [ ] Confirm no functionality was removed.
- [ ] Confirm information hierarchy matches user importance.
- [ ] Confirm page does not default to card soup.
- [ ] Confirm light theme first.
- [ ] Confirm dark theme.
- [ ] Confirm keyboard path.
- [ ] Confirm focus-visible.
- [ ] Confirm reduced motion.
- [ ] Confirm 200% zoom.
- [ ] Confirm text-spacing override does not clip.
- [ ] Confirm loading.
- [ ] Confirm refreshing.
- [ ] Confirm empty.
- [ ] Confirm filter-empty where relevant.
- [ ] Confirm stale/partial/degraded where relevant.
- [ ] Confirm error and recovery.
- [ ] Confirm long text.
- [ ] Confirm large numeric values.
- [ ] Confirm real-looking synthetic data.
- [ ] Confirm no raw colours in feature code.
- [ ] Confirm no arbitrary animation.
- [ ] Confirm no purple AI gradient.
- [ ] Confirm no generic three-card layout without semantic reason.
- [ ] Confirm performance budget.
- [ ] Confirm visual-regression snapshots.
- [ ] Confirm axe/accessibility checks.
- [ ] Confirm visual review rubric ≥17/20.

---

# 48. Automated design regression ideas

Future implementation should consider checks for:

## Static lint
- disallow raw hex outside token files;
- flag excessive arbitrary Tailwind values;
- flag `rounded-full` on buttons;
- flag new global `.card`;
- flag feature-level box shadows;
- flag transition `all`;
- flag animations without reduced-motion counterpart;
- flag text below 12 px;
- flag icon-only button without accessible name.

## Visual regression
Screenshots:
- 1280 light;
- 1440 light;
- 1440 dark;
- 1024 light;
- reduced-motion state does not require screenshot motion;
- representative long-data fixture.

## Accessibility
- axe;
- keyboard smoke tests;
- dialog focus trap;
- focus restoration;
- colour-independent status assertions.

## Performance
- bundle-size diff;
- Core Web Vitals synthetic monitoring;
- React render profiling for heavy tables;
- no unnecessary full-page client hydration.

---

# 49. Design-system naming philosophy

Names should encode semantic role.

Good:
- `AttentionItem`
- `RunStatus`
- `EvidenceLink`
- `AgentIdentity`
- `ExecutionReceipt`
- `FreshnessState`

Avoid:
- `BlueCard`
- `RoundedBox`
- `FancyPanel`
- `GradientButton`

The component model should teach future agents how the product thinks.

---

# 50. Recommended initial design-system inventory

## Foundation
- ThemeProvider
- tokens
- Typography
- Icon
- FocusRing
- VisuallyHidden

## Layout
- AppShell
- Page
- Section
- Stack
- Inline
- Split
- Sidebar
- ScrollArea
- Divider

## Controls
- Button
- IconButton
- Link
- TextField
- TextArea
- Select
- Checkbox
- Radio
- Switch
- SegmentedControl

## Navigation
- NavRail
- NavGroup
- Breadcrumb
- Tabs
- CommandPalette
- SearchField

## Feedback/state
- Status
- Alert
- InlineNotice
- Progress
- Spinner
- Skeleton
- EmptyState
- ErrorState
- Toast

## Overlays
- Menu
- Popover
- Tooltip
- Dialog
- Sheet

## Data
- Table
- DataGrid
- Metric
- Trend
- ChartFrame
- Timeline
- KeyValue
- CodeBlock

## AI Operations patterns
- ManagerIdentity
- ManagerSnapshot
- AttentionItem
- ConversationMessage
- ConversationComposer
- HandoffIndicator
- RunSummary
- RunTimeline
- EvidenceReference
- FreshnessIndicator
- ApprovalSummary
- ExecutionReceipt
- CostIndicator
- SourceHealth
- ActionQueueItem

This is an initial inventory, not a mandate to build every abstraction before need appears.

---

# 51. Quality of visual implementation

Pixel quality matters.

Agents should inspect:

- 1 px alignment;
- baseline alignment;
- icon optical size;
- border contrast;
- radius nesting;
- line wrapping;
- hover transitions;
- focus ring clipping;
- scrollbars;
- sticky elements;
- selected row states;
- loading transitions;
- dark-mode elevation;
- chart label collision;
- table column rhythm;
- text anti-aliasing around animated wrappers.

“Technically correct” is insufficient.

---

# 52. Interaction details that create premium feel

Small examples:

- row hover appears before pointer reaches text because hit area is the whole row;
- selected navigation indicator moves rather than flashes;
- opening a contextual sheet preserves the selected row underneath;
- closing the sheet returns focus to the trigger;
- copy action changes icon/label briefly without toast spam;
- queued operation immediately appears in state with exact wording;
- retry state shows attempt count only when useful;
- command palette remembers recent useful commands;
- search highlights terms without shifting text;
- tables preserve column widths during refresh;
- charts keep axis scale stable during small updates when comparison matters;
- notification count decreases with a coherent transition after resolution;
- theme switch does not flash unthemed content;
- font loads without major layout jump.

None of these require flashy effects. Together they create a designed product.

---

# 53. Rules for AI-generated frontend work

A coding agent must not assume its first generated UI is acceptable.

Required self-critique questions:

1. Does this look like a shadcn demo?
2. Did I put everything in cards?
3. Did I choose a grid because it was easy?
4. Is colour doing work that typography/spacing should do?
5. Is the main user decision obvious?
6. Am I showing internal implementation instead of user meaning?
7. Are successful background events stealing space from exceptions?
8. Does anything move without helping comprehension?
9. Would this still work with twice as much text?
10. Does this feel designed for AI Operations rather than generic SaaS?
11. Can keyboard users perform the same task?
12. Can a user with reduced motion understand state change?
13. Does light mode look first-class?
14. Does dark mode preserve semantic hierarchy rather than invert colours?
15. What would a staff frontend engineer simplify?

If the answers expose weak design, iterate before PR.

---

# 54. Research provenance and source list

The principles in this document are synthesised from current web research, primary accessibility/platform documentation, observed patterns in contemporary AI-generated interfaces, current job expectations for staff-level frontend/design-system engineers, and the AI Operations repository/specifications.

This list is not an endorsement of every opinion in every source. Primary sources and repeated consensus were weighted most heavily.

## 54.1 AI-generated UI sameness / anti-pattern research

- Joshua Snoddy — “Why do AI-generated websites all look the same?” (2026).
- DesignMD — analysis of AI-generated website sameness and recurring layout/palette defaults (2026).
- UXskill — comparison of Lovable, Bolt and v0 generated aesthetics (2026).
- Curio — discussion of AI visual “slop” and statistical-average design (2026).
- VisiblePage — guidance on escaping generic AI website output through art direction and systems (2026).
- SlopCheckr — measured sample of 93 AI-generated sites, including repeated fonts, card/grid and button patterns (2026).
- Community discussions in web-design/frontend communities about Tailwind/Radix/shadcn sameness and AI-generated visual signatures (2026).
- WIRED — recent discussion of CSS/framework homogenisation (2026).

## 54.2 Accessibility and cognitive usability

- W3C WCAG 2.2  
  https://www.w3.org/TR/wcag/
- W3C Cognitive and Learning Disabilities accessibility guidance  
  https://www.w3.org/WAI/people-use-web/abilities-barriers/cognitive/
- W3C white-space cognitive accessibility pattern  
  https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p10-whitespace/
- W3C text spacing guidance  
  https://www.w3.org/WAI/WCAG21/Understanding/text-spacing
- MDN `prefers-reduced-motion` / animation accessibility guidance  
  https://developer.mozilla.org/
- W3C dyslexia/cognitive research material, used as supplemental rather than normative WCAG.

## 54.3 Performance and motion

- web.dev Core Web Vitals  
  https://web.dev/articles/vitals
- MDN View Transition API  
  https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- MDN Web Animations API  
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API
- Figma engineering material on frontend/perceived performance and direct-manipulation responsiveness.

## 54.4 Design systems and high-quality product UI

- Vercel Web Interface Guidelines / Geist design system.
- Linear product and design-system patterns.
- Stripe Dashboard / Stripe design-system practices.
- Figma product interaction patterns.
- Raycast.
- Notion.
- GitHub.
- Attio.
- Arc.
- Material 3 Expressive / Google product-system work.
- Webby 2026 Best UI / Best UX / Best Navigation / app UX award lists, used as supporting external recognition rather than an objective design ranking.
- Cross-product design-system and product-design case-study collections covering Linear, Stripe, Figma, Raycast, Notion, Vercel and related products.

## 54.5 Typography

- GitHub Mona Sans official repository  
  https://github.com/github/mona-sans
- IBM Design Language — IBM Plex  
  https://www.ibm.com/design/language/typography/typeface/

Mona Sans is recommended because the official project provides variable weight, width, optical size and italic axes, enabling a deliberately tuned product voice while retaining a single efficient variable family.

## 54.6 Staff/principal frontend engineering expectations

Research reviewed current staff-level frontend/design-system role descriptions and engineering guidance from companies including:
- Pleo;
- Aave;
- Verkada;
- Trading 212;
- other senior design-system/frontend platform roles.

Repeated expectations included:
- design-system ownership;
- shared architecture;
- accessibility;
- performance;
- component/API quality;
- visual regression;
- developer experience;
- state and data-flow architecture;
- hands-on technical leadership;
- product judgement;
- simplifying complex workflows.

These expectations inform the engineering-governance sections of this document.

---

# 55. Final design contract

AI Operations should not look impressive because it contains more effects than other software.

It should look impressive because:

- the right information appears at the right time;
- everything unnecessary is quiet;
- state changes are understandable;
- typography feels intentional;
- whitespace makes complexity breathable;
- controls respond immediately;
- evidence is always reachable;
- agent activity feels present but not distracting;
- every manager belongs to one coherent system;
- the application is unusually polished in both common and edge states;
- the system can be operated quickly with keyboard or pointer;
- light mode feels refined;
- dark mode feels deliberate;
- accessibility is invisible until the user needs it;
- the interface gets out of the way of decisions.

The defining aesthetic is not “AI”.

The defining aesthetic is:

> **A calm, living control plane for genuinely capable software.**

Any frontend implementation that is functionally complete but visually generic, cognitively noisy, gratuitously animated, or recognisably AI-template-derived is **not complete**.

