import React, { useState, useEffect } from "react";
import { Link, NavLink, Navigate, Routes, Route, useLocation } from "react-router-dom";
import PracticeView from './components/PracticeView.jsx';
import ProgressView from './components/ProgressView.jsx';
import WeakAreasView from './components/WeakAreasView.jsx';
import LearningPathView from './components/LearningPathViewClean.jsx';
import ScholarshipPage from './components/ScholarshipPage.jsx';
import './styles.css';
import { supabase, loadPublicContent, ensureProfile, loadPracticeSessions, savePracticeSession } from "./services/supabaseData.js";
import securityLogger from "./services/securityLogger.js";
import InputSanitizer from "./services/inputSanitizer.js";
import SecureErrorHandler from "./services/secureErrorHandler.js";

/* ═══════════════════════════════════════════════════════
   QUESTION BANK — 250+ questions, difficulty-tagged
   difficulty: 1=Easy 2=Medium 3=Hard
═══════════════════════════════════════════════════════ */
const LEARNING_PATH = {
  "Reading – T/F/NG": {
    icon:"📖", color:"#5BA3C9",
    summary:"The most feared question type — and one of the most learnable once you internalise its strict logic.",
    steps:[
      {title:"Understand the three definitions precisely",body:"TRUE = the passage explicitly confirms the statement. FALSE = the passage explicitly contradicts it. NOT GIVEN = the information is absent or cannot be confirmed from the passage alone. There is no 'kind of true' or 'probably true.' IELTS deals in facts, not inferences."},
      {title:"The NOT GIVEN trap",body:"The biggest mistake is spending too long searching for NG. If you have scanned the relevant section and cannot find confirmation or contradiction, it is NOT GIVEN — move on. Spending more than 90 seconds on a single T/F/NG question is almost always a timing error."},
      {title:"Use synonyms, not exact word matches",body:"IELTS rarely uses the exact words from the passage in the statement. Herbivorous = vegetarian. Nocturnal = awake at night. Train yourself to spot synonyms and paraphrases rather than looking for identical wording. This is the most commonly missed skill."},
      {title:"Watch qualifying words carefully",body:"Words like 'all,' 'always,' 'never,' 'only,' 'some,' 'may,' and 'could' change the meaning of a statement entirely. A statement using 'all' is FALSE if the passage says 'most.' A statement using 'always' is FALSE if the passage says 'usually.'"},
      {title:"Answers follow passage order",body:"T/F/NG answers appear in the same order as the relevant information in the passage. Use this to manage your time — once you've found question 3's answer, question 4's answer is somewhere after it, not before."},
      {title:"There is always at least one of each",body:"Every T/F/NG set contains at least one True, one False, and one Not Given. If you have answered all questions and one category is missing, you have made an error — review."},
    ]
  },
  "Reading – Multiple Choice":{
    icon:"🔍", color:"#8899CC",
    summary:"Multiple choice in IELTS tests comprehension of specific detail, main idea, and writer's purpose. The answer is always in the passage — your general knowledge is irrelevant.",
    steps:[
      {title:"Read the question before the passage",body:"Read each question stem carefully before scanning the passage. Identify what type of question it is: specific detail (scan for keywords), main idea (read the whole paragraph), or purpose/attitude (look at tone and structure)."},
      {title:"Eliminate clearly wrong options first",body:"Often two options are clearly wrong from a single sentence. Eliminate those, then focus on distinguishing the remaining two. The correct answer will be supported by specific passage evidence — not inference or general knowledge."},
      {title:"Paraphrase detection",body:"Correct answers are almost never worded identically to the passage. The passage says 'herbivorous' — the answer says 'vegetarian.' Train yourself to recognise when an option means the same thing as a passage sentence, even in different words."},
      {title:"Beware of 'true but irrelevant' distractors",body:"A common trap: an option that is factually true based on the passage, but does not answer the specific question asked. Always re-read the question after reading the answer options."},
    ]
  },
  "Grammar":{
    icon:"⚙️", color:"#E09020",
    summary:"Grammar accounts for 25% of your Writing and Speaking band scores. The top errors are predictable and fixable with targeted practice.",
    steps:[
      {title:"Subject-verb agreement",body:"The most common error. 'The government has decided' (singular institution = singular verb). 'Neither the teacher nor the students were present' (verb agrees with the nearest noun — students = plural). 'The number of applicants has increased' ('The number of' = singular). 'A number of applicants have applied' ('A number of' = plural)."},
      {title:"Uncountable nouns",body:"Never pluralise: information, advice, evidence, research, furniture, equipment, news, homework, feedback. Wrong: 'many informations.' Right: 'a great deal of information.' This error alone can prevent you from reaching Band 7."},
      {title:"Conditionals",body:"Zero (facts): If you heat water, it boils. First (possible): If it rains, I will stay. Second (unlikely/hypothetical): If I had more time, I would study more. Third (impossible past): If she had studied, she would have passed. Mixed: If I had studied harder, I would be at a better university now."},
      {title:"Articles: a / an / the / Ø",body:"'The' = specific, already identified or unique. 'A/An' = first mention or non-specific. 'Ø' = uncountable nouns used generally (Education is important), plural nouns used generally (Students learn best through practice). Superlatives always take 'the.' 'A' before consonant sounds; 'an' before vowel sounds."},
      {title:"Discourse markers and punctuation",body:"When a discourse marker opens a sentence, a comma must follow: 'However, the results were inconclusive.' In the middle of a sentence: 'The results were, however, inconclusive.' Never write two independent clauses with only a comma between them (comma splice)."},
      {title:"Reported speech tense shifts",body:"Present → Past. Will → Would. Can → Could. May → Might. 'Tomorrow' → 'the next day.' 'Said' takes no object; 'told' requires one ('She told me' not 'She told'). 'Said that' is correct; 'told that' without an object is not."},
    ]
  },
  "Academic Vocabulary":{
    icon:"📚", color:"#2ECC71",
    summary:"Lexical Resource counts for 25% of your Writing and Speaking scores. The goal is not rare words — it is accurate, precise, and varied academic language.",
    steps:[
      {title:"Learn collocations, not isolated words",body:"'Establish a link' not 'make a link.' 'Reach a conclusion' not 'make a conclusion.' 'Address an issue' not 'handle an issue.' 'Raise a question' not 'lift a question.' The wrong verb in the right context is penalised as an inaccuracy, not rewarded as vocabulary range."},
      {title:"The precision principle",body:"One well-used word is better than three impressive but misused ones. 'Disseminate' is stronger than 'spread' in academic writing — but only if you use it correctly. Using 'exacerbate' when you mean 'cause' is an error, not a demonstration of range."},
      {title:"Avoid informal register",body:"Never use in academic writing: loads of, a lot of, kids, stuff, things, really big, get (in place of formal verbs), nowadays (prefer 'in recent years'), these days. Replace 'talk about' with 'address,' 'discuss,' or 'examine.' Replace 'find out' with 'discover' or 'determine.'"},
      {title:"Academic word families",body:"Know all four forms: SIGNIFY → significant (adj), significantly (adv), significance (noun). CONCLUDE → conclusive (adj), conclusively (adv), conclusion (noun). SUSTAIN → sustainable (adj), sustainability (noun), sustainably (adv). PREDICT → predictable (adj), predictability (noun), prediction (noun). Errors in word form are penalised under Lexical Resource."},
      {title:"Paraphrasing without plagiarism",body:"In Task 2 introductions, never copy the question prompt word-for-word. Paraphrase the topic using synonyms and restructured grammar. Copying from the prompt is a Lexical Resource penalty. The examiner will notice immediately."},
    ]
  },
  "Writing Task 1":{
    icon:"📊", color:"#8899CC",
    summary:"Task 1 is worth one-third of your Writing band score. Most marks are lost through missing the overview, wrong tense, or describing every detail instead of key trends.",
    steps:[
      {title:"Structure: always Introduction → Overview → Body 1 → Body 2",body:"Your Introduction paraphrases the question. Your Overview (2–3 sentences) identifies the most significant overall trends — no specific figures here. Body paragraphs contain grouped, detailed data with figures. There is no conclusion in Task 1."},
      {title:"The overview is the most important paragraph",body:"Examiners read the overview to assess Task Achievement. Missing it or making it too vague is the most common reason for losing marks. State the two or three most striking patterns: 'Overall, X rose consistently while Y declined, with both values converging by 2020.'"},
      {title:"Tense discipline",body:"Historical data (past): rose, fell, peaked, declined. Data that extends to the present: has risen, has remained. Projections (future): is expected to, is projected to. Mixing tenses arbitrarily = grammatical error."},
      {title:"Describe, compare, don't list",body:"The weakest Task 1 responses list every figure in chronological order. Strong responses group comparisons, foreground contrasts, and describe trends rather than enumerating data points. 'While Country A's output doubled between 2000 and 2010, Country B's remained flat' is stronger than describing each separately."},
      {title:"Language for trends",body:"Rise: rose, increased, climbed, grew, surged (sharply), crept up (gradually). Fall: fell, declined, dropped, decreased, plummeted (sharply), eased (slightly). Stable: remained constant, levelled off, plateaued, stabilised. Fluctuated before levelling off. Peaked at / reached a peak of / hit a low of."},
    ]
  },
  "Writing Task 2":{
    icon:"✍️", color:"#E05252",
    summary:"Task 2 carries twice the weight of Task 1. Most candidates fail not on language but on Task Achievement — they don't fully answer what was asked.",
    steps:[
      {title:"Always fully answer the question",body:"Task Achievement is 25% of your score and the most commonly lost. Read the question twice. Identify: (1) the topic, (2) the specific task (agree/disagree? both views? causes and solutions?). A beautiful essay that answers the wrong question will not exceed Band 5."},
      {title:"Structure by question type",body:"Opinion (To what extent do you agree?): state your position in introduction, develop with two body paragraphs, restate in conclusion. Discuss both views: one paragraph per view + your own position. Problem-Solution: one paragraph for problems, one for solutions. Advantage-Disadvantage: one paragraph each, then your evaluation."},
      {title:"Time management: 40 minutes exactly",body:"Plan: 3–5 minutes (outline your position and two main points). Write: 30 minutes (aim for 280–300 words). Check: 3–5 minutes (proofread for grammar, vocabulary, and coherence). Overrunning on Task 1 is the single most damaging time error."},
      {title:"Vary sentence structure for Grammatical Range",body:"Include conditionals ('If governments acted sooner...'), relative clauses ('policies which benefit...'), passive constructions ('It has been argued that...'), and nominal clauses ('The fact that...suggests...'). Variety matters — but only when the structure is accurate. A broken complex sentence scores lower than a clean simple one."},
      {title:"Cohesion: flow, not just connectors",body:"Overusing 'However' and 'Furthermore' is marked as a cohesion weakness. Good cohesion comes from pronoun reference, lexical chains, and logical paragraph ordering — not just adding connectors. One well-placed 'Nevertheless' is worth more than five 'In additions.'"},
    ]
  },
  "Listening":{
    icon:"🎧", color:"#E09020",
    summary:"Listening scores improve fastest when you stop losing easy marks to predictable traps. The test is played once — active, predictive listening is the core skill.",
    steps:[
      {title:"Use the reading time",body:"Before each section begins, you have time to read the questions. Use it to predict: what kind of answer is expected? A name? A number? A place? A date? Predicting the answer type means you know what to listen for rather than transcribing everything."},
      {title:"The self-correction trap",body:"The most reliable source of wrong answers in form-completion tasks: a speaker gives information, then corrects it. 'The meeting is on Tuesday... actually, Wednesday.' Always write the corrected, final version. The initial version is the distractor."},
      {title:"Word limits are strictly enforced",body:"If the instruction says 'NO MORE THAN TWO WORDS,' a three-word answer is wrong even if the content is correct. Count articles and prepositions — 'the river bank' is three words. Abbreviations count as one word."},
      {title:"Sections 3 and 4 require different strategies",body:"Sections 1–2 use predictable everyday vocabulary. Sections 3–4 use academic language, multiple speakers with overlapping views, and abstract content. In Section 4 (the academic lecture) — the hardest section — focus on the main argument structure, not individual details."},
      {title:"Build your error log",body:"After every practice session, do not just check your score. Analyse every wrong answer: was it a timing issue, a vocabulary gap, a strategy error, or a distraction? Most candidates make the same three or four errors repeatedly. Identifying them is the fastest route to improvement."},
    ]
  },
  "Exam Strategy":{
    icon:"🎯", color:"#5BA3C9",
    summary:"Test-taking strategy can add half a band to your score without improving your English. Most of these errors are entirely preventable.",
    steps:[
      {title:"Academic vs General Training",body:"Listening and Speaking are identical for both. Reading and Writing differ. Academic Reading uses complex analytical texts; General Training uses practical, workplace texts. Academic Writing Task 1 describes visual data; General Training Task 1 is a letter. Confirm which version your target institution requires."},
      {title:"Never leave a Listening or Reading answer blank",body:"There is no negative marking in IELTS. A guess costs nothing; a blank guarantees zero. If time is running out in Reading, use the first sentence of each paragraph to quickly answer general questions and scan for keywords on specific ones."},
      {title:"Half-band increments",body:"IELTS reports in 0.5 increments: 5.0, 5.5, 6.0, 6.5, 7.0. Most Scottish postgraduate programmes require 6.0–6.5 overall with no band below 5.5–6.0. Always check the specific component requirements — an average can conceal a weak individual band that fails a minimum threshold."},
      {title:"Reading: matching headings does not follow passage order",body:"T/F/NG, sentence completion, and short answers follow passage order. Matching headings requires you to scan the whole passage non-linearly. Allocate time accordingly — matching headings is the most time-consuming question type."},
    ]
  },
  "Use of English – Open Cloze":{
    icon:"🔤", color:"#8899CC",
    summary:"Open cloze tests grammar and fixed phrases, not vocabulary. One word only — and it must be the exact grammatical form required.",
    steps:[
      {title:"Read the whole sentence before filling the gap",body:"The gap word always has a grammatical relationship with words on both sides. Read the full sentence first, then identify what role the missing word plays: preposition, auxiliary verb, article, conjunction, pronoun, or part of a fixed phrase."},
      {title:"Fixed phrases and collocations",body:"Many gaps in open cloze test fixed prepositional phrases: 'come into effect,' 'as a result of,' 'on behalf of,' 'in spite of,' 'take into account.' These cannot be guessed — they must be learned. The preposition in a fixed phrase is not interchangeable."},
      {title:"Inversion with negative adverbials",body:"When 'rarely,' 'never,' 'seldom,' 'barely,' 'not only,' or 'under no circumstances' begin a clause, the auxiliary verb and subject are inverted: 'Rarely has such research been conducted.' This inversion is frequently tested at C2 level."},
    ]
  },
  "Word Formation":{
    icon:"🏗️", color:"#2ECC71",
    summary:"Word formation tests whether you know the correct suffix for the required grammatical category. Always identify whether the gap needs a noun, adjective, adverb, or verb before selecting.",
    steps:[
      {title:"Identify the required word class first",body:"Read the sentence and identify what grammatical function the gap word must serve. Is it the subject or object (noun)? Does it modify a noun (adjective)? Does it modify a verb or adjective (adverb)? Does it follow an auxiliary (verb)? The word class tells you which suffix to apply."},
      {title:"Learn all four forms of academic word families",body:"For every root word, know: verb, noun, adjective, adverb. SIGNIFY: signifies / significance / significant / significantly. CONCLUDE: conclude / conclusion / conclusive / conclusively. SUSTAIN: sustain / sustainability / sustainable / sustainably. Gaps frequently require negative or abstract noun forms."},
      {title:"Beware of similar-looking words with different meanings",body:"'Predictable' (able to be predicted) ≠ 'predictive' (relating to prediction). 'Reliable' ≠ 'reliant' (depending on). 'Appreciative' (feeling appreciation) ≠ 'appreciable' (large enough to be noticed). The correct meaning, not just the correct suffix, is what matters."},
    ]
  },
  "Key Word Transformation":{
    icon:"🔄", color:"#E09020",
    summary:"KWT tests your ability to express the same meaning using a different grammatical structure. You must use the key word unchanged and keep within the 3–8 word limit.",
    steps:[
      {title:"Identify the grammatical transformation required",body:"Most transformations fall into predictable categories: passive voice, reported speech, conditionals, wishes and regrets, causative 'have/get,' comparative structures, inversion, modal verbs for deduction, too/enough/so-that. Recognise the category quickly rather than guessing from scratch."},
      {title:"The 3–8 word rule is strict",body:"Count every word including the key word. Contractions count as two words (don't = do + not). Articles and prepositions count as words. Exceeding 8 or falling below 3 = zero marks for that item, even if the content is correct."},
      {title:"Never change the key word",body:"The key word must appear in your answer in exactly the form given — no additions, subtractions, or changes. If the key word is SAID, it must appear as 'said' not 'saying' or 'have said.'"},
    ]
  },
  "Multiple Choice Cloze":{
    icon:"📝", color:"#5BA3C9",
    summary:"Multiple choice cloze tests collocations, fixed phrases, and idiomatic language. The correct option is the one that is both grammatically correct AND the natural English choice.",
    steps:[
      {title:"Test all options in context",body:"Insert each option into the sentence and read it aloud mentally. One option will feel natural; the others will feel slightly off. This technique works because collocations are patterns — incorrect options often violate native speaker intuition even when the meaning seems close."},
      {title:"Collocations are not interchangeable",body:"'Raise a question' not 'lift a question.' 'Reach a decision' not 'arrive at a decision' (though both are possible). 'Cut your losses' not 'reduce your losses.' 'Come as a surprise' not 'arrive as a surprise.' The wrong verb in a fixed collocation is wrong regardless of meaning."},
      {title:"Idiomatic phrases",body:"Some gaps test fixed idioms: 'go unnoticed,' 'come into play,' 'take for granted,' 'bring about change.' If you recognise the idiom, the answer is immediate. Build your idiom knowledge through reading authentic academic and journalistic texts."},
    ]
  },
  "Exam Overview":{
    icon:"🗺️", color:"#2ECC71",
    summary:"CELPIP is Canada-specific, fully computer-delivered, and aligned to Canadian Language Benchmarks. Understanding its format prevents costly surprises on test day.",
    steps:[
      {title:"CELPIP vs IELTS: key differences",body:"CELPIP Speaking: computer-delivered, AI-scored, no human examiner. IELTS Speaking: face-to-face with a human examiner. CELPIP content: Canadian daily life (healthcare, housing, weather, community). IELTS content: international academic and social contexts. CELPIP: 1–12 scale. IELTS: 1–9 scale in 0.5 bands."},
      {title:"CLB alignment",body:"CELPIP scores map 1:1 to Canadian Language Benchmarks: CELPIP 7 = CLB 7 = approximately IELTS 6.0–6.5. CELPIP 9 = CLB 9 = approximately IELTS 7.5. For Federal Skilled Worker Express Entry: CLB 7 required in all four components."},
    ]
  },
  "Reading":{
    icon:"📖", color:"#5BA3C9",
    summary:"CELPIP Reading uses everyday Canadian contexts — emails, memos, notices, and opinion texts — increasing in complexity across four parts.",
    steps:[
      {title:"Parts increase in difficulty",body:"Part 1 (Correspondence): everyday emails and letters. Part 2 (Diagrams): reading visual information. Part 3 (Forms): extracting specific information. Part 4 (Viewpoints): opinion and argument texts — the most demanding. Allocate more time to Parts 3 and 4."},
      {title:"Purpose questions",body:"When asked about the writer's main purpose, read the entire text before answering. Purpose is determined by overall tone and structure — not just the opening sentence. Common purposes: to inform, to persuade, to request, to complain, to advise."},
    ]
  },
  "Writing":{
    icon:"✍️", color:"#E05252",
    summary:"CELPIP Writing Task 1 is an email; Task 2 is a survey response. Both test real-world Canadian communication skills.",
    steps:[
      {title:"Task 1: email register",body:"Match your tone to the relationship specified. Emailing a neighbour: semi-formal. Emailing a manager: formal. Opening: 'Dear [Name],' not 'Hey.' State your purpose in the first sentence. Close politely. Target 150–200 words."},
      {title:"Scoring criteria",body:"Content (is it relevant and complete?), Coherence/Cohesion (does it flow logically?), Vocabulary (range and accuracy), Grammar/Sentence Structure (variety and correctness). Staying entirely off-topic on Content scores very low regardless of language quality."},
    ]
  },
  "Speaking":{
    icon:"🎙️", color:"#8899CC",
    summary:"CELPIP Speaking has 8 tasks scored by AI. The absence of a human examiner changes what you should optimise for.",
    steps:[
      {title:"Use your 30-second preparation time",body:"Most tasks give 30 seconds before you begin speaking. Use it to identify the main point you want to make, a supporting example, and how you will conclude. Speak clearly and at a measured pace — the AI scores listenability."},
      {title:"CELPIP Speaking scoring criteria",body:"Vocabulary Range, Listenability (clarity and ease of understanding), Rhythm/Fluency/Pronunciation, and Content (relevance and completeness). Unlike IELTS, you cannot adjust for an examiner's reactions. Natural, clear, organised speech is the priority."},
      {title:"Task types to practise specifically",body:"Task 1 (Giving Advice), Task 3 (Describing a Scene), Task 6 (Dealing with a Difficult Situation), and Task 8 (Describing an Unlikely Situation) are the most cognitively demanding. Practise each type so the format is automatic on test day."},
    ]
  },
};

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const EXAMS = ["All", "IELTS", "CEP (C2)", "CELPIP"];
const DIFF_LABEL = { 1: "Easy", 2: "Medium", 3: "Hard" };
const DIFF_COLOR = { 1: "#1A8C4E", 2: "#B86A0A", 3: "#C93838" };
const EXAM_COLOR = { IELTS: "#C47A00", "CEP (C2)": "#2A7AB0", CELPIP: "#A83030" };
const APP_OWNER = import.meta.env.VITE_APP_OWNER || 'User';
const C = {
  bg: "#F9F7F4",
  surface: "#FFFFFF",
  border: "#E0DAD2",
  text: "#1A1814",
  muted: "#7A7570",
  faint: "#EAE6DF",
  accent: "#2D5BE3",
  green: "#1A8C4E",
  red: "#C93838",
  amber: "#B86A0A",
  bg2: "#F2EFE9",
  bg3: "#EAE6DF",
};

const SECTIONS_BY_EXAM = {
  "IELTS": ["Reading – T/F/NG", "Reading – Multiple Choice", "Grammar", "Academic Vocabulary", "Writing Task 1", "Writing Task 2", "Listening", "Exam Strategy"],
  "CEP (C2)": ["Use of English – Open Cloze", "Word Formation", "Key Word Transformation", "Multiple Choice Cloze", "Exam Strategy"],
  "CELPIP": ["Exam Overview", "Reading", "Writing", "Speaking", "Exam Strategy"],
};

function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* Weighted question selector — boosts weak sections */
function selectQueue(allQ, weakSections, exam, count = 20) {
  let pool = exam === "All" ? allQ : allQ.filter(q => q.exam === exam);
  if (!pool.length) return [];
  if (weakSections.length === 0) return shuffle(pool).slice(0, count);
  const weak = pool.filter(q => weakSections.includes(q.section));
  const other = pool.filter(q => !weakSections.includes(q.section));
  const weakCount = Math.min(Math.round(count * 0.6), weak.length);
  const otherCount = Math.min(count - weakCount, other.length);
  return shuffle([...shuffle(weak).slice(0, weakCount), ...shuffle(other).slice(0, otherCount)]);
}

/* Compute section accuracy from all sessions (session-aware)
   Flags a section as weak when it has appeared in at least 3 distinct sessions
   and the overall accuracy for that section is below the threshold (default 60%). */
function computeWeakSections(sessions, threshold = 0.6) {
  const sectionData = {};
  sessions.forEach((s, idx) => {
    const sessionId = s.date || idx;
    s.results.forEach(r => {
      if (!sectionData[r.section]) sectionData[r.section] = { correct: 0, total: 0, sessions: new Set() };
      sectionData[r.section].total++;
      if (r.correct) sectionData[r.section].correct++;
      sectionData[r.section].sessions.add(sessionId);
    });
  });
  return Object.entries(sectionData)
    .filter(([, d]) => d.sessions.size >= 3 && d.correct / d.total < threshold)
    .map(([s]) => s);
}

/* ═══════════════════════════════════════════════════════
   STORAGE — use window.storage if available, otherwise fallback to localStorage
═══════════════════════════════════════════════════════ */
async function loadSessions() {
  try {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function') {
      const r = await window.storage.get("precious_sessions");
      return safeLoadSessions(r ? r.value : null);
    } else if (typeof localStorage !== 'undefined') {
      const s = localStorage.getItem('precious_sessions');
      return safeLoadSessions(s);
    }
    return [];
  } catch { return []; }
}

function safeLoadSessions(rawData) {
  try {
    if (!rawData) return [];
    const data = JSON.parse(rawData);
    if (!Array.isArray(data)) return [];

    return data.filter(session =>
      typeof session === 'object' &&
      session !== null &&
      !Object.prototype.hasOwnProperty.call(session, '__proto__') &&
      !Object.prototype.hasOwnProperty.call(session, 'constructor')
    ).map(session => ({
      id: String(session.id || ''),
      date: String(session.date || new Date().toISOString()),
      score: Number(session.score) || 0,
      total: Number(session.total) || 0,
      exam: String(session.exam || 'IELTS'),
      results: Array.isArray(session.results) ? session.results : []
    }));
  } catch {
    return [];
  }
}
async function saveSessions(sessions) {
  try {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function') {
      await window.storage.set("precious_sessions", JSON.stringify(sessions));
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('precious_sessions', JSON.stringify(sessions));
    }
  } catch { }
}

function normalizeSessions(list) {
  return (Array.isArray(list) ? list : []).map((session) => ({
    ...session,
    id: session.id || session.date || crypto.randomUUID(),
  }));
}

function mergeSessions(existing, incoming) {
  const map = new Map();
  [...normalizeSessions(existing), ...normalizeSessions(incoming)].forEach((session) => {
    map.set(session.id, session);
  });
  return [...map.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportSessionsData(sessions) {
  securityLogger.logDataExport(authUser?.id || 'anonymous', 'practice_sessions', sessions.length);
  downloadJson(`ielts-sessions-${new Date().toISOString().slice(0, 10)}.json`, {
    exported_at: new Date().toISOString(),
    sessions,
  });
}

/* ═══════════════════════════════════════════════════════
   SMALL UI ATOMS (unchanged)
═══════════════════════════════════════════════════════ */
function Chip({ label, color, small }) {
  return <span className={`chip${small ? ' chip-small' : ''}`} style={{ ['--chip-color']: color }}>{label}</span>;
}
function PrimaryBtn({ children, onClick, disabled }) {
  return <button onClick={!disabled ? onClick : undefined} disabled={disabled} className={`primary-btn${disabled ? ' disabled' : ''}`}>{children}</button>;
}
function GhostBtn({ children, onClick }) {
  return <button onClick={onClick} className="ghost-btn">{children}</button>;
}

/* ═══════════════════════════════════════════════════════
   ROUTED APP
═══════════════════════════════════════════════════════ */
const MAIN_NAV = [
  { to: "/practice", label: "Practice" },
  { to: "/scholarships", label: "Scholarships" },
  { to: "/account", label: "Account" },
];

const PRACTICE_NAV = [
  { to: "/practice", label: "Practice", end: true },
  { to: "/practice/progress", label: "Progress" },
  { to: "/practice/weak-areas", label: "Weak Areas" },
  { to: "/practice/learning-path", label: "Learning Path" },
];

function Shell({ sessions, onReset, children }) {
  return (
    <div className="app-container app-shell" style={{ color: C.text, fontFamily: "var(--font-reading)" }}>
      <header className="app-sidebar">
        <Link to="/" className="app-brand app-brand-link">
          <div className="app-brand-kicker">IELTS · Practice & Scholarship Tools</div>
          <div className="app-brand-title">{APP_OWNER}</div>
          <div className="app-brand-subtitle">A calm study workspace for exam prep and scholarship planning.</div>
        </Link>

        <nav className="app-nav" aria-label="Primary">
          {MAIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `route-link${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shell-actions">
          <div className="session-count">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </div>
          <button onClick={onReset} className="ghost-btn ghost-btn-danger">Reset</button>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {MAIN_NAV.filter((item) => item.to !== "/account").map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mobile-nav-btn${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="topbar">
      <div>
        <div style={{ font: "600 11px/1.4 var(--font-ui)", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase" }}>Workspace</div>
        <div className="page-title" style={{ marginBottom: 8 }}>{title}</div>
        <div className="page-subtitle">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}

function PracticeShell({ title, subtitle, weakCount, exportAction, children }) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={exportAction ? <button onClick={exportAction} className="ghost-btn">Export</button> : null}
      />
      <div className="module-subnav" aria-label="Practice navigation">
        {PRACTICE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `module-subnav-link${isActive ? " active" : ""}`}
          >
            {item.label}
            {item.to === "/practice/weak-areas" && weakCount > 0 && <span className="module-subnav-badge">{weakCount}</span>}
          </NavLink>
        ))}
      </div>
      <section className="panel-card">{children}</section>
    </>
  );
}

function LandingPage({ questionsCount, examCount, passageCount }) {
  return (
    <section className="hero-grid">
      <div className="hero-copy">
        <div className="section-kicker">Landing</div>
        <h1 className="hero-title">Prepare smarter. Find your scholarship.</h1>
        <p className="hero-lead">
          Built for exam prep and scholarship planning, with a calm editorial interface and clear study flows.
        </p>
        <div className="hero-actions">
          <Link className="primary-btn link-button" to="/practice">Start practicing →</Link>
          <Link className="ghost-btn link-button" to="/scholarships">Find scholarships</Link>
        </div>
      </div>

      <aside className="hero-panel">
        <div className="hero-panel-title">Current snapshot</div>
        <div className="hero-stats">
          <div className="stat-card">
            <div className="stat-label">Questions</div>
            <div className="stat-value">{questionsCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Exams</div>
            <div className="stat-value">{examCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Passages</div>
            <div className="stat-value">{passageCount}</div>
          </div>
        </div>
        <div className="feature-strip">
          <div className="feature-card">
            <div className="feature-title">Adaptive Practice</div>
            <div className="feature-text">Question queueing and weak-area weighting already work in-browser.</div>
          </div>
          <div className="feature-card">
            <div className="feature-title">Scholarship Matching</div>
            <div className="feature-text">Keyword-driven scholarship browsing and shortlist support are live.</div>
          </div>
          <div className="feature-card">
            <div className="feature-title">Learning Path</div>
            <div className="feature-text">Section guidance and revision notes are organized as separate routes.</div>
          </div>
        </div>
      </aside>
    </section>
  );
}

function AccountPage({ sessions, authUser, profile, authEmail, setAuthEmail, authMessage, authBusy, onSignIn, onSignOut }) {
  return (
    <section className="panel-card route-card">
      <PageHeader
        title="Account"
        subtitle="This route handles sign-in, consent, and later data export or account deletion."
      />
      <div className="account-grid">
        <div className="account-card">
          <div className="empty-state-title">{authUser ? "Signed in" : "Sign in with email"}</div>
          <div className="empty-state-copy">
            {authUser
              ? `You are signed in as ${authUser.email || "your account"}. We can now sync practice sessions and shortlist data through Supabase.`
              : "Send yourself a magic link and we’ll use Supabase Auth to keep your sessions and shortlist in sync."}
          </div>
          {!authUser ? (
            <div className="auth-form">
              <input className="input auth-input" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" />
              <button className="primary-btn" onClick={onSignIn} disabled={authBusy || !authEmail.trim()}>
                {authBusy ? "Sending..." : "Send magic link"}
              </button>
            </div>
          ) : (
            <button className="ghost-btn" onClick={onSignOut}>Sign out</button>
          )}
          {authMessage && <div className="empty-state-meta" style={{ textTransform: "none", letterSpacing: 0 }}>{authMessage}</div>}
        </div>

        <div className="account-card">
          <div className="empty-state-title">Profile sync</div>
          <div className="empty-state-copy">
            {profile ? "A profile row exists in Supabase and is ready for session/shortlist sync." : "Your profile row will be created automatically after the first successful sign-in."}
          </div>
          <div className="empty-state-meta">{sessions.length} locally stored session{sessions.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
    </section>
  );
}

function ProtectedRoute({ component: Component, authUser, requiredRole = 'admin' }) {
  if (!authUser) return <Navigate to="/" replace />;
  // TODO: Add role checking when role system is implemented
  return <Component />;
}

function AdminPage() {
  return (
    <section className="panel-card route-card">
      <PageHeader
        title="Admin"
        subtitle="Question verification and content review will live here once the backend review queue is added."
      />
      <div className="empty-state">
        <div className="empty-state-title">Admin queue not wired yet</div>
        <div className="empty-state-copy">
          This route is reserved for verified-question review, scholarship moderation, and future content operations.
        </div>
      </div>
    </section>
  );
}

function PracticeRoutes({ sessions, onSessionComplete, exportAction, qb, passages }) {
  const weak = computeWeakSections(sessions);
  const location = useLocation();
  const pathname = location.pathname;

  let content = (
      <PracticeView
        sessions={sessions}
        onSessionComplete={onSessionComplete}
        QB={qb}
        PASSAGES={passages}
        computeWeakSections={computeWeakSections}
        selectQueue={selectQueue}
        EXAMS={EXAMS}
        EXAM_COLOR={EXAM_COLOR}
        DIFF_LABEL={DIFF_LABEL}
        DIFF_COLOR={DIFF_COLOR}
        PrimaryBtn={PrimaryBtn}
        GhostBtn={GhostBtn}
        Chip={Chip}
        C={C}
      />
  );

  if (pathname === "/practice/progress") {
    content = <ProgressView sessions={sessions} C={C} Chip={Chip} EXAM_COLOR={EXAM_COLOR} />;
  } else if (pathname === "/practice/weak-areas") {
    content = <WeakAreasView sessions={sessions} C={C} Chip={Chip} computeWeakSections={computeWeakSections} />;
  } else if (pathname === "/practice/learning-path") {
    content = <LearningPathView sessions={sessions} C={C} Chip={Chip} LEARNING_PATH={LEARNING_PATH} computeWeakSections={computeWeakSections} />;
  }

  return (
    <PracticeShell
      title="Practice"
      subtitle="Work through adaptive exam practice with answer feedback and passage context."
      weakCount={weak.length}
      exportAction={exportAction}
    >
      {content}
    </PracticeShell>
  );
}

function ScholarshipRoutes({ sessions, institutions, authUser, profile, exportAction }) {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader
        title="Scholarships"
        subtitle={pathname === "/scholarships/shortlist" ? "Your shortlist is tracked in the scholarship workspace for now." : "Match your profile to institutions and keep a shortlist of viable options."}
        action={<button onClick={exportAction} className="ghost-btn">Export</button>}
      />
      <section className="panel-card">
        <ScholarshipPage sessions={sessions} institutions={institutions} authUser={authUser} profile={profile} C={C} Chip={Chip} PrimaryBtn={PrimaryBtn} />
      </section>
    </>
  );
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [content, setContent] = useState({ questions: [], passages: {}, institutions: [] });
  const [loaded, setLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [otpAttempts, setOtpAttempts] = useState(() => {
    const stored = localStorage.getItem('otp_attempts');
    return stored ? JSON.parse(stored) : {};
  });

  useEffect(() => {
    Promise.all([
      loadSessions(),
      loadPublicContent().catch(() => ({ questions: [], passages: {}, institutions: [] })),
    ]).then(([storedSessions, publicContent]) => {
      setSessions(storedSessions);
      setContent(publicContent);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const user = data.session?.user || null;
      setAuthUser(user);
      if (user) {
        try {
          const profileRow = await ensureProfile(user);
          if (mounted) setProfile(profileRow);
          const remoteSessions = await loadPracticeSessions(user.id);
          if (mounted && remoteSessions.length) {
            setSessions((current) => mergeSessions(current, remoteSessions));
          }
        } catch (error) {
          console.error(error);
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null;
      setAuthUser(user);
      if (!user) {
        securityLogger.log('SECURITY', 'USER_SESSION_END', { previousUserId: authUser?.id });
        setProfile(null);
        return;
      }
      securityLogger.logAuthSuccess(user.id, user.email);
      try {
        const profileRow = await ensureProfile(user);
        if (mounted) setProfile(profileRow);
        const remoteSessions = await loadPracticeSessions(user.id);
        if (mounted && remoteSessions.length) {
          setSessions((current) => mergeSessions(current, remoteSessions));
        }
      } catch (error) {
        console.error(error);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const onSessionComplete = async (sess) => {
    const session = { ...sess, id: sess.id || crypto.randomUUID() };
    const updated = mergeSessions(sessions, [session]);
    setSessions(updated);
    await saveSessions(updated);
    if (authUser?.id && profile?.id) {
      try {
        await savePracticeSession(profile.id, session);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const resetData = async () => {
    if (!window.confirm("Reset all session data? This cannot be undone.")) return;
    setSessions([]);
    await saveSessions([]);
  };

  // Rate limiting functions for OTP
  function canSendOTP(email) {
    const now = Date.now();
    const attempts = otpAttempts[email] || [];
    const recent = attempts.filter(time => now - time < 3600000); // 1 hour
    return recent.length < 3; // Max 3 per hour
  }

  function recordOTPAttempt(email) {
    const now = Date.now();
    setOtpAttempts(prev => {
      const updated = {
        ...prev,
        [email]: [...(prev[email] || []).filter(time => now - time < 3600000), now]
      };
      localStorage.setItem('otp_attempts', JSON.stringify(updated));
      return updated;
    });
  }

  const signInWithEmail = async () => {
    if (!supabase || !authEmail.trim()) return;

    // Sanitize and validate email
    const sanitizedEmail = InputSanitizer.sanitizeEmail(authEmail.trim());
    if (!sanitizedEmail) {
      securityLogger.logSuspiciousActivity('INVALID_EMAIL_FORMAT', { input: authEmail });
      setAuthMessage("Please enter a valid email address.");
      return;
    }

    if (!canSendOTP(sanitizedEmail)) {
      securityLogger.logRateLimitExceeded(sanitizedEmail, 'otp_attempts');
      setAuthMessage("Too many attempts. Please wait before trying again.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      securityLogger.logAuthAttempt(sanitizedEmail, false, 'otp');
      const { error } = await supabase.auth.signInWithOtp({
        email: sanitizedEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setAuthMessage("Magic link sent. Check your email to finish sign-in.");
      recordOTPAttempt(sanitizedEmail);
      securityLogger.logAuthAttempt(sanitizedEmail, true, 'otp');
    } catch (error) {
      SecureErrorHandler.logError(error, { action: 'signInWithEmail', email: sanitizedEmail });
      securityLogger.logAuthFailure(sanitizedEmail, error.message);
      setAuthMessage(SecureErrorHandler.getSafeErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    securityLogger.log('SECURITY', 'USER_LOGOUT', { userId: authUser?.id });
    await supabase.auth.signOut();
    setAuthUser(null);
    setProfile(null);
    // Clear all localStorage data for security
    localStorage.removeItem('sessions');
    localStorage.removeItem('otp_attempts');
    localStorage.removeItem('scholarship_shortlist');
    localStorage.removeItem('scholarship_keywords');
    localStorage.removeItem('scholarship_cv');
    localStorage.removeItem('scholarship_consent');
  };

  if (!loaded || !authReady) {
    return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "var(--font-ui)", fontSize: 12 }}>Loading your data…</div>;
  }

  const exportAction = () => exportSessionsData(sessions);
  const QB = content.questions;
  const PASSAGES = content.passages;
  const institutions = content.institutions;

  return (
    <Shell sessions={sessions} onReset={resetData}>
      <Routes>
        <Route path="/" element={<LandingPage questionsCount={QB.length} examCount={Object.keys(SECTIONS_BY_EXAM).length} passageCount={Object.keys(PASSAGES).length} />} />
        <Route path="/practice/*" element={<PracticeRoutes sessions={sessions} onSessionComplete={onSessionComplete} exportAction={exportAction} qb={QB} passages={PASSAGES} />} />
        <Route path="/scholarships/*" element={<ScholarshipRoutes sessions={sessions} institutions={institutions} authUser={authUser} profile={profile} exportAction={exportAction} />} />
        <Route path="/account" element={<AccountPage sessions={sessions} authUser={authUser} profile={profile} authEmail={authEmail} setAuthEmail={setAuthEmail} authMessage={authMessage} authBusy={authBusy} onSignIn={signInWithEmail} onSignOut={signOut} />} />
        <Route path="/admin" element={<ProtectedRoute component={AdminPage} authUser={authUser} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

