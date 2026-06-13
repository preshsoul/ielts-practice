import React from "react";
import { Sentry } from "../instrument.js";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env?.DEV) {
      console.error("[ErrorBoundary]", error, info?.componentStack);
    }
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: info?.componentStack || null,
        },
      },
    });
  }

  render() {
    if (this.state.error) {
      const fallback = this.props.fallback;
      if (fallback) return fallback;
      return (
        <div style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 32,
          fontFamily: "var(--font-ui, sans-serif)",
          color: "#61574F",
          textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#A72828" }}>
            Something went wrong loading this section.
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            Refresh the page or go back and try again.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 8,
              padding: "6px 16px",
              fontSize: 13,
              cursor: "pointer",
              border: "1px solid #DDD4C8",
              borderRadius: 6,
              background: "#FCFAF6",
              color: "#171512",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
