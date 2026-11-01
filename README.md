# Caddie

A private loop book for Gabe. Log every round, what you were paid, and how each player likes to play. It is a static site — HTML, CSS, and vanilla JavaScript — with no build step and no server. Everything you type stays in this phone’s browser.

Open it in Safari, then add it to the Home Screen. After the first visit it works offline.

**https://gabrielgangon-oss.github.io/caddie-app/**

## On an iPhone

1. Open the link above in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open Caddie from the icon. The first launch caches the app so later rounds work with no signal.

## What’s inside

- **Loop** — single bag, double bag, or forecaddie (2–12 players). Date, course, 9 or 18, base pay, tip, total, paid or unpaid, and round notes. Recent courses are one tap. Players can be picked from the roster or added on the spot. Their notes sit in the form before you go to the first tee.
- **Recent** — loops newest first, grouped by month. Mark a loop paid in one tap. Open one to edit or delete it.
- **Roster** — member or guest, handicap, and notes for club selection and yardages, green reading, pace and personality, drinks and snacks, tipping, and anything else. The player page leads with those notes, then loops together, total earned, and average tip.
- **Revenue** — net income after expenses, income for this week, this month, and the year, base pay, tips, expenses, a tax set-aside (25% until you change it), a month-by-month table with a running total, an earnings chart, averages, what you’re still owed, and the players you’ve earned the most with. Expenses can be logged, edited, and deleted.
- **Settings** — your name for the greeting, the tax percent, a full JSON backup, CSV of loops, CSV of expenses, and a two-step erase.

Money is stored in cents. There is no sample data; a new install is empty.

## GitHub Pages

The site is the repository root. Pages is set to **Deploy from a branch**, **main**, **/ (root)**. `.nojekyll` keeps Jekyll from rewriting the files. A push to `main` publishes on its own.

## Credits

Course photograph: [Alan Hughes](https://commons.wikimedia.org/wiki/File:Southerndown_Golf_Club_-_2nd_green_(geograph_6274427).jpg), *Southerndown Golf Club — 2nd green* (geograph.org.uk, photo 6274427). Licensed under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The copy in `images/course.jpg` was resized and JPEG-compressed so it can ship with the app (under 300 KB). That image file remains under CC BY-SA 2.0. On screen it sits under a navy blur.

Type: [Plus Jakarta Sans](https://github.com/google/fonts/tree/main/ofl/plusjakartasans) by Tokotype, used under the SIL Open Font License. See `fonts/OFL.txt`.
