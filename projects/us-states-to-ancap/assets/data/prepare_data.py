#!/usr/bin/env python3
"""Convert frozen official Census geometry and FEC results without simplification.

Rebuild: python -m pip install pyshp pypdf && python prepare_data.py
The original shapefile NAD83 geographic coordinates and ring order are retained.
"""
from collections import Counter
from io import BytesIO
import hashlib
import json
from pathlib import Path
import re
import zipfile

from pypdf import PdfReader
import shapefile

HERE = Path(__file__).resolve().parent
BOUNDARY = "cb_2024_us_state_500k"


def dump(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def candidate_votes(page, candidate, expected_sum):
    text = page.extract_text(extraction_mode="layout")
    lines = text.splitlines()
    header = next(line for line in lines if "STATE" in line and candidate in line)
    columns = list(re.finditer(r"\S+", header))
    index = next(i for i, match in enumerate(columns) if match.group() == candidate)
    centers = [(m.start() + m.end()) / 2 for m in columns]
    start = round((centers[index - 1] + centers[index]) / 2)
    end = round((centers[index] + centers[index + 1]) / 2)
    result = {}
    for line in lines:
        match = re.match(r"\s*([A-Z]{2})\s", line)
        if match:
            value = re.sub(r"[\s,]", "", line[start:end])
            assert value.isdigit(), (candidate, match.group(1), value)
            result[match.group(1)] = int(value)
    assert len(result) == 51, (candidate, len(result))
    assert sum(result.values()) == expected_sum, (candidate, sum(result.values()))
    return result


pdf = PdfReader(HERE / "2024presgeresults.pdf")
harris = candidate_votes(pdf.pages[2], "HARRIS", 75_017_613)
trump = candidate_votes(pdf.pages[4], "TRUMP", 77_302_580)
archive = zipfile.ZipFile(HERE / f"{BOUNDARY}.zip")
reader = shapefile.Reader(**{
    ext: BytesIO(archive.read(f"{BOUNDARY}.{ext}"))
    for ext in ("shp", "dbf", "shx")
})

features = []
winners = {}
excluded = []
for record in reader.iterShapeRecords():
    props = record.record.as_dict()
    code = props["STUSPS"]
    if int(props["STATEFP"]) > 56:
        excluded.append({"abbreviation": code, "name": props["NAME"], "fips": props["STATEFP"]})
        continue
    party = "Democratic" if harris[code] > trump[code] else "Republican"
    state = {
        "name": props["NAME"],
        "abbreviation": code,
        "fips": props["STATEFP"],
        "entity_type": "federal_district" if code == "DC" else "state",
        "party": party,
        "winner": "Kamala D. Harris" if party == "Democratic" else "Donald J. Trump",
        "harris_votes": harris[code],
        "trump_votes": trump[code],
    }
    winners[code] = state
    features.append({
        "type": "Feature",
        "id": props["STATEFP"],
        "properties": {**props, **state},
        "geometry": record.shape.__geo_interface__,
    })

features.sort(key=lambda feature: feature["id"])
assert len(features) == 51
assert sum(f["properties"]["entity_type"] == "state" for f in features) == 50
counts = Counter(v["party"] for code, v in winners.items() if code != "DC")
assert counts == {"Republican": 31, "Democratic": 19}, counts
assert winners["ME"]["party"] == "Democratic"
assert winners["NE"]["party"] == "Republican"

geo = {
    "type": "FeatureCollection",
    "name": "2024 Census cartographic state boundaries, 50 states plus DC",
    "sourceCRS": "EPSG:4269 (NAD83 geographic degrees), unchanged from source shapefile",
    "features": features,
}
(HERE / "us-states-2024.geojson").write_text(json.dumps(geo, separators=(",", ":")) + "\n")
dump("state-winners-2024.json", {
    "election_date": "2024-11-05",
    "basis": "Statewide presidential popular-vote winner, as published by the Federal Election Commission from state election offices.",
    "interpretation": "Democratic and Republican are an explicit electoral proxy for left-leaning and right-leaning. This is not a claim about every resident or every policy position.",
    "maine_nebraska": "Maine is Democratic and Nebraska Republican by statewide vote. Congressional-district electoral-vote splits are intentionally not used for whole-state colors.",
    "source": "https://www.fec.gov/documents/5644/2024presgeresults.pdf",
    "source_pages": {"harris_popular_votes": 3, "trump_popular_votes": 5},
    "state_counts": dict(counts),
    "district_of_columbia": "Included separately as a federal district; not counted among the 50 states.",
    "states": dict(sorted(winners.items())),
})
dump("source-attribution.json", {
    "retrieved_date": "2026-10-25",
    "boundaries": {
        "publisher": "U.S. Census Bureau",
        "title": "2024 Cartographic Boundary File, State and Equivalent Entities for United States, 1:500,000",
        "catalog_url": "https://www.census.gov/geographies/mapping-files/2024/geo/carto-boundary-file.html",
        "download_url": "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_500k.zip",
        "documentation_url": "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html",
        "raw_file": f"{BOUNDARY}.zip",
        "raw_sha256": hashlib.sha256((HERE / f"{BOUNDARY}.zip").read_bytes()).hexdigest(),
        "derived_file": "us-states-2024.geojson",
        "source_crs": "EPSG:4269 / NAD83 geographic coordinates",
        "coordinate_processing": "Shapefile-to-GeoJSON conversion only; no rounding, simplification, smoothing, hand redrawing, or AI generation.",
        "precision_limits": "The Census cartographic dataset is itself an officially simplified 1:500,000 representation for small-scale mapping, not a cadastral survey or a legal boundary determination. A projected map and raster video cannot be literally exact at all physical scales.",
        "included": "All 50 states and District of Columbia (51 features); all source polygon parts and islands retained.",
        "excluded_territories": sorted(excluded, key=lambda item: item["abbreviation"]),
        "rendering_caution": "Composite projections may clip the Aleutian Islands or northwestern Hawaiian Islands. Use unclipped separate fitted Alaska and Hawaii projections to retain the complete state geometry.",
    },
    "political_classification": {
        "publisher": "Federal Election Commission",
        "title": "Official 2024 Presidential General Election Results",
        "source_data": "State Elections Offices",
        "download_url": "https://www.fec.gov/documents/5644/2024presgeresults.pdf",
        "crosscheck_url": "https://www.archives.gov/electoral-college/2024",
        "raw_file": "2024presgeresults.pdf",
        "raw_sha256": hashlib.sha256((HERE / "2024presgeresults.pdf").read_bytes()).hexdigest(),
        "derived_file": "state-winners-2024.json",
        "method": "Extract Harris and Trump statewide popular-vote totals from PDF pages 3 and 5, verify 51 records and national candidate totals, then compare vote counts per state.",
        "verified_totals": {"harris": sum(harris.values()), "trump": sum(trump.values()), "states": 50, "federal_districts": 1},
    },
})
print(json.dumps({"features": len(features), "state_counts": dict(counts), "territories_excluded": len(excluded), "geometry_bytes": (HERE / "us-states-2024.geojson").stat().st_size}))
