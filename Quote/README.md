# Quote

A quote of the day, with a bold quote and smaller author fitted together using smd-big-text. The Change quote menu action advances the shared selection immediately. Display settings use the standard shared controls and Atkinson Hyperlegible Next by default.

## Selection and sharing

shared/js/smd-quotes.js owns quote_daily in localStorage: {counter, day}. day is a local calendar-day ordinal; elapsed days advance the counter and counter modulo the dataset length selects a quote. Missed days, local midnight, daylight saving changes, focus/resume and other-tab storage changes are handled. Moving the clock backwards does not count a day twice.

PlanMyDay and CountMyDays each store their own namespaced showQuote flag, default false. Their shared smd-quote cards subscribe to the same selection. Changing the quote does not change either app's visibility preference.

## Data provenance

quotes.json contains 4,292 quotes: 50 from the supplied ZenQuotes dataset and 4,242 from the supplied Goodreads JSONL export. The original renderer was found at P:/git/display/display/src/app/quotes/quotes.js.

The inputs contained 4,312 records. Twenty exact or near duplicates were removed. Matching ignores case, punctuation, typographic quotes, accents and spacing. For quotes of at least 50 normalized characters, minor wording variants by the same normalized author are matched within 4% edit distance. ZenQuotes records are processed first and retain their wording, author and sole source credit. Distinct wording is retained. The merged JSON was verified before quotes.jsonl was deleted.

Each record has q (quote), a (author), c (character count), h (legacy HTML), and sources (zenquotes or goodreads). Rendering uses safe plain text, never h. Credits read Quote from ZenQuotes or Quote from Goodreads and link to the provider.

## Shared components

Load shared/js/smd-quotes.js before shared/js/components/smd-quote.js. A smd-quote element renders the current selection as a standard themed card and unsubscribes when removed.

For fitted styled text, smd-big-text.lines accepts [{text, scale, weight, style, gap}]. All blocks scale together; value restores plain-text mode. The host needs a definite available height.
