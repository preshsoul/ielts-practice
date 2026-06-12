const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f-\u009f]/g;
const TAGS_RE = /<\/?[^>]+>/g;
const JS_URL_RE = /^\s*javascript:/i;

export function cleanText(value, { maxLength = 256, allowNewlines = false } = {}) {
  const text = String(value ?? "")
    .replace(CONTROL_CHARS_RE, "")
    .replace(TAGS_RE, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();

  const normalized = allowNewlines
    ? text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    : text.replace(/\s+/g, " ");

  return normalized.slice(0, maxLength);
}

export function cleanEmail(value) {
  const text = cleanText(value, { maxLength: 254 }).toLowerCase();
  if (!text || text.length > 254) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

export function cleanNumber(value, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.trunc(bounded) : bounded;
}

export function cleanList(value, { maxItems = 25, maxLength = 80 } = {}) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return items
    .map((item) => cleanText(item, { maxLength }))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function cleanUrl(value) {
  const text = String(value ?? "").trim();
  if (!text || JS_URL_RE.test(text)) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function cleanReferee(referee) {
  if (typeof referee === "string") {
    const name = cleanText(referee, { maxLength: 120 });
    return name ? { name, status: "pending" } : null;
  }

  if (!referee || typeof referee !== "object") return null;

  const name = cleanText(referee.name, { maxLength: 120 });
  if (!name) return null;

  return {
    name,
    status: cleanText(referee.status, { maxLength: 32 }) || "pending",
  };
}

function cleanNestedProfileSection(section = {}) {
  return Object.fromEntries(
    Object.entries(section || {}).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, cleanText(value, { maxLength: 160 }) || null];
      }

      if (typeof value === "number") {
        return [key, Number.isFinite(value) ? value : null];
      }

      if (Array.isArray(value)) {
        return [key, cleanList(value)];
      }

      return [key, value];
    })
  );
}

export function cleanProfilePatch(payload = {}) {
  const next = { ...payload };

  delete next.email_hash;
  delete next.device_id;
  delete next.tier;
  delete next.onboarding_completed;

  if (next.display_name !== undefined) {
    next.display_name = cleanText(next.display_name, { maxLength: 120 }) || null;
  }

  if (next.identity) next.identity = cleanNestedProfileSection(next.identity);
  if (next.academic) next.academic = cleanNestedProfileSection(next.academic);
  if (next.professional) next.professional = cleanNestedProfileSection(next.professional);
  // PostgreSQL folds unquoted identifiers to lowercase (applicationCycle -> applicationcycle).
  // The PostgREST schema cache stores the lowercase names, so we must rename.
  if (next.languageTests) {
    next.languagetests = cleanNestedProfileSection(next.languageTests);
    delete next.languageTests;
  }

  if (next.applicationCycle !== undefined) {
    next.applicationcycle = cleanText(next.applicationCycle, { maxLength: 24 }) || null;
    delete next.applicationCycle;
  }

  if (next.targetDegreeLevel !== undefined) {
    next.targetdegreelevel = cleanText(next.targetDegreeLevel, { maxLength: 64 }) || null;
    delete next.targetDegreeLevel;
  }

  if (next.targetDisciplines !== undefined) {
    next.targetdisciplines = cleanList(next.targetDisciplines, { maxLength: 64 });
    delete next.targetDisciplines;
  }

  if (next.targetCountries !== undefined) {
    next.targetcountries = cleanList(next.targetCountries, { maxLength: 64 });
    delete next.targetCountries;
  }

  if (next.self_assessment) {
    next.self_assessment = cleanNestedProfileSection(next.self_assessment);
  }

  if (next.test_date !== undefined) {
    const text = cleanText(next.test_date, { maxLength: 16 });
    next.test_date = text || null;
  }

  if (next.target_band !== undefined) {
    next.target_band = cleanNumber(next.target_band, { min: 0, max: 9, integer: false });
  }

  if (next.last_seen_at !== undefined) {
    next.last_seen_at = new Date().toISOString();
  }

  return next;
}

export function cleanCvProfile(payload = {}) {
  return {
    profile_id: cleanText(payload.profile_id, { maxLength: 64 }) || null,
    label: cleanText(payload.label, { maxLength: 120 }) || null,
    source_filename: cleanText(payload.source_filename || payload.sourceFilename, { maxLength: 180 }) || null,
    mime_type: cleanText(payload.mime_type || payload.mimeType, { maxLength: 120 }) || null,
    document_type: cleanText(payload.document_type || payload.documentType, { maxLength: 40 }) || null,
    raw_text_hash: cleanText(payload.raw_text_hash || payload.rawTextHash, { maxLength: 128 }) || null,
    extracted_excerpt: cleanText(payload.extracted_excerpt || payload.extractedExcerpt, { maxLength: 1200, allowNewlines: true }) || null,
    extracted_text: cleanText(payload.extracted_text || payload.extractedText, { maxLength: 20000, allowNewlines: true }) || null,
    parsed_profile: payload.parsed_profile && typeof payload.parsed_profile === "object"
      ? payload.parsed_profile
      : payload.parsedProfile && typeof payload.parsedProfile === "object"
        ? payload.parsedProfile
        : {},
    parsed_candidate_profile: payload.parsed_candidate_profile && typeof payload.parsed_candidate_profile === "object"
      ? payload.parsed_candidate_profile
      : payload.parsedCandidateProfile && typeof payload.parsedCandidateProfile === "object"
        ? payload.parsedCandidateProfile
        : {},
    parser_version: cleanText(payload.parser_version || (payload.provenance?.parser_version), { maxLength: 40 }) || null,
    parser_method: cleanText(payload.parser_method || (payload.provenance?.method), { maxLength: 40 }) || null,
    parser_model: cleanText(payload.parser_model || (payload.provenance?.model), { maxLength: 80 }) || null,
    parsed_at: cleanText(payload.parsed_at || (payload.provenance?.parsed_at), { maxLength: 32 }) || null,
    confidence: cleanNumber(payload.confidence, { min: 0, max: 1, integer: false }),
    keywords: cleanList(payload.keywords, { maxItems: 40, maxLength: 64 }),
  };
}

export function cleanCandidateProfile(payload = {}) {
  const embedding = Array.isArray(payload.embedding)
    ? payload.embedding
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    : payload.embedding ?? null;

  return {
    profile_id: cleanText(payload.profile_id, { maxLength: 64 }) || null,
    source_type: cleanText(payload.source_type, { maxLength: 32 }) || "merged",
    semantic_text: cleanText(payload.semantic_text, { maxLength: 8000, allowNewlines: true }) || null,
    canonical_json: payload.canonical_json && typeof payload.canonical_json === "object"
      ? payload.canonical_json
      : {},
    confidence_json: payload.confidence_json && typeof payload.confidence_json === "object"
      ? payload.confidence_json
      : {},
    embedding_model: cleanText(payload.embedding_model, { maxLength: 120 }) || null,
    embedding,
    last_cv_profile_id: cleanText(payload.last_cv_profile_id, { maxLength: 64 }) || null,
    source_fingerprint: cleanText(payload.source_fingerprint, { maxLength: 128 }) || null,
  };
}

export function cleanApplicationTracking(payload = {}) {
  return {
    ...payload,
    state: cleanText(payload.state, { maxLength: 32 }) || "saved",
    notes: cleanText(payload.notes, { maxLength: 1200, allowNewlines: true }) || null,
    state_updated_at: new Date().toISOString(),
    documents_checklist: payload.documents_checklist && typeof payload.documents_checklist === "object"
      ? {
          ...payload.documents_checklist,
          requiredDocuments: cleanList(payload.documents_checklist.requiredDocuments, { maxItems: 20, maxLength: 80 }),
          completedDocuments: cleanList(payload.documents_checklist.completedDocuments, { maxItems: 20, maxLength: 80 }),
        }
      : payload.documents_checklist,
    referees: Array.isArray(payload.referees)
      ? payload.referees.map(cleanReferee).filter(Boolean)
      : [],
  };
}
