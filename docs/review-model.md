# Review model & study settings

Business logic for Languee's spaced-repetition review system. Design agreed
2026-08-02; implementation lands across PRs A–F (see [Rollout](#rollout)).

## Core model: item-centric cards, decks as grouping

- **The card (node) is the scheduled unit.** Each card carries its own FSRS state and
  is scheduled independently. This is the item-centric model (as in SuperMemo and
  RemNote), not Anki's deck-exclusive model.
- **Decks are grouping sugar over cards** — a view/tag layer with no scheduling
  ownership. A word can belong to multiple decks and is still reviewed **once**:
  reviewing it through any deck advances its single per-card schedule, and it then
  drops out of every other deck's queue for that cycle.

See `.lab/tilr/spaced-repetition.md` for the rationale (item-centric vs deck-centric
scheduling and why reset semantics must follow the scheduling model).

## Cards generated per word

A saved word generates up to **three card types, each independently scheduled**:

| # | Card | Prompt | Answer | Grading |
|---|------|--------|--------|---------|
| 1 | **Existing card** | masked sentence with the lemma hidden | type-in the word | as today |
| 2 | **Inflection card** | the word's paradigm | type-in **all** forms, then reveal | self-rate (Again/Hard/Good/Easy) |
| 3 | **Definition card** | lemma + part of speech | recall the meaning, then reveal | self-rate |

- The **inflection card** is **one per lemma+POS** (forms are lemma-level, shared across
  senses), and is generated only when the word actually inflects. It is a single combined
  card covering the whole paradigm on one schedule — not one card per form.
- The **definition card** is **one per saved sense**. When a lemma has multiple saved
  senses, each has its own definition card.

### Definition-card hints

Optional, tappable, with **no effect on scheduling** (grading is self-assessed):

- **Hint 1** — shown only when the user has **≥2 saved senses** of the lemma. Lists short
  glosses of the user's *other* senses so the target can be identified by elimination.
  The gloss is derived by truncating the stored definition (no new data).
- **Hint 2** — shows the lemma **in context**: the user's captured sentence
  (`Card.context`) if present, otherwise the dictionary example (`Definition.example`).

## Reviews & decks

- **Tap a deck → start its review.** **Long-press a deck → context menu** `{ Browse,
  Settings }`. There is **no deck-level reset** (see [Forget](#forget-reset)).
- **Daily caps** (per-deck, delivered via [presets](#settings--presets)): a **new** cap and
  a **review** cap.
  - **"New" means never-reviewed globally.** Once a card is reviewed in any deck it is
    never counted as new again in any deck.
  - The **review cap counts reviews actually performed in that deck's session.** A card
    completed via another deck simply disappears from this deck's queue and does **not**
    consume the cap, so the deck backfills with the next due card that the cap would
    otherwise have deferred.
- **New:review ratio** — the suggested default keeps new introductions at roughly **1
  new per 10 reviews**. Setting a more aggressive ratio raises a **soft warning** but is
  **not blocked** (advise, don't block).

## Suspend

- **Per-card suspend** — hide an individual card from future reviews. Independent of the
  word's other cards; **keeps** the card's scheduling progress (it is hidden, not reset).
- **Per-type suspend (account-global)** — hide a whole card type from reviews:
  - **Inflection cards:** three-way — **show all** / **hide regular** (show only
    irregular words) / **hide all**. "Regular vs irregular" is driven off the NLP's
    existing irregularity signal.
  - **Other types:** on/off.

## Forget (reset)

Forget wipes a card's scheduling progress so it is relearned from scratch.

- **Granularity:** per-card, plus a **"forget all cards for this word"** shortcut. There
  is **no global reset**.
- **What it does:** clears the card's FSRS state (back to *new*) but **keeps the
  `ReviewLog`** — the review history is FSRS training data and the audit trail, so it is
  never deleted (equivalent to Anki's "Forget"; `ts-fsrs` exposes `forget()`).
- **Advisory:** forgetting is discouraged; the confirmation points the user to lowering
  the daily cap as the non-destructive way to handle a backlog.
- **Entry points:** browse → item detail; an overflow action during review; and
  bulk multi-select in browse.

## Settings & presets

- **Named presets** bundle **per-deck** review settings only: **new cap**, **review
  cap**, and **ratio** behavior. A preset is applied to one or more decks.
- **Card-type visibility** (the per-type suspend above, including the inflection
  three-way) is **account-global** — it is *not* part of presets.

Defaults (pending final confirmation): presets are **live-linked** (editing a preset
updates every deck using it, Anki-style); the three cards generated from one word are
**sibling-buried** so they do not all surface on the same day.

## Rollout

Implementation is split into focused PRs on `bb_develop`:

| PR | Scope | Services |
|----|-------|----------|
| A | Human-readable inflection-form labels | languee-droid |
| B | Deck tap → review, browse via long-press | languee-droid |
| C | Three-card model + scheduling engine/schema | languee-back, languee-droid |
| D | Definition-card hints | languee-back, languee-droid |
| E | Suspend + forget (keeps review log) | languee-back, languee-droid |
| F | Daily caps + presets + 1:10 warning | languee-back, languee-droid |

PR C is the keystone; D, E, and F build on the new card model. A and B are independent.
