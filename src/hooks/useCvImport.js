import { useState } from "react";
import { saveCvProfile, updateCvProfileMetadata, saveCandidateProfileSnapshot, generateSemanticProfile } from "../services/supabaseData.js";
import { serializeStructuredProfileDraft } from "../services/scoringEngine.js";
import { buildCandidateEmbeddingText } from "../lib/embeddingText.js";
import { createExtractedCandidateProfile } from "../lib/candidateProfile.js";
import { logAppError, getErrorMessage } from "../lib/appErrors.js";
import { normalizeProfileRecord } from "./useAuthSession.js";
import { buildOfflineSemanticProfile } from "../lib/offlineSemanticProfile.js";

export function useCvImport({ authUser, profile, profileDraft, setProfile, setProfileDraft }) {
  const [cvImportBusy, setCvImportBusy] = useState(false);
  const [cvImportMessage, setCvImportMessage] = useState("");

  const handleCvImport = async ({ intake }) => {
    const activeProfileId = profile?.id || authUser?.id || null;
    if (!authUser?.id || !activeProfileId) {
      return { ok: false, message: "Sign in first to save the document to your account." };
    }
    if (!intake) {
      return { ok: false, message: "Choose a file to import." };
    }

    setCvImportBusy(true);
    setCvImportMessage("");
    try {
      const savedCv = await saveCvProfile(activeProfileId, intake);
      let semanticResult = null;
      const extractedCandidateProfile = createExtractedCandidateProfile(intake);
      const mergedDraft = {
        ...profileDraft,
        ...intake.parsedProfile,
        identity: { ...profileDraft.identity, ...intake.parsedProfile?.identity },
        academic: { ...profileDraft.academic, ...intake.parsedProfile?.academic },
        professional: { ...profileDraft.professional, ...intake.parsedProfile?.professional },
        languageTests: { ...profileDraft.languageTests, ...intake.parsedProfile?.languageTests },
        applicationCycle: intake.parsedProfile?.applicationCycle || profileDraft.applicationCycle,
        targetDegreeLevel: intake.parsedProfile?.targetDegreeLevel || profileDraft.targetDegreeLevel,
        targetDisciplines: Array.isArray(intake.parsedProfile?.targetDisciplines) ? intake.parsedProfile.targetDisciplines.join(", ") : profileDraft.targetDisciplines,
        targetCountries: Array.isArray(intake.parsedProfile?.targetCountries) ? intake.parsedProfile.targetCountries.join(", ") : profileDraft.targetCountries,
      };
      let semanticText = "";
      try {
        semanticText = buildCandidateEmbeddingText({
          profile: mergedDraft,
          parsedProfile: intake.parsedProfile,
          intake,
          semanticText: intake.extractedText || intake.extractedExcerpt || intake.label || "",
          display_name: profile?.display_name || authUser?.email?.split("@")?.[0] || null,
          source: "cv",
        });
        semanticResult = await generateSemanticProfile(semanticText);
        // Offline fallback: if Edge Function is unreachable, use regex + ontology
        if (!semanticResult) {
          semanticResult = buildOfflineSemanticProfile(mergedDraft, {
            rawText: intake.extractedText || "",
            keywords: intake.keywords || [],
            notes: intake.label || "",
          });
        }
        await saveCandidateProfileSnapshot(activeProfileId, {
          sourceType: "cv",
          canonicalJson: {
            ...serializeStructuredProfileDraft(mergedDraft),
            candidateProfile: { extracted: extractedCandidateProfile },
          },
          confidenceJson: {
            source: "cv",
            confidence: intake.confidence ?? null,
            semanticProfile: semanticResult?.confidence ?? null,
            semanticKeywords: Array.isArray(semanticResult?.keywords) ? semanticResult.keywords : [],
          },
          semanticText: semanticResult?.semanticText || semanticText,
          embedding: null,
          embeddingModel: semanticResult?.model || null,
          lastCvProfileId: savedCv?.id || null,
          sourceFingerprint: intake.rawTextHash || null,
        });
      } catch (candidateError) {
        logAppError(candidateError, { event: "CANDIDATE_PROFILE_SHADOW_SAVE", profileId: activeProfileId });
      }
      const enrichedKeywords = Array.from(new Set([
        ...(Array.isArray(intake.keywords) ? intake.keywords : []),
        ...(Array.isArray(semanticResult?.keywords) ? semanticResult.keywords : []),
      ]));
      try {
        await updateCvProfileMetadata(activeProfileId, intake.rawTextHash || savedCv?.raw_text_hash || null, {
          label: semanticResult?.summary || intake.label || savedCv?.label || null,
          keywords: enrichedKeywords,
        });
      } catch (cvSemanticError) {
        logAppError(cvSemanticError, { event: "CV_SEMANTIC_SAVE", profileId: activeProfileId });
      }
      if (intake.parsedProfile) {
        setProfileDraft((current) => ({
          ...current,
          ...intake.parsedProfile,
          identity: { ...current.identity, ...intake.parsedProfile.identity },
          academic: { ...current.academic, ...intake.parsedProfile.academic },
          professional: { ...current.professional, ...intake.parsedProfile.professional },
          languageTests: { ...current.languageTests, ...intake.parsedProfile.languageTests },
          applicationCycle: intake.parsedProfile.applicationCycle || current.applicationCycle,
          targetDegreeLevel: intake.parsedProfile.targetDegreeLevel || current.targetDegreeLevel,
          targetDisciplines: Array.isArray(intake.parsedProfile.targetDisciplines) ? intake.parsedProfile.targetDisciplines.join(", ") : current.targetDisciplines,
          targetCountries: Array.isArray(intake.parsedProfile.targetCountries) ? intake.parsedProfile.targetCountries.join(", ") : current.targetCountries,
          semanticText: semanticResult?.semanticText || semanticText,
          candidateProfile: {
            ...(current?.candidateProfile || {}),
            extracted: extractedCandidateProfile,
          },
        }));
      }
      setProfile((current) => normalizeProfileRecord({
        ...current,
        semanticText: semanticResult?.semanticText || current?.semanticText || null,
        semanticKeywords: enrichedKeywords,
        latestCvProfileId: savedCv?.id || current?.latestCvProfileId || null,
        candidateProfile: {
          ...(current?.candidateProfile || {}),
          extracted: extractedCandidateProfile,
        },
      }));
      setCvImportMessage("Your CV is in. We're finding your perfect opportunity now.");
      return { ok: true };
    } catch (error) {
      logAppError(error, { event: "CV_IMPORT_SAVE", profileId: activeProfileId });
      const message = getErrorMessage(error, "Unable to save the document right now.");
      setCvImportMessage(message);
      return { ok: false, message };
    } finally {
      setCvImportBusy(false);
    }
  };

  return { cvImportBusy, cvImportMessage, handleCvImport };
}
