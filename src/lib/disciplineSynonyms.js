// Curated synonym map for disciplines and fields that don't lexically overlap.
// Covers the main cases where regex/keyword matching alone would miss.
// Extended by the ontology normalizer at match time.

const DISCIPLINE_SYNONYMS = {
  // Computing & AI
  "ai": ["artificial intelligence", "machine learning", "deep learning"],
  "artificial intelligence": ["ai", "machine learning", "deep learning", "ml"],
  "machine learning": ["ml", "ai", "artificial intelligence", "deep learning"],
  "ml": ["machine learning", "ai", "artificial intelligence"],
  "data science": ["data analytics", "big data", "data engineering"],
  "data analytics": ["data science", "big data"],
  "software engineering": ["software development", "programming", "web development"],
  "cybersecurity": ["information security", "network security", "infosec"],

  // Engineering
  "mechanical engineering": ["mechatronics", "automotive engineering"],
  "electrical engineering": ["electronics", "power systems", "control systems"],
  "civil engineering": ["structural engineering", "construction management"],
  "chemical engineering": ["process engineering", "petrochemical engineering"],
  "environmental engineering": ["sustainable engineering", "green technology"],

  // Business & Economics
  "economics": ["economic development", "econometrics", "macroeconomic"],
  "development economics": ["international development", "development studies", "economic development"],
  "international development": ["development economics", "development studies", "global development"],
  "finance": ["financial management", "investment", "banking", "corporate finance"],
  "business administration": ["mba", "business management", "organisational management"],
  "accounting": ["accountancy", "financial accounting", "auditing"],
  "marketing": ["digital marketing", "brand management", "market research"],

  // Health & Life Sciences
  "public health": ["global health", "epidemiology", "community health", "health policy"],
  "global health": ["public health", "international health"],
  "epidemiology": ["disease control", "public health surveillance"],
  "nursing": ["clinical nursing", "midwifery", "nurse practitioner"],
  "pharmacy": ["pharmacology", "pharmaceutical sciences"],
  "biomedical science": ["biomedicine", "medical laboratory science", "clinical science"],
  "biotechnology": ["biotech", "genetic engineering", "molecular biology"],

  // Natural Sciences
  "environmental science": ["environmental management", "ecology", "conservation"],
  "climate science": ["climate change", "atmospheric science", "meteorology"],
  "renewable energy": ["sustainable energy", "solar energy", "clean energy"],
  "agriculture": ["agricultural science", "agronomy", "food security", "crop science"],

  // Social Sciences & Humanities
  "psychology": ["clinical psychology", "counselling", "behavioral science"],
  "sociology": ["social policy", "social research", "social work"],
  "political science": ["international relations", "public policy", "governance"],
  "international relations": ["diplomacy", "global affairs", "foreign policy"],
  "law": ["legal studies", "international law", "human rights law", "llb", "llm"],
  "education": ["teaching", "educational leadership", "curriculum development", "literacy"],
  "linguistics": ["applied linguistics", "tesol", "language studies", "english language"],

  // Cross-cutting
  "project management": ["program management", "operations management"],
  "supply chain": ["logistics", "procurement", "operations"],
  "entrepreneurship": ["innovation", "startup", "enterprise development"],
  "gender studies": ["women studies", "gender and development"],
  "human rights": ["international human rights", "humanitarian law", "social justice"],
};

// Expand a token or phrase into itself plus all known synonyms
export function expandWithSynonyms(keyword) {
  const normalized = String(keyword || "").toLowerCase().trim();
  if (!normalized) return [normalized];

  const results = new Set([normalized]);

  // Direct lookup
  const synonyms = DISCIPLINE_SYNONYMS[normalized];
  if (synonyms) {
    for (const synonym of synonyms) {
      results.add(synonym);
    }
  }

  // Reverse lookup: if the keyword IS a synonym, add the canonical term
  for (const [canonical, aliasList] of Object.entries(DISCIPLINE_SYNONYMS)) {
    if (aliasList.includes(normalized)) {
      results.add(canonical);
      for (const alias of aliasList) {
        results.add(alias);
      }
    }
  }

  return [...results];
}

// Expand an entire list of keywords with synonyms
export function expandKeywordList(keywords) {
  const expanded = new Set();
  for (const kw of (Array.isArray(keywords) ? keywords : [])) {
    for (const variant of expandWithSynonyms(kw)) {
      expanded.add(variant);
    }
  }
  return [...expanded];
}

export default DISCIPLINE_SYNONYMS;
