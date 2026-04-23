function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function topicTheme(topic) {
  const t = String(topic || "").toLowerCase();
  if (/(climate|plastic|energy|environment|pollution|water|agric)/.test(t)) return "environment";
  if (/(study|education|school|university|student|learning)/.test(t)) return "education";
  if (/(health|sleep|medicine|disease|hospital|nutrition)/.test(t)) return "health";
  if (/(technology|digital|ai|remote|online|data|automation)/.test(t)) return "technology";
  if (/(econom|budget|gdp|finance|jobs|market|work)/.test(t)) return "economics";
  return "society";
}

function buildPassage(topic, theme) {
  const sentenceBank = {
    environment: [
      `${topic} has become a recurring subject in public debate because it affects both policy and daily behaviour.`,
      `Supporters argue that practical reform can reduce waste, improve resilience, and create more sustainable systems.`,
      `Critics, however, note that implementation costs and uneven access often limit the scale of immediate change.`,
      `The result is usually a compromise between ambition, available funding, and public acceptance.`,
    ],
    education: [
      `${topic} is often discussed as a measure of long-term social mobility and national productivity.`,
      `Advocates say that strong educational pathways widen opportunity and help people adapt to changing labour markets.`,
      `Others point out that institutions can reproduce inequality when support structures are weak or unevenly distributed.`,
      `Policy makers therefore face a familiar challenge: how to raise quality without making participation less accessible.`,
    ],
    health: [
      `${topic} illustrates how health outcomes are shaped by habits, institutions, and access to reliable information.`,
      `Public campaigns often aim to reduce risk through early intervention, clearer guidance, and more consistent prevention.`,
      `Even so, outcomes depend on whether people can translate advice into sustainable routines in everyday life.`,
      `Researchers increasingly argue that prevention is cheaper and more humane than treatment after problems become severe.`,
    ],
    technology: [
      `${topic} shows how technology can make work faster while also creating new forms of dependence and uncertainty.`,
      `Businesses usually adopt tools when the promise of efficiency outweighs the cost of training and integration.`,
      `At the same time, users often worry about privacy, reliability, and the loss of human judgement.`,
      `For that reason, successful adoption tends to involve careful rollout rather than instant replacement.`,
    ],
    economics: [
      `${topic} is often used as a shorthand for larger questions about value, fairness, and trade-offs in public life.`,
      `Economists point out that headline figures can hide important distributional effects across regions and social groups.`,
      `A policy may look successful in aggregate while leaving some communities with little immediate benefit.`,
      `This is why analysts increasingly look for supporting indicators before making strong conclusions.`,
    ],
    society: [
      `${topic} reflects a broader social pattern rather than a single isolated event.`,
      `People tend to support change when it feels practical, visible, and consistent with their own experience.`,
      `Resistance usually grows when reforms appear abstract, expensive, or disconnected from everyday concerns.`,
      `That tension makes social change both slow and uneven, even when public discussion is intense.`,
    ],
  };
  return sentenceBank[theme].join(" ");
}

function buildQuestions(topic, passage, pid, baseId, sourceId) {
  const lowerTopic = String(topic || "").toLowerCase();
  const trueQuestion = {
    id: `${baseId}-t`,
    exam: "IELTS",
    section: "Reading – T/F/NG",
    pid,
    difficulty: 1,
    question: `The passage presents ${topic} as an issue with practical consequences.`,
    options: ["True", "False", "Not Given"],
    answer: "True",
    explanation: "The passage explicitly frames the topic as affecting policy and everyday behaviour.",
    tags: [lowerTopic],
  };
  const falseQuestion = {
    id: `${baseId}-f`,
    exam: "IELTS",
    section: "Reading – T/F/NG",
    pid,
    difficulty: 2,
    question: `The passage says there are no trade-offs involved in ${topic}.`,
    options: ["True", "False", "Not Given"],
    answer: "False",
    explanation: "The passage clearly discusses costs, limits, uncertainty, or compromise depending on the theme.",
    tags: [lowerTopic],
  };
  const ngQuestion = {
    id: `${baseId}-ng`,
    exam: "IELTS",
    section: "Reading – T/F/NG",
    pid,
    difficulty: 3,
    question: `The passage explains whether every country handles ${topic} in exactly the same way.`,
    options: ["True", "False", "Not Given"],
    answer: "Not Given",
    explanation: "The passage discusses the issue in general terms but does not compare all countries.",
    tags: [lowerTopic],
  };
  const mcqQuestion = {
    id: `${baseId}-mcq`,
    exam: "IELTS",
    section: "Reading – MCQ",
    pid,
    difficulty: 2,
    question: `What is the main message of the passage about ${topic}?`,
    options: [
      "It is a simple problem with a single solution",
      "It involves trade-offs between ambition and practicality",
      "It is only relevant to one small group of people",
      "It can be ignored until it becomes urgent",
    ],
    answer: "It involves trade-offs between ambition and practicality",
    explanation: "The passage repeatedly emphasizes constraints, compromise, and implementation limits.",
    tags: [lowerTopic],
  };
  const summaryQuestion = {
    id: `${baseId}-sum`,
    exam: "IELTS",
    section: "Reading – Summary",
    pid,
    difficulty: 3,
    question: `Complete the summary: The passage suggests that success on ${topic} depends on balancing ______ and ______.`,
    options: [
      "speed / luck",
      "cost / access",
      "image / gossip",
      "volume / noise",
    ],
    answer: "cost / access",
    explanation: "The passage consistently points to implementation cost and accessibility as the key tension.",
    tags: [lowerTopic],
  };
  return [trueQuestion, falseQuestion, ngQuestion, mcqQuestion, summaryQuestion].map((item) => ({
    ...item,
    sourceId,
    passageText: passage,
  }));
}

export function generateQuestionDrafts({ topics = [], sourceId = "source", startIndex = 1 }) {
  const questionDrafts = [];
  const passageDrafts = {};

  topics.forEach((topic, index) => {
    const theme = topicTheme(topic);
    const pid = `${sourceId}-p${startIndex + index}`;
    const passage = buildPassage(topic, theme);
    passageDrafts[pid] = passage;
    const baseId = slugify(`${sourceId}-${topic}-${index + startIndex}`);
    questionDrafts.push(...buildQuestions(topic, passage, pid, baseId, sourceId));
  });

  return { passages: passageDrafts, questions: questionDrafts };
}
