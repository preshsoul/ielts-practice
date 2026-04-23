import React from "react";

export default function AccountProfileForm({
  profile,
  profileDraft,
  setProfileDraft,
  profileBusy,
  profileMessage,
  saveProfileDraft,
  authUser,
  sessions,
}) {
  const updateDraftField = (section, field, value) => {
    setProfileDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  };

  const updateTopLevelField = (field, value) => {
    setProfileDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  return (
    <div className="account-card" style={{ marginTop: 16 }}>
      <div className="empty-state-title">Candidate profile</div>
      <div className="empty-state-copy">
        Fill the fields that matter for scholarship matching. The scorer will read these values directly.
      </div>

      <div className="profile-grid">
        <label className="profile-field">
          <span>Nationality</span>
          <input value={profileDraft.identity.nationality} onChange={(e) => updateDraftField("identity", "nationality", e.target.value)} placeholder="Nigerian" />
        </label>
        <label className="profile-field">
          <span>Country of residence</span>
          <input value={profileDraft.identity.countryOfResidence} onChange={(e) => updateDraftField("identity", "countryOfResidence", e.target.value)} placeholder="Nigeria" />
        </label>
        <label className="profile-field">
          <span>Age at application cycle</span>
          <input value={profileDraft.identity.ageAtApplicationCycle} onChange={(e) => updateDraftField("identity", "ageAtApplicationCycle", e.target.value)} placeholder="24" />
        </label>

        <label className="profile-field">
          <span>Degree class</span>
          <select value={profileDraft.academic.degreeClass} onChange={(e) => updateDraftField("academic", "degreeClass", e.target.value)}>
            <option value="">Select degree class</option>
            <option value="first">First class</option>
            <option value="2:1">2:1</option>
            <option value="2:2">2:2</option>
            <option value="third">Third class</option>
          </select>
        </label>
        <label className="profile-field">
          <span>Institution</span>
          <input value={profileDraft.academic.institution} onChange={(e) => updateDraftField("academic", "institution", e.target.value)} placeholder="University of Lagos" />
        </label>
        <label className="profile-field">
          <span>Institution country</span>
          <input value={profileDraft.academic.institutionCountry} onChange={(e) => updateDraftField("academic", "institutionCountry", e.target.value)} placeholder="Nigeria" />
        </label>
        <label className="profile-field">
          <span>Discipline</span>
          <input value={profileDraft.academic.discipline} onChange={(e) => updateDraftField("academic", "discipline", e.target.value)} placeholder="Education" />
        </label>
        <label className="profile-field">
          <span>Discipline category</span>
          <input value={profileDraft.academic.disciplineCategory} onChange={(e) => updateDraftField("academic", "disciplineCategory", e.target.value)} placeholder="Humanities" />
        </label>
        <label className="profile-field">
          <span>Graduation year</span>
          <input value={profileDraft.academic.graduationYear} onChange={(e) => updateDraftField("academic", "graduationYear", e.target.value)} placeholder="2024" />
        </label>
        <label className="profile-field">
          <span>CGPA</span>
          <input value={profileDraft.academic.cgpa} onChange={(e) => updateDraftField("academic", "cgpa", e.target.value)} placeholder="4.32" />
        </label>
        <label className="profile-field">
          <span>CGPA scale</span>
          <input value={profileDraft.academic.cgpaScale} onChange={(e) => updateDraftField("academic", "cgpaScale", e.target.value)} placeholder="5" />
        </label>

        <label className="profile-field">
          <span>Work experience years</span>
          <input value={profileDraft.professional.workExperienceYears} onChange={(e) => updateDraftField("professional", "workExperienceYears", e.target.value)} placeholder="2" />
        </label>
        <label className="profile-field">
          <span>Currently employed</span>
          <select value={profileDraft.professional.currentlyEmployed} onChange={(e) => updateDraftField("professional", "currentlyEmployed", e.target.value)}>
            <option value="">Select status</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="profile-field">
          <span>Sector</span>
          <input value={profileDraft.professional.sector} onChange={(e) => updateDraftField("professional", "sector", e.target.value)} placeholder="Education" />
        </label>

        <label className="profile-field">
          <span>IELTS score</span>
          <input value={profileDraft.languageTests.ielts} onChange={(e) => updateDraftField("languageTests", "ielts", e.target.value)} placeholder="6.5" />
        </label>
        <label className="profile-field">
          <span>TOEFL score</span>
          <input value={profileDraft.languageTests.toefl} onChange={(e) => updateDraftField("languageTests", "toefl", e.target.value)} placeholder="95" />
        </label>
        <label className="profile-field">
          <span>CELPIP score</span>
          <input value={profileDraft.languageTests.celpip} onChange={(e) => updateDraftField("languageTests", "celpip", e.target.value)} placeholder="9" />
        </label>

        <label className="profile-field">
          <span>Application cycle</span>
          <input value={profileDraft.applicationCycle} onChange={(e) => updateTopLevelField("applicationCycle", e.target.value)} placeholder="2026" />
        </label>
        <label className="profile-field">
          <span>Target degree level</span>
          <input value={profileDraft.targetDegreeLevel} onChange={(e) => updateTopLevelField("targetDegreeLevel", e.target.value)} placeholder="Master's" />
        </label>
        <label className="profile-field">
          <span>Target disciplines</span>
          <input value={profileDraft.targetDisciplines} onChange={(e) => updateTopLevelField("targetDisciplines", e.target.value)} placeholder="Education, Linguistics" />
        </label>
        <label className="profile-field">
          <span>Target countries</span>
          <input value={profileDraft.targetCountries} onChange={(e) => updateTopLevelField("targetCountries", e.target.value)} placeholder="UK, Canada" />
        </label>
      </div>

      <div className="profile-actions">
        <button className="primary-btn" onClick={saveProfileDraft} disabled={profileBusy || !authUser}>
          {profileBusy ? "Saving..." : "Save profile"}
        </button>
        {profile?.tier && <div className="empty-state-meta">Plan: {profile.tier}</div>}
        <div className="empty-state-meta">{sessions.length} locally stored session{sessions.length !== 1 ? "s" : ""}</div>
      </div>
      {profileMessage && <div className="empty-state-meta" style={{ textTransform: "none", letterSpacing: 0 }}>{profileMessage}</div>}
      <div className="empty-state-meta" style={{ textTransform: "none", letterSpacing: 0, marginTop: 10 }}>
        The Scholarships page now handles document intake for PDFs and DOC/DOCX files. Parsed details can be projected back into these fields after backend extraction and confirmation.
      </div>
    </div>
  );
}
