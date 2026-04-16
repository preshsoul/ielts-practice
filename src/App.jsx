import React, { useState, useEffect } from "react";
import { QB as FILE_QB } from "./data/qb.js";
import PracticeView from './components/PracticeView.jsx';
import ProgressView from './components/ProgressView.jsx';
import WeakAreasView from './components/WeakAreasView.jsx';
import LearningPathView from './components/LearningPathViewClean.jsx';
import ScholarshipPage from './components/ScholarshipPage.jsx';
import './styles.css';

/* ═══════════════════════════════════════════════════════
   PASSAGE POOL — referenced by ID, not duplicated
═══════════════════════════════════════════════════════ */
const PASSAGES = {
  P1: `Urban farming — the practice of cultivating food within city boundaries — has expanded rapidly over the past two decades. Proponents argue that it reduces food miles, improves community cohesion, and provides fresh produce to urban residents who might otherwise rely on processed food. However, critics note that urban farmland is inherently limited, yields per square metre are typically lower than in conventional agriculture, and the cost of establishing rooftop or vertical farms is often prohibitive for low-income communities. A 2021 study by the University of Sheffield found that even if all suitable urban surfaces in the UK were converted to food production, total caloric output would cover only about two percent of national demand.`,
  P2: `The migration of monarch butterflies represents one of nature's most remarkable navigational feats. Each autumn, millions of monarchs travel up to 4,500 kilometres from Canada and the United States to overwintering sites in the mountains of central Mexico. Scientists believe they use a combination of the sun's position and an internal circadian clock to maintain direction. The butterflies that make the southward journey are not the same individuals that travelled north in spring — they are the great-grandchildren of those earlier migrants. Despite this generational gap, they navigate to the same forests their ancestors used, a phenomenon researchers have yet to fully explain. Habitat loss at both ends of the migration route has caused monarch populations to decline by more than 80 percent since the 1990s.`,
  P3: `The development of antibiotics in the twentieth century is widely regarded as one of medicine's greatest achievements. Alexander Fleming's observation of penicillin's antibacterial properties in 1928 set in motion a chain of discoveries that would save hundreds of millions of lives. However, the widespread and often indiscriminate use of antibiotics in both human medicine and livestock farming has accelerated the emergence of antimicrobial resistance (AMR). The World Health Organization now considers AMR one of the greatest threats to global health. Some strains of tuberculosis, gonorrhoea, and pneumonia have become virtually untreatable. Experts warn that without coordinated global action to restrict antibiotic use and fund new drug development, routine surgeries and chemotherapy could become life-threatening by 2050.`,
  P4: `Sleep research has undergone a significant transformation in the past three decades. Earlier scientific consensus held that sleep was a passive state of reduced brain activity. Neuroimaging studies have since demonstrated that the sleeping brain is remarkably active, cycling through distinct stages that each serve different restorative functions. Rapid eye movement (REM) sleep, during which most vivid dreaming occurs, appears critical for emotional regulation and memory consolidation. Slow-wave sleep, the deepest stage, is associated with physical repair and immune function. Chronic sleep deprivation — defined as consistently sleeping fewer than seven hours per night — has been linked to increased risk of cardiovascular disease, type 2 diabetes, obesity, and impaired cognitive performance. Despite this evidence, surveys suggest that more than a third of adults in developed countries regularly fail to achieve adequate sleep.`,
  P5: `The concept of gross domestic product (GDP) as a measure of national wellbeing has come under increasing scrutiny from economists and policymakers. GDP measures the total monetary value of goods and services produced within a country in a given period, but it does not account for income inequality, environmental degradation, unpaid domestic labour, or subjective wellbeing. A country can register GDP growth while simultaneously experiencing rising poverty and worsening air quality. New Zealand adopted a Wellbeing Budget in 2019, allocating spending according to indicators including mental health, child poverty, and indigenous culture — a model attracting international interest. Critics of this approach argue that wellbeing metrics are inherently subjective and difficult to measure consistently, making them unsuitable as primary guides for fiscal policy.`,
  P6: `Plastic pollution has become one of the defining environmental challenges of the early twenty-first century. Approximately 380 million tonnes of plastic are produced globally each year, and it is estimated that only nine percent of all plastic ever manufactured has been recycled. The remainder has been incinerated, sent to landfill, or released into the environment. Marine ecosystems have been particularly affected: the Great Pacific Garbage Patch, a concentration of plastic debris in the North Pacific Ocean, covers an area roughly three times the size of France. Microplastics — particles smaller than five millimetres — have been detected in the deepest ocean trenches, in Arctic ice, and in human blood. While bans on single-use plastics have been introduced in dozens of countries, researchers argue that regulatory measures alone are insufficient without fundamental changes to production and consumption patterns.`,
  P7: `Remote work, once the preserve of a small minority of knowledge workers, became mainstream almost overnight during the COVID-19 pandemic. Studies conducted during this period produced mixed findings. Some showed that workers reported higher productivity and better work-life balance; others found increased rates of loneliness, difficulty separating work from home life, and reduced opportunities for mentorship and career progression, particularly among younger employees. Employers reported benefits including reduced office costs and access to a wider talent pool, but also challenges in maintaining organisational culture and monitoring performance. Post-pandemic, many organisations have adopted hybrid models, though the optimal balance between remote and in-person work remains contested. Some economists argue that fully remote work may reduce innovation, which has historically been driven by informal, spontaneous interactions in shared physical spaces.`,
  P8: `The history of the English language is one of continuous absorption and transformation. Old English, spoken in Britain from roughly the fifth to the eleventh centuries, bore little resemblance to modern English and was itself the product of Anglo-Saxon dialects mixed with earlier Celtic influences. The Norman Conquest of 1066 introduced a vast French vocabulary — particularly in domains of law, cuisine, and aristocratic life — creating a linguistic stratification in which French-derived words often carried higher social status than their Old English equivalents. The subsequent centuries saw further influences from Latin, Greek, and later the languages of colonised peoples across Asia, Africa, and the Americas. Today, English has more words than virtually any other language, with the Oxford English Dictionary tracking over 600,000 entries.`,
};

/* ═══════════════════════════════════════════════════════
   QUESTION BANK — 250+ questions, difficulty-tagged
   difficulty: 1=Easy 2=Medium 3=Hard
═══════════════════════════════════════════════════════ */
// QB lives in src/data/qb.js; keep the app on a single data source.
const QB = FILE_QB;

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
const ALL_SECTIONS = [...new Set(QB.map(q => q.section))];

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
      return r ? JSON.parse(r.value) : [];
    } else if (typeof localStorage !== 'undefined') {
      const s = localStorage.getItem('precious_sessions');
      return s ? JSON.parse(s) : [];
    }
    return [];
  } catch { return []; }
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

/* ═══════════════════════════════════════════════════════
   SMALL UI ATOMS (unchanged)
═══════════════════════════════════════════════════════ */
function Chip({ label, color, small }) {
  return <span className={`chip${small ? ' chip-small' : ''}`} style={{ ['--chip-color']: color }}>{label}</span>;
}
function TabBtn({ label, active, onClick, badge }) {
  return <button onClick={onClick} className={`tab-btn${active ? ' active' : ''}`}>
    {label}
    {badge > 0 && <span className="tab-badge">{badge}</span>}
  </button>;
}
function PrimaryBtn({ children, onClick, disabled }) {
  return <button onClick={!disabled ? onClick : undefined} disabled={disabled} className={`primary-btn${disabled ? ' disabled' : ''}`}>{children}</button>;
}
function GhostBtn({ children, onClick }) {
  return <button onClick={onClick} className="ghost-btn">{children}</button>;
}

/* ═══════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════ */
export default function App() {
  const [tab, setTab] = useState("practice");
  const [sessions, setSessions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { loadSessions().then(s => { setSessions(s); setLoaded(true); }); }, []);

  const onSessionComplete = async (sess) => {
    const updated = [...sessions, sess];
    setSessions(updated);
    await saveSessions(updated);
  };

  const resetData = async () => {
    if (!window.confirm("Reset all session data? This cannot be undone.")) return;
    setSessions([]); await saveSessions([]);
  };

  const weak = computeWeakSections(sessions);

  if (!loaded) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "var(--font-ui)", fontSize: 12 }}>Loading your data…</div>;

  const tabs = [
    { id: "practice", label: "Practice" },
    { id: "progress", label: "Progress" },
    { id: "weak", label: "Weak Areas", badge: weak.length },
    { id: "learning", label: "Learning Path" },
    { id: "scholarships", label: "Scholarships" }
  ];

  return (
    <div className="app-container app-shell" style={{ color: C.text, fontFamily: "var(--font-reading)" }}>
      <header className="app-sidebar">
        <div className="app-brand">
          <div className="app-brand-kicker">IELTS · Practice & Scholarship Tools</div>
          <div className="app-brand-title">Precious Ajayi</div>
          <div className="app-brand-subtitle">A calm study workspace for exam prep and scholarship planning.</div>
        </div>
        <nav className="app-nav" aria-label="Primary">
          {tabs.map(t => <TabBtn key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} badge={t.badge} />)}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ font: "500 12px/1.4 var(--font-ui)", color: C.muted }}>
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </div>
          <button onClick={resetData} className="ghost-btn" style={{ padding: "8px 12px" }}>Reset</button>
        </div>
      </header>

      <main className="app-main">
        <div className="topbar">
          <div>
            <div style={{ font: "600 11px/1.4 var(--font-ui)", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase" }}>Workspace</div>
            <div className="page-title" style={{ marginBottom: 8 }}>
              {tab === "practice" && "Practice"}
              {tab === "progress" && "Progress"}
              {tab === "weak" && "Weak Areas"}
              {tab === "learning" && "Learning Path"}
              {tab === "scholarships" && "Scholarships"}
            </div>
            <div className="page-subtitle">
              {tab === "practice" && "Work through adaptive exam practice with answer feedback and passage context."}
              {tab === "progress" && "Review recent sessions, section accuracy, and score trends over time."}
              {tab === "weak" && "See which sections need attention and which ones should be weighted next."}
              {tab === "learning" && "Open the study notes that explain the logic behind each section and question type."}
              {tab === "scholarships" && "Match your profile to institutions and keep a shortlist of viable options."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {sessions.length > 0 && <span style={{ font: "500 12px/1.4 var(--font-ui)", color: C.muted }}>{sessions.length} recorded</span>}
            <button onClick={() => { exportData(); }} className="ghost-btn" style={{ padding: "8px 12px" }}>Export</button>
          </div>
        </div>

        <section className="panel-card">
          {tab === "practice" && <PracticeView sessions={sessions} onSessionComplete={onSessionComplete} QB={QB} PASSAGES={PASSAGES} computeWeakSections={computeWeakSections} selectQueue={selectQueue} EXAMS={EXAMS} EXAM_COLOR={EXAM_COLOR} DIFF_LABEL={DIFF_LABEL} DIFF_COLOR={DIFF_COLOR} PrimaryBtn={PrimaryBtn} GhostBtn={GhostBtn} Chip={Chip} C={C} />}
          {tab === "progress" && <ProgressView sessions={sessions} C={C} Chip={Chip} EXAM_COLOR={EXAM_COLOR} />}
          {tab === "weak" && <WeakAreasView sessions={sessions} C={C} Chip={Chip} computeWeakSections={computeWeakSections} />}
          {tab === "learning" && <LearningPathView sessions={sessions} C={C} Chip={Chip} LEARNING_PATH={LEARNING_PATH} computeWeakSections={computeWeakSections} />}
          {tab === "scholarships" && <ScholarshipPage sessions={sessions} C={C} Chip={Chip} PrimaryBtn={PrimaryBtn} />}
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? "mobile-nav-btn active" : "mobile-nav-btn"}>{t.label}</button>)}
      </nav>
    </div>
  );
}



