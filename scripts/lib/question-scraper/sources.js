export const QUESTION_SOURCES = [
  {
    id: "ielts-topic-bank-1",
    url: "https://ieltsliz.com/ielts-speaking-part-1-topics/",
    kind: "topic-list",
    rateLimitMs: 2500,
    fallbackTopics: [
      "technology in daily life",
      "education and learning",
      "health and sleep habits",
    ],
  },
  {
    id: "who-fact-sheets",
    url: "https://www.who.int/news-room/fact-sheets",
    kind: "topic-list",
    rateLimitMs: 3000,
    fallbackTopics: [
      "antimicrobial resistance",
      "mental health",
      "air pollution",
    ],
  },
  {
    id: "our-world-in-data",
    url: "https://ourworldindata.org/",
    kind: "topic-list",
    rateLimitMs: 3000,
    fallbackTopics: [
      "climate change",
      "education inequality",
      "health access",
    ],
  },
  {
    id: "world-bank-open-knowledge",
    url: "https://openknowledge.worldbank.org/",
    kind: "topic-list",
    rateLimitMs: 3500,
    fallbackTopics: [
      "development policy",
      "poverty reduction",
      "digital inclusion",
    ],
  },
  {
    id: "oecd-education",
    url: "https://www.oecd.org/en/publications/open-educational-resources_9789264247543-en.html",
    kind: "topic-list",
    rateLimitMs: 3500,
    fallbackTopics: [
      "open educational resources",
      "education innovation",
      "digital learning",
    ],
  },
  {
    id: "oecd-equity",
    url: "https://www.oecd.org/en/publications/mending-the-education-divide_92b75874-en/full-report/component-7",
    kind: "topic-list",
    rateLimitMs: 3500,
    fallbackTopics: [
      "education equity",
      "digital divide",
      "teacher distribution",
    ],
  },
];
