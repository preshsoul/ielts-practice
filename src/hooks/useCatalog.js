import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  loadShortlistIds,
  loadApplicationTracking,
  saveShortlist,
  removeShortlist,
  saveApplicationTracking,
  updateApplicationTracking,
  loadPracticeSessions,
} from "../services/supabaseData.js";
import { loadScholarshipContent } from "../services/supabaseData.js";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

export function useScholarshipCatalog() {
  return useQuery({
    queryKey: ["scholarshipCatalog"],
    queryFn: async () => {
      const content = await loadScholarshipContent();
      const raw = content?.scholarshipCatalog || content?.scholarshipRecords || content?.scholarships || [];
      const map = new Map();
      for (const record of raw) {
        if (!record) continue;
        const key = record.id || record.slug || record.source_url || record.website || record.name || record.title;
        if (!key || map.has(key)) continue;
        map.set(key, record);
      }
      return [...map.values()];
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useShortlistIds(profileId) {
  return useQuery({
    queryKey: ["shortlistIds", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      try {
        return await loadShortlistIds(profileId);
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useToggleShortlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, scholarshipId, isSaved }) => {
      if (isSaved) {
        await removeShortlist(profileId, scholarshipId);
      } else {
        await saveShortlist(profileId, scholarshipId);
      }
      return { profileId, scholarshipId, isSaved };
    },
    onMutate: async ({ profileId, scholarshipId, isSaved }) => {
      await queryClient.cancelQueries({ queryKey: ["shortlistIds", profileId] });
      const previous = queryClient.getQueryData(["shortlistIds", profileId]);
      queryClient.setQueryData(["shortlistIds", profileId], (old = []) =>
        isSaved ? old.filter((id) => id !== scholarshipId) : [...old, scholarshipId],
      );
      return { previous };
    },
    onError: (_err, { profileId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["shortlistIds", profileId], context.previous);
      }
    },
    onSettled: (_data, _err, { profileId }) => {
      queryClient.invalidateQueries({ queryKey: ["shortlistIds", profileId] });
    },
  });
}

export function useTrackedApplications(profileId) {
  return useQuery({
    queryKey: ["trackedApplications", profileId],
    queryFn: async () => {
      if (!profileId) return {};
      try {
        const rows = await loadApplicationTracking(profileId);
        const mapped = {};
        for (const row of rows) {
          mapped[row.scholarship_id] = row;
        }
        return mapped;
      } catch {
        return {};
      }
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useTrackApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, scholarship, currentState }) => {
      return await saveApplicationTracking(profileId, scholarship, currentState || "saved");
    },
    onSuccess: (saved, { profileId, scholarship }) => {
      queryClient.setQueryData(["trackedApplications", profileId], (old = {}) => ({
        ...old,
        [scholarship.id]: saved,
      }));
    },
  });
}

export function useAdvanceApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, scholarshipId, nextState }) => {
      return await updateApplicationTracking(profileId, scholarshipId, nextState);
    },
    onSuccess: (saved, { profileId, scholarshipId }) => {
      queryClient.setQueryData(["trackedApplications", profileId], (old = {}) => ({
        ...old,
        [scholarshipId]: saved,
      }));
    },
  });
}

export function usePracticeSessions(userId) {
  return useQuery({
    queryKey: ["practiceSessions", userId],
    queryFn: async () => {
      if (!userId) return [];
      try {
        return await loadPracticeSessions(userId);
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
    enabled: Boolean(userId),
  });
}
