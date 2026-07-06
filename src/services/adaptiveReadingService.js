/**
 * API client for the generate-ielts-reading Edge Function.
 *
 * Calls the Supabase Edge Function with user auth token and returns
 * the generated passage + questions.
 */

import { supabase } from "./supabaseClient.js";

/**
 * Generate an IELTS reading passage with calibrated difficulty and
 * auto-generated questions.
 *
 * @param {Object} params
 * @param {number} params.targetBand - Target IELTS band (4.0-9.0, step 0.5)
 * @param {string|null} [params.topic] - Optional topic for the passage
 * @param {"academic"|"general"} [params.passageType="academic"] - Passage type
 * @param {string[]} [params.questionTypes] - Question types to include: tfng, mcq, summary, matching
 * @returns {Promise<Object>} Generated passage and questions
 */
export async function generateIELTSReading({
  targetBand,
  topic = null,
  passageType = "academic",
  questionTypes = ["tfng", "mcq", "summary", "matching"],
}) {
  if (!supabase?.functions?.invoke) {
    throw new Error("Supabase functions client is not available");
  }

  const { data, error } = await supabase.functions.invoke("generate-ielts-reading", {
    body: {
      targetBand,
      topic: topic || null,
      passageType,
      questionTypes,
      saveToDb: false,
    },
  });

  if (error) {
    // Supabase client error (network, auth, etc.)
    const message = typeof error === "string" ? error
      : error?.message || error?.error_description || "Edge function invocation failed";
    throw new Error(message);
  }

  if (!data?.ok) {
    // Application-level error from the Edge Function
    const appError = data?.error?.message || "Generation failed";
    const details = data?.error?.details || "";
    throw new Error(details ? `${appError}: ${details}` : appError);
  }

  return {
    passage: data.passage,
    questions: data.questions,
    model: data.model,
    usage: data.usage,
    saved: data.saved || null,
  };
}
