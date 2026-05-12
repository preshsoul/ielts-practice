import React from "react";

export default function LociCard({
  variant = "editorial",
  eyebrow,
  title,
  copy,
  children,
  className = "",
  onClick,
  tone = "default",
  footer,
  action,
}) {
  const Component = onClick ? "button" : "article";
  const interactiveProps = onClick ? { type: "button", onClick } : {};

  return (
    <Component
      className={`loci-card loci-card--${variant} loci-card--${tone} ${className}`.trim()}
      {...interactiveProps}
    >
      {eyebrow && <div className="loci-card__eyebrow">{eyebrow}</div>}
      {title && <h2 className="loci-card__title">{title}</h2>}
      {copy && <p className="loci-card__copy">{copy}</p>}
      {children}
      {(action || footer) && (
        <div className="loci-card__footer">
          {footer}
          {action}
        </div>
      )}
    </Component>
  );
}

