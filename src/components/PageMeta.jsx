import React from "react";
import { Helmet } from "react-helmet-async";

/**
 * Per-route SEO meta tags. Drop <PageMeta title="..." description="..." /> into any route.
 * Falls back to sensible app-wide defaults when props are omitted.
 */
export default function PageMeta({
  title,
  description,
  path = "",
  noIndex = false,
}) {
  const fullTitle = title ? `${title} — Loci` : "Loci — IELTS Practice & International Scholarship Discovery";
  const desc = description || "Master IELTS with focused practice across all four modules. Discover and match with international scholarships, graduate opportunities, and funding for study abroad.";
  const url = path ? `https://loci-project.vercel.app${path}` : "https://loci-project.vercel.app";

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex" />}
    </Helmet>
  );
}
