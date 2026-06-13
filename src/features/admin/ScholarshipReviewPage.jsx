import React, { useEffect, useMemo, useState } from "react";

// =========================================================================
// Admin Scholarship Review Page
// =========================================================================
// Allows an admin to review, edit, approve, or reject scraped scholarships
// from the review queue before they go live to users.
// =========================================================================

const REVIEW_STORE_KEY = "loci.admin.scholarshipReview";

function loadReviewQueue() {
  try {
    // In production, this would fetch from a Supabase table or API endpoint.
    // For now, it reads from the review JSON file baked into the app.
    var raw = window.sessionStorage.getItem(REVIEW_STORE_KEY);
    if (raw) return JSON.parse(raw);
    return [];
  } catch {
    return [];
  }
}

function saveReviewQueue(queue) {
  try {
    window.sessionStorage.setItem(REVIEW_STORE_KEY, JSON.stringify(queue));
  } catch { /* quota exceeded — ignore */ }
}

function formatDate(value) {
  if (!value) return "";
  var d = new Date(value);
  if (isNaN(d.getTime())) return String(value || "");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function truncate(value, max) {
  var s = String(value || "");
  return s.length > max ? s.slice(0, max) + "..." : s;
}

// =========================================================================
// Review Card Component
// =========================================================================

function ReviewCard(_ref) {
  var scholarship = _ref.scholarship;
  var onApprove = _ref.onApprove;
  var onReject = _ref.onReject;
  var onEdit = _ref.onEdit;
  var isExpanded = _ref.isExpanded;
  var onToggle = _ref.onToggle;

  var coverage = scholarship.coverage || {};
  var application = scholarship.application || {};
  var eligibility = scholarship.eligibility || {};
  var source = scholarship.source || {};
  var provenance = scholarship.provenance || {};

  var confidence = Number(source.confidence || provenance.confidenceScore || 0);
  var confidencePct = Math.round(confidence * 100);

  var hasDeadline = Boolean(application.deadline);
  var hasCoverage = coverage.type && coverage.type !== "unknown";
  var hasEligibility = Boolean(
    (eligibility.nationalities && eligibility.nationalities.length) ||
    (eligibility.disciplines && eligibility.disciplines.length) ||
    eligibility.degreeClassMin
  );

  var qualityScore = (hasDeadline ? 1 : 0) + (hasCoverage ? 1 : 0) + (hasEligibility ? 1 : 0);
  var qualityLabel = qualityScore >= 3 ? "Rich" : qualityScore >= 2 ? "Adequate" : "Sparse";

  return (
    <article
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--color-bg-surface)",
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* Header row — always visible */}
      <div
        onClick={onToggle}
        style={{
          padding: "12px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={{ fontSize: 13, fontFamily: "var(--font-ui)", display: "block", marginBottom: 2 }}>
            {truncate(scholarship.name || scholarship.title || "Untitled", 70)}
          </strong>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-ui)" }}>
            {scholarship.awardingBody || source.sourceLabel || "Unknown source"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 10,
              fontFamily: "var(--font-ui)",
              background: qualityLabel === "Rich" ? "#dcfce7" : qualityLabel === "Adequate" ? "#fef9c3" : "#fee2e2",
              color: qualityLabel === "Rich" ? "#166534" : qualityLabel === "Adequate" ? "#854d0e" : "#991b1b",
            }}
          >
            {qualityLabel}
          </span>
          <span style={{ fontSize: 11, fontFamily: "var(--font-ui)", color: "var(--text-2)", minWidth: 50, textAlign: "right" }}>
            {confidencePct}%
          </span>
          <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-ui)" }}>
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          {/* Key fields */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 12 }}>
            <Field label="Name" value={scholarship.name || scholarship.title || "-"} />
            <Field label="Awarding body" value={scholarship.awardingBody || "-"} />
            <Field label="Coverage" value={coverage.type || "unknown"} />
            <Field label="Amount" value={coverage.amountGBP ? "£" + coverage.amountGBP : "-"} />
            <Field label="Deadline" value={application.deadline ? formatDate(application.deadline) : "No deadline"} />
            <Field label="Deadline type" value={application.deadlineType || application.deadlineRaw || "-"} />
            <Field label="Nationalities" value={(eligibility.nationalities || []).join(", ") || "Not specified"} />
            <Field label="Degree minimum" value={eligibility.degreeClassMin || "Not specified"} />
            <Field label="IELTS minimum" value={eligibility.languageReqs?.ielts != null ? String(eligibility.languageReqs.ielts) : "Not specified"} />
            <Field label="Source URL" value={truncate(source.sourceUrl || provenance.sourceUrl || "", 50)} url />
            <Field label="Source type" value={source.sourceType || provenance.sourceType || "unknown"} />
            <Field label="Page type" value={source.pageType || "unknown"} />
          </div>

          {/* Description / raw text */}
          {scholarship.requirements_summary && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-2)", fontFamily: "var(--font-ui)", lineHeight: 1.5 }}>
              <strong>Requirements:</strong> {truncate(scholarship.requirements_summary, 300)}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={function () { return onApprove(scholarship); }}
              style={{
                padding: "8px 20px",
                background: "#16a34a",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ✓ Approve
            </button>
            <button
              type="button"
              onClick={function () { return onEdit(scholarship); }}
              style={{
                padding: "8px 20px",
                background: "var(--color-bg-surface)",
                color: "var(--text-1)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
              }}
            >
              ✎ Edit
            </button>
            <button
              type="button"
              onClick={function () { return onReject(scholarship); }}
              style={{
                padding: "8px 20px",
                background: "transparent",
                color: "#dc2626",
                border: "1px solid #dc2626",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
              }}
            >
              ✕ Reject
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Field(_ref2) {
  var label = _ref2.label;
  var value = _ref2.value;
  var url = _ref2.url;
  return (
    <div style={{ fontSize: 11, fontFamily: "var(--font-ui)" }}>
      <span style={{ color: "var(--text-3)", display: "block", marginBottom: 1 }}>{label}</span>
      {url && value && value !== "-" ? (
        <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all", fontSize: 11 }}>
          {value}
        </a>
      ) : (
        <span style={{ color: "var(--text-1)", wordBreak: "break-word" }}>{value}</span>
      )}
    </div>
  );
}

// =========================================================================
// Edit Modal
// =========================================================================

function EditModal(_ref3) {
  var scholarship = _ref3.scholarship;
  var onSave = _ref3.onSave;
  var onClose = _ref3.onClose;
  var _useState = useState(Object.assign({}, scholarship)), draft = _useState[0], setDraft = _useState[1];

  function updateField(section, field, value) {
    setDraft(function (prev) {
      var next = Object.assign({}, prev);
      if (section) {
        next[section] = Object.assign({}, next[section] || {});
        next[section][field] = value;
      } else {
        next[field] = value;
      }
      return next;
    });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          background: "var(--color-bg)", borderRadius: 16, padding: 24,
          maxWidth: 600, width: "90%", maxHeight: "80vh", overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ fontFamily: "var(--font-ui)", fontSize: 16, marginBottom: 16 }}>Edit Scholarship</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <EditField label="Name" value={draft.name || ""} onChange={function (v) { updateField(null, "name", v); }} />
          <EditField label="Awarding Body" value={draft.awardingBody || ""} onChange={function (v) { updateField(null, "awardingBody", v); }} />
          <EditField label="Coverage Type" value={(draft.coverage || {}).type || ""} onChange={function (v) { updateField("coverage", "type", v); }} />
          <EditField label="Amount (GBP)" value={String((draft.coverage || {}).amountGBP || "")} onChange={function (v) { updateField("coverage", "amountGBP", v ? Number(v) : null); }} />
          <EditField label="Deadline" value={(draft.application || {}).deadline || ""} onChange={function (v) { updateField("application", "deadline", v); }} />
          <EditField label="IELTS Minimum" value={String(((draft.eligibility || {}).languageReqs || {}).ielts || "")} onChange={function (v) {
            var elig = Object.assign({}, draft.eligibility || {});
            elig.languageReqs = Object.assign({}, elig.languageReqs || {}, { ielts: v ? Number(v) : null });
            setDraft(Object.assign({}, draft, { eligibility: elig }));
          }} />
          <EditField label="Nationalities (comma-separated)" value={((draft.eligibility || {}).nationalities || []).join(", ")} onChange={function (v) {
            var elig = Object.assign({}, draft.eligibility || {});
            elig.nationalities = v ? v.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [];
            setDraft(Object.assign({}, draft, { eligibility: elig }));
          }} />
          <EditField label="Degree Class Minimum" value={(draft.eligibility || {}).degreeClassMin || ""} onChange={function (v) { updateField("eligibility", "degreeClassMin", v); }} />
          <EditField label="Requirements Summary" value={draft.requirements_summary || ""} onChange={function (v) { updateField(null, "requirements_summary", v); }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={function () { onSave(draft); }} style={{ padding: "10px 24px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 600 }}>Save Changes</button>
          <button onClick={onClose} style={{ padding: "10px 24px", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 13 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function EditField(_ref4) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "var(--font-ui)", fontSize: 11 }}>
      <span style={{ color: "var(--text-3)" }}>{_ref4.label}</span>
      <input
        type="text"
        value={_ref4.value}
        onChange={function (e) { _ref4.onChange(e.target.value); }}
        style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-ui)", background: "var(--color-bg-surface)", color: "var(--text-1)" }}
      />
    </label>
  );
}

// =========================================================================
// Page Component
// =========================================================================

export default function ScholarshipReviewPage(_ref5) {
  var C = _ref5.C;
  var Chip = _ref5.Chip;

  var _useState2 = useState(loadReviewQueue), reviewQueue = _useState2[0], setReviewQueue = _useState2[1];
  var _useState3 = useState(loadReviewQueue), approvedList = _useState3[0], setApprovedList = _useState3[1];
  var _useState4 = useState(null), expandedId = _useState4[0], setExpandedId = _useState4[1];
  var _useState5 = useState(null), editingItem = _useState5[0], setEditingItem = _useState5[1];
  var _useState6 = useState("all"), filter = _useState6[0], setFilter = _useState6[1];
  var _useState7 = useState(""), message = _useState7[0], setMessage = _useState7[1];

  // On mount, try to load review data from the public JSON
  useEffect(function () {
    if (reviewQueue.length) return;
    fetch("/data/scholarships-review.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.scholarships)) {
          setReviewQueue(data.scholarships);
          saveReviewQueue(data.scholarships);
        }
      })
      .catch(function () { /* file may not exist — that's fine */ });
  }, []);

  // Load approved list from sessionStorage
  useEffect(function () {
    try {
      var raw = window.sessionStorage.getItem("loci.admin.approvedScholarships");
      if (raw) setApprovedList(JSON.parse(raw));
    } catch {}
  }, []);

  var stats = useMemo(function () {
    var pending = reviewQueue.filter(function (s) { return s.reviewStatus !== "approved" && s.reviewStatus !== "rejected"; });
    var approved = approvedList;
    var rejected = reviewQueue.filter(function (s) { return s.reviewStatus === "rejected"; });
    var total = reviewQueue.length;
    return {
      total: total,
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      avgConfidence: total ? Math.round(reviewQueue.reduce(function (s, r) { return s + (Number((r.source || {}).confidence || (r.provenance || {}).confidenceScore || 0)); }, 0) / total * 100) : 0,
    };
  }, [reviewQueue, approvedList]);

  var filtered = useMemo(function () {
    if (filter === "approved") return approvedList;
    if (filter === "rejected") return reviewQueue.filter(function (s) { return s.reviewStatus === "rejected"; });
    if (filter === "pending") return reviewQueue.filter(function (s) { return s.reviewStatus !== "approved" && s.reviewStatus !== "rejected"; });
    return reviewQueue;
  }, [reviewQueue, approvedList, filter]);

  function handleApprove(scholarship) {
    var updated = Object.assign({}, scholarship, { reviewStatus: "approved", reviewedAt: new Date().toISOString() });
    var next = reviewQueue.map(function (s) {
      return (s.id === scholarship.id || s.name === scholarship.name) ? updated : s;
    });
    setReviewQueue(next);
    saveReviewQueue(next);
    var nextApproved = approvedList.concat([updated]);
    setApprovedList(nextApproved);
    try { window.sessionStorage.setItem("loci.admin.approvedScholarships", JSON.stringify(nextApproved)); } catch {}
    setMessage("Approved: " + (scholarship.name || "Scholarship").slice(0, 40));
    setTimeout(function () { setMessage(""); }, 2000);
  }

  function handleReject(scholarship) {
    var updated = Object.assign({}, scholarship, { reviewStatus: "rejected", reviewedAt: new Date().toISOString() });
    var next = reviewQueue.map(function (s) {
      return (s.id === scholarship.id || s.name === scholarship.name) ? updated : s;
    });
    setReviewQueue(next);
    saveReviewQueue(next);
    setMessage("Rejected: " + (scholarship.name || "Scholarship").slice(0, 40));
    setTimeout(function () { setMessage(""); }, 2000);
  }

  function handleEditSave(edited) {
    var next = reviewQueue.map(function (s) {
      return (s.id === edited.id || s.name === edited.name) ? Object.assign({}, edited, { reviewStatus: "approved", reviewedAt: new Date().toISOString() }) : s;
    });
    setReviewQueue(next);
    saveReviewQueue(next);
    setEditingItem(null);
    setMessage("Edited & approved: " + (edited.name || "Scholarship").slice(0, 40));
    setTimeout(function () { setMessage(""); }, 2000);
  }

  function handleExport() {
    var toExport = approvedList.length ? approvedList : reviewQueue.filter(function (s) { return s.reviewStatus === "approved"; });
    var json = JSON.stringify({ version: "2.0.0", updated_at: new Date().toISOString(), total: toExport.length, scholarships: toExport }, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "scholarships-approved-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Exported " + toExport.length + " approved scholarships");
    setTimeout(function () { setMessage(""); }, 3000);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
          Admin
        </div>
        <h1 style={{ fontFamily: "var(--font-ui)", fontSize: 22, margin: 0, marginBottom: 8 }}>
          Scholarship Review
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", fontFamily: "var(--font-ui)", margin: 0 }}>
          Review, edit, approve, or reject scraped scholarships before they appear to users.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "Total", value: stats.total },
          { label: "Pending", value: stats.pending },
          { label: "Approved", value: stats.approved },
          { label: "Rejected", value: stats.rejected },
          { label: "Avg confidence", value: stats.avgConfidence + "%" },
        ].map(function (stat) {
          return (
            <div key={stat.label} style={{ background: "var(--color-bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", minWidth: 100 }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-ui)", textTransform: "uppercase" }}>{stat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-ui)", marginTop: 2 }}>{stat.value}</div>
            </div>
          );
        })}
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "pending", "approved", "rejected"].map(function (f) {
          return (
            <button
              key={f}
              type="button"
              onClick={function () { setFilter(f); }}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: filter === f ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: filter === f ? "var(--accent-bg)" : "transparent",
                color: filter === f ? "var(--accent)" : "var(--text-2)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: filter === f ? 600 : 400,
                textTransform: "capitalize",
              }}
            >
              {f} ({f === "all" ? stats.total : f === "pending" ? stats.pending : f === "approved" ? stats.approved : stats.rejected})
            </button>
          );
        })}
        <button
          type="button"
          onClick={handleExport}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            border: "1px solid #16a34a",
            background: "transparent",
            color: "#16a34a",
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            fontWeight: 600,
            marginLeft: "auto",
          }}
        >
          Export approved
        </button>
      </div>

      {/* Message toast */}
      {message && (
        <div style={{ padding: "8px 14px", background: "#dcfce7", color: "#166534", borderRadius: 8, fontSize: 12, fontFamily: "var(--font-ui)", marginBottom: 12 }}>
          {message}
        </div>
      )}

      {/* Empty state */}
      {!filtered.length && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontFamily: "var(--font-ui)" }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>No scholarships to review</div>
          <div style={{ fontSize: 12 }}>Run the scraper to populate the review queue. Approved items appear in the filter tabs above.</div>
        </div>
      )}

      {/* Review list */}
      {filtered.map(function (scholarship) {
        var key = scholarship.id || (scholarship.name + "-" + scholarship.awardingBody);
        return React.createElement(ReviewCard, {
          key: key,
          scholarship: scholarship,
          isExpanded: expandedId === key,
          onToggle: function () { setExpandedId(expandedId === key ? null : key); },
          onApprove: handleApprove,
          onReject: handleReject,
          onEdit: function (s) { setEditingItem(s); },
        });
      })}

      {/* Edit modal */}
      {editingItem && React.createElement(EditModal, {
        scholarship: editingItem,
        onSave: handleEditSave,
        onClose: function () { setEditingItem(null); },
      })}

      {/* Pipeline model explanation */}
      <div style={{ marginTop: 40, padding: 20, background: "var(--color-bg-surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <h3 style={{ fontFamily: "var(--font-ui)", fontSize: 14, marginBottom: 12 }}>Pipeline Model</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: "var(--font-ui)", fontSize: 11 }}>
          {["Discover", "Extract", "Validate", "Review", "Publish", "Monitor"].map(function (stage, i) {
            return React.createElement(React.Fragment, { key: stage },
              i > 0 && React.createElement("span", { style: { color: "var(--text-3)" } }, "→"),
              React.createElement("span", {
                style: {
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: i <= 3 ? "var(--accent-bg)" : "var(--color-bg)",
                  border: "1px solid " + (i <= 3 ? "var(--accent)" : "var(--border)"),
                  color: i <= 3 ? "var(--accent)" : "var(--text-2)",
                  fontWeight: i === 3 ? 700 : 400,
                },
              }, stage)
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
          <strong>Discover:</strong> Scraper finds URLs on university sites.<br />
          <strong>Extract:</strong> JSON-LD + regex parses structured fields.<br />
          <strong>Validate:</strong> Schema check, confidence threshold ≥ 0.35.<br />
          <strong>Review:</strong> <strong>You are here.</strong> Human approves or rejects.<br />
          <strong>Publish:</strong> Approved entries flow to public catalog.<br />
          <strong>Monitor:</strong> Weekly freshness checks, deadline expiry detection.
        </div>
      </div>
    </div>
  );
}
