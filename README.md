# proto-garden-designer

A prototype of a simulation app for garden designers.

Draw a plot, drag in plants, then scrub three sliders — **time of day**, **time of
year**, and **age of the garden** out to twenty years — and watch the design
respond. Shadows sweep round, light warms and cools, leaves come and go, autumn
colour arrives, and the planting grows up.

Three ways of looking at it: the plan you arrange on, a measured **elevation**
through a slice of it, and a **360° view** from an eye point inside the garden
that you can turn and tilt.

This is built to test whether the interaction idea has depth, not to be a
comprehensive plant database. Thirty plants, each researched properly and
simulated seriously, rather than a hundred stubs.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 126 tests
npm run build      # normal production build into dist/
```

For something you can email to a tester, or open by double-clicking with no
server at all:

```bash
SINGLEFILE=1 npm run build     # one self-contained dist/index.html, ~250 kB
node scripts/check-singlefile.mjs   # confirms it runs from file:// with zero network requests
```

To see it working across the slider range, and to check the phone layout:

```bash
npx vite preview --port 4173
node scripts/screenshots.mjs http://localhost:4173 screenshots
node scripts/check-mobile.mjs http://localhost:4173 screenshots
node scripts/check-panorama.mjs http://localhost:4173 screenshots
node scripts/check-editing.mjs http://localhost:4173 screenshots
```

## What is actually simulated

Everything on both canvases is a pure function of `(design, site, time)`. Four
models do the work.

**Sun position** — `src/model/sun.ts`. The NOAA solar position equations, not an
approximation: fractional year, equation of time, declination, hour angle, then
altitude and azimuth built as a vector in a south/east/up frame. Sunrise and
sunset come out within a couple of minutes of published times, and the tests
check that against London figures rather than against the code's own output.

This is what makes latitude, longitude and the north dial mean something. At
London the noon sun reaches ~62° at midsummer and ~15° at midwinter, so the same
tree throws a shadow roughly four times longer in December than in June, for
free. Summer time is applied on the UK/EU rule, so a June evening still has sun
at 21:00.

**Light colour** — `src/render/palette.ts`. Sun altitude sets a colour
temperature, from about 1900 K at the horizon to 5800 K high. Hue and brightness
are then applied *separately*: the tint is whichever light is falling on a
surface (the beam in sun, the blue sky in shadow), normalised to unit luminance
so it only shifts colour, with brightness applied on top. Tying the two together
— the obvious implementation — makes everything drift cold and grey at exactly
the moment it should be going golden.

**Growth** — `src/model/growth.ts`. A logistic curve from nursery stock to mature
size, with height and spread on separate curves, which reproduces the familiar
habit of a young tree shooting upward for a decade before broadening out. Clipped
subjects like the yew gain a fixed amount each year and then stop, because
somebody is cutting them.

**Phenology** — `src/model/phenology.ts`. Day-of-year anchors per species — bud
burst, full leaf, autumn onset, leaf fall, flowering — smoothed into a phase
vector. Anchors shift with the site using Hopkins' bioclimatic law: spring about
four days later per degree of latitude north and per 120 m of altitude, autumn
the other way. Put the same garden 400 m up and bud burst slips a fortnight while
leaf fall comes a fortnight early.

**Sun/shade map** — `src/model/shade.ts`. Walks the sun across the sky in
fifteen-minute steps and projects every canopy onto the ground, accumulating how
much light each quarter-metre of plot receives. Bands are labelled in the
vocabulary designers use — full sun, partial shade, shade.

## The 360° view

`src/model/panorama.ts` and `src/render/drawPanorama.ts`. Drop an eye anywhere
on the plan, then drag the picture to turn and tilt. Plan and elevation are both
drawings; this is the first view that answers what a client actually asks — what
will it look like from the terrace — and it is a genuinely different projection,
where distance matters and a shrub two metres away can hide a tree twenty metres
off.

**Cylindrical, not a flat perspective plane.** A pinhole projection multiplies by
`tan(angle)`, which runs away at the edges and makes a wide view unusable.
Mapping angle linearly to pixels keeps a wide field undistorted and lets the
maths carry on smoothly through a whole turn. Everything — horizontal position,
apparent size, the height of the horizon — comes off one number, the pixels per
degree of arc.

Two consequences worth knowing, because both look like bugs until you see why:

- **The field opens out on a short panel.** Horizontal and vertical share that
  one scale, so a 90° field in a 300 px strip would magnify everything
  vertically until a shrub three metres away filled the frame. Rather than
  distort, the view shows *wider* than asked — the readout says how wide, and
  the cone on the plan is drawn from the field actually rendered, not the one
  requested. Making the panel taller zooms in.
- **You have to look up.** Standing seven metres from a twelve-metre birch, its
  crown is 56° above eye level, and no honest wide view fits that on screen at
  once. Hence the tilt: drag up and down, or use the chevrons.

**Whose eyes.** Eye level starts at 1.6 m — the conventional architectural
figure, a person of about 1.71 m, since eyes sit some 10–12 cm below the top of
the head. That is close to the average adult man and well above the average
adult woman, whose eyes are nearer 1.50 m, so it is a control rather than a
constant. The gap is not cosmetic: twenty centimetres decides whether a 1.5 m
hedge is something you see over or something you see, and two people standing in
the same garden genuinely disagree about whether it is enclosed. Presets run
from a seven-year-old to a tall adult, and a separate ground offset covers
standing on a raised terrace or looking down from an upstairs window — the
geometry only ever needs the sum of the two.

## Filtering by growing conditions

The library filters on six axes. Type and a **Planted** toggle stay visible;
the rest fold behind a **Growing conditions** disclosure that shows how many are
active, because six rows of chips at once leave no room for the plants
themselves — especially in the phone sheet.

| Axis | Values |
|---|---|
| Aspect | full sun · dappled shade · semi shade · shade |
| Soil type | clay · loam · sand · chalk |
| Soil pH | acidic · neutral · alkaline |
| Drainage | free draining · water retentive · waterlogged · bog · pond |
| Foliage | deciduous · evergreen · dies back |

**Dappled shade is a real category, not a midpoint.** It is the moving, broken
light under a deciduous canopy, and it is what a hellebore or a Japanese maple
actually wants rather than merely tolerates — the same plant in open partial
shade is a worse plant.

**Chips that would empty the list are dimmed** rather than hidden, given the
other filters already set. That does two jobs. It admits honestly that *bog* and
*pond* match nothing, because there are no marginals or aquatics in this palette
yet. And it surfaces real horticulture: select dappled shade and chalk together
and the **Trees** chip dims, because every dappled-tolerant tree here — acer,
magnolia, amelanchier — is a lime-hater.

Two consistency rules are enforced by tests rather than by care, since the soil
axes can contradict each other silently: anything offered for chalk must accept
alkaline soil, and anything that will take waterlogging must also take clay.

## Editing on the plan

Right-click a plant (long-press on a touchscreen) for **Add another**, which
plants a second of the same kind just beside it, or ⌘/Ctrl-D on the selection.
Planting is done in threes and fives rather than ones, and without this every
repeat meant going back to the library and finding the same species again in a
list of thirty.

The copy gets a fresh seed, so it is a second plant of the same kind rather than
a clone of the same individual — two hostas in a border are never identical, and
the skeleton cache in `form.ts` is keyed on that seed.

**Undo** is ⌘/Ctrl-Z, redo is ⇧⌘Z or Ctrl-Y, and both have buttons in the header
that name what they will undo. Two decisions in `src/state/store.ts` are worth
knowing:

- **It covers the design, not the view.** Planting and the plot outline are
  undoable; the time sliders, the 360° camera and the display toggles are not.
  They are not edits, they are trivially reversible by hand, and including them
  would bury a deleted border under a scrub of the season slider.
- **A drag is one step.** Moving a plant fires an update on every pointer move,
  and one undo step per frame would be useless. Rather than have the pointer
  handlers announce when a gesture begins and ends — easy to get wrong, easy to
  forget in a new handler — consecutive edits carrying the same key within
  600 ms fold into one entry. Two drags of different plants stay two steps, and
  so do two drags of the same plant with a pause between them.

## Two things in the drawing that are less obvious than they look

**A plant's skeleton is generated once and cached** (`src/render/form.ts`).
Branch forks, leaf-mass positions, outline wobble — all decided from the instance
seed and then held fixed, so rendering only varies size, colour and how much is
visible. Deciding them while drawing seems equivalent and is not: the number of
leaf clumps changes as the season slider moves, which changes how much randomness
has been consumed, which rearranges everything after it. Scrubbing time would
look like the garden was being replanted every frame.

**The elevation strip's vertical scale is fixed to the *mature* size of the
planting**, never to the current size. If it refitted as plants grew, everything
would stay the same size on screen and the age slider would appear to do nothing.

## The plant palette

Thirty plants, chosen to span the axes the simulation exercises — vigorous to
slow, evergreen to fully dormant, sun to deep shade, tree to groundcover.
Dimensions and flowering periods are from the RHS entry for each plant (every
entry in `src/model/plants.ts` carries its source URL); where a nursery gives a
realistic twenty-year size well below the RHS "ultimate" figure, the growth curve
is tuned to hit the twenty-year number, since that is the range the age slider
covers.

**Trees** — West Himalayan birch, snowy mespilus, Japanese maple 'Ōsakazuki',
cider gum, saucer magnolia, crab apple 'Evereste', Tibetan cherry, rowan.
**Shrubs** — panicle hydrangea 'Limelight', English lavender, mānuka, dogwood
'Midwinter Fire', laurustinus, shrub rose 'Gertrude Jekyll', Mexican orange
blossom 'Sundance'. **Conifers** — clipped yew, dwarf mountain pine.
**Grasses** — feather reed grass 'Karl Foerster', giant oat grass, maiden grass.
**Perennials** — hosta 'Halcyon', purple top, cranesbill Rozanne, salvia
'Caradonna', coneflower, lady's mantle, black-eyed Susan, Lenten rose,
ornamental onion. **Annuals** — cosmos.

Several of them exist to exercise a specific piece of the model, and it is worth
knowing which, because each is a case where the obvious implementation silently
does nothing rather than failing loudly:

| Plant | What it exercises |
|---|---|
| Saucer magnolia | flowers on completely bare wood, weeks before a leaf |
| Laurustinus | a flowering window that crosses the new year (November–April) |
| Dogwood 'Midwinter Fire' | grown for the colour of its leafless stems |
| Crab apple, rowan | fruit still held long after leaf fall |
| Ornamental onion | a bulb: dormant in high summer, not in winter, with seedheads that go over before autumn |
| Cosmos | an annual — the same size in year 20 as in year 1, because it is a different plant each year |
| Giant oat grass | evergreen foliage *and* standing winter seedheads at once |
| Cider gum | the fastest grower here, and evergreen, so it shades in winter too |

## On a phone

The page never scrolls on a phone, and that is deliberate rather than incidental.
Published as an artifact it lives inside a sheet in a host app, and a swipe that
runs past the end of the document chains upward and reads as a dismiss — the pane
closes underneath you mid-gesture. So the phone layout fits the viewport exactly:
canvas, elevation and the three sliders, with the plant library and site settings
as sheets that slide up over the canvas and contain their own scrolling.
`overscroll-behavior: none` severs the chain at every level as a second line of
defence. `scripts/check-mobile.mjs` asserts all of this rather than trusting it.

Dragging onto a canvas you cannot see is not a real option on a phone, so tapping
a plant drops it in the middle of the plot and closes the sheet; you then drag it
into place on the canvas.

## Deliberately not in this build

- **Soil type and suitability alerts.** Next obvious step; the plant data already
  carries what it needs, including a hardiness rating per plant — and the palette
  now includes genuinely borderline things (mānuka at H3, cosmos at H2) for that
  check to have something to say.
- **Save / load / export.** All state is one serialisable object, so this is a
  small addition — but as things stand, closing the tab loses the design. Worth
  adding before any unsupervised testing.

## Known trade-offs

- **The elevation strip has empty sky either side.** Its scale is uniform in both
  directions, so once there is a 14 m tree in a 13 m slice, the vertical is the
  binding constraint and the content cannot fill a short wide strip without
  distorting the drawing. The **Compact / Normal / Tall** button raises the shared
  scale, which fills the width as a side effect.
- **"Hours of direct sun" counts partial transmission proportionally.** A cell
  under a bare birch that passes 78% of the light accrues 0.78 h per hour. That is
  a reasonable reading of dappled shade, but it is not the strict horticultural
  definition of unobstructed hours.
- **Band thresholds scale on short days.** "Full sun means six hours" is a
  growing-season convention; six hours of an eight-hour December day is 72% of all
  available light, so the thresholds are capped at a share of daylight and the
  legend says so when that applies.
- **Light, not lighting.** Plants are lit as flat tinted shapes. There is no
  self-shading, no shadow cast by one plant onto another's foliage in elevation,
  and no cloud.

## Testing with gardeners

`window.gardenStore` is exposed in the browser, so a scenario can be set up
directly from the console (or over a call) rather than by dragging:

```js
const s = window.gardenStore.getState();
s.addPlant('betula-jacquemontii', { x: 4, y: 3 });
s.setTime({ doy: 288, hour: 15, year: 12 });   // mid-October afternoon, 12 years on
s.toggle('showOverlay');
```

The moments that have landed hardest so far: the same design at year 0 versus
year 20; mid-October at twenty years, when the birch goes yellow and the maple
scarlet; January, when half the planting simply is not there — but the dogwood
stems are flaming orange and the laurustinus is in full flower; and standing in
the 360° view at the near end of the plot on a January afternoon, which is the
one that makes people stop talking about the drawing and start talking about the
garden.
