# BEACON Bangladesh: 2022 Sylhet Flood Case Study Plan

Date: 2026-06-20  
Status: planning document only  
Scope: Bangladesh only, one historical event, one coherent humanitarian decision story

## 1. Core Thesis

BEACON should become a focused, useful flood-intelligence case study for the **2022 Sylhet floods**, not a generic disaster dashboard.

The product story:

> In June 2022, extreme monsoon rainfall over Sylhet and upstream northeast India pushed the Barak-Surma-Kushiyara river system into the haor basin. BEACON reconstructs how the flood formed, how water spread through villages, who was exposed, who had the least capacity to recover, and what response protocol would have reduced harm.

The app should answer five practical questions:

1. **What happened?**  
   Show the rainfall, upstream river surge, haor basin filling, and flood extent progression.

2. **Where did the water go?**  
   Animate observed or reconstructed flood spread across Sylhet/Sunamganj.

3. **Who was exposed?**  
   Overlay population density and under-5 child exposure.

4. **Who was hit hardest?**  
   Overlay poverty/economic vulnerability and access constraints.

5. **What should responders do?**  
   Produce village/union-level shelter, supply, WASH, disease, and routing priorities.

## 2. Why This Is Useful, Not Just A Map

The map is only the visual interface. The actual value is a decision pipeline:

```text
Rainfall + river context
  -> flood extent over time
  -> exposed population
  -> vulnerability/economic status
  -> damaged access to clinics/schools/roads
  -> disease/aftercare risk
  -> response protocol and costed needs
```

The demo should not be framed as “look at this map.” It should be framed as:

> BEACON turns a past flood into an evidence chain that shows what responders should have known, when they should have known it, and which villages should have been prioritized.

## 3. Event Selection

Recommended event: **2022 Sylhet / Sunamganj floods**, northeast Bangladesh.

Reasons:

- Severe and well-documented.
- Clear upstream hydrology story: Barak River system enters Bangladesh as Surma/Kushiyara.
- Strong local geography: low-lying haor basin, villages, schools, clinics, roads, wetlands.
- Humanitarian relevance: marooned communities, disrupted transport, clean-water shortage, school disruption, disease risk.
- Fits BEACON’s core differentiator: village-level prioritization.

## 4. Event Narrative

### Chapter 1: Before The Flood

Show:

- Sylhet Division and Sunamganj/Sylhet districts.
- Haor wetland basin.
- Surma and Kushiyara rivers.
- Villages, roads, clinics, schools.
- Baseline population density and vulnerability.

Message:

> The area is not empty floodplain. It contains dense villages, children, schools, clinics, and people with uneven resources to recover.

### Chapter 2: Rainfall Builds Upstream

Show:

- Rainfall over Sylhet, Meghalaya, Assam, and upstream Barak catchment.
- Animated rainfall cells or accumulated rainfall raster.
- Flow arrows from upstream India toward Sylhet.

Data candidates:

- NASA GPM IMERG precipitation.
- CHIRPS rainfall.
- Bangladesh FFWC/BWDB rainfall/river context if accessible.

Message:

> The flood did not simply start inside Sylhet. Upstream rainfall moved into Bangladesh through the river system.

### Chapter 3: Rivers Rise

Show:

- Barak River splitting into Surma and Kushiyara.
- River gauge markers where available.
- Modeled discharge or warning-state indicators.

Data candidates:

- Bangladesh Flood Forecasting and Warning Centre (FFWC): https://ffwc.gov.bd/
- GloFAS / JRC global flood forecast/archive: https://www.globalfloods.eu/
- River system context: Surma and Kushiyara references.

Message:

> River rise is the bridge between rainfall and village flooding. BEACON should show the hydrologic chain, not only final inundation.

### Chapter 4: Haor Basin Fills

Show:

- Low-elevation basin/haor areas.
- DEM-based lowland mask.
- Water expansion animation from river/haor areas outward.

Data candidates:

- SRTM / Copernicus DEM / AWS Terrain Tiles for elevation context.
- Haor/wetland boundaries if available from Bangladesh geospatial sources.
- Sentinel-1/Copernicus flood extent for observed water.

Message:

> Sylhet/Sunamganj flood dynamics are shaped by low-lying haor geography. Water collects, persists, and cuts off access.

### Chapter 5: Flood Extent Progression

Show:

- Date slider: May 2022 to July 2022.
- Flood snapshots by date.
- Permanent water baseline vs flood anomaly.

Preferred data:

- Copernicus Emergency Management Service Global Flood Monitoring: https://global-flood.emergency.copernicus.eu/
- Sentinel-1 SAR flood extent products.

Secondary data:

- NASA MODIS Near Real-Time Global Flood Mapping: https://floodmap.modaps.eosdis.nasa.gov/
- GloFAS as modeled context, not observed inundation.

Important limitation:

- Haor wetlands naturally contain water seasonally. The app must distinguish permanent/seasonal water from abnormal flood expansion.

### Chapter 6: Human Exposure

Show:

- Population density overlay.
- Vertical bars or extruded columns for population.
- Under-5 children exposure layer.
- Village/settlement labels.

Data candidates:

- WorldPop 100m age/sex population: https://www.worldpop.org/
- NASA SEDAC GPWv4 population density: https://sedac.ciesin.columbia.edu/data/collection/gpw-v4
- OSM villages/hamlets/towns.
- Bangladesh census/admin data where available.

Message:

> The same water depth does not mean the same human impact. Exposure depends on where people live.

### Chapter 7: Economic Vulnerability

Show:

- Green-to-red vulnerability/economic-status overlay.
- Green: more resources/resilience.
- Red: poorer / lower resilience / harder recovery.
- Combine with population bars and flood extent.

Direct data candidates:

- Bangladesh BBS / HIES poverty indicators.
- World Bank Bangladesh poverty maps / poverty assessment.
- DHS or MICS household indicators for floor/roof/wall/electricity/water/sanitation.
- Meta Relative Wealth Index via HDX: https://data.humdata.org/dataset/relative-wealth-index

Proxy data candidates:

- VIIRS nightlights.
- Distance to roads/markets/clinics.
- OSM road class and accessibility.
- Google Open Buildings or Microsoft building footprints for settlement density.
- GHSL built-up surface.

Important language:

Do **not** say:

> This exact house is poor.

Say:

> This village/cell has higher modeled vulnerability based on poverty, housing, access, and remote-sensing proxies.

Recommended label:

> Vulnerability Screening Index

Formula:

```text
vulnerability_index =
  admin_poverty_score
  + non_durable_housing_score
  + low_nightlight_score
  + poor_road_access_score
  + high_dependency_score
```

### Chapter 8: Facilities And Access

Show:

- Clinics.
- Schools.
- Shelters / elevated buildings if available.
- Roads and bridges likely cut off.
- Boat access points if available.

Data candidates:

- OpenStreetMap / Geofabrik Bangladesh: https://download.geofabrik.de/asia/bangladesh.html
- HDX Bangladesh datasets: https://data.humdata.org/group/bgd
- Bangladesh GeoDASH: https://geodash.gov.bd/

Model outputs:

- Nearest safe clinic.
- Schools inside flood extent.
- Villages farther than threshold from safe health access.
- Roads intersecting flood extent.
- Possible shelter sites above flood extent.

### Chapter 9: Aftermath And Disease Risk

Show:

- WASH risk after flood.
- Diarrheal disease risk.
- Dengue risk after water recedes.
- Malaria only as targeted risk, not universal assumption.
- Shelter crowding and clean-water gaps.

Primary risks:

- Unsafe water and damaged sanitation.
- Crowded shelters.
- Interrupted clinic access.
- Food insecurity.
- Stagnant water and vector risk.

Sources:

- Sphere Handbook: https://spherestandards.org/handbook-2018/
- UNICEF Bangladesh: https://www.unicef.org/bangladesh/
- IFRC Bangladesh flood emergency documents: https://www.ifrc.org/emergency/bangladesh-floods
- ReliefWeb Bangladesh: https://reliefweb.int/country/bgd
- WHO guidance: https://www.who.int/
- Bangladesh DGHS: https://dghs.gov.bd/

Model outputs:

```text
safe_water_gap_liters_day = affected_population * 15 - verified_safe_water_supply
emergency_toilets_needed = ceil(affected_population / 20)
food_kcal_day = affected_population * 2100
covered_living_area_m2 = displaced_population * 3.5
ORS_need = expected_diarrhea_cases * treatment_sachets_per_case
```

## 5. Main Map Overlays

### Overlay 1: Flood Progression

Purpose:

Show how water expanded over the event timeline.

Visual:

- Blue transparent flood extent by date.
- Optional animation between dates.
- Permanent water shown separately in muted blue/gray.

Data:

- Copernicus CEMS GFM / Sentinel-1 preferred.
- NASA MODIS flood maps as secondary.
- FFWC/GloFAS for river context.

Interaction:

- Timeline states:
  - Baseline / pre-flood.
  - Rainfall buildup.
  - River rise.
  - Peak flood.
  - Persistence.
  - Recession/aftermath.

### Overlay 2: Population Density

Purpose:

Show where people are concentrated.

Visual:

- Vertical bars / columns over villages or cells.
- Taller bar = higher population.
- Optional age-specific view: under-5 children.

Data:

- WorldPop 100m population / age-sex.
- SEDAC GPWv4 as NASA credibility layer.

Interaction:

- Toggle:
  - Total population.
  - Children under 5.
  - Displaced/affected estimate.

### Overlay 3: Economic Status / Vulnerability

Purpose:

Show where people have fewer resources to recover.

Visual:

- Green-to-red overlay.
- Green = lower vulnerability / more resources.
- Red = higher vulnerability / less resilience.

Data:

- BBS/HIES poverty indicators.
- World Bank poverty context.
- DHS/MICS housing material indicators.
- Meta Relative Wealth Index.
- VIIRS nightlights.
- Road access.
- Building density.

Interaction:

- Toggle sub-components:
  - Poverty/admin layer.
  - Housing-material proxy.
  - Road access.
  - Nightlight proxy.
  - Combined vulnerability index.

### Overlay 4: Facilities And Access

Purpose:

Show operational consequences.

Visual:

- Clinics and schools.
- Shelters.
- Roads cut by flood.
- Safe route / boat route concepts.

Data:

- OSM.
- HDX.
- Bangladesh GeoDASH.

### Overlay 5: Disease / Aftermath Risk

Purpose:

Show why response continues after water recedes.

Visual:

- WASH gap heatmap.
- Diarrhea risk.
- Dengue risk.
- Shelter crowding.

Data:

- Derived from flood duration, population, WASH access, shelter density, DGHS surveillance when available.

## 6. Personal Story Integration

The human story should be handled carefully and ethically.

### Child Case Story

Use a composite or anonymized child story unless there is explicit consent.

Structure:

1. Introduce a child in a Sylhet/Sunamganj village.
2. Show their village before the flood.
3. Show rainfall and river rise.
4. Show their home/school/clinic becoming inaccessible.
5. Show what BEACON would have flagged:
   - Flood exposure.
   - Under-5 population nearby.
   - Poor road access.
   - High vulnerability.
   - Nearest safe shelter/clinic.
6. Show the recommended response protocol.

Do not invent exact names, injuries, or private medical details unless the story is explicitly fictional/composite.

Recommended wording:

> Composite child story based on documented 2022 Sylhet flood impacts.

### Aiden / Myanmar Flash Flood Story

This can be a short personal motivation bridge, not the main data evidence.

Use:

- Explain why flash/flood intelligence matters emotionally.
- Connect personal experience to BEACON’s purpose.
- Avoid making it seem like Myanmar data is part of the Sylhet case unless used as a parallel anecdote.

Recommended wording:

> One team member’s flash-flood experience made the problem personal: when water rises fast, people need clear, local, actionable guidance, not a map full of abstract colors.

## 7. Product Flow

### Opening

Title:

> BEACON Bangladesh: Reconstructing The 2022 Sylhet Flood

Subtitle:

> From upstream rainfall to village-level response.

### Scene 1: The Basin

Show Bangladesh northeast, Sylhet/Sunamganj, rivers, haors.

User sees:

- Not a generic country map.
- A focused flood basin.

### Scene 2: The Rain

Animate rainfall accumulation.

User learns:

- Upstream rainfall in Meghalaya/Assam mattered.

### Scene 3: The Rivers

Show Barak -> Surma/Kushiyara flow.

User learns:

- Water entered the haor basin through river systems.

### Scene 4: The Water

Show observed flood extent progression.

User learns:

- Where the flood expanded and persisted.

### Scene 5: The People

Turn on population bars.

User learns:

- The biggest flood area is not always the highest human priority.

### Scene 6: Vulnerability

Turn on poverty/economic overlay.

User learns:

- Lower-resource villages need earlier support.

### Scene 7: Access

Turn on clinics, schools, roads.

User learns:

- Flood response is a logistics problem.

### Scene 8: BEACON Protocol

Generate priority list:

- First villages to evacuate/support.
- First clinics/schools to protect.
- Shelter placement.
- WASH kits.
- Food/cash.
- Disease surveillance.

### Scene 9: Aftermath

Show standing water / shelter crowding / disease risk.

User learns:

- Flood response continues after peak water.

## 8. Model Design

### Spatial Unit

Recommended:

- Use **union/upazila** for official reporting.
- Use **H3 cells** for modeling and overlay math.
- Use **village/settlement points** for storytelling.

Why:

- Villages are readable for humans.
- H3 cells are consistent for modeling.
- Admin units are credible for reports and government alignment.

### Priority Score

```text
priority_score =
  flood_severity
  * exposed_population
  * vulnerability_multiplier
  * access_penalty
  * service_disruption_penalty
  * disease_risk_multiplier
```

Components:

```text
flood_severity =
  depth_score + duration_score + flood_likelihood_score

exposed_population =
  total_population + under5_weight * children_under5

vulnerability_multiplier =
  1 + poverty_score + non_durable_housing_score + low_nightlight_score

access_penalty =
  distance_to_safe_road + distance_to_clinic + road_cut_indicator

service_disruption_penalty =
  flooded_schools + flooded_clinics + shelter_gap

disease_risk_multiplier =
  water_sanitation_gap + shelter_crowding + post_flood_stagnant_water
```

### Output Categories

- **Immediate rescue / evacuation**
- **WASH priority**
- **Food/cash support**
- **Clinic/mobile health priority**
- **Shelter placement**
- **Disease surveillance**
- **School continuity**

## 9. Data Source Plan

### Flood Event Data

Primary:

- Copernicus CEMS Global Flood Monitoring  
  https://global-flood.emergency.copernicus.eu/

Secondary:

- NASA MODIS Global Flood Mapping  
  https://floodmap.modaps.eosdis.nasa.gov/

Context:

- FFWC  
  https://ffwc.gov.bd/

- GloFAS  
  https://www.globalfloods.eu/

Historical baseline:

- NASA SEDAC Global Flood Database  
  https://sedac.ciesin.columbia.edu/data/set/pend-gfd-global-flood-database

### Population

- WorldPop  
  https://www.worldpop.org/

- NASA SEDAC GPWv4  
  https://sedac.ciesin.columbia.edu/data/collection/gpw-v4

### Poverty / Economic Status

- Bangladesh Bureau of Statistics  
  https://bbs.gov.bd/

- World Bank Bangladesh documents  
  https://documents.worldbank.org/

- Meta Relative Wealth Index  
  https://data.humdata.org/dataset/relative-wealth-index

- DHS  
  https://dhsprogram.com/data/available-datasets.cfm

- UNICEF MICS  
  https://mics.unicef.org/surveys

### Buildings / Settlement

- OSM / Geofabrik Bangladesh  
  https://download.geofabrik.de/asia/bangladesh.html

- Google Open Buildings  
  https://sites.research.google/open-buildings/

- Microsoft Global ML Building Footprints  
  https://github.com/microsoft/GlobalMLBuildingFootprints

- GHSL  
  https://human-settlement.emergency.copernicus.eu/

### Roads / Facilities / Admin

- HDX Bangladesh  
  https://data.humdata.org/group/bgd

- Bangladesh GeoDASH  
  https://geodash.gov.bd/

- geoBoundaries  
  https://www.geoboundaries.org/

### Health / Aftermath

- Sphere Handbook  
  https://spherestandards.org/handbook-2018/

- UNICEF Bangladesh  
  https://www.unicef.org/bangladesh/

- IFRC Bangladesh floods  
  https://www.ifrc.org/emergency/bangladesh-floods

- ReliefWeb Bangladesh  
  https://reliefweb.int/country/bgd

- WHO  
  https://www.who.int/

- DGHS  
  https://dghs.gov.bd/

## 10. Research Caveats

The plan must be honest about uncertainty.

### Flood Extent Caveats

- Sentinel-1 SAR is strong under cloud cover, but can misclassify urban, vegetation, and wetland water.
- MODIS is coarser and cloud-limited.
- Haor wetlands have seasonal water; permanent/seasonal water must be separated from flood anomaly.

### Poverty Caveats

- Poverty/housing data are often survey-based and coarse.
- DHS GPS points are displaced for privacy.
- Nightlights are a proxy, not poverty truth.
- Building footprints do not reveal roof/wall material by themselves.

### Disease Caveats

- Diarrhea/WASH risk is likely relevant early.
- Dengue risk can rise after recession.
- Malaria should be localized and surveillance-based, not assumed everywhere.

### Personal Story Caveats

- Use composite/anonymized stories unless there is consent.
- Do not overstate what the model “knows” about a child or household.

## 11. Implementation Phases

### Phase 1: Story Refocus

- Rename app to Bangladesh/Sylhet case study.
- Remove multi-country framing.
- Remove generic module-first navigation.
- Create chapter-based story flow.
- Add event intro panel.

### Phase 2: Data Foundation

- Create Sylhet/Sunamganj AOI.
- Add admin boundaries.
- Add settlement/village layer.
- Add rivers/haor context.
- Add base population layer.

### Phase 3: Flood Reconstruction

- Acquire Copernicus CEMS GFM date snapshots.
- Process flood extents into app-friendly tiles.
- Add timeline animation.
- Add permanent water baseline.
- Add uncertainty note.

### Phase 4: Exposure

- Join flood extent to WorldPop.
- Compute exposed total population and under-5 children.
- Add population bars.
- Add village exposure ranking.

### Phase 5: Vulnerability

- Add poverty/admin layer.
- Add Meta RWI or nightlights proxy.
- Add road access proxy.
- Add housing-material proxy from DHS/MICS if feasible.
- Compute vulnerability screening index.

### Phase 6: Response Protocol

- Compute shelter suitability.
- Compute WASH needs.
- Compute food/cash needs.
- Compute mobile clinic priorities.
- Compute disease surveillance triggers.
- Generate cost estimate.

### Phase 7: Presentation

- Add child/composite story.
- Add Aiden motivation story carefully.
- Add “what happened / what BEACON would do” contrast.
- Add citations/evidence panel.

## 12. Judge Pitch

Short version:

> BEACON reconstructs the 2022 Sylhet floods as a village-level decision problem. It fuses flood progression, population density, child exposure, economic vulnerability, roads, clinics, schools, and post-flood disease risk to show where response should go first.

Technical version:

> We combine observed flood extents, rainfall/hydrology context, WorldPop age-structured population, settlement/facility data, and vulnerability proxies into a spatial priority model. The output is not only a map; it is a protocol for shelters, WASH, supplies, mobile health, and surveillance.

Ethical version:

> BEACON does not claim to identify poverty or trauma at the household level. It uses transparent, cited geospatial proxies to prioritize support where flood exposure and vulnerability overlap.

## 13. Immediate Next Design Decision

Choose the exact app mode:

1. **Investigation mode:** user explores layers freely.
2. **Story mode:** app guides through chapters.
3. **Hybrid:** chapter story first, then free exploration.

Recommendation:

Use **Hybrid**.

The judges need a clear story, but technical users should be able to inspect layers.

## 14. Minimum Viable Demo

For a compelling demo, the minimum is:

- Sylhet/Sunamganj-focused map.
- Flood progression timeline.
- Population bars.
- Vulnerability choropleth.
- Facilities/roads.
- Village priority list.
- One composite child story.
- BEACON recommended response plan.
- Source/evidence panel.

This is enough to make the project feel like a real humanitarian intelligence tool rather than a generic map.

