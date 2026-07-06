/**
 * IELTS topic lists for the Adaptive Reading Passage Generator.
 *
 * Topics are organised by passage type (Academic vs General Training)
 * to provide relevant options for the topic dropdown.
 */

export const ACADEMIC_TOPICS = [
  "Science & Technology",
  "Environment & Climate Change",
  "Education & Learning",
  "Health & Medicine",
  "Urban Development & Architecture",
  "Economics & Business",
  "Culture & Society",
  "History & Archaeology",
  "Psychology & Behavior",
  "Communication & Media",
  "Transport & Infrastructure",
  "Food & Agriculture",
  "Energy & Resources",
  "Art & Literature",
  "Space Exploration",
];

export const GENERAL_TOPICS = [
  "Work & Employment",
  "Travel & Tourism",
  "Hobbies & Leisure",
  "Family & Relationships",
  "Food & Nutrition",
  "Sports & Exercise",
  "Shopping & Consumer Behavior",
  "Transport & Commuting",
  "Technology in Daily Life",
  "Health & Fitness",
  "Education & Career",
  "Environment & Recycling",
  "Community & Volunteering",
  "Entertainment & Media",
  "Housing & Living",
];

/**
 * Return topic list appropriate for the given passage type.
 * @param {"academic"|"general"} type
 * @returns {string[]}
 */
export function getTopicsByType(type) {
  return type === "academic" ? ACADEMIC_TOPICS : GENERAL_TOPICS;
}
