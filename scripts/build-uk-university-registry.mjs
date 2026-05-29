import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outputPath = join(root, "content", "uk-universities.json");
const englandWorkbookPath = join(root, "tmp", "ofs-register.xlsx");

const SCOTLAND_UNIVERSITIES = [
  { name: "University of Aberdeen", website: "https://www.abdn.ac.uk", nation: "Scotland" },
  { name: "Abertay University", website: "https://www.abertay.ac.uk", nation: "Scotland" },
  { name: "University of Dundee", website: "https://www.dundee.ac.uk", nation: "Scotland" },
  { name: "University of Edinburgh", website: "https://www.ed.ac.uk", nation: "Scotland" },
  { name: "Edinburgh Napier University", website: "https://www.napier.ac.uk", nation: "Scotland" },
  { name: "University of Glasgow", website: "https://www.gla.ac.uk", nation: "Scotland" },
  { name: "Glasgow Caledonian University", website: "https://www.gcu.ac.uk", nation: "Scotland" },
  { name: "The Glasgow School of Art", website: "https://www.gsa.ac.uk", nation: "Scotland" },
  { name: "Heriot-Watt University", website: "https://www.hw.ac.uk", nation: "Scotland" },
  { name: "University of the Highlands and Islands", website: "https://www.uhi.ac.uk", nation: "Scotland" },
  { name: "The Open University in Scotland", website: "https://www.open.ac.uk/scotland", nation: "Scotland" },
  { name: "Queen Margaret University", website: "https://www.qmu.ac.uk", nation: "Scotland" },
  { name: "Robert Gordon University", website: "https://www.rgu.ac.uk", nation: "Scotland" },
  { name: "Royal Conservatoire of Scotland", website: "https://www.rcs.ac.uk", nation: "Scotland" },
  { name: "Scotland's Rural College", website: "https://www.sruc.ac.uk", nation: "Scotland" },
  { name: "University of St Andrews", website: "https://www.st-andrews.ac.uk", nation: "Scotland" },
  { name: "University of Stirling", website: "https://www.stir.ac.uk", nation: "Scotland" },
  { name: "University of Strathclyde", website: "https://www.strath.ac.uk", nation: "Scotland" },
  { name: "University of the West of Scotland", website: "https://www.uws.ac.uk", nation: "Scotland" },
];

const WALES_UNIVERSITIES = [
  { name: "Aberystwyth University", website: "https://www.aber.ac.uk", nation: "Wales" },
  { name: "Bangor University", website: "https://www.bangor.ac.uk", nation: "Wales" },
  { name: "Cardiff Metropolitan University", website: "https://www.cardiffmet.ac.uk", nation: "Wales" },
  { name: "Cardiff University", website: "https://www.cardiff.ac.uk", nation: "Wales" },
  { name: "The Open University in Wales", website: "https://www.open.ac.uk/wales", nation: "Wales" },
  { name: "Swansea University", website: "https://www.swansea.ac.uk", nation: "Wales" },
  { name: "University of South Wales", website: "https://www.southwales.ac.uk", nation: "Wales" },
  { name: "University of Wales Trinity Saint David", website: "https://www.uwtsd.ac.uk", nation: "Wales" },
  { name: "Wrexham University", website: "https://wrexham.ac.uk", nation: "Wales" },
];

const NORTHERN_IRELAND_UNIVERSITIES = [
  { name: "The Open University in Northern Ireland", website: "https://www.open.ac.uk/northern-ireland", nation: "Northern Ireland" },
  { name: "Queen's University Belfast", website: "https://www.qub.ac.uk", nation: "Northern Ireland" },
  { name: "St Mary's University College", website: "https://www.stmarys-belfast.ac.uk", nation: "Northern Ireland" },
  { name: "Stranmillis University College", website: "https://www.stran.ac.uk", nation: "Northern Ireland" },
  { name: "Ulster University", website: "https://www.ulster.ac.uk", nation: "Northern Ireland" },
];

const AUTHORITY_BY_NATION = {
  England: {
    sourceName: "Office for Students Register",
    sourceUrl: "https://register-api.officeforstudents.org.uk/api/Download/",
  },
  Scotland: {
    sourceName: "Scottish Government Recognised Bodies",
    sourceUrl: "https://www.gov.scot/policies/universities/",
  },
  Wales: {
    sourceName: "Universities Wales",
    sourceUrl: "https://uniswales.ac.uk/",
  },
  "Northern Ireland": {
    sourceName: "Department for the Economy / nidirect",
    sourceUrl: "https://www.economy-ni.gov.uk/articles/higher-education-division",
  },
};

function slugify(input = "") {
  return String(input || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeWebsite(url = "") {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function titleCase(input = "") {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toRegistryRecord(entry = {}, authority = {}) {
  const website = normalizeWebsite(entry.website);
  const name = titleCase(entry.name);
  return {
    slug: slugify(name),
    name,
    website,
    nation: entry.nation,
    country: "United Kingdom",
    registrySource: authority.sourceName,
    registrySourceUrl: authority.sourceUrl,
    verifiedOfficial: true,
  };
}

function loadEnglandProvidersFromWorkbook() {
  const pythonScript = `
import json, sys
from pathlib import Path
try:
    import openpyxl
except Exception as exc:
    print(json.dumps({"error": f"openpyxl unavailable: {exc}"}))
    sys.exit(0)

path = Path(sys.argv[1])
if not path.exists():
    print(json.dumps({"error": f"Workbook not found: {path}"}))
    sys.exit(0)

wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
ws = wb["Register"]
rows = ws.iter_rows(values_only=True)
header = None
for candidate in rows:
    values = [str(cell).strip() if cell is not None else "" for cell in candidate]
    if "Provider’s legal name" in values or "Provider's legal name" in values:
        header = values
        break

if header is None:
    print(json.dumps({"error": "Unable to find OfS header row"}))
    sys.exit(0)

headers = header
index = {value: idx for idx, value in enumerate(headers)}

name_idx = index.get("Provider’s legal name", index.get("Provider's legal name"))
trading_idx = index.get("Provider’s trading name(s)", index.get("Provider's trading name(s)"))
website_idx = index.get("Provider's website", index.get("Provider’s website"))
title_idx = index.get("Does the provider have the right to use ‘university’ in its title?", index.get("Does the provider have the right to use 'university' in its title?"))

providers = []
for row in rows:
    name = str(row[name_idx]).strip() if name_idx is not None and row[name_idx] else ""
    trading = str(row[trading_idx]).strip() if trading_idx is not None and row[trading_idx] else ""
    website = str(row[website_idx]).strip() if website_idx is not None and row[website_idx] else ""
    university_title = str(row[title_idx]).strip().lower() if title_idx is not None and row[title_idx] else ""
    haystack = f"{name} {trading}".lower()
    if not website:
        continue
    has_actual_university_signal = (
        university_title == "yes" or
        "open university" in haystack or
        "university college" in haystack or
        haystack.startswith("university ") or
        " university of " in f" {haystack} " or
        haystack.endswith(" university")
    )
    has_excluded_centre_signal = "university centre" in haystack
    if has_actual_university_signal and not has_excluded_centre_signal:
        preferred_name = trading if trading and trading.lower() != "not applicable" else name
        if preferred_name.count("\\n") > 1 or len(preferred_name) > 90:
            preferred_name = name
        providers.append({
            "name": preferred_name.replace("\\n", " "),
            "website": website,
            "nation": "England"
        })

print(json.dumps({"providers": providers}))
`;

  const result = spawnSync("python", ["-c", pythonScript, englandWorkbookPath], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  const payload = JSON.parse(result.stdout || "{}");
  if (payload.error) {
    throw new Error(payload.error);
  }

  return Array.isArray(payload.providers) ? payload.providers : [];
}

function mergeRecords(records = []) {
  const merged = [];
  const seen = new Set();

  for (const record of records) {
    if (!record?.name || !record?.website) continue;
    const key = `${slugify(record.name)}::${record.website}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }

  return merged.sort((a, b) => a.nation.localeCompare(b.nation) || a.name.localeCompare(b.name));
}

async function main() {
  const england = loadEnglandProvidersFromWorkbook()
    .map((entry) => toRegistryRecord(entry, AUTHORITY_BY_NATION.England));
  const scotland = SCOTLAND_UNIVERSITIES.map((entry) => toRegistryRecord(entry, AUTHORITY_BY_NATION.Scotland));
  const wales = WALES_UNIVERSITIES.map((entry) => toRegistryRecord(entry, AUTHORITY_BY_NATION.Wales));
  const northernIreland = NORTHERN_IRELAND_UNIVERSITIES.map((entry) => toRegistryRecord(entry, AUTHORITY_BY_NATION["Northern Ireland"]));

  const universities = mergeRecords([
    ...england,
    ...scotland,
    ...wales,
    ...northernIreland,
  ]);

  const totalsByNation = universities.reduce((acc, university) => {
    acc[university.nation] = (acc[university.nation] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    version: "1.0.0",
    updated_at: new Date().toISOString(),
    generated_from: {
      england_workbook: englandWorkbookPath,
      authorities: AUTHORITY_BY_NATION,
    },
    total: universities.length,
    totals_by_nation: totalsByNation,
    universities,
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${universities.length} UK universities to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
