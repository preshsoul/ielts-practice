import React, { useEffect, useMemo, useState } from "react";

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .toLowerCase();
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === "fbclid" || key === "gclid") {
        url.searchParams.delete(key);
      }
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function formatCountLabel(count, label) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function normalizeScholarshipKey(item = {}) {
  const record = item?.scholarship || item;
  return [
    normalizeText(record?.name || item?.name),
    normalizeText(record?.awardingBody || item?.awardingBody || item?.source?.sourceLabel),
    normalizeUrl(
      record?.application?.portal ||
        record?.application?.url ||
        record?.provenance?.sourceUrl ||
        record?.source?.sourceUrl ||
        item?.website ||
        item?.scraped_from
    ),
  ]
    .filter(Boolean)
    .join("::");
}

function analyzeQuestionQueue(questions) {
  const adjacentDuplicateIds = [];
  const punctuationIssues = [];
  const duplicateMap = new Map();
  let previousKey = "";

  questions.forEach((question, index) => {
    const key = normalizeText(question?.question);
    if (key) {
      duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
      if (previousKey && previousKey === key) {
        adjacentDuplicateIds.push(question?.id || `${index}`);
      }
      previousKey = key;
    }

    const rawQuestion = String(question?.question || "").trim();
    const rawExplanation = String(question?.explanation || "").trim();
    if (rawQuestion && !/[.?!…]$/.test(rawQuestion)) {
      punctuationIssues.push({ id: question?.id || `${index}`, field: "question", text: rawQuestion });
    }
    if (rawExplanation && !/[.?!…]$/.test(rawExplanation)) {
      punctuationIssues.push({ id: question?.id || `${index}`, field: "explanation", text: rawExplanation });
    }
  });

  return {
    adjacentDuplicateIds,
    punctuationIssues,
    repeatedQuestions: [...duplicateMap.entries()].filter(([, count]) => count > 1),
  };
}

function analyzeScholarshipQueue(scholarships) {
  const adjacentDuplicateIds = [];
  const duplicateMap = new Map();
  const invalidIds = [];
  const missingPortalIds = [];
  const missingDeadlineIds = [];
  const lowConfidenceIds = [];
  const needsVerificationIds = [];
  let previousKey = "";

  scholarships.forEach((scholarship, index) => {
    const key = normalizeScholarshipKey(scholarship);
    if (key) {
      duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
      if (previousKey && previousKey === key) {
        adjacentDuplicateIds.push(scholarship?.id || `${index}`);
      }
      previousKey = key;
    }

    if (!scholarship?.id || !scholarship?.name || !scholarship?.awardingBody || !scholarship?.application?.url || !scholarship?.provenance?.sourceUrl) {
      invalidIds.push(scholarship?.id || `${index}`);
    }
    if (!scholarship?.application?.portal) {
      missingPortalIds.push(scholarship?.id || `${index}`);
    }
    if (!scholarship?.application?.deadline && String(scholarship?.application?.deadlineType || "").toLowerCase() !== "rolling") {
      missingDeadlineIds.push(scholarship?.id || `${index}`);
    }
    const confidence = Number(scholarship?.provenance?.confidenceScore ?? scholarship?.source?.confidence ?? 0);
    if (confidence < 0.35) {
      lowConfidenceIds.push(scholarship?.id || `${index}`);
    }
    if ((scholarship?.source?.needsVerification || []).length > 0) {
      needsVerificationIds.push(scholarship?.id || `${index}`);
    }
  });

  return {
    adjacentDuplicateIds,
    repeatedScholarships: [...duplicateMap.entries()].filter(([, count]) => count > 1),
    invalidIds,
    missingPortalIds,
    missingDeadlineIds,
    lowConfidenceIds,
    needsVerificationIds,
  };
}

function getConfidenceValue(item) {
  return Number(item?.provenance?.confidenceScore ?? item?.source?.confidence ?? 0);
}

function formatConfidence(item) {
  const confidence = getConfidenceValue(item);
  return `${Math.round(confidence * 100)}%`;
}

export default function AdminContentScreen() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeTab, setActiveTab] = useState("questions");
  const [copyStatus, setCopyStatus] = useState("");
  const [reviewData, setReviewData] = useState({
    questions: { queue: null, manifest: null },
    scholarships: { queue: null, manifest: null },
    loading: true,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      import("../../content/questions.review.json"),
      import("../../content/questions.review.manifest.json"),
      import("../../content/scholarships.review.json"),
      import("../../content/scholarships.review.manifest.json"),
    ])
      .then(([questionsQueue, questionsManifest, scholarshipsQueue, scholarshipsManifest]) => {
        if (!active) return;
        setReviewData({
          questions: {
            queue: questionsQueue?.default || questionsQueue,
            manifest: questionsManifest?.default || questionsManifest,
          },
          scholarships: {
            queue: scholarshipsQueue?.default || scholarshipsQueue,
            manifest: scholarshipsManifest?.default || scholarshipsManifest,
          },
          loading: false,
        });
      })
      .catch(() => {
        if (!active) return;
        setReviewData({
          questions: { queue: null, manifest: null },
          scholarships: { queue: null, manifest: null },
          loading: false,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const questions = Array.isArray(reviewData.questions.queue?.questions) ? reviewData.questions.queue.questions : [];
  const questionPassages = reviewData.questions.queue?.passages && typeof reviewData.questions.queue.passages === "object" ? reviewData.questions.queue.passages : {};
  const scholarships = Array.isArray(reviewData.scholarships.queue?.scholarships) ? reviewData.scholarships.queue.scholarships : [];

  const questionAnalysis = useMemo(() => analyzeQuestionQueue(questions), [questions]);
  const scholarshipAnalysis = useMemo(() => analyzeScholarshipQueue(scholarships), [scholarships]);

  const activeItems = activeTab === "questions" ? questions : scholarships;
  const activeQuestionStats = useMemo(() => {
    const sources = new Set();
    const sections = new Set();
    questions.forEach((question) => {
      if (question?.sourceId) sources.add(question.sourceId);
      if (question?.section) sections.add(question.section);
    });
    return {
      total: questions.length,
      passages: Object.keys(questionPassages).length,
      sources: sources.size,
      sections: sections.size,
      adjacentDuplicates: questionAnalysis.adjacentDuplicateIds.length,
      punctuationIssues: questionAnalysis.punctuationIssues.length,
      repeatedGroups: questionAnalysis.repeatedQuestions.length,
      manifestIds: Array.isArray(reviewData.questions.manifest?.ids) ? reviewData.questions.manifest.ids.length : 0,
      approveAll: Boolean(reviewData.questions.manifest?.approveAll),
      target: reviewData.questions.manifest?.target || "base",
    };
  }, [questions, questionPassages, questionAnalysis, reviewData.questions.manifest]);

  const activeScholarshipStats = useMemo(() => {
    const sources = new Set();
    const labels = new Set();
    scholarships.forEach((scholarship) => {
      if (scholarship?.source?.sourceLabel) sources.add(scholarship.source.sourceLabel);
      if (scholarship?.awardingBody) labels.add(scholarship.awardingBody);
    });
    return {
      total: scholarships.length,
      sources: sources.size || labels.size,
      invalid: scholarshipAnalysis.invalidIds.length,
      duplicates: scholarshipAnalysis.repeatedScholarships.length,
      missingPortal: scholarshipAnalysis.missingPortalIds.length,
      missingDeadline: scholarshipAnalysis.missingDeadlineIds.length,
      lowConfidence: scholarshipAnalysis.lowConfidenceIds.length,
      needsVerification: scholarshipAnalysis.needsVerificationIds.length,
      manifestIds: Array.isArray(reviewData.scholarships.manifest?.ids) ? reviewData.scholarships.manifest.ids.length : 0,
      approveAll: Boolean(reviewData.scholarships.manifest?.approveAll),
      target: reviewData.scholarships.manifest?.target || "approved",
      minConfidence: reviewData.scholarships.manifest?.minConfidence,
      maxConfidence: reviewData.scholarships.manifest?.maxConfidence,
    };
  }, [scholarships, scholarshipAnalysis, reviewData.scholarships.manifest]);

  const activeStats = activeTab === "questions" ? activeQuestionStats : activeScholarshipStats;
  const activeManifest = activeTab === "questions" ? reviewData.questions.manifest : reviewData.scholarships.manifest;

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeItems;
    return activeItems.filter((item) => {
      if (activeTab === "questions") {
        const haystack = [
          item?.id,
          item?.exam,
          item?.section,
          item?.question,
          item?.answer,
          item?.sourceId,
          ...(Array.isArray(item?.tags) ? item.tags : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      }

      const haystack = [
        item?.id,
        item?.name,
        item?.awardingBody,
        item?.application?.url,
        item?.application?.portal,
        item?.source?.sourceLabel,
        item?.source?.sourceUrl,
        item?.provenance?.sourceUrl,
        ...(Array.isArray(item?.tags) ? item.tags : []),
        ...(Array.isArray(item?.source?.needsVerification) ? item.source.needsVerification : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [activeItems, activeTab, search]);

  useEffect(() => {
    setSelectedIds([]);
    setSearch("");
  }, [activeTab]);

  const toggleSelected = (id) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const selectVisible = () => {
    setSelectedIds(filteredItems.map((item) => item.id).filter(Boolean));
  };

  const clearSelected = () => setSelectedIds([]);

  const getReviewCommand = () => {
    const ids = selectedIds.length ? selectedIds : filteredItems.map((item) => item.id).filter(Boolean);
    if (!ids.length) return "";
    const baseCommand = activeTab === "questions"
      ? "npm run content:review-questions -- --ids="
      : "npm run content:review-scholarships -- --ids=";
    return `${baseCommand}${ids.join(",")}`;
  };

  const copySelected = async () => {
    const ids = selectedIds.length ? selectedIds : filteredItems.map((item) => item.id).filter(Boolean);
    if (!ids.length) return;
    try {
      await navigator.clipboard.writeText(ids.join(","));
      setCopyStatus("Selected IDs copied to clipboard.");
    } catch {
      setCopyStatus("Clipboard copy failed. You can still use the selected IDs from the screen.");
    }
  };

  const copyReviewCommand = async () => {
    const command = getReviewCommand();
    if (!command) {
      setCopyStatus("No IDs available to build a review command.");
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus("Review command copied to clipboard.");
    } catch {
      setCopyStatus("Clipboard copy failed. Copy the command manually from the page.");
    }
  };

  if (reviewData.loading) {
    return (
      <section className="panel-card route-card admin-screen">
        <div className="empty-state">
          <div className="empty-state-title">Loading review queue</div>
          <div className="empty-state-copy">The admin content screen is pulling the latest local review output.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card route-card admin-screen">
      <div className="admin-hero">
        <div>
          <div className="section-kicker">Content ops</div>
          <h1 className="page-title" style={{ marginBottom: 10 }}>Admin review dashboard</h1>
          <p className="page-subtitle" style={{ marginBottom: 14 }}>
            Visit <code>/admin</code> after signing in. This page links the question approver and scholarship approver in one place so you can inspect the queue, select IDs, and promote only what passes review.
          </p>
          <div className="admin-help">
            <div className="admin-help-title">How to use admin</div>
            <ol className="admin-help-list">
              <li>Open <code>/admin</code> while signed in.</li>
              <li>Switch between Questions and Scholarships using the tabs.</li>
              <li>Search, select visible rows, or copy IDs for batch approval.</li>
              <li>Run <code>npm run content:review-questions -- --ids=id1,id2</code> or <code>npm run content:review-scholarships -- --ids=id1,id2</code>.</li>
              <li>The review script refreshes public content automatically after promotion.</li>
            </ol>
          </div>
          {copyStatus && <div className="admin-panel-note" style={{ marginTop: 14 }}>{copyStatus}</div>}
        </div>
        <div className="admin-hero-actions">
          <button type="button" className={`ghost-btn${activeTab === "questions" ? " active" : ""}`} onClick={() => setActiveTab("questions")}>Questions</button>
          <button type="button" className={`ghost-btn${activeTab === "scholarships" ? " active" : ""}`} onClick={() => setActiveTab("scholarships")}>Scholarships</button>
          <button type="button" className="ghost-btn" onClick={selectVisible}>Select visible</button>
          <button type="button" className="ghost-btn" onClick={clearSelected}>Clear</button>
          <button type="button" className="ghost-btn" onClick={copySelected}>Copy IDs</button>
          <button type="button" className="primary-btn" onClick={copyReviewCommand}>Copy review command</button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Review queues">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "questions"}
          className={`admin-tab${activeTab === "questions" ? " active" : ""}`}
          onClick={() => setActiveTab("questions")}
        >
          Questions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "scholarships"}
          className={`admin-tab${activeTab === "scholarships" ? " active" : ""}`}
          onClick={() => setActiveTab("scholarships")}
        >
          Scholarships
        </button>
      </div>

      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-label">{activeTab === "questions" ? "Questions" : "Scholarships"}</span>
          <span className="admin-stat-value">{formatCountLabel(activeStats.total, activeTab === "questions" ? "question" : "scholarship")}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Sources</span>
          <span className="admin-stat-value">{formatCountLabel(activeStats.sources, "source")}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Duplicates</span>
          <span className="admin-stat-value">{activeTab === "questions" ? activeStats.adjacentDuplicates : activeStats.duplicates}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Flags</span>
          <span className="admin-stat-value">{activeTab === "questions" ? activeStats.punctuationIssues : activeStats.needsVerification}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Manifest IDs</span>
          <span className="admin-stat-value">{activeStats.manifestIds}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Target</span>
          <span className="admin-stat-value">{activeStats.target}</span>
        </div>
      </div>

      <div className="admin-layout">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <div className="admin-panel-title">{activeTab === "questions" ? "Question review queue" : "Scholarship review queue"}</div>
              <div className="admin-panel-copy">
                {formatCountLabel(filteredItems.length, `visible ${activeTab === "questions" ? "question" : "scholarship"}`)} · {formatCountLabel(selectedIds.length, "selected")}
              </div>
            </div>
            <label className="admin-search">
              <span>Search</span>
              <input
                className="input"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={activeTab === "questions" ? "ID, question, section, answer" : "ID, scholarship, body, portal"}
              />
            </label>
          </div>

          <div className="admin-list">
            {filteredItems.map((item, index) => {
              const isSelected = selectedIds.includes(item.id);

              if (activeTab === "questions") {
                const duplicateWarning = questionAnalysis.adjacentDuplicateIds.includes(item.id);
                const punctuationWarning =
                  !/[.?!…]$/.test(String(item?.question || "").trim()) || !/[.?!…]$/.test(String(item?.explanation || "").trim());
                return (
                  <label key={item.id || `${index}`} className={`admin-item${isSelected ? " selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(item.id)}
                      className="admin-item-check"
                    />
                    <div className="admin-item-body">
                      <div className="admin-item-top">
                        <div className="admin-item-title">{item.question}</div>
                        <div className="admin-item-badges">
                          {item.exam && <span className="chip chip-small">{item.exam}</span>}
                          {item.section && <span className="chip chip-small">{item.section}</span>}
                          {duplicateWarning && <span className="chip chip-small" style={{ ["--chip-color"]: "var(--red)" }}>Adjacent repeat</span>}
                          {punctuationWarning && <span className="chip chip-small" style={{ ["--chip-color"]: "var(--amber)" }}>Punctuation</span>}
                        </div>
                      </div>
                      <div className="admin-item-meta">
                        <span>{item.id}</span>
                        <span>{item.sourceId || "unknown source"}</span>
                        <span>{item.pid || "no passage"}</span>
                      </div>
                      <div className="admin-item-answer">
                        <strong>Answer:</strong> {item.answer}
                      </div>
                      <div className="admin-item-explanation">{item.explanation}</div>
                    </div>
                  </label>
                );
              }

              const duplicateWarning = scholarshipAnalysis.adjacentDuplicateIds.includes(item.id);
              const portalMissing = !item?.application?.portal;
              const deadlineMissing = !item?.application?.deadline && String(item?.application?.deadlineType || "").toLowerCase() !== "rolling";
              const confidence = formatConfidence(item);
              const verificationCount = Array.isArray(item?.source?.needsVerification) ? item.source.needsVerification.length : 0;
              return (
                <label key={item.id || `${index}`} className={`admin-item${isSelected ? " selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(item.id)}
                    className="admin-item-check"
                  />
                  <div className="admin-item-body">
                    <div className="admin-item-top">
                      <div className="admin-item-title">{item.name}</div>
                      <div className="admin-item-badges">
                        {item.awardingBody && <span className="chip chip-small">{item.awardingBody}</span>}
                        <span className="chip chip-small">{confidence} confidence</span>
                        {duplicateWarning && <span className="chip chip-small" style={{ ["--chip-color"]: "var(--red)" }}>Duplicate</span>}
                        {portalMissing && <span className="chip chip-small" style={{ ["--chip-color"]: "var(--amber)" }}>No portal</span>}
                        {deadlineMissing && <span className="chip chip-small" style={{ ["--chip-color"]: "var(--amber)" }}>No deadline</span>}
                        {verificationCount > 0 && <span className="chip chip-small" style={{ ["--chip-color"]: "var(--amber)" }}>{verificationCount} checks</span>}
                      </div>
                    </div>
                    <div className="admin-item-meta">
                      <span>{item.id}</span>
                      <span>{item.source?.sourceLabel || item.source?.sourceUrl || item.provenance?.sourceUrl || "unknown source"}</span>
                      <span>{item.application?.url || "no application url"}</span>
                    </div>
                    <div className="admin-item-answer">
                      <strong>Portal:</strong> {item.application?.portal || "Not captured"}
                    </div>
                    <div className="admin-item-explanation">
                      Deadline: {item.application?.deadlineRaw || item.application?.deadline || item.application?.deadlineType || "Unknown"} ·
                      Review: {item.reviewStatus || "pending"} ·
                      {Array.isArray(item?.source?.needsVerification) && item.source.needsVerification.length > 0
                        ? ` Flagged: ${item.source.needsVerification.join(", ")}`
                        : " No flags"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <aside className="admin-sidebar">
          <div className="admin-panel admin-summary">
            <div className="admin-panel-title">Queue health</div>
            {activeTab === "questions" ? (
              <>
                <div className="admin-summary-row">
                  <span>Repeated question groups</span>
                  <strong>{activeQuestionStats.repeatedGroups}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Adjacent duplicate rows</span>
                  <strong>{activeQuestionStats.adjacentDuplicates}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Punctuation warnings</span>
                  <strong>{activeQuestionStats.punctuationIssues}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Manifest IDs</span>
                  <strong>{activeQuestionStats.manifestIds}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="admin-summary-row">
                  <span>Repeated scholarship groups</span>
                  <strong>{activeScholarshipStats.duplicates}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Missing portal links</span>
                  <strong>{activeScholarshipStats.missingPortal}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Missing deadlines</span>
                  <strong>{activeScholarshipStats.missingDeadline}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Low confidence</span>
                  <strong>{activeScholarshipStats.lowConfidence}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Needs verification</span>
                  <strong>{activeScholarshipStats.needsVerification}</strong>
                </div>
              </>
            )}
          </div>

          <div className="admin-panel">
            <div className="admin-panel-title">Review manifest</div>
            <div className="admin-summary-row">
              <span>Approve all</span>
              <strong>{activeStats.approveAll ? "Yes" : "No"}</strong>
            </div>
            <div className="admin-summary-row">
              <span>Target</span>
              <strong>{activeStats.target}</strong>
            </div>
            {activeTab === "scholarships" && (
              <>
                <div className="admin-summary-row">
                  <span>Min confidence</span>
                  <strong>{activeStats.minConfidence ?? "—"}</strong>
                </div>
                <div className="admin-summary-row">
                  <span>Max confidence</span>
                  <strong>{activeStats.maxConfidence ?? "—"}</strong>
                </div>
              </>
            )}
            <div className="admin-summary-row">
              <span>Source IDs</span>
              <strong>{Array.isArray(activeManifest?.sourceIds) ? activeManifest.sourceIds.length : 0}</strong>
            </div>
            <div className="admin-summary-row">
              <span>Selected IDs</span>
              <strong>{selectedIds.length}</strong>
            </div>
            <div className="admin-panel-note">
              {activeTab === "questions"
                ? "Promotion still happens through scripts/review-questions.mjs. The screen keeps the queue readable and the IDs ready for batch approval."
                : "Promotion still happens through scripts/review-scholarships.mjs. Use the queue to validate portal links, deadlines, and duplicate syndications before approving."}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
