import * as Sentry from "@sentry/react";

const dsn = import.meta?.env?.VITE_SENTRY_DSN;
const environment = import.meta?.env?.VITE_SENTRY_ENVIRONMENT || import.meta?.env?.MODE || "local";
const tracesSampleRate = Number(import.meta?.env?.VITE_SENTRY_TRACES_SAMPLE_RATE || 0);
const replaySessionSampleRate = Number(import.meta?.env?.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE || 0);
const replayOnErrorSampleRate = Number(import.meta?.env?.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE || 0);

function scrubEvent(event) {
  if (event.request?.data) {
    event.request.data = "[Filtered]";
  }
  if (event.extra) {
    delete event.extra.rawText;
    delete event.extra.extractedText;
    delete event.extra.profile;
    delete event.extra.parsedProfile;
    delete event.extra.parsedCandidateProfile;
  }
  return event;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
    replaysSessionSampleRate: Number.isFinite(replaySessionSampleRate) ? replaySessionSampleRate : 0,
    replaysOnErrorSampleRate: Number.isFinite(replayOnErrorSampleRate) ? replayOnErrorSampleRate : 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

export { Sentry };
