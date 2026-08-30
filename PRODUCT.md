# Garden Designer — product description

A prototype of a garden-design simulation for semi-professional garden designers.
You draw a plot, plant it, and then move the garden through time: the hour of the
day, the week of the year, and the next twenty years of growth. The drawing
answers back — shadows swing round and lengthen, the light warms towards evening,
leaves arrive and colour and fall, and the planting grows up until a whip of a
birch is a tree that shades half the garden.

This document is about the product: where it came from, who it is for, what it
does, what was deliberately left out, and what it is meant to find out. For
running the code, see [`README.md`](README.md).

---

## Where it came from

The brief that started this asked for a browser-launchable prototype of a garden
design simulation app, to support **ideation and early testing of garden ideas**,
and to be **tested with gardeners for feedback**. In its own terms it asked for:

- a plot of land drawn on a canvas
- a drag-and-drop **plant library**, listing plants by **English and Latin name**,
  categorised by genus, family, type, colour, size and variety
- plants drawn in a **sketchy line-art style, with colour**
- plants that can be **moved around the plot**
- the ability to say **where north is**, **where on the globe** the garden is, and
  **how high above sea level** — so that weather and seasonal conditions can be
  simulated
- **sliders for time of day, time of year, and age of the garden out to twenty
  years**
- a design that **reacts to those sliders**: plants changing size, colour and
  shape; shadows moving and the light warming and cooling through the day; leaves
  dropping or staying green and autumn colour arriving with the season; plants
  growing according to their annual growth rate over the years

Soil type and suitability alerts were named as a later step.

Two constraints did more to shape the result than any of the features:

> *"Limit the library to a few representative plants, but do research on them."*

> *"I want to test the depth of interaction with this application idea rather
> than make it comprehensive."*

That is a decision about what the prototype is for. It is not a plant database
with a viewer attached; it is a simulation with just enough plants to exercise
it. Everything below follows from taking that seriously.

A few open questions were settled before building:

| Question | Decision |
|---|---|
| Which views? | Plan view as the main canvas, with an elevation strip beneath it |
| How delivered? | A repo app to iterate on, **and** a single self-contained HTML file to send to testers |
| Where in the world? | UK / north-west Europe, London by default, metric throughout |
| Which optional extras? | The sun/shade overlay only — soil alerts, save/load and a plant info panel were cut |

Everything after that came from using it: ten plants became thirty and then a
hundred and fifty-two, plus a phone layout, a 360° view from inside the
garden, adjustable eye height, duplicating a plant in place, undo, and filtering
the library by growing conditions.

## Who it is for

Semi-professional garden designers, at the stage where an idea is still soft —
working out where the tree goes, whether the terrace will still get evening sun
in ten years, what the border does in February. Not a documentation or
specification tool, and not for the finished planting plan.

## The problem it addresses

A planting plan is a drawing of a single instant, and that instant is never the
one that matters. It is drawn at nursery size on a summer's day, and everything
a client actually asks about is somewhere else in time:

- *What does it look like in October?*
- *Will that tree shade the terrace at breakfast?*
- *How big is this in ten years?*
- *Is there anything there at all in January?*

Those questions get answered from experience and imagination, and they get
answered differently by the designer and by the client, who are not picturing the
same garden. This prototype tries to put the answer on screen, so the two of them
are looking at the same thing and can disagree about something real.

## Principles

**Depth over breadth first.** The palette began at ten plants deeply simulated
rather than a hundred stubs, and grew to a hundred and fifty-two as testing
demanded specific plants. The rule has not changed: every entry is researched
rather than invented, and carries a source link. What breadth buys is that a
designer can look for the plant they actually had in mind; what depth buys is
that it behaves correctly when they find it.

**Real models, not plausible fakes.** The sun is the NOAA solar position
algorithm, not a sine wave — because a gardener will spot a fake sun immediately,
and because a real one makes latitude, altitude and the north dial genuinely
consequential rather than decorative. The same goes for growth curves and leafing
dates.

**Honest about what it does not know.** Where the model simplifies, it is written
down (see *Known trade-offs*) rather than smoothed over.

---

## What it does

### Three ways of looking at the garden

**Plan** — the main canvas. Plot outline, metre grid, scale bar, north arrow,
plant footprints and cast shadows.

**Elevation** — a measured slice through the plan, taken along a sight line you
can drag to either end. Plants in the band are drawn side-on against a height
ruler, depth-sorted. This is where height, silhouette, leaf-drop and autumn
colour are legible.

**360°** — an eye placed anywhere on the plan, which you drag to turn and tilt.
Plan and elevation are both drawings; this is the first view that answers what a
client actually asks — *what will it look like from the terrace* — and it is a
genuinely different projection, where distance matters and a shrub two metres
away can hide a tree twenty metres off. Eye level is adjustable, from a
seven-year-old to a tall adult, with a separate ground offset for a raised
terrace or an upstairs window.

### The plant library

A hundred and fifty-two plants, searchable by common name, Latin name, genus
or family, each card showing both names, mature dimensions, foliage type and a
sketch thumbnail. Drag onto the plan to place; on a phone, tap to drop one in the
middle and then drag it into position.

A **planted count** on each card shows how many of that plant are already on the
plan, and clicking it steps the selection through them.

Filtering runs on six axes. Type and a *Planted* toggle stay visible; the rest
fold behind a **Growing conditions** disclosure:

| Axis | Values |
|---|---|
| Type | trees · shrubs · conifers · climbers · grasses · ferns · perennials · bulbs · annuals |
| Aspect | full sun · dappled shade · semi shade · shade |
| Soil type | clay · loam · sand · chalk |
| Soil pH | acidic · neutral · alkaline |
| Drainage | free draining · water retentive · waterlogged · bog · pond |
| Foliage | deciduous · evergreen · dies back |

Chips that would empty the list are **dimmed rather than hidden**, given the
filters already set. That admits honestly where the palette is thin — *pond*
still matches nothing, because there is no true aquatic here yet — and it
surfaces real horticulture: choose dappled shade and chalk together and the
*Trees* chip thins right out, because most of the dappled-tolerant trees here are
lime-haters.

Dappled shade is treated as a category in its own right, not a midpoint between
sun and shade. It is the moving, broken light under a deciduous canopy, and it is
what a hellebore or a Japanese maple actually wants rather than merely tolerates.

### Placing and editing

Drag to place, drag to move. Right-click a plant — long-press on a touchscreen —
for **Add another**, which plants a second of the same kind just beside it, or
⌘/Ctrl-D on the selection. Planting is done in threes and fives rather than ones.
The copy gets fresh randomness, so it is a second plant of the same kind rather
than a clone of the same individual.

**Undo** is ⌘/Ctrl-Z, redo ⇧⌘Z or Ctrl-Y, with buttons in the header that name
what they will undo. It covers the design — planting and the plot outline — and
not the view: scrubbing to April or turning to face west are not edits, and
including them would bury a deleted border under a scrub of the season slider.

### Walls and raised beds

Two built things can be drawn on the plan. A **wall** is a run of points with a
height and a thickness — a garden wall, or a solid fence, which is the same thing
thinner. A **raised bed** is a closed outline with a low height.

Both are part of the simulation rather than marks on a drawing, which was the
decision that shaped the work:

- **A wall casts a real shadow.** It is stepped across the sun map with
  everything else, as an opaque swept footprint rather than a dappled canopy. A
  1.8 m south boundary wall takes a measurable share of a small garden's light,
  and takes far more of it in December than in June — which is exactly the
  question a designer has about the bed in front of it.
- **A wall blocks the 360° view.** It is depth-sorted with the planting, so it
  hides what is behind it and is hidden by what is in front. This is the view
  where a boundary wall stops being a line and becomes the thing you are looking
  at from the terrace.
- **A raised bed lifts what grows in it.** A plant standing in one is drawn from
  the top of the bed in the elevation and the 360° view, and casts its shadow
  from there — longer, and starting further out. A bed that raised nothing would
  be decoration.

Height is adjustable per structure and is where the interest is: it is the one
number that decides both the shadow and what you can see over. A wall runs from
0.2 m to 4 m, a bed from 10 cm to 1.2 m — above which it is a terrace wall and
should be drawn as one.

### Saving a design

Designs are saved as named projects, with Save, Save as copy, New, rename,
Open and Delete. A marker in the header shows when there are unsaved changes,
and ⌘/Ctrl-S saves over the open design.

A design can also be **exported to a JSON file and imported back**, which is what
carries it between machines — laptop to phone, or a tester's garden back to the
designer — since saved projects otherwise never leave the browser they were made
in. An imported design arrives unsaved, so Save is what adopts it onto that
device. The file is indented rather than minified: a designer who opens one in a
text editor should be able to read it.

A saved design is the plot, the planting and the site — not the time of day, the
season, or where you are standing. The same reasoning as undo: those are ways of
looking at a design rather than parts of one, and reopening a garden to find the
clock wound back to whenever it was saved would be a surprise rather than a
restoration.

Two failures are handled explicitly rather than left to chance, because both are
silent until they are not:

- **A plant that is no longer in the library.** Looking a species up throws on an
  unknown id, and there is no error boundary, so an unfiltered load would not
  lose one plant — it would white-screen the app, and would do it again on every
  reload, with the bad data still in storage and no way back through the
  interface. Unknown plants are dropped at the load boundary and counted, and the
  app says *"2 plants could not be restored"*. No id has ever been renamed or
  removed in this project's history, but curating the palette down is an open
  question above, and that edit is exactly the one this guards against.
- **A design saved by a newer version.** Saves carry a version stamp, and a file
  from the future is refused in words rather than guessed at — guessing is how a
  newer design gets silently truncated to an older shape and then saved back.

An imported file is the first genuinely untrusted input the app accepts: it has
been off the machine, may have been edited by hand, and may have been written by
another version. It therefore goes through exactly the same boundary as a stored
design rather than a second, more trusting path written for the occasion — so
every guard above applies to it automatically.

### Buying a plant in part-grown

A plant can go in as **nursery stock** or as a **ten-year-old specimen**, chosen
before it is placed. A specimen carries ten years of growth from the day the
garden goes in and stays that far ahead for the whole life of the design — so at
year 0 it is already a tree with everything around it still a whip, and at year
20 it is a thirty-year-old.

This is per plant rather than per garden on purpose. The garden-wide version of
it is the age slider, which already exists; what this adds is the thing a
designer actually does, which is buy structure in for one or two key plants and
let the rest catch up. It is also the honest way to show what that money buys:
the specimen shades the terrace on day one, and the shade map says so.

### The site

North set by a draggable dial, latitude and longitude by UK preset (London,
Bristol, Manchester, Edinburgh, Penzance, Aviemore) or free entry, and altitude
in metres. A live readout gives sun altitude and compass direction, sunrise,
sunset and daylight hours, and says how the growing season shifts relative to
London.

### Time

Three sliders — time of day, time of year, age of garden out to twenty years —
with a combined readout and a button that runs the day. Everything on all three
canvases is a function of those three numbers and the site, so nothing is ever
out of step with anything else.

### Sun and shade

An overlay that walks the sun across the sky and accumulates how much direct sun
each quarter-metre of the plot receives on that day, banded into the vocabulary
designers use: full sun, partial shade, shade, with the percentage of the plot in
each.

### On a phone

The page never scrolls on a phone, deliberately. Published as an artifact it
lives inside a sheet in a host app, and a swipe past the end of the document
chains upward and reads as a dismiss — the pane closes underneath you mid-gesture.
So the phone layout fits the viewport exactly, with the library and site settings
as sheets that slide up over the canvas and scroll internally.

---

## What is simulated, and why a designer can trust it

**Sun position.** The NOAA solar position equations — fractional year, equation
of time, declination, hour angle, then altitude and azimuth. Sunrise and sunset
come out within a couple of minutes of published times, and the tests check that
against London figures rather than against the code's own output. At London the
noon sun reaches about 62° at midsummer and about 15° at midwinter, so the same
tree throws a shadow roughly four times longer in December than in June, for
free. British Summer Time is applied on the UK/EU rule, so a June evening still
has sun at 21:00.

**Light colour.** Sun altitude sets a colour temperature, from about 1900 K at
the horizon to 5800 K high. Hue and brightness are applied separately — the tint
is whichever light is falling on a surface, the beam in sun or the blue sky in
shadow, normalised so that it only shifts colour, with brightness applied on top.

**Growth.** A logistic curve from nursery stock to mature size, with height and
spread on separate curves, which reproduces the familiar habit of a young tree
shooting upward for a decade before broadening out. Clipped subjects like the yew
gain a fixed amount each year and then stop, because somebody is cutting them.
Where a nursery gives a realistic twenty-year size well below the RHS *ultimate*
figure, the curve is tuned to hit the twenty-year number, since that is the range
the slider covers.

![Mid-October at twenty years: the birch gone yellow, the maple scarlet, and a 17° sun throwing shadows clear off the plot](docs/img/plan-october-year20.png)

**Phenology.** Day-of-year anchors per species — bud burst, full leaf, autumn
onset, leaf fall, flowering — smoothed into a continuous phase. Anchors shift
with the site using Hopkins' bioclimatic law: spring about four days later per
degree of latitude north and per 120 m of altitude, autumn the other way. Put the
same garden 400 m up and bud burst slips a fortnight while leaf fall comes a
fortnight early. This is what makes the altitude field do real work.

**Sun and shade.** The sun is stepped across the sky and every canopy projected
onto the ground, accumulating light per cell over the whole daylight window.
Walls and raised beds cast into the same map, as opaque swept footprints rather
than ellipses — a solid thing, not a dappled one.

## The plant palette

A hundred and fifty-two plants, chosen to span the axes the simulation
exercises — vigorous to slow, evergreen to fully dormant, sun to deep shade, tree
to groundcover, and now bulb, fern and climber as well.

| Type | Count | Examples |
|---|---|---|
| Trees | 20 | birch, snowy mespilus, Japanese maple, magnolia, crab apple, apple, wild cherry, beech, hornbeam |
| Shrubs | 41 | hydrangeas, lavender, roses, rhododendron, tamarisk, witch hazel, daphne, cistus, sarcococca, mahonia, box |
| Conifers | 2 | clipped yew, dwarf mountain pine |
| Climbers | 10 | clematis (montana, armandii, viticella), ivy, Japanese honeysuckle, passion flower, crimson glory vine, star jasmine, winter jasmine |
| Grasses | 14 | miscanthus, molinia, calamagrostis, stipa, pennisetum, Mexican feather grass, deschampsia |
| Ferns | 2 | male fern, soft tree fern |
| Perennials | 51 | hellebore, hosta, epimedium, lungwort, London pride, hollyhock, giant viper's bugloss, euphorbia, geranium, aster, peony, dahlia, delphinium |
| Bulbs | 9 | snowdrop, cyclamen, narcissus, allium, tree lily |
| Annuals | 3 | cosmos, love-in-a-mist, marigold |

Several exist to exercise a specific behaviour, and it is worth knowing which,
because each is a case where a naive implementation silently does nothing rather
than failing loudly:

| Plant | What it exercises |
|---|---|
| Saucer magnolia | flowers on completely bare wood, weeks before a leaf |
| Laurustinus | a flowering window that crosses the new year (November–April) |
| Dogwood 'Midwinter Fire' | grown for the colour of its leafless stems |
| Crab apple, rowan | fruit still held long after leaf fall |
| Ornamental onion | a bulb: dormant in high summer, not in winter |
| Cosmos | an annual — the same size in year 20 as in year 1 |
| Giant oat grass | evergreen foliage *and* standing winter seedheads at once |
| Cider gum | the fastest grower here, and evergreen, so it shades in winter too |
| Winter jasmine | yellow flower on bare stems in January, on a support rather than a trunk |
| Soft tree fern | almost all trunk, at two or three centimetres of growth a year |
| Houttuynia | the only plant here that will grow at a pond margin |
| Foxglove | a biennial, which the age slider cannot honestly represent at all |
| Ivy | flowers in October and fruits through winter — the calendar the other way up |
| Rhododendron | acid soil or nothing: the one plant here chalk rules out completely |
| Giant viper's bugloss | monocarpic — a rosette for a year or two, then one spire, then dead |
| Apple | a grafted tree, where the rootstock and not the variety decides the size |
| Lungwort | flowers open pink and age blue, so one plant carries both at once |
| Burnet rose | black hips, which almost no other rose has |

### The shapes they are drawn with

Twelve plant forms, because a plant drawn in the wrong shape is worse than not
drawn: a rounded crown, a multi-stem, a clipped column, a dense mound, a grass
tussock, a leafy clump, see-through airy stems, an allium globe, a flower spire
over basal leaves, a fern shuttlecock, a tree fern on its trunk, and a climber
drawn as a sheet of leaf on a trellis rather than a mass on a trunk.

The climber is the one worth explaining. Its recorded spread is *how wide a face
it covers*, not how far it stands off its support — so it is drawn in plan as a
shallow band rather than a disc, and in elevation against a faint trellis. Without
that trellis a clematis reads as a small multi-stemmed tree, which is exactly what
a mass of leaf on stems looks like.

---

## Deliberately not built

**Suitability alerts.** The plant data now carries aspect, soil pH, soil type,
drainage and a hardiness rating, and the library filters on all of them — so you
can find plants for a chalky, dry, shady corner. What does *not* exist is the
other direction: nothing warns you when a plant already on the plan is in the
wrong place. That is the obvious next step, and the data is ready for it. The
palette now contains genuinely borderline subjects for it to have something to
say about — mānuka and pink jasmine at H2–H3, a tree fern that needs wrapping,
and a dahlia whose tubers will not survive a frost in the ground.

**A plant info panel.** Cards carry names and dimensions; there is no deeper
per-plant page. Cut to keep the focus on the simulation.

## Known trade-offs

- **The elevation strip has empty sky either side.** Its scale is uniform in both
  directions, so once there is a 14 m tree in a 13 m slice, the vertical is the
  binding constraint and the content cannot fill a short wide strip without
  distorting the drawing. The Compact / Normal / Tall control raises the shared
  scale, which fills the width as a side effect.
- **"Hours of direct sun" counts partial transmission proportionally.** A cell
  under a bare birch that passes 78% of the light accrues 0.78 h per hour. That is
  a reasonable reading of dappled shade, but it is not the strict horticultural
  definition of unobstructed hours.
- **Band thresholds scale on short days.** "Full sun means six hours" is a
  growing-season convention; six hours of an eight-hour December day is 72% of all
  available light, so the thresholds are capped at a share of daylight and the
  legend says so when that applies.
- **A climber still has no wall to climb.** Walls and raised beds now exist, but
  nothing connects a climber to one: a clematis is drawn against its implied
  trellis wherever it is placed, whether or not there is a wall behind it.
  Attaching a climber to a structure is the obvious next step and is not built.
  There are still no pergolas, houses or overhead structures of any kind.
- **Winter-growing plants are approximated.** Phenology anchors run within one
  calendar year, so a cyclamen whose leaves appear in November and die back in
  May is shown with foliage from January instead. It is right for eight months of
  the twelve and wrong for the other four, and the plant's notes say so.
- **A biennial is modelled as a perennial.** Foxglove flowers in its second year
  and dies; the age slider carries it on indefinitely. A self-seeding colony does
  persist, so the picture is defensible, but the individual plant is not.
- **Light, not lighting.** Plants are lit as flat tinted shapes. There is no
  self-shading, no shadow cast by one plant onto another's foliage in elevation,
  and no cloud, rain, wind or frost — "weather" here means the sun and the season,
  not the forecast.
- **Pond still matches nothing.** Houttuynia now answers the bog end of the
  drainage axis, but there is no true aquatic in the palette, so the wettest chip
  remains dimmed.
- **A bought-in specimen never sulks.** A plant placed at ten years old is put
  straight onto the curve of one grown on site for ten years, and grows on from
  there. Real semi-mature transplants check badly: they sit and recover for
  several seasons, sometimes never catch up with a smaller plant put in beside
  them, and are far likelier to fail outright. None of that is modelled, so the
  age option shows the size a specimen is bought at rather than the risk it
  carries.
- **A wall is a flat, solid, opaque plane.** No thickness in elevation beyond a
  drawn coping, no openings, no gates, no gaps between boards, and no light
  through or around anything. A close-boarded fence and a brick wall behave
  identically, and a slatted screen — which a designer would reach for precisely
  because it filters rather than blocks — cannot be represented at all.
- **Nothing sits on top of a structure.** A plant is raised by a bed it stands
  in, but nothing can be placed on a wall, and there is no planting in the face
  of one. The ground under a wall is treated as shaded rather than as unplantable.
- **Saved projects stay on one device; a file is how they move.** Projects live
  in the browser's own storage, which is what lets saving work with no backend at
  all — but they are per-browser and per-device, and they are gone if site data is
  cleared. Export and import carry a design between machines, and are the only way
  a tester's garden reaches anyone else. A share link encoding the design in the
  URL fragment would do the same without the file step, and is not built.
- **Export takes two different routes, and neither is guaranteed.** On an
  ordinary page it is a download link. Published as an artifact the page is
  framed in a sandbox that never lets a page start its own download, so it asks
  the host instead, and the viewer confirms each save and may decline. The app
  prefers whichever route exists and reports only what actually happened — the
  one outcome ruled out is claiming to have written a file that was never
  written.
- **UK and north-west Europe.** The solar maths is global, but the plant palette,
  the phenology baselines and the summer-time rule are not.

---

## What testing with gardeners should settle

The prototype exists to answer questions about the idea, not about the code:

1. **Is scrubbing time the right interaction?** Does moving through the day, the
   year and twenty years tell a designer something they did not already know, or
   is it a novelty that wears off in a minute?
2. **Which view earns its place?** Plan, elevation and 360° are three answers to
   *what will this look like*. Early signs are that the 360° view is the one that
   makes people stop talking about the drawing and start talking about the garden
   — but that needs testing, not assuming.
3. **Is a hundred and fifty-two plants the right size?** The palette started
   at ten on a depth-over-breadth argument and grew four-fold because testing
   kept asking for specific plants. The open question is now the opposite one:
   whether a list this long is harder to work with than a curated short one, and
   whether the filters carry the weight the scrolling no longer does.
4. **Is the sun/shade map read as analysis or as decoration?**
5. **Would this be shown to a client, or is it a designer's private tool?**
6. **What is the first thing they try to do that it cannot do?**

To set up a scenario directly — on a call, rather than by dragging — the store is
exposed in the browser console:

```js
const s = window.gardenStore.getState();
s.addPlant('betula-jacquemontii', { x: 4, y: 3 });
s.setTime({ doy: 288, hour: 15, year: 12 });   // mid-October afternoon, 12 years on
s.toggle('showOverlay');
```

The moments that have landed hardest so far: the same design at year 0 versus
year 20; mid-October at twenty years, when the birch goes yellow and the maple
scarlet; and January, when half the planting simply is not there — but the
dogwood stems are flaming orange and the laurustinus is in full flower.

---

## Roadmap

### Saving a design as a named project — done

Built as described above. Both hazards recorded here before building did turn
out to be real: the unknown-id crash was reproduced deliberately, by tampering
with a stored design to rename one plant and remove another, and it is now a
counted message instead of a white screen. The version stamp is in place, with
the migration seam left open at the one point that will need it.

Export and import of a JSON file followed, and designs now move between devices.
What remains unbuilt is the **share link** — the design encoded in the URL
fragment, never sent to a server, so it still works on static hosting. It would
need no backend and no file step, and it would arrive through the same guarded
boundary the file already uses. It is the one route that would get a tester's
garden back without asking them to find and send an attachment.

### Publishing it — done

**Live at <https://marekkultys.com/proto-garden-designer/>.** The repository is
public and GitHub Actions publishes the single-file build on every merge to
`master`, with the 230 tests as a gate in front of it. Actions is free on public
repositories and a run takes about a minute.

The decision that got it there: **go public rather than pay to stay private.**
GitHub Pro does let you publish Pages from a private repository, but the
published *site* is public regardless — private Pages is an organisation and
Enterprise Cloud feature, and GitHub's own answer to individuals asking for it is
that it is not available to them. So Pro would have bought a hidden source tree
and an open app, which is the wrong half for a prototype whose whole value is in
what gardeners say after using it.

If it ever does need to be genuinely private, a JavaScript password prompt is
theatre — the app has already been downloaded before the check runs. What works
without a backend is **Cloudflare Pages behind Zero Trust Access**: about half an
hour of clicking, free for a small number of users, per-tester email
one-time-PIN, revocable, and the repo can go private again. The cost is a URL
that is not on GitHub.

### Which domain it is served from

The URL is the repository name appended to the custom domain on the **user
site** — `marek-kultys.github.io`, which serves `marekkultys.com`. Project sites
inherit that domain automatically, but only while they carry no custom domain of
their own, so this repo's Pages *Custom domain* field is deliberately left blank.

A domain attached to a **project** repo behaves differently, and the difference
is easy to miss because the DNS looks identical — both cases CNAME to
`marek-kultys.github.io`. A project-repo domain serves that one repository at its
root and nothing underneath it. `melayerka.com` is the custom domain on the
`melayerka_art` repo, which is why `melayerka.com/proto-garden-designer` is a
404 and always will be while that arrangement holds.

Two ways to serve this app from that domain, if it should live under that name:

- **A subdomain** — `garden.melayerka.com`, one CNAME record at OVH pointing to
  `marek-kultys.github.io`, then set as this repo's custom domain. Cheap and it
  cannot disturb the existing site. The cost is that a repo has only one home, so
  the app *moves* off `marekkultys.com/proto-garden-designer` rather than gaining
  a second address.
- **Publishing into the `melayerka_art` repo** — the workflow writes the built
  file into a folder there, and it is served as an ordinary path of that site.
  This is the only way to get `melayerka.com/proto-garden-designer` specifically.
  It costs a cross-repository write, which means a token to manage, and it ties
  the two projects' deployments together.

### Walls and raised beds — done

Built as described above, and the first change to reach every part of the app at
once: the sun map, all three views, undo, saving and the file format. Two bugs
worth recording, because both looked like the drawing being wrong when it was
not:

- **The sun map ignored the walls entirely** at first. The renderer had been
  extended and the *model* had not been given them, so the plan drew a shadow
  while the overlay reported 99% full sun. Two ways of answering the same
  question had been allowed to disagree.
- **A wall's drawn shadow erased itself.** The swept shadow is filled as a
  single path so overlapping parts do not double-darken — but a nonzero fill
  cancels where subpaths of opposite winding overlap, and a sweep produces side
  quads wound against their own footprint. The fix is to normalise the winding
  before filling. Worth knowing because the symptom is a shadow that is simply
  absent, with nothing in the code obviously wrong.

### Further out

Suitability alerts against the soil and aspect data already held; marginals and
aquatics, so the wet end of the drainage axis means something; more of the plant
palette, once the interaction has been judged worth deepening.
