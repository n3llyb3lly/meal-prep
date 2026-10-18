# Recipe pages for the photo and steps tests

Each page keeps only what the photo and steps reader looks at: the `<title>`, the
`application/ld+json` blocks and a little body text. Images and every other script are removed.

The recipe sites could not be reached from the machine that wrote these, so the pages are written to
match the JSON-LD each kind of site publishes (WP Recipe Maker with a Yoast `@graph`, Dotdash/Allrecipes,
Tasty Recipes, a plain block with one long string) rather than downloaded. Swap in saved real pages when
there are some; `test/recipe-steps.test.js` lists what each one should give.
