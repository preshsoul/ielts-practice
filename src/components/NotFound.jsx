import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="empty-state" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ fontSize: 64, lineHeight: 1, color: "var(--text-3)", fontWeight: 700 }}>404</div>
      <div className="empty-state-title">Page not found</div>
      <div className="empty-state-copy" style={{ maxWidth: 420, textAlign: "center" }}>
        The page you're looking for doesn't exist or may have moved. Check the URL or return home.
      </div>
      <Link to="/" className="primary-btn" style={{ textDecoration: "none", marginTop: 8 }}>
        Back to dashboard
      </Link>
    </div>
  );
}
