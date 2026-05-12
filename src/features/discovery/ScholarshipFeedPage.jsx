import React, { useMemo } from "react";
import { cleanText, cleanUrl } from "../../lib/security.js";
import { getLatestScholarshipFeed } from "../../lib/scholarshipFeed.js";

function formatDate(value) {
  if (!value) return "Recently added";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function safeWebsiteUrl(value) {
  return cleanUrl(value) || "";
}

export default function ScholarshipFeedPage({
  scholarships = [],
  scholarshipCatalog = [],
  contentManifest = null,
  C,
  Chip,
}) {
  const feed = useMemo(() => {
    const combined = [
      ...(Array.isArray(scholarshipCatalog) ? scholarshipCatalog : []),
      ...(Array.isArray(scholarships) ? scholarships : []),
    ];
    return getLatestScholarshipFeed(combined, {
      limit: 24,
      referenceDate: contentManifest?.updated_at || new Date(),
      recentDays: 10,
    });
  }, [scholarshipCatalog, scholarships, contentManifest?.updated_at]);

  return (
    <div className="scholarship-page">
      <div className="scholarship-hero" style={{ marginBottom: 24 }}>
        <div className="scholarship-hero-main">
          <div className="scholarship-kicker">Weekly feed</div>
          <h2 className="scholarship-title">Scholarships added this week.</h2>
          <p className="scholarship-copy">
            This feed is the fresh batch. It shows new scholarship and university opportunities without exposing the full catalog at once.
          </p>
        </div>
        <div className="scholarship-hero-side">
          <div className="scholarship-sidebar-card">
            <div className="scholarship-sidebar-stat">
              <span className="scholarship-sidebar-stat-label">Fresh items</span>
              <span className="scholarship-sidebar-stat-value">{feed.length}</span>
            </div>
            <div className="scholarship-sidebar-stat">
              <span className="scholarship-sidebar-stat-label">Updated</span>
              <span className="scholarship-sidebar-stat-value">{contentManifest?.updated_at ? formatDate(new Date(contentManifest.updated_at)) : "Recently"}</span>
            </div>
            <div className="scholarship-sidebar-stat">
              <span className="scholarship-sidebar-stat-label">Scope</span>
              <span className="scholarship-sidebar-stat-value">International focus</span>
            </div>
          </div>
        </div>
      </div>

      <div className="scholarship-card">
        <div className="scholarship-card-label">This week&apos;s additions</div>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {feed.length ? feed.map((item) => {
            const website = safeWebsiteUrl(item.website);
            return (
              <article key={item.id} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--color-bg-surface)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: "var(--font-ui)", marginBottom: 4 }}>
                      {cleanText(item.sourceLabel, { maxLength: 72 })}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>
                      {cleanText(item.title, { maxLength: 130 })}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, fontFamily: "var(--font-ui)", marginTop: 4 }}>
                      {cleanText(item.locationLabel, { maxLength: 80 })} · {item.date ? formatDate(item.date) : "Recently added"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <Chip label={`Priority ${Math.round(item.priorityScore * 100)}/100`} color={C.green} small />
                    <Chip label={item.audienceScope === "international" ? "International" : "New" } color={C.accent} small />
                  </div>
                </div>
                {item.reasons.length > 0 && (
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: C.text, marginTop: 10 }}>
                    {item.reasons.join(" ")}
                  </div>
                )}
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ghost-btn"
                    style={{ marginTop: 12, display: "inline-flex", padding: "8px 12px", textDecoration: "none" }}
                  >
                    Open source
                  </a>
                )}
              </article>
            );
          }) : (
            <div className="empty-state">
              <div className="empty-state-title">No fresh additions yet</div>
              <div className="empty-state-copy">New scholarships will appear here after the weekly refresh cycle.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
