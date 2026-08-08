# proto-garden-designer

A prototype of a simulation app for garden designers.

Draw a plot, drag in plants, then scrub three sliders — **time of day**, **time of
year**, and **age of the garden** out to twenty years — and watch the design
respond. Shadows sweep round, light warms and cools, leaves come and go, autumn
colour arrives, and the planting grows up.

This is built to test whether the interaction idea has depth, not to be a
comprehensive plant database. Ten plants, each researched properly and simulated
seriously, rather than a hundred stubs.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 49 model tests
npm run build      # normal production build into dist/
```

For something you can email to a tester, or open by double-clicking with no
server at all:

```bash
SINGLEFILE=1 npm run build     # one self-contained dist/index.html, ~220 kB
node scripts/check-singlefile.mjs   # confirms it runs from file:// with zero network requests
```

To see it working across the slider range:

```bash
npx vite preview --port 4173
node scripts/screenshots.mjs http://localhost:4173 screenshots
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

Chosen to span the axes the simulation exercises — vigorous to slow, evergreen to
fully dormant, sun to deep shade, tree to groundcover. Dimensions and flowering
periods are from the RHS entry for each plant; where a nursery gives a realistic
twenty-year size well below the RHS "ultimate" figure, the growth curve is tuned
to hit the twenty-year number, since that is the range the age slider covers.

| Plant | Latin | Notes |
|---|---|---|
| West Himalayan birch | *Betula utilis* var. *jacquemontii* | 12–18 m, vigorous, white bark, yellow autumn |
| Snowy mespilus | *Amelanchier lamarckii* | multistem, April blossom, orange-red autumn |
| Japanese maple | *Acer palmatum* 'Ōsakazuki' | 4 × 3 m at 20 years, orange-scarlet autumn |
| Yew | *Taxus baccata* | clipped column, 20–40 cm/yr, takes deep shade |
| Panicle hydrangea | *Hydrangea paniculata* 'Limelight' | flowers age lime → cream → pink through the season |
| English lavender | *Lavandula angustifolia* 'Hidcote' | evergreen grey, full sun only |
| Feather reed grass | *Calamagrostis* × *acutiflora* 'Karl Foerster' | plumes stand all winter, cut back in February |
| Plantain lily | *Hosta* (Tardiana Gp) 'Halcyon' | vanishes below ground November–April |
| Purple top | *Verbena bonariensis* | see-through, July to first frosts |
| Cranesbill | *Geranium* Rozanne | flowers across most of the season slider |

Each entry in `src/model/plants.ts` carries its source URL.

## Deliberately not in this build

- **Soil type and suitability alerts.** Next obvious step; the plant data already
  carries what it needs.
- **Save / load / export.** All state is one serialisable object, so this is a
  small addition — but as things stand, closing the tab loses the design. Worth
  adding before any unsupervised testing.
- **Anything beyond ten plants.** The point is interaction depth.

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
scarlet; and January, when half the planting simply is not there.
