import { useState } from "react";
import { saveStructuredProfile, saveCandidateProfileSnapshot, generateSemanticProfile } from "../services/supabaseData.js";
import { serializeStructuredProfileDraft } from "../services/scoringEngine.js";
import { buildCandidateEmbeddingText } from "../lib/embeddingText.js";
import { logAppError, getErrorMessage } from "../lib/appErrors.js";
import { normalizeProfileRecord } from "./useAuthSession.js";

export function useProfileSave({ authUser, profile, profileDraft, setProfile, setProfileDraft }) {
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const saveProfileDraft = async () => {
    if (!authUser?.id || !profile?.id) {
      setProfileMessage("Sign in first to save your profile.");
      return;
    }

    setProfileBusy(true);
    setProfileMessage("");
    try {
      const payload = serializeStructuredProfileDraft(profileDraft);
      const updatedProfile = await saveStructuredProfile(profile.id, payload);
      const candidateProfile = profileDraft?.candidateProfile && typeof profileDraft.candidateProfile === "object"
        ? profileDraft.candidateProfile
        : null;
      const semanticText = buildCandidateEmbeddingText({
        profile: payload,
        display_name: updatedProfile?.display_name || profile?.display_name || authUser?.email?.split("@")?.[0] || null,
        source: "manual",
      });
      const semanticResult = await generateSemanticProfile(semanticText);
      try {
        await saveCandidateProfileSnapshot(profile.id, {
          sourceType: "manual",
          canonicalJson: {
            ...payload,
            ...(candidateProfile ? { candidateProfile } : {}),
          },
          confidenceJson: {
            source: "manual",
            completeness: updatedProfile ? "saved" : "pending",
            semanticProfile: semanticResult?.confidence ?? null,
            semanticKeywords: Array.isArray(semanticResult?.keywords) ? semanticResult.keywords : [],
          },
          semanticText: semanticResult?.semanticText || semanticText,
          embedding: null,
          embeddingModel: semanticResult?.model || null,
          sourceFingerprint: semanticText || null,
        });
      } catch (candidateError) {
        logAppError(candidateError, { event: "CANDIDATE_PROFILE_SHADOW_SAVE", profileId: profile.id });
      }
      if (semanticResult?.semanticText) {
        setProfileDraft((current) => ({ ...current, semanticText: semanticResult.semanticText }));
      }
      setProfile(normalizeProfileRecord({
        ...updatedProfile,
        semanticText: semanticResult?.semanticText || semanticText,
        semanticKeywords: Array.isArray(semanticResult?.keywords) ? semanticResult.keywords : [],
        ...(candidateProfile ? { candidateProfile } : {}),
      }));
      setProfileMessage("Profile saved. Scholarship scoring refreshed.");
    } catch (error) {
      logAppError(error, { event: "PROFILE_SAVE", profileId: profile.id });
      setProfileMessage(getErrorMessage(error, "Unable to save your profile right now."));
    } finally {
      setProfileBusy(false);
    }
  };

  return { profileBusy, profileMessage, setProfileMessage, saveProfileDraft };
}
