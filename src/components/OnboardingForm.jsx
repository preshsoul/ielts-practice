import React from "react";

const MODULES = ["reading", "listening", "writing", "speaking"];

function updateCurrentLevel(setDraft, field, value) {
  setDraft((current) => ({
    ...current,
    currentLevel: {
      ...current.currentLevel,
      [field]: value,
    },
  }));
}

export default function OnboardingForm({ profile, draft, setDraft, onSave, saving, message, greeting }) {
  const toggleModule = (module) => {
    setDraft((current) => {
      const next = current.targetModules.includes(module)
        ? current.targetModules.filter((item) => item !== module)
        : [...current.targetModules, module];
      return { ...current, targetModules: next };
    });
  };

  return (
    <div className="onboarding-layout">
      <div className="onboarding-card">
        <div className="page-kicker">{greeting?.label || "Onboarding"}</div>
        {greeting?.title && <div className="onboarding-greeting">{greeting.title}</div>}
        <h1 className="page-title">Set up your test plan</h1>
        <p className="page-copy">
          We only need the minimum data to personalize the dashboard: target band, current level, test date, and the skills you want to focus on.
          {greeting?.copy ? ` ${greeting.copy}` : ""}
        </p>

        <div className="onboarding-grid">
          <label className="field-row">
            <span>Target band</span>
            <select value={draft.targetBand} onChange={(event) => setDraft((current) => ({ ...current, targetBand: event.target.value }))}>
              <option value="">Select band</option>
              {[4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="field-row">
            <span>Test date</span>
            <input type="date" value={draft.testDate} onChange={(event) => setDraft((current) => ({ ...current, testDate: event.target.value }))} />
          </label>

          {MODULES.map((module) => (
            <label className="field-row" key={module}>
              <span>{module} self-assessment</span>
              <input
                type="number"
                min="0"
                max="9"
                step="0.5"
                value={draft.currentLevel[module]}
                onChange={(event) => updateCurrentLevel(setDraft, module, event.target.value)}
                placeholder="6.0"
              />
            </label>
          ))}
        </div>

        <div className="module-pills">
          {MODULES.map((module) => (
            <button
              type="button"
              key={module}
              className={`module-pill${draft.targetModules.includes(module) ? " active" : ""}`}
              onClick={() => toggleModule(module)}
            >
              {module}
            </button>
          ))}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="primary-btn" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Finish setup"}
          </button>
          <div className="auth-note">
            This becomes the dashboard baseline for {profile?.email || "your account"}.
          </div>
        </div>

        {message && <div className="auth-message">{message}</div>}
      </div>
    </div>
  );
}
