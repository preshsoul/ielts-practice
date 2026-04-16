import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QB } from "../src/data/qb.js";
import { INSTITUTIONS } from "../src/data/institutions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const PASSAGES = {
  P1: `Urban farming — the practice of cultivating food within city boundaries — has expanded rapidly over the past two decades. Proponents argue that it reduces food miles, improves community cohesion, and provides fresh produce to urban residents who might otherwise rely on processed food. However, critics note that urban farmland is inherently limited, yields per square metre are typically lower than in conventional agriculture, and the cost of establishing rooftop or vertical farms is often prohibitive for low-income communities. A 2021 study by the University of Sheffield found that even if all suitable urban surfaces in the UK were converted to food production, total caloric output would cover only about two percent of national demand.`,
  P2: `The migration of monarch butterflies represents one of nature's most remarkable navigational feats. Each autumn, millions of monarchs travel up to 4,500 kilometres from Canada and the United States to overwintering sites in the mountains of central Mexico. Scientists believe they use a combination of the sun's position and an internal circadian clock to maintain direction. The butterflies that make the southward journey are not the same individuals that travelled north in spring — they are the great-grandchildren of those earlier migrants. Despite this generational gap, they navigate to the same forests their ancestors used, a phenomenon researchers have yet to fully explain. Habitat loss at both ends of the migration route has caused monarch populations to decline by more than 80 percent since the 1990s.`,
  P3: `The development of antibiotics in the twentieth century is widely regarded as one of medicine's greatest achievements. Alexander Fleming's observation of penicillin's antibacterial properties in 1928 set in motion a chain of discoveries that would save hundreds of millions of lives. However, the widespread and often indiscriminate use of antibiotics in both human medicine and livestock farming has accelerated the emergence of antimicrobial resistance (AMR). The World Health Organization now considers AMR one of the greatest threats to global health. Some strains of tuberculosis, gonorrhoea, and pneumonia have become virtually untreatable. Experts warn that without coordinated global action to restrict antibiotic use and fund new drug development, routine surgeries and chemotherapy could become life-threatening by 2050.`,
  P4: `Sleep research has undergone a significant transformation in the past three decades. Earlier scientific consensus held that sleep was a passive state of reduced brain activity. Neuroimaging studies have since demonstrated that the sleeping brain is remarkably active, cycling through distinct stages that each serve different restorative functions. Rapid eye movement (REM) sleep, during which most vivid dreaming occurs, appears critical for emotional regulation and memory consolidation. Slow-wave sleep, the deepest stage, is associated with physical repair and immune function. Chronic sleep deprivation — defined as consistently sleeping fewer than seven hours per night — has been linked to increased risk of cardiovascular disease, type 2 diabetes, obesity, and impaired cognitive performance. Despite this evidence, surveys suggest that more than a third of adults in developed countries regularly fail to achieve adequate sleep.`,
  P5: `The concept of gross domestic product (GDP) as a measure of national wellbeing has come under increasing scrutiny from economists and policymakers. GDP measures the total monetary value of goods and services produced within a country in a given period, but it does not account for income inequality, environmental degradation, unpaid domestic labour, or subjective wellbeing. A country can register GDP growth while simultaneously experiencing rising poverty and worsening air quality. New Zealand adopted a Wellbeing Budget in 2019, allocating spending according to indicators including mental health, child poverty, and indigenous culture — a model attracting international interest. Critics of this approach argue that wellbeing metrics are inherently subjective and difficult to measure consistently, making them unsuitable as primary guides for fiscal policy.`,
  P6: `Plastic pollution has become one of the defining environmental challenges of the early twenty-first century. Approximately 380 million tonnes of plastic are produced globally each year, and it is estimated that only nine percent of all plastic ever manufactured has been recycled. The remainder has been incinerated, sent to landfill, or released into the environment. Marine ecosystems have been particularly affected: the Great Pacific Garbage Patch, a concentration of plastic debris in the North Pacific Ocean, covers an area roughly three times the size of France. Microplastics — particles smaller than five millimetres — have been detected in the deepest ocean trenches, in Arctic ice, and in human blood. While bans on single-use plastics have been introduced in dozens of countries, researchers argue that regulatory measures alone are insufficient without fundamental changes to production and consumption patterns.`,
  P7: `Remote work, once the preserve of a small minority of knowledge workers, became mainstream almost overnight during the COVID-19 pandemic. Studies conducted during this period produced mixed findings. Some showed that workers reported higher productivity and better work-life balance; others found increased rates of loneliness, difficulty separating work from home life, and reduced opportunities for mentorship and career progression, particularly among younger employees. Employers reported benefits including reduced office costs and access to a wider talent pool, but also challenges in maintaining organisational culture and monitoring performance. Post-pandemic, many organisations have adopted hybrid models, though the optimal balance between remote and in-person work remains contested. Some economists argue that fully remote work may reduce innovation, which has historically been driven by informal, spontaneous interactions in shared physical spaces.`,
  P8: `The history of the English language is one of continuous absorption and transformation. Old English, spoken in Britain from roughly the fifth to the eleventh centuries, bore little resemblance to modern English and was itself the product of Anglo-Saxon dialects mixed with earlier Celtic influences. The Norman Conquest of 1066 introduced a vast French vocabulary — particularly in domains of law, cuisine, and aristocratic life — creating a linguistic stratification in which French-derived words often carried higher social status than their Old English equivalents. The subsequent centuries saw further influences from Latin, Greek, and later the languages of colonised peoples across Asia, Africa, and the Americas. Today, English has more words than virtually any other language, with the Oxford English Dictionary tracking over 600,000 entries.`,
};

const questionsPath = join(root, "public", "data", "questions.json");
const passagesPath = join(root, "public", "data", "passages.json");
const scholarshipsPath = join(root, "public", "data", "scholarships.json");
const extraQuestionsPath = join(root, "content", "questions.extra.json");
const scrapedScholarshipsPath = join(root, "content", "scholarships.scraped.json");
const scrapedScholarshipsV2Path = join(root, "content", "scholarships.scraped.v2.json");

async function readJsonIfExists(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeById(base = [], extra = []) {
  const map = new Map();
  extra.forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  base.forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  return [...map.values()];
}

const extraQuestions = (await readJsonIfExists(extraQuestionsPath))?.questions || [];
const scrapedScholarships = (await readJsonIfExists(scrapedScholarshipsPath))?.scholarships || [];
const scrapedScholarshipsV2 = (await readJsonIfExists(scrapedScholarshipsV2Path))?.scholarships || [];

function v2ToLegacy(v2) {
  return {
    id: v2.id,
    name: v2.name,
    country: "UK",
    city: "Online",
    tuition_international_yearly: 0,
    currency: v2.coverage?.currency || "GBP",
    typical_program_length_months: 12,
    living_cost_monthly_by_city: {},
    IHS_per_year: 0,
    CAS_issuance_speed: "unknown",
    research_areas: ["scholarship", "funding"],
    website: v2.application?.url || v2.source?.sourceUrl,
    notes: v2.source?.rawText ? v2.source.rawText.slice(0, 260) : "",
    source: "scraped",
    verified: v2.source?.verified ?? false,
    active: true,
    scraped_from: v2.source?.sourceUrl,
    scholarship: v2,
  };
}

await writeFile(
  passagesPath,
  JSON.stringify(
    {
      version: "1.0.0",
      updated_at: new Date().toISOString(),
      passages: PASSAGES,
    },
    null,
    2
  ),
  "utf8"
);

await writeFile(
  questionsPath,
  JSON.stringify(
    {
      version: "1.0.0",
      updated_at: new Date().toISOString(),
      total: mergeById(QB, extraQuestions).length,
      questions: mergeById(QB, extraQuestions),
    },
    null,
    2
  ),
  "utf8"
);

const scrapedV2AsLegacy = scrapedScholarshipsV2.map(v2ToLegacy);
const allScraped = mergeById(scrapedScholarships, scrapedV2AsLegacy);
const institutions = mergeById(INSTITUTIONS, allScraped);

await writeFile(
  scholarshipsPath,
  JSON.stringify(
    {
      version: "1.0.0",
      updated_at: new Date().toISOString(),
      total: institutions.length,
      institutions,
    },
    null,
    2
  ),
  "utf8"
);

console.log("Refreshed public data files.");
