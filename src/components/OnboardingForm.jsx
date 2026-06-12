import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDocumentImport } from "../hooks/useDocumentImport.js";
import { rankScholarships } from "../services/scoringEngine.js";

const MODULES = ["reading", "listening", "writing", "speaking"];
const STEPS = ["Extraction", "Verification", "Alignment", "Verdict"];

function updateDraft(setDraft, patch) {
  setDraft((current) => ({ ...current, ...patch }));
}

function updateNested(setDraft, section, field, value) {
  setDraft((current) => ({
    ...current,
    [section]: {
      ...(current[section] || {}),
      [field]: value,
    },
  }));
}

function updateCurrentLevel(setDraft, field, value) {
  setDraft((current) => ({
    ...current,
    currentLevel: {
      ...current.currentLevel,
      [field]: value,
    },
  }));
}

function getList(value) {
  return Array.isArray(value) ? value : [];
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getConfidencePercent(draft) {
  if (draft?.dossier?.confidence !== undefined) return Math.round(Number(draft.dossier.confidence || 0) * 100);
  const filled = [
    draft?.academic?.discipline,
    draft?.academic?.degreeClass,
    draft?.identity?.nationality,
    draft?.targetDegreeLevel,
    draft?.targetCountries?.length,
    draft?.targetBand,
  ].filter(Boolean).length;
  return Math.round((filled / 6) * 100);
}

function getReadinessPercent(draft) {
  const skillValues = MODULES.map((module) => Number(draft?.currentLevel?.[module])).filter((value) => Number.isFinite(value) && value > 0);
  const skillAverage = skillValues.length ? skillValues.reduce((sum, value) => sum + value, 0) / skillValues.length : 0;
  const confidence = getConfidencePercent(draft);
  const profileSignals = [
    draft?.academic?.discipline,
    draft?.academic?.degreeClass,
    draft?.identity?.nationality,
    draft?.targetDegreeLevel,
    getList(draft?.targetCountries).length,
    getList(draft?.targetTracks).length,
    draft?.testDate,
  ].filter(Boolean).length;
  return Math.max(12, Math.min(96, Math.round((skillAverage / 9) * 34 + (confidence / 100) * 28 + (profileSignals / 7) * 38)));
}

function getVerdict(readiness) {
  if (readiness >= 78) return { label: "High Potential", tone: "high" };
  if (readiness >= 56) return { label: "Promising, With Gaps", tone: "medium" };
  return { label: "Foundation Needed", tone: "low" };
}

function getVerificationIssues(draft = {}) {
  const issues = [];
  const confidence = Number(draft?.dossier?.confidence || 0);

  if (draft?.dossier && confidence > 0 && confidence < 0.5) {
    issues.push({
      key: "confidence",
      tone: "high",
      title: "Extraction confidence is low",
      detail: "Review the academic and language fields before using them for scholarship matching.",
    });
  }

  if (!hasValue(draft?.identity?.nationality)) {
    issues.push({
      key: "nationality",
      tone: "medium",
      title: "Nationality still needs confirmation",
      detail: "Many scholarship filters depend on confirmed nationality.",
    });
  }

  if (!hasValue(draft?.academic?.discipline)) {
    issues.push({
      key: "discipline",
      tone: "medium",
      title: "Discipline is still missing",
      detail: "Loci needs your field of study to match you against the right scholarship taxonomy.",
    });
  }

  if (!hasValue(draft?.academic?.degreeClass)) {
    issues.push({
      key: "degree-class",
      tone: "medium",
      title: "Degree class is unverified",
      detail: "This affects minimum eligibility checks for UK scholarship routes.",
    });
  }

  if (!hasValue(draft?.professional?.workExperienceYears)) {
    issues.push({
      key: "experience",
      tone: "low",
      title: "Work experience is not confirmed yet",
      detail: "Mid-career and leadership scholarships often require verified experience.",
    });
  }

  return issues;
}

function getVerdictBlockers(draft = {}, resolutionDraft = {}) {
  const blockers = [];
  const resolved = resolutionDraft?.resolved || {};

  if (resolved.nationality?.state === "conflict") {
    blockers.push("Nationality was edited after extraction and still needs a final confirmation.");
  }
  if (resolved.degreeClass?.state === "conflict") {
    blockers.push("Degree class differs from the uploaded dossier and should be confirmed before ranking.");
  }
  if (resolved.discipline?.state === "needs_verification") {
    blockers.push(resolved.discipline.reason || "Discipline still needs to be verified.");
  }
  if (resolved.languageTests?.state === "needs_verification") {
    blockers.push(resolved.languageTests.reason || "Language readiness is still unverified.");
  }
  if (resolved.workExpYears?.state === "needs_verification") {
    blockers.push(resolved.workExpYears.reason || "Work experience is still unverified.");
  }

  if (!hasValue(draft?.identity?.nationality)) {
    blockers.push("Nationality is still missing for scholarship eligibility checks.");
  }
  if (!hasValue(draft?.academic?.degreeClass)) {
    blockers.push("Degree class is not confirmed yet.");
  }
  if (!hasValue(draft?.academic?.discipline)) {
    blockers.push("Discipline still needs to be verified.");
  }
  if (!hasValue(draft?.targetDegreeLevel)) {
    blockers.push("Target degree level is not selected.");
  }
  if (!getList(draft?.targetCountries).length) {
    blockers.push("Target country is still open-ended.");
  }
  if (!hasValue(draft?.targetBand)) {
    blockers.push("Target IELTS band is not set.");
  }

  const missingBands = MODULES.filter((module) => !hasValue(draft?.currentLevel?.[module]));
  if (missingBands.length) {
    blockers.push(`${missingBands.map((item) => item[0].toUpperCase() + item.slice(1)).join(", ")} still need IELTS baseline scores.`);
  }

  return [...new Set(blockers)].slice(0, 4);
}

function getRecommendedNextAction(draft = {}, resolutionDraft = {}) {
  const resolved = resolutionDraft?.resolved || {};
  const unresolvedFields = [resolved.nationality, resolved.discipline, resolved.degreeClass, resolved.languageTests]
    .filter((field) => field && (field.state === "needs_verification" || field.state === "conflict"));

  if (unresolvedFields.length) {
    return {
      title: "Resolve your profile evidence",
      detail: "Confirm the fields Loci is still uncertain about so your scholarship ranking is based on trusted signals.",
      surface: "Verification",
    };
  }

  const missingBands = MODULES.filter((module) => !hasValue(draft?.currentLevel?.[module]));
  if (missingBands.length) {
    return {
      title: "Build your IELTS baseline",
      detail: "Complete one focused practice session so Loci can start ranking opportunities against real language evidence.",
      surface: "Practice",
    };
  }

  if (!hasValue(draft?.testDate)) {
    return {
      title: "Set your test timeline",
      detail: "A test date gives the readiness engine something concrete to plan around.",
      surface: "Verdict",
    };
  }

  return {
    title: "Review your strongest matches",
    detail: "Your profile is strong enough to move into the scholarship workspace and shortlist viable funding routes.",
    surface: "Scholarships",
  };
}

function getExtractionSignals(draft = {}) {
  const intake = draft?.dossier || {};
  const extractedText = String(intake?.extractedText || "");
  const parsedProfile = intake?.parsedProfile || {};
  const resolvedCount = [
    parsedProfile?.identity?.nationality || parsedProfile?.identity?.countryOfResidence,
    parsedProfile?.academic?.degreeClass,
    parsedProfile?.academic?.discipline,
    parsedProfile?.professional?.workExperienceYears,
    parsedProfile?.languageTests?.ielts,
    parsedProfile?.targetDegreeLevel,
  ].filter(hasValue).length;
  return [
    {
      key: "document",
      label: "Upload status",
      value: intake?.sourceFilename ? "Received" : "Waiting",
      detail: intake?.sourceFilename ? intake.sourceFilename : "No dossier uploaded yet.",
      tone: intake?.sourceFilename ? "high" : "muted",
    },
    {
      key: "text",
      label: "Readable text",
      value: extractedText ? `${Math.min(extractedText.length, 9999)} chars` : "None",
      detail: extractedText ? "This is the text the parser could actually read from the file." : "We could not read enough text from this file.",
      tone: extractedText ? "medium" : "muted",
    },
    {
      key: "signals",
      label: "Detected fields",
      value: `${resolvedCount}`,
      detail: resolvedCount ? "Only the fields below were inferred with any confidence." : "No trustworthy structured fields were inferred yet.",
      tone: resolvedCount ? "high" : "muted",
    },
  ];
}

function getExtractionEdgeCases(draft = {}) {
  const intake = draft?.dossier || {};
  const confidence = Number(intake?.confidence || 0);
  const cases = [];

  if (draft?.dossier && confidence < 0.5) {
    cases.push({
      key: "low-confidence",
      tone: "error",
      title: "Low confidence alert",
      detail: "Legibility or document structure is limiting extraction quality.",
      action: "Upload a clearer file",
    });
  }

  if (draft?.dossier && !hasValue(intake?.parsedProfile?.identity?.nationality) && !hasValue(draft?.identity?.nationality)) {
    cases.push({
      key: "missing-metadata",
      tone: "warning",
      title: "Missing metadata",
      detail: "Nationality and country signals were not confidently detected from the dossier.",
      action: "Verify manually",
    });
  }

  if (draft?.dossier && !hasValue(intake?.extractedText)) {
    cases.push({
      key: "format-conflict",
      tone: "warning",
      title: "Format conflict",
      detail: "This document may be image-heavy or contain limited selectable text.",
      action: "Try another format",
    });
  }

  return cases;
}

function summarizeResolvedField(field) {
  if (!field) {
    return { status: "missing", statusLabel: "Missing", extracted: "", reason: "" };
  }

  if (field.state === "conflict") {
    return { status: "changed", statusLabel: "Edited", extracted: field.extractedValue || "", reason: field.reason || "" };
  }

  if (field.state === "confirmed") {
    return { status: "confirmed", statusLabel: "Confirmed", extracted: field.extractedValue || "", reason: "" };
  }

  if (field.state === "extracted_only") {
    return { status: "detected", statusLabel: "Detected", extracted: field.extractedValue || field.value || "", reason: "" };
  }

  return { status: "missing", statusLabel: "Needs review", extracted: field.extractedValue || field.value || "", reason: field.reason || "" };
}

function buildVerificationRows(draft = {}, resolutionDraft = {}) {
  const extracted = draft?.dossier?.parsedProfile || {};
  const resolved = resolutionDraft?.resolved || {};
  const rows = [
    {
      key: "nationality",
      label: "Nationality",
      value: draft?.identity?.nationality || "",
      extracted: extracted?.identity?.nationality || extracted?.identity?.countryOfResidence || "",
      resolvedField: resolved.nationality,
    },
    {
      key: "degreeClass",
      label: "Degree class",
      value: draft?.academic?.degreeClass || "",
      extracted: extracted?.academic?.degreeClass || "",
      resolvedField: resolved.degreeClass,
    },
    {
      key: "discipline",
      label: "Discipline",
      value: draft?.academic?.discipline || "",
      extracted: extracted?.academic?.discipline || extracted?.academic?.disciplineCategory || "",
      resolvedField: resolved.discipline,
    },
    {
      key: "experience",
      label: "Work experience",
      value: draft?.professional?.workExperienceYears || "",
      extracted: extracted?.professional?.workExperienceYears || "",
      resolvedField: resolved.workExpYears,
    },
    {
      key: "ielts",
      label: "IELTS overall",
      value: draft?.languageTests?.ielts || "",
      extracted: extracted?.languageTests?.ielts || "",
      resolvedField: resolved.languageTests,
    },
    {
      key: "targetLevel",
      label: "Target degree level",
      value: draft?.targetDegreeLevel || "",
      extracted: extracted?.targetDegreeLevel || "",
    },
  ];

  return rows.map((row) => {
    const resolvedSummary = summarizeResolvedField(row.resolvedField);
    const hasCurrent = hasValue(row.value);
    const hasExtracted = hasValue(row.extracted);
    const normalizedValue = String(row.value || "").trim().toLowerCase();
    const normalizedExtracted = String(row.extracted || "").trim().toLowerCase();
    const fallbackStatus = !hasCurrent && !hasExtracted
      ? "missing"
      : hasCurrent && hasExtracted && normalizedValue !== normalizedExtracted
        ? "changed"
        : hasCurrent
          ? "confirmed"
          : "detected";

    return {
      ...row,
      status: row.resolvedField ? resolvedSummary.status : fallbackStatus,
      statusLabel: row.resolvedField
        ? resolvedSummary.statusLabel
        : fallbackStatus === "confirmed"
          ? "Confirmed"
          : fallbackStatus === "changed"
            ? "Edited"
            : fallbackStatus === "detected"
              ? "Detected"
              : "Missing",
      extracted: row.resolvedField ? resolvedSummary.extracted || row.extracted : row.extracted,
      reason: row.resolvedField ? resolvedSummary.reason : "",
    };
  });
}

function buildProfileForScoring(draft = {}) {
  return {
    identity: draft.identity || {},
    academic: draft.academic || {},
    professional: draft.professional || {},
    languageTests: {
      ...(draft.languageTests || {}),
      ielts: draft.languageTests?.ielts || draft.targetBand || null,
      ieltsBands: draft.currentLevel || {},
    },
    applicationCycle: draft.applicationCycle || null,
    targetDegreeLevel: draft.targetDegreeLevel || null,
    targetDisciplines: getList(draft.targetDisciplines),
    targetCountries: getList(draft.targetCountries),
  };
}

function getScholarshipTitle(scholarship) {
  return scholarship?.name || scholarship?.title || scholarship?.awardingBody || "Scholarship";
}

function getScholarshipSponsor(scholarship) {
  return scholarship?.awardingBody || scholarship?.provider || scholarship?.sourceLabel || "Funding body";
}

function getScholarshipKey(scholarship, fallback) {
  return String(scholarship?.id || scholarship?.slug || scholarship?.external_id || fallback);
}

function ConfidenceDots({ value }) {
  const lit = value >= 78 ? 3 : value >= 50 ? 2 : value > 0 ? 1 : 0;
  return (
    <div className="loci-dots" aria-label={`${value}% confidence`}>
      {[0, 1, 2].map((index) => <span key={index} className={index < lit ? "is-on" : ""} />)}
    </div>
  );
}

function StepRail({ step, setStep }) {
  return (
    <div className="loci-step-rail" aria-label="Onboarding progress">
      {STEPS.map((label, index) => (
        <button
          type="button"
          key={label}
          className={index === step ? "is-active" : index < step ? "is-complete" : ""}
          onClick={() => setStep(index)}
        >
          <span>{label}</span>
          {index < STEPS.length - 1 && <i aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

function ExtractionStep({ draft, setDraft, setStep, onSkipUpload }) {
  const [uploadStatus, setUploadStatus] = useState("");
  const { status: parserStatus, progress, phase, message: parserMessage, result, upload } = useDocumentImport();
  const isReading = parserStatus === "uploading" || parserStatus === "processing";
  const keywords = getList(draft?.dossier?.keywords).slice(0, 8);
  const confidence = getConfidencePercent(draft);
  const extractionSignals = getExtractionSignals(draft);
  const edgeCases = getExtractionEdgeCases(draft);
  const uploadSucceeded = Boolean(draft?.dossier?.sourceFilename) && !isReading;

  const handleFile = async (file) => {
    if (!file) return;
    setUploadStatus("");
    const parserResult = await upload(file, draft?.dossierNote || "");
    if (!parserResult) return;

    const metadata = parserResult?.metadata || {};
    const canonical = parserResult?.parsed_candidate_profile || null;
    const legacyProfile = parserResult?.profile || {};

    const intake = {
      label: (draft?.dossierNote || "").trim() || file.name,
      sourceFilename: file.name,
      mimeType: file.type || "",
      documentType: file.name.match(/\.(pdf|docx?|txt|rtf)$/i)?.[1] || "unknown",
      rawTextHash: metadata?.source_document_hash || null,
      extractedExcerpt: metadata?.extracted_text_preview || "",
      extractedText: "",
      keywords: Array.isArray(canonical?.keywords) ? canonical.keywords : [],
      parsedProfile: {
        identity: {
          nationality: legacyProfile?.personal_details?.nationality?.label || legacyProfile?.personal_details?.nationality?.raw_text || "",
          countryOfResidence: legacyProfile?.personal_details?.nationality?.label || "",
        },
        academic: {
          institution: legacyProfile?.academic_history?.[0]?.institution || "",
          discipline: legacyProfile?.academic_history?.[0]?.academic_discipline || "",
          disciplineCategory: legacyProfile?.academic_history?.[0]?.academic_discipline || "",
          graduationYear: legacyProfile?.academic_history?.[0]?.graduation_year ?? null,
          degreeClass: legacyProfile?.academic_history?.[0]?.degree_class?.label || "",
          degreeLevel: legacyProfile?.academic_history?.[0]?.degree_type || "",
        },
        professional: {},
        languageTests: {
          ielts: legacyProfile?.international_exams?.ielts_band_score ?? null,
        },
        applicationCycle: "",
        targetDegreeLevel: legacyProfile?.academic_history?.[0]?.degree_type || "",
        targetDisciplines: legacyProfile?.academic_history?.[0]?.academic_discipline ? [legacyProfile.academic_history[0].academic_discipline] : [],
        targetCountries: legacyProfile?.personal_details?.nationality?.label ? [legacyProfile.personal_details.nationality.label] : [],
      },
      parsedCandidateProfile: canonical,
      provenance: parserResult?.provenance || null,
      confidence: parserResult?.confidence_score ?? 0,
    };

    setDraft((current) => ({
      ...current,
      displayName: canonical?.personal_details?.full_legal_name || current.displayName || "",
      dossier: intake,
      academic: { ...(current.academic || {}), ...(intake.parsedProfile?.academic || {}) },
      identity: { ...(current.identity || {}), ...(intake.parsedProfile?.identity || {}) },
      professional: { ...(current.professional || {}), ...(intake.parsedProfile?.professional || {}) },
      languageTests: { ...(current.languageTests || {}), ...(intake.parsedProfile?.languageTests || {}) },
      currentLevel: current.currentLevel || {}, // ensure band-score inputs never crash VerdictStep
      targetDegreeLevel: current.targetDegreeLevel || intake.parsedProfile?.targetDegreeLevel || "",
      targetDisciplines: getList(current.targetDisciplines).length ? current.targetDisciplines : getList(intake.parsedProfile?.targetDisciplines),
      targetCountries: getList(current.targetCountries).length ? current.targetCountries : getList(intake.parsedProfile?.targetCountries),
    }));
    setUploadStatus(`Upload received: ${intake.sourceFilename}. The parser draft is ready for review below.`);
  };

  return (
    <div className="loci-flow-grid">
      <section className="loci-flow-main">
        <div className="loci-page-heading">
          <p>Identity intelligence</p>
          <h1>Initialize Core Pedigree Scan</h1>
          <span>Upload your academic dossier or professional history, then verify the profile signals Loci should use for matching.</span>
        </div>

        <label className="loci-upload-zone">
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.rtf,.md"
            onChange={(event) => handleFile(event.target.files?.[0] || null)}
          />
          <strong>{isReading ? "Parsing intelligence..." : "Drop Intelligence Dossier"}</strong>
          <span>PDF, DOCX, RTF, TXT, or profile notes under 5MB</span>
          <b>{isReading ? "Reading" : "Select File"}</b>
        </label>

        {uploadStatus && <div className={`loci-inline-status${uploadSucceeded ? " is-success" : ""}`}>{uploadStatus}</div>}
        {uploadSucceeded && (
          <div className="loci-inline-status is-success">
            Candidate dossier on file: {draft.dossier.sourceFilename}
          </div>
        )}

        <div className="loci-signal-card-grid">
          {extractionSignals.map((signal) => (
            <article key={signal.key} className={`loci-signal-card is-${signal.tone}`}>
              <div>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </div>
              <p>{signal.detail}</p>
            </article>
          ))}
        </div>

        <div className="loci-card-grid">
          <label className="loci-field">
            <span>Full legal name</span>
            <input value={draft.displayName || ""} onChange={(event) => updateDraft(setDraft, { displayName: event.target.value })} placeholder="Candidate name" />
          </label>
          <label className="loci-field">
            <span>Nationality</span>
            <input value={draft.identity?.nationality || ""} onChange={(event) => updateNested(setDraft, "identity", "nationality", event.target.value)} placeholder="Nigerian" />
          </label>
          <label className="loci-field">
            <span>Degree class</span>
            <select value={draft.academic?.degreeClass || ""} onChange={(event) => updateNested(setDraft, "academic", "degreeClass", event.target.value)}>
              <option value="">Select degree class</option>
              <option value="first">First class</option>
              <option value="2:1">Second class upper (2:1)</option>
              <option value="2:2">Second class lower (2:2)</option>
              <option value="third">Third class</option>
            </select>
          </label>
          <label className="loci-field">
            <span>Academic discipline</span>
            <input value={draft.academic?.discipline || ""} onChange={(event) => updateNested(setDraft, "academic", "discipline", event.target.value)} placeholder="Sustainable Development" />
          </label>
        </div>

        {keywords.length > 0 && (
          <div className="loci-keyword-strip">
            {keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
          </div>
        )}

        {edgeCases.length > 0 && (
          <div className="loci-edgecase-stack">
            {edgeCases.map((item) => (
              <article key={item.key} className={`loci-edgecase-card is-${item.tone}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
                <b>{item.action}</b>
              </article>
            ))}
          </div>
        )}

        <div className="loci-actions">
          <button type="button" className="loci-ghost-button" onClick={onSkipUpload}>Skip upload</button>
          <button type="button" className="loci-primary-button" onClick={() => setStep(1)}>Continue to verification</button>
        </div>
      </section>

      <aside className="loci-intel-panel">
        <div className="loci-panel-title">Parsing Engine</div>
        <div className="loci-meter">
          <span style={{ width: `${confidence}%` }} />
        </div>
        <div className="loci-panel-stat">
          <strong>{confidence}%</strong>
          <span>Extraction confidence</span>
        </div>
        <div className="loci-signal-list">
          <div><span>Academic</span><ConfidenceDots value={draft.academic?.discipline ? confidence : 0} /></div>
          <div><span>Identity</span><ConfidenceDots value={draft.identity?.nationality ? confidence : 0} /></div>
          <div><span>Language</span><ConfidenceDots value={draft.languageTests?.ielts ? confidence : 0} /></div>
        </div>
      </aside>
    </div>
  );
}

function VerificationStep({ draft, resolutionDraft, setDraft, setStep }) {
  const issues = getVerificationIssues(draft);
  const confidence = getConfidencePercent(draft);
  const verificationRows = buildVerificationRows(draft, resolutionDraft);

  return (
    <div className="loci-flow-grid">
      <section className="loci-flow-main">
        <div className="loci-page-heading">
          <p>Profile verification</p>
          <h1>Confirm What Loci Should Trust</h1>
          <span>Review the extracted profile, correct anything that looks off, and make sure your scholarship baseline is solid before alignment.</span>
        </div>

        {issues.length > 0 ? (
          <div className="loci-issue-stack">
            {issues.map((issue) => (
              <article key={issue.key} className={`loci-issue-card is-${issue.tone}`}>
                <strong>{issue.title}</strong>
                <span>{issue.detail}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="loci-inline-status is-success">No critical extraction issue detected. You can continue once these details look right.</div>
        )}

        <div className="loci-verify-grid">
          {verificationRows.map((row) => (
            <article key={row.key} className={`loci-verify-card is-${row.status}`}>
              <div className="loci-verify-card__top">
                <span>{row.label}</span>
                <b>{row.statusLabel}</b>
              </div>
              <strong>{hasValue(row.value) ? row.value : "Not added yet"}</strong>
              {hasValue(row.extracted) && (
                <div className="loci-verify-card__source">
                  Extracted: {row.extracted}
                </div>
              )}
              {hasValue(row.reason) && (
                <div className="loci-verify-card__source">
                  {row.reason}
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="loci-card-grid">
          <label className="loci-field">
            <span>Country of residence</span>
            <input value={draft.identity?.countryOfResidence || ""} onChange={(event) => updateNested(setDraft, "identity", "countryOfResidence", event.target.value)} placeholder="Nigeria" />
          </label>
          <label className="loci-field">
            <span>Institution</span>
            <input value={draft.academic?.institution || ""} onChange={(event) => updateNested(setDraft, "academic", "institution", event.target.value)} placeholder="University of Lagos" />
          </label>
          <label className="loci-field">
            <span>Graduation year</span>
            <input value={draft.academic?.graduationYear || ""} onChange={(event) => updateNested(setDraft, "academic", "graduationYear", event.target.value)} placeholder="2023" />
          </label>
          <label className="loci-field">
            <span>Work experience years</span>
            <input value={draft.professional?.workExperienceYears || ""} onChange={(event) => updateNested(setDraft, "professional", "workExperienceYears", event.target.value)} placeholder="2" />
          </label>
          <label className="loci-field">
            <span>IELTS overall</span>
            <input value={draft.languageTests?.ielts || ""} onChange={(event) => updateNested(setDraft, "languageTests", "ielts", event.target.value)} placeholder="7.0" />
          </label>
          <label className="loci-field">
            <span>Professional sector</span>
            <input value={draft.professional?.sector || ""} onChange={(event) => updateNested(setDraft, "professional", "sector", event.target.value)} placeholder="Public policy" />
          </label>
        </div>

        <div className="loci-actions">
          <button type="button" className="loci-ghost-button" onClick={() => setStep(0)}>Back to extraction</button>
          <button type="button" className="loci-primary-button" onClick={() => setStep(2)}>Continue to alignment</button>
        </div>
      </section>

      <aside className="loci-intel-panel">
        <div className="loci-panel-title">Verification Confidence</div>
        <div className="loci-meter">
          <span style={{ width: `${confidence}%` }} />
        </div>
        <div className="loci-panel-stat">
          <strong>{confidence}%</strong>
          <span>Current profile confidence</span>
        </div>
        <div className="loci-signal-list">
          <div><span>Nationality</span><ConfidenceDots value={hasValue(draft.identity?.nationality) ? confidence : 0} /></div>
          <div><span>Degree class</span><ConfidenceDots value={hasValue(draft.academic?.degreeClass) ? confidence : 0} /></div>
          <div><span>Experience</span><ConfidenceDots value={hasValue(draft.professional?.workExperienceYears) ? confidence : 0} /></div>
        </div>
      </aside>
    </div>
  );
}

function AlignmentStep({ draft, setDraft, setStep, scholarshipCatalog = [] }) {
  const selectedTracks = getList(draft.targetTracks);
  const readiness = getReadinessPercent(draft);
  const scoredTargets = useMemo(() => {
    const catalog = Array.isArray(scholarshipCatalog) ? scholarshipCatalog : [];
    if (!catalog.length) return [];
    try {
      return rankScholarships(catalog, buildProfileForScoring(draft), { limit: 4 }).scored || [];
    } catch {
      // Ranking is best-effort during onboarding — partial profiles may not score cleanly
      return [];
    }
  }, [draft, scholarshipCatalog]);
  const targetCards = scoredTargets
    .filter(({ analysis }) => Number(analysis?.score || 0) > 0 || Number(analysis?.retrievalScore || 0) > 0)
    .map(({ scholarship, analysis }, index) => ({
      key: getScholarshipKey(scholarship, `ranked-${index}`),
      title: getScholarshipTitle(scholarship),
      sponsor: getScholarshipSponsor(scholarship),
      themes: (analysis?.gaps || []).slice(0, 3).map((gap) => gap.message || gap.field || "Eligibility signal"),
      fit: Math.round(analysis?.fitScore ?? analysis?.score ?? 0),
    }));
  const toggleTrack = (key) => {
    setDraft((current) => {
      const currentTracks = getList(current.targetTracks);
      return {
        ...current,
        targetTracks: currentTracks.includes(key)
          ? currentTracks.filter((item) => item !== key)
          : [...currentTracks, key],
      };
    });
  };

  return (
    <div className="loci-flow-grid">
      <section className="loci-flow-main">
        <div className="loci-page-heading">
          <p>Target alignment</p>
          <h1>Verify Your Scholarship Trajectory</h1>
          <span>Confirm your academic focus and select the high-impact funding tracks Loci should prioritize.</span>
        </div>

        <div className="loci-discipline-card">
          <div>
            <span>Extracted discipline</span>
            <strong>{draft.academic?.discipline || "Discipline not added"}</strong>
          </div>
          <label>
            <span>Modify extraction</span>
            <input value={draft.academic?.discipline || ""} onChange={(event) => updateNested(setDraft, "academic", "discipline", event.target.value)} />
          </label>
        </div>

        {targetCards.length ? (
          <div className="loci-card-grid loci-target-grid">
            {targetCards.map((track) => {
              const active = selectedTracks.includes(track.key);
              return (
                <button type="button" key={track.key} className={`loci-track-card${active ? " is-active" : ""}`} onClick={() => toggleTrack(track.key)}>
                  <div>
                    <strong>{track.title}</strong>
                    <span>{track.sponsor}</span>
                  </div>
                  <b>{track.fit}%</b>
                  <div className="loci-track-meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, Math.min(track.fit, 100))}%` }} />
                  </div>
                  <p>{getList(track.themes).length ? getList(track.themes).join(" / ") : "No critical blocker detected yet"}</p>
                  <i>{active ? "Selected" : "Shortlist match"}</i>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="loci-inline-status">
            Ranking is not ready yet. Finish the core profile fields and save onboarding before Loci can show trustworthy scholarship matches.
          </div>
        )}

        <div className="loci-card-grid">
          <label className="loci-field">
            <span>Target degree level</span>
            <select value={draft.targetDegreeLevel || ""} onChange={(event) => updateDraft(setDraft, { targetDegreeLevel: event.target.value })}>
              <option value="">Select level</option>
              <option value="Master's">Master's</option>
              <option value="PhD">PhD</option>
              <option value="Bachelor's">Bachelor's</option>
            </select>
          </label>
          <label className="loci-field">
            <span>Target countries</span>
            <input value={getList(draft.targetCountries).join(", ")} onChange={(event) => updateDraft(setDraft, { targetCountries: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="United Kingdom" />
          </label>
          <label className="loci-field">
            <span>Application cycle</span>
            <input value={draft.applicationCycle || ""} onChange={(event) => updateDraft(setDraft, { applicationCycle: event.target.value })} placeholder="2026" />
          </label>
          <label className="loci-field">
            <span>Target band</span>
            <select value={draft.targetBand} onChange={(event) => updateDraft(setDraft, { targetBand: event.target.value })}>
              <option value="">Select IELTS band</option>
              {[6, 6.5, 7, 7.5, 8, 8.5, 9].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="loci-actions">
          <button type="button" className="loci-ghost-button" onClick={() => setStep(1)}>Back to verification</button>
          <button type="button" className="loci-primary-button" onClick={() => setStep(3)}>Generate verdict</button>
        </div>
      </section>

      <aside className="loci-intel-panel is-dark">
        <div className="loci-panel-title">Readiness Forecast</div>
        <p>{targetCards.length
          ? "These cards are drawn from the live scholarship scorer using your current profile."
          : "No reliable ranking is available yet, so this step stays descriptive until the profile is stronger."}</p>
        <div className="loci-panel-stat">
          <strong>{selectedTracks.length || 0}</strong>
          <span>Priority tracks selected</span>
        </div>
        <div className="loci-panel-stat">
          <strong>{readiness}%</strong>
          <span>Current readiness baseline</span>
        </div>
        <div className="loci-signal-list">
          <div><span>Level</span><ConfidenceDots value={hasValue(draft?.targetDegreeLevel) ? readiness : 0} /></div>
          <div><span>Country</span><ConfidenceDots value={getList(draft?.targetCountries).length ? readiness : 0} /></div>
          <div><span>Band target</span><ConfidenceDots value={hasValue(draft?.targetBand) ? readiness : 0} /></div>
        </div>
      </aside>
    </div>
  );
}

function VerdictStep({ draft, resolutionDraft, setDraft, setStep, onSave, saving, message, profile }) {
  const readiness = getReadinessPercent(draft);
  const verdict = getVerdict(readiness);
  const confidence = getConfidencePercent(draft);
  const targetModules = getList(draft.targetModules);
  const blockers = getVerdictBlockers(draft, resolutionDraft);
  const nextAction = getRecommendedNextAction(draft, resolutionDraft);
  const toggleModule = (module) => {
    setDraft((current) => ({
      ...current,
      targetModules: targetModules.includes(module)
        ? targetModules.filter((item) => item !== module)
        : [...targetModules, module],
    }));
  };

  return (
    <div className="loci-verdict-layout">
      <section className="loci-verdict-hero">
        <div className="loci-readiness-ring" style={{ "--readiness": `${readiness}%` }}>
          <div>
            <strong>{readiness}%</strong>
            <span>Readiness</span>
          </div>
        </div>
        <div className={`loci-verdict-pill is-${verdict.tone}`}>{verdict.label}</div>
      </section>

      <section className="loci-verdict-grid">
        <article className="loci-metric-card">
          <p>Metric</p>
          <h2>Academic Strength</h2>
          <strong>{draft.academic?.degreeClass || "Pending"}</strong>
          <span>{draft.academic?.discipline || "Add discipline to sharpen scoring"}</span>
          <ConfidenceDots value={confidence} />
        </article>
        <article className="loci-metric-card">
          <p>Metric</p>
          <h2>IELTS Baseline</h2>
          <div className="loci-band-grid">
            {MODULES.map((module) => (
              <label key={module}>
                <span>{module}</span>
                <input type="number" min="0" max="9" step="0.5" value={draft.currentLevel?.[module] || ""} onChange={(event) => updateCurrentLevel(setDraft, module, event.target.value)} placeholder="7.0" />
              </label>
            ))}
          </div>
        </article>
        <article className="loci-metric-card is-dark">
          <p>Strategic Forecast</p>
          <h2>{readiness >= 78
            ? "Your profile is credible enough to start making hard scholarship choices."
            : readiness >= 56
              ? "You have a promising baseline, but a few missing signals are still softening the match quality."
              : "Loci can see the outline of your direction, but the profile still needs firmer evidence before the best routes become obvious."}</h2>
          <span>{blockers[0] || "No major blocker is standing in the way of your first shortlist."}</span>
        </article>
        <article className="loci-metric-card">
          <p>Execution Plan</p>
          <h2>Focus modules</h2>
          <div className="loci-module-pills">
            {MODULES.map((module) => (
              <button type="button" key={module} className={targetModules.includes(module) ? "is-active" : ""} onClick={() => toggleModule(module)}>
                {module}
              </button>
            ))}
          </div>
          <label className="loci-field">
            <span>Test date</span>
            <input type="date" value={draft.testDate} onChange={(event) => updateDraft(setDraft, { testDate: event.target.value })} />
          </label>
        </article>
        <article className="loci-metric-card">
          <p>Immediate Blockers</p>
          <h2>{blockers.length ? "What still needs attention" : "No critical blocker detected"}</h2>
          <div className="loci-blocker-list">
            {blockers.length ? blockers.map((blocker) => (
              <div key={blocker} className="loci-blocker-item">
                <span />
                <b>{blocker}</b>
              </div>
            )) : (
              <div className="loci-blocker-item is-clear">
                <span />
                <b>Your current baseline is strong enough to move into ranking and shortlisting.</b>
              </div>
            )}
          </div>
        </article>
        <article className="loci-metric-card">
          <p>Best Next Move</p>
          <h2>{nextAction.title}</h2>
          <span>{nextAction.detail}</span>
          <div className="loci-next-surface">{nextAction.surface}</div>
        </article>
      </section>

      <div className="loci-actions">
        <button type="button" className="loci-ghost-button" onClick={() => setStep(2)}>Back to alignment</button>
        <button type="button" className="loci-primary-button" onClick={onSave} disabled={saving}>
          {saving ? "Saving intelligence..." : "Save and enter workspace"}
        </button>
      </div>
      <div className="loci-save-note">
        {message || `This baseline will sync to ${profile?.email || "your account"} and power scholarships, readiness, and practice.`}
      </div>
    </div>
  );
}

export default function OnboardingForm({ profile, draft, resolutionDraft, setDraft, onSave, saving, message, greeting, scholarshipCatalog = [], onSkipUpload }) {
  const [step, setStep] = useState(0);
  const readiness = useMemo(() => getReadinessPercent(draft), [draft]);
  const navigate = useNavigate();
  const handleSkipUpload = () => {
    if (typeof onSkipUpload === "function") {
      onSkipUpload();
      return;
    }
    navigate("/");
  };

  return (
    <div className="loci-onboarding-shell">
      <main className="loci-onboarding-main">
        <header className="loci-onboarding-topbar">
          <div>
            <span>Loci Intelligence</span>
            <strong>{STEPS[step]}</strong>
          </div>
          <StepRail step={step} setStep={setStep} />
          <div className="loci-topbar-score">{readiness}%</div>
        </header>

        {greeting?.title && (
          <div className="loci-greeting">
            <span>{greeting.label || "Onboarding"}</span>
            <strong>{greeting.title}</strong>
          </div>
        )}

        {step === 0 && <ExtractionStep draft={draft} setDraft={setDraft} setStep={setStep} onSkipUpload={handleSkipUpload} />}
        {step === 1 && <VerificationStep draft={draft} resolutionDraft={resolutionDraft} setDraft={setDraft} setStep={setStep} />}
        {step === 2 && <AlignmentStep draft={draft} setDraft={setDraft} setStep={setStep} scholarshipCatalog={scholarshipCatalog} />}
        {step === 3 && (
          <VerdictStep
            draft={draft}
            resolutionDraft={resolutionDraft}
            setDraft={setDraft}
            setStep={setStep}
            onSave={onSave}
            saving={saving}
            message={message}
            profile={profile}
          />
        )}
      </main>
    </div>
  );
}
