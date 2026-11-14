/* ============================================================================
   ELSEWHERE — catalogue.js
   This is the file you edit and commit. Whatever is written here is what every
   visitor sees. There is no database.

   WHO CAN ADD OR REMOVE SITES
   ---------------------------------------------------------------------------
   "ownerEmailHash" is the SHA-256 of the owner's email address, lowercased.
   Only that account can add, edit or remove sites; every other visitor can
   browse, search, rate and write notes, and nothing else. The address is
   stored as a hash so your email is not published in this public file.

   Change the owner: put your address in "ownerEmail" (plain text, simplest),
   or generate a new hash and put it in "ownerEmailHash". If you fill
   "ownerEmail", it wins over the hash.

   Leave BOTH empty and the first account created becomes the owner — fine
   while testing, unsafe once the site is public.

   An owner account is never created twice. If you lock yourself out, empty
   these fields, commit, clear the site's data in your browser and sign up
   again.
   ---------------------------------------------------------------------------
   CURRENT STATE: all 16 categories are in place and EMPTY on purpose.
   Fill them from the site itself:
       avatar → Admin studio → Add / Edit → Save site        (one at a time)
       avatar → Admin studio → Bulk import                   (many at once)
   then: Admin studio → Publish → Download catalogue.js → replace this file.
   ---------------------------------------------------------------------------
   Adding a row by hand works too. One object in "sites":

     {
       "id": "my-site",                  // unique, lowercase, no spaces
       "name": "My Site",
       "category": "anime",              // must match an id in "categories"
       "link": "https://example.com",    // never shown to visitors
       "description": "What it is actually good for.",
       "issues": "The honest catch, if there is one.",
       "featured": false,
       "image": ""                       // optional cover art URL
     }

   Adding a category: copy an existing object in "categories" and change
   id / name / accent / blurb. Nav, drawer, rails and the admin dropdown all
   pick it up automatically.
   ========================================================================== */

window.ELSEWHERE_CATALOGUE = {
  "ownerEmailHash": "c3fc23d71ede6da0c24d39ebbd30f2e2f61015e25fc5e2264494ef8201565a02",
  "ownerEmail": "",
  "updated": "2026-11-14",
  "categories": [
    {
      "id": "gamestores",
      "name": "Games & Stores",
      "accent": "#7c8cff",
      "blurb": "Where PC and console games are sold, tracked and fixed."
    },
    {
      "id": "movies",
      "name": "Movies & TV",
      "accent": "#ffb020",
      "blurb": "What to watch, where it streams, and who actually made it."
    },
    {
      "id": "anime",
      "name": "Anime",
      "accent": "#f472b6",
      "blurb": "Seasonal simulcasts, tracking and twenty years of database."
    },
    {
      "id": "cartoons",
      "name": "Cartoons & Animation",
      "accent": "#ffd166",
      "blurb": "From public-domain classics to this season's studio work."
    },
    {
      "id": "manga",
      "name": "Manga",
      "accent": "#c084fc",
      "blurb": "Official chapters, release tracking and publisher apps."
    },
    {
      "id": "comics",
      "name": "Comics",
      "accent": "#ff6a00",
      "blurb": "Big-two archives, public-domain golden age, and webcomics."
    },
    {
      "id": "tech",
      "name": "Tech & Hardware",
      "accent": "#28c2a0",
      "blurb": "Benchmarks, teardowns and repair guides."
    },
    {
      "id": "ai",
      "name": "AI Tools",
      "accent": "#a78bfa",
      "blurb": "Assistants, open models and the places to run them locally."
    },
    {
      "id": "privacy",
      "name": "Adblock & Privacy",
      "accent": "#2dd4bf",
      "blurb": "Block the ads, kill the trackers, check the damage."
    },
    {
      "id": "downloads",
      "name": "Torrents & Downloads",
      "accent": "#60a5fa",
      "blurb": "Clients and legal trackers for big files."
    },
    {
      "id": "freegames",
      "name": "Free Games & Demos",
      "accent": "#4ade80",
      "blurb": "Zero-cost games that are not demos of a store."
    },
    {
      "id": "sport-football",
      "name": "Football",
      "accent": "#22c55e",
      "blurb": "Live scores, transfers and official free streams."
    },
    {
      "id": "sport-cricket",
      "name": "Cricket",
      "accent": "#f59e0b",
      "blurb": "Ball-by-ball, every league, plus the records."
    },
    {
      "id": "sport-basketball",
      "name": "Basketball",
      "accent": "#fb7185",
      "blurb": "Stats, salaries and free highlights."
    },
    {
      "id": "sport-tennis",
      "name": "Tennis",
      "accent": "#a3e635",
      "blurb": "Draws, rankings and the deep data."
    },
    {
      "id": "sport-motorsport",
      "name": "Motorsport",
      "accent": "#ef4444",
      "blurb": "F1, MotoGP, WEC and the timing screens."
    }
  ],
  "sites": []
};
