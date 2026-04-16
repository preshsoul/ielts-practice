import { useState, useEffect, useCallback, useRef } from "react";

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
const QB = [
  /* ── IELTS · Reading T/F/NG · Passage P1 (Urban Farming) ── */
  {id:"q1",exam:"IELTS",section:"Reading – T/F/NG",pid:"P1",difficulty:1,
   question:"Urban farming has grown significantly over the last twenty years.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'Expanded rapidly over the past two decades' directly confirms this. TRUE."},
  {id:"q2",exam:"IELTS",section:"Reading – T/F/NG",pid:"P1",difficulty:2,
   question:"Urban farming consistently produces more food per square metre than conventional agriculture.",
   options:["True","False","Not Given"],answer:"False",
   explanation:"The passage states yields per square metre are 'typically lower than in conventional agriculture.' FALSE."},
  {id:"q3",exam:"IELTS",section:"Reading – T/F/NG",pid:"P1",difficulty:2,
   question:"Low-income communities face financial barriers when trying to establish urban farms.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'The cost of establishing rooftop or vertical farms is often prohibitive for low-income communities.' TRUE."},
  {id:"q4",exam:"IELTS",section:"Reading – T/F/NG",pid:"P1",difficulty:3,
   question:"The University of Sheffield study was the first to examine urban farming's caloric potential.",
   options:["True","False","Not Given"],answer:"Not Given",
   explanation:"The passage cites the study's findings but says nothing about whether it was the first of its kind. NOT GIVEN."},
  {id:"q5",exam:"IELTS",section:"Reading – T/F/NG",pid:"P1",difficulty:3,
   question:"Converting all suitable urban surfaces to food production would meet roughly two percent of UK caloric needs.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'Total caloric output would cover only about two percent of national demand.' TRUE."},
  {id:"q6",exam:"IELTS",section:"Reading – T/F/NG",pid:"P1",difficulty:2,
   question:"Governments have introduced financial incentives to support urban farming initiatives.",
   options:["True","False","Not Given"],answer:"Not Given",
   explanation:"Government incentives are not mentioned anywhere in the passage. NOT GIVEN."},

  /* ── IELTS · Reading T/F/NG · Passage P2 (Monarch Butterflies) ── */
  {id:"q7",exam:"IELTS",section:"Reading – T/F/NG",pid:"P2",difficulty:1,
   question:"Monarch butterflies can travel up to 4,500 kilometres during migration.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"The passage states explicitly 'travel up to 4,500 kilometres.' TRUE."},
  {id:"q8",exam:"IELTS",section:"Reading – T/F/NG",pid:"P2",difficulty:2,
   question:"The butterflies that migrate south in autumn are the same individuals that flew north in spring.",
   options:["True","False","Not Given"],answer:"False",
   explanation:"'The butterflies that make the southward journey are not the same individuals' — they are great-grandchildren. FALSE."},
  {id:"q9",exam:"IELTS",section:"Reading – T/F/NG",pid:"P2",difficulty:3,
   question:"Scientists have fully explained how monarchs navigate to ancestral forests.",
   options:["True","False","Not Given"],answer:"False",
   explanation:"'A phenomenon researchers have yet to fully explain' — the opposite is stated. FALSE."},
  {id:"q10",exam:"IELTS",section:"Reading – T/F/NG",pid:"P2",difficulty:2,
   question:"Monarch populations have declined by more than 80 percent since the 1990s.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"Directly stated in the final sentence of the passage. TRUE."},
  {id:"q11",exam:"IELTS",section:"Reading – T/F/NG",pid:"P2",difficulty:3,
   question:"Conservation programmes have begun to reverse the decline in monarch populations.",
   options:["True","False","Not Given"],answer:"Not Given",
   explanation:"The passage mentions decline but says nothing about conservation programmes or reversal. NOT GIVEN."},
  {id:"q12",exam:"IELTS",section:"Reading – T/F/NG",pid:"P2",difficulty:2,
   question:"Monarchs use both the sun and an internal clock to navigate.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'A combination of the sun's position and an internal circadian clock.' TRUE."},

  /* ── IELTS · Reading T/F/NG · Passage P3 (Antibiotics) ── */
  {id:"q13",exam:"IELTS",section:"Reading – T/F/NG",pid:"P3",difficulty:1,
   question:"Fleming discovered penicillin's antibacterial properties in 1928.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"Directly stated: 'Alexander Fleming's observation of penicillin's antibacterial properties in 1928.' TRUE."},
  {id:"q14",exam:"IELTS",section:"Reading – T/F/NG",pid:"P3",difficulty:2,
   question:"Antimicrobial resistance has been caused solely by overuse in human medicine.",
   options:["True","False","Not Given"],answer:"False",
   explanation:"The passage attributes AMR to both human medicine AND livestock farming — not solely human medicine. FALSE."},
  {id:"q15",exam:"IELTS",section:"Reading – T/F/NG",pid:"P3",difficulty:3,
   question:"The WHO ranks AMR as a greater threat than climate change.",
   options:["True","False","Not Given"],answer:"Not Given",
   explanation:"The WHO calls AMR 'one of the greatest threats' but no comparison with climate change is made. NOT GIVEN."},
  {id:"q16",exam:"IELTS",section:"Reading – T/F/NG",pid:"P3",difficulty:2,
   question:"Some diseases have developed strains that are nearly impossible to treat.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'Some strains...have become virtually untreatable.' TRUE."},
  {id:"q17",exam:"IELTS",section:"Reading – T/F/NG",pid:"P3",difficulty:3,
   question:"Without global action, routine surgeries could become life-threatening by 2050.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"Directly stated in the final sentence of the passage. TRUE."},

  /* ── IELTS · Reading T/F/NG · Passage P4 (Sleep) ── */
  {id:"q18",exam:"IELTS",section:"Reading – T/F/NG",pid:"P4",difficulty:1,
   question:"Earlier scientific thinking viewed sleep as a state of reduced brain activity.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'Earlier scientific consensus held that sleep was a passive state of reduced brain activity.' TRUE."},
  {id:"q19",exam:"IELTS",section:"Reading – T/F/NG",pid:"P4",difficulty:2,
   question:"REM sleep is linked to memory consolidation and emotional regulation.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'REM sleep...appears critical for emotional regulation and memory consolidation.' TRUE."},
  {id:"q20",exam:"IELTS",section:"Reading – T/F/NG",pid:"P4",difficulty:2,
   question:"Slow-wave sleep is the lightest stage of the sleep cycle.",
   options:["True","False","Not Given"],answer:"False",
   explanation:"The passage calls slow-wave sleep 'the deepest stage' — the opposite of lightest. FALSE."},
  {id:"q21",exam:"IELTS",section:"Reading – T/F/NG",pid:"P4",difficulty:3,
   question:"Governments in developed countries have introduced policies to improve adult sleep habits.",
   options:["True","False","Not Given"],answer:"Not Given",
   explanation:"Government policy is never mentioned. NOT GIVEN."},
  {id:"q22",exam:"IELTS",section:"Reading – T/F/NG",pid:"P4",difficulty:2,
   question:"Sleeping fewer than seven hours regularly is associated with cardiovascular disease risk.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"'Increased risk of cardiovascular disease' is explicitly listed among consequences of chronic deprivation. TRUE."},

  /* ── IELTS · Reading T/F/NG · Passage P5 (GDP) ── */
  {id:"q23",exam:"IELTS",section:"Reading – T/F/NG",pid:"P5",difficulty:1,
   question:"GDP measures the total monetary value of goods and services produced in a country.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"This is the definition given in the passage. TRUE."},
  {id:"q24",exam:"IELTS",section:"Reading – T/F/NG",pid:"P5",difficulty:2,
   question:"GDP accounts for unpaid domestic labour when calculating national output.",
   options:["True","False","Not Given"],answer:"False",
   explanation:"The passage explicitly lists unpaid domestic labour as something GDP does NOT account for. FALSE."},
  {id:"q25",exam:"IELTS",section:"Reading – T/F/NG",pid:"P5",difficulty:2,
   question:"New Zealand adopted a Wellbeing Budget in 2019.",
   options:["True","False","Not Given"],answer:"True",
   explanation:"Directly stated in the passage. TRUE."},
  {id:"q26",exam:"IELTS",section:"Reading – T/F/NG",pid:"P5",difficulty:3,
   question:"Most economists support wellbeing metrics as a primary guide for fiscal policy.",
   options:["True","False","Not Given"],answer:"Not Given",
   explanation:"Critics are mentioned, but the passage gives no information about what most economists believe overall. NOT GIVEN."},
  {id:"q27",exam:"IELTS",section:"Reading – T/F/NG",pid:"P5",difficulty:3,
   question:"A country experiencing GDP growth cannot simultaneously have rising poverty.",
   options:["True","False","Not Given"],answer:"False",
   explanation:"The passage states explicitly: 'A country can register GDP growth while simultaneously experiencing rising poverty.' FALSE."},

  /* ── IELTS · Reading MC · Passage P6 (Plastic) ── */
  {id:"q28",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P6",difficulty:1,
   question:"What percentage of all plastic ever manufactured has been recycled?",
   options:["About 25 percent","Only nine percent","Less than one percent","Around 40 percent"],
   answer:"Only nine percent",
   explanation:"'Only nine percent of all plastic ever manufactured has been recycled.' Direct retrieval. B."},
  {id:"q29",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P6",difficulty:2,
   question:"What comparison does the passage use to convey the size of the Great Pacific Garbage Patch?",
   options:["Three times the size of France","Larger than the entire Pacific Ocean","The size of the United Kingdom","Twice the size of Australia"],
   answer:"Three times the size of France",
   explanation:"'Covers an area roughly three times the size of France.' Direct retrieval. A."},
  {id:"q30",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P6",difficulty:2,
   question:"Where have microplastics been detected, according to the passage?",
   options:["Only in surface ocean waters","In ocean trenches, Arctic ice, and human blood","Exclusively in freshwater rivers","In the atmosphere above major cities"],
   answer:"In ocean trenches, Arctic ice, and human blood",
   explanation:"All three locations are explicitly listed in the passage. B."},
  {id:"q31",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P6",difficulty:3,
   question:"What is the passage's main argument about single-use plastic bans?",
   options:["They are the most effective solution available","They are unnecessary given market forces","They are insufficient without fundamental production and consumption changes","They have successfully reduced ocean plastic by 50 percent"],
   answer:"They are insufficient without fundamental production and consumption changes",
   explanation:"'Regulatory measures alone are insufficient without fundamental changes to production and consumption patterns.' C."},

  /* ── IELTS · Reading MC · Passage P7 (Remote Work) ── */
  {id:"q32",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P7",difficulty:1,
   question:"According to the passage, which group was particularly affected by reduced mentorship opportunities during remote work?",
   options:["Senior executives","Younger employees","Part-time workers","IT professionals"],
   answer:"Younger employees",
   explanation:"'Reduced opportunities for mentorship and career progression, particularly among younger employees.' B."},
  {id:"q33",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P7",difficulty:2,
   question:"What benefit for employers does the passage specifically mention?",
   options:["Higher employee productivity","Access to a wider talent pool","Elimination of management costs","Improved team communication"],
   answer:"Access to a wider talent pool",
   explanation:"'Access to a wider talent pool' is explicitly listed as an employer benefit. B."},
  {id:"q34",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P7",difficulty:3,
   question:"Some economists argue that fully remote work may reduce innovation because:",
   options:["Remote workers lack adequate technology","Informal spontaneous interactions in shared spaces drive innovation","Remote teams produce lower-quality work","Home environments are too distracting for creative thinking"],
   answer:"Informal spontaneous interactions in shared spaces drive innovation",
   explanation:"'Innovation, which has historically been driven by informal, spontaneous interactions in shared physical spaces.' B."},

  /* ── IELTS · Reading MC · Passage P8 (English Language) ── */
  {id:"q35",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P8",difficulty:2,
   question:"Which event introduced significant French vocabulary into English?",
   options:["The Roman conquest of Britain","The Norman Conquest of 1066","The Renaissance","The Age of Exploration"],
   answer:"The Norman Conquest of 1066",
   explanation:"'The Norman Conquest of 1066 introduced a vast French vocabulary.' B."},
  {id:"q36",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P8",difficulty:2,
   question:"What linguistic effect did French vocabulary have on English social structure?",
   options:["It simplified the English class system","French-derived words carried higher social status than Old English equivalents","It replaced Old English completely","It created a new dialect spoken only in cities"],
   answer:"French-derived words carried higher social status than Old English equivalents",
   explanation:"'French-derived words often carried higher social status than their Old English equivalents.' B."},
  {id:"q37",exam:"IELTS",section:"Reading – Multiple Choice",pid:"P8",difficulty:3,
   question:"Approximately how many entries does the Oxford English Dictionary track?",
   options:["100,000","300,000","600,000","Over one million"],
   answer:"600,000",
   explanation:"'Over 600,000 entries' is stated directly. C."},

  /* ── IELTS · Grammar ── */
  {id:"q38",exam:"IELTS",section:"Grammar",difficulty:1,
   question:"Choose the correct sentence:",
   options:["The data shows a clear upward trend.","The data show a clear upward trend.","The datas shows a clear upward trend.","The data are showing a clear upward trend always."],
   answer:"The data shows a clear upward trend.",
   explanation:"'Data' can take singular or plural agreement in modern academic English. Both A and B are technically acceptable, but 'data shows' is the more common academic convention tested in IELTS. A is the safest answer."},
  {id:"q39",exam:"IELTS",section:"Grammar",difficulty:1,
   question:"Which sentence uses subject-verb agreement correctly?",
   options:["The government have decided to raise taxes.","The committee are divided on the issue.","Neither the teacher nor the students was present.","The number of applicants has increased this year."],
   answer:"The number of applicants has increased this year.",
   explanation:"'The number of' takes a singular verb. 'Neither...nor' agrees with the nearest noun (students = plural → were). D is the only fully correct option."},
  {id:"q40",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"Select the correct conditional: 'If she ___ harder, she would have passed the exam.'",
   options:["studied","had studied","would study","studies"],
   answer:"had studied",
   explanation:"Third conditional (unreal past): 'If + past perfect, would have + past participle.' 'Had studied' is correct. B."},
  {id:"q41",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"Choose the grammatically correct sentence:",
   options:["She gave me many informations about the course.","She provided me with a lot of information about the course.","She told me many informations regarding the course.","She gave many information to me about the course."],
   answer:"She provided me with a lot of information about the course.",
   explanation:"'Information' is an uncountable noun — never plural, never 'many informations.' 'A lot of information' is correct. B."},
  {id:"q42",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"'Decide' is always followed by which verb form?",
   options:["verb + -ing","to + infinitive","bare infinitive","past participle"],
   answer:"to + infinitive",
   explanation:"'Decide' belongs to the group of verbs followed by the infinitive: decide to do, want to do, hope to do. B."},
  {id:"q43",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"Which sentence correctly uses a discourse marker?",
   options:["However the results were inconclusive.","The results were, however, inconclusive.","However, the results were inconclusive.","The results however were inconclusive."],
   answer:"However, the results were inconclusive.",
   explanation:"When a discourse marker opens a sentence, a comma must follow it immediately. 'However, + clause' is the standard form. C."},
  {id:"q44",exam:"IELTS",section:"Grammar",difficulty:3,
   question:"Which sentence correctly uses reported speech?",
   options:["She said she will submit the report tomorrow.","She said she would submit the report the next day.","She told she would submit the report the next day.","She said she submitted the report tomorrow."],
   answer:"She said she would submit the report the next day.",
   explanation:"'Will' becomes 'would'; 'tomorrow' becomes 'the next day'; 'said' needs no object (unlike 'told'). B."},
  {id:"q45",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"Choose the correct passive construction: 'The findings ___ by independent scientists next month.'",
   options:["will verify","will be verified","are verifying","will have verify"],
   answer:"will be verified",
   explanation:"Future passive: 'will be + past participle.' B."},
  {id:"q46",exam:"IELTS",section:"Grammar",difficulty:3,
   question:"Which sentence contains a comma splice error?",
   options:["She studied hard, so she passed.","The rain stopped, the match resumed.","Although he was tired, he continued working.","The experiment failed; the team revised their approach."],
   answer:"The rain stopped, the match resumed.",
   explanation:"Two independent clauses joined by only a comma = comma splice. Should be separated by a full stop, semicolon, or conjunction. B."},
  {id:"q47",exam:"IELTS",section:"Grammar",difficulty:3,
   question:"'The more you practice, ___ your score will become.' Complete correctly.",
   options:["the high","higher","the higher","most high"],
   answer:"the higher",
   explanation:"Double comparative structure: 'The more X, the [comparative] Y.' = 'the higher.' C."},
  {id:"q48",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"Which is correct? 'She was met with ___ approval from the committee.'",
   options:["an unanimous","a unanimous","unanimous","the unanimous"],
   answer:"unanimous",
   explanation:"'Approval' is uncountable here — no article needed before 'unanimous approval.' C."},
  {id:"q49",exam:"IELTS",section:"Grammar",difficulty:3,
   question:"Identify the sentence fragment:",
   options:["Although he studied hard, he failed.","She passed the exam.","Because the results were inconclusive.","The team worked through the night."],
   answer:"Because the results were inconclusive.",
   explanation:"A subordinating clause without a main clause = fragment. It begins with 'because' but has no independent clause to complete it. C."},
  {id:"q50",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"Which modal verb usage is correct?",
   options:["You must to finish the task today.","You must finish the task today.","You must finishing the task today.","You must finished the task today."],
   answer:"You must finish the task today.",
   explanation:"Modal verbs (must, can, should, will) are always followed by the bare infinitive — never 'to + verb' or '-ing.' B."},
  {id:"q51",exam:"IELTS",section:"Grammar",difficulty:1,
   question:"Which sentence uses the correct article?",
   options:["She is best student in the class.","She is the best student in the class.","She is a best student in class.","She is an best student in the class."],
   answer:"She is the best student in the class.",
   explanation:"Superlatives require 'the.' 'An' is used before vowel sounds but 'best' starts with /b/. B."},
  {id:"q52",exam:"IELTS",section:"Grammar",difficulty:3,
   question:"Which sentence correctly uses the passive with a reporting verb?",
   options:["He is said to write the novel last year.","He is said to have written the novel last year.","He said to have written the novel last year.","He was said to writes the novel last year."],
   answer:"He is said to have written the novel last year.",
   explanation:"Passive reporting: 'is said to have + past participle' — the perfect infinitive shows the action occurred before now. B."},
  {id:"q53",exam:"IELTS",section:"Grammar",difficulty:2,
   question:"Select the sentence with correct preposition use:",
   options:["She is married with a doctor.","She is married to a doctor.","She is married by a doctor.","She is married for a doctor."],
   answer:"She is married to a doctor.",
   explanation:"'Married to' is the fixed collocation. The other prepositions do not apply here. B."},

  /* ── IELTS · Academic Vocabulary ── */
  {id:"q54",exam:"IELTS",section:"Academic Vocabulary",difficulty:1,
   question:"'The report ___ a strong link between diet and cognitive decline.' Best word:",
   options:["establishes","makes","creates","builds"],
   answer:"establishes",
   explanation:"'Establish a link/connection' is the standard academic collocation for proving or demonstrating a relationship. A."},
  {id:"q55",exam:"IELTS",section:"Academic Vocabulary",difficulty:1,
   question:"Which word is closest in meaning to 'indigenous'?",
   options:["foreign","native","ancient","widespread"],
   answer:"native",
   explanation:"'Indigenous' = originating naturally in a particular place. Closest synonym: 'native.' B."},
  {id:"q56",exam:"IELTS",section:"Academic Vocabulary",difficulty:2,
   question:"Which word best replaces 'although' in the sentence: '___ the findings were promising, the sample size was too small.'",
   options:["Despite","However","Albeit","While"],
   answer:"While",
   explanation:"'While' functions as a subordinating conjunction introducing a concessive clause — it can replace 'although' here. 'Despite' would need a noun phrase. D."},
  {id:"q57",exam:"IELTS",section:"Academic Vocabulary",difficulty:2,
   question:"'The new policy will ___ a significant shift in how data is collected.' Best word:",
   options:["bring about","bring in","bring up","bring off"],
   answer:"bring about",
   explanation:"'Bring about' = cause or produce a change. 'Bring in' = introduce legislation. 'Bring up' = raise a topic. A."},
  {id:"q58",exam:"IELTS",section:"Academic Vocabulary",difficulty:1,
   question:"Which word is a precise synonym for 'exacerbate'?",
   options:["worsen","improve","stabilise","cause"],
   answer:"worsen",
   explanation:"'Exacerbate' = to make something worse or more severe. Direct synonym: 'worsen.' A."},
  {id:"q59",exam:"IELTS",section:"Academic Vocabulary",difficulty:2,
   question:"'The findings were widely ___ across the scientific community.' Best word:",
   options:["disseminated","scattered","broadcast","sprinkled"],
   answer:"disseminated",
   explanation:"'Disseminate findings/results' is the formal academic collocation for spreading research widely. A."},
  {id:"q60",exam:"IELTS",section:"Academic Vocabulary",difficulty:2,
   question:"'The evidence ___ the need for urgent policy reform.' Most precise academic verb:",
   options:["underscores","talks about","mentions","says"],
   answer:"underscores",
   explanation:"'Underscore' = to emphasise or highlight the importance of. Academic and precise. 'Talks about' and 'says' are informal. A."},
  {id:"q61",exam:"IELTS",section:"Academic Vocabulary",difficulty:3,
   question:"Which option correctly completes the sentence? 'The economic downturn had a ___ impact on employment.'",
   options:["devastating","devastated","devastation","devastate"],
   answer:"devastating",
   explanation:"An adjective is needed to modify the noun 'impact.' 'Devastating' (adjective) is correct. A."},
  {id:"q62",exam:"IELTS",section:"Academic Vocabulary",difficulty:2,
   question:"What does 'albeit' mean in academic writing?",
   options:["therefore","although/even though","moreover","consequently"],
   answer:"although/even though",
   explanation:"'Albeit' is a formal concessive conjunction: 'interesting, albeit flawed' = 'interesting, although flawed.' B."},
  {id:"q63",exam:"IELTS",section:"Academic Vocabulary",difficulty:3,
   question:"'She ___ her findings to the broader research community.' Most precise verb:",
   options:["disseminated","scattered","threw out","passed around"],
   answer:"disseminated",
   explanation:"'Disseminate' is the precise academic verb for spreading research or information formally and widely. A."},
  {id:"q64",exam:"IELTS",section:"Academic Vocabulary",difficulty:1,
   question:"Which sentence uses academic register correctly?",
   options:["There are loads of reasons why this is true.","A significant number of factors contribute to this outcome.","This is a really big problem.","Lots of people think this is wrong."],
   answer:"A significant number of factors contribute to this outcome.",
   explanation:"'A significant number of,' 'contribute to,' and 'outcome' are all formal academic phrases. 'Loads of,' 'really big,' and 'lots of' are informal. B."},
  {id:"q65",exam:"IELTS",section:"Academic Vocabulary",difficulty:2,
   question:"'The study ___ a correlation between screen time and anxiety.' Best word:",
   options:["revealed","told","said","spoke of"],
   answer:"revealed",
   explanation:"'Reveal' is the academic collocation for studies presenting findings. 'Told/said' are informal and imprecise. A."},
  {id:"q66",exam:"IELTS",section:"Academic Vocabulary",difficulty:3,
   question:"Which word collocates correctly? 'The committee ___ a unanimous decision.'",
   options:["made","reached","took","got"],
   answer:"reached",
   explanation:"'Reach a decision/agreement/conclusion' is the standard academic collocation. 'Made a decision' is also acceptable but 'reached' is preferred in formal contexts. B."},

  /* ── IELTS · Writing Task 1 ── */
  {id:"q67",exam:"IELTS",section:"Writing Task 1",difficulty:1,
   question:"What must an Academic Task 1 overview paragraph contain?",
   options:["Your personal opinion on the data","Two or three key overall trends without specific figures","Every data point in full detail","A prediction about the future"],
   answer:"Two or three key overall trends without specific figures",
   explanation:"The overview captures the big picture — main patterns and trends. Specific figures belong in body paragraphs. No opinions or predictions are appropriate. B."},
  {id:"q68",exam:"IELTS",section:"Writing Task 1",difficulty:1,
   question:"A bar chart shows historical data from 2000 to 2020. Which tense is most appropriate for body paragraphs?",
   options:["Present simple","Future simple","Past simple","Present perfect"],
   answer:"Past simple",
   explanation:"Completed historical data = past simple. 'Sales rose sharply between 2005 and 2010.' C."},
  {id:"q69",exam:"IELTS",section:"Writing Task 1",difficulty:2,
   question:"What is the recommended structural order for an Academic Task 1 response?",
   options:["Introduction → Opinion → Body → Conclusion","Introduction → Overview → Body 1 → Body 2","Overview → Introduction → Data → Summary","Introduction only — Task 1 is too short for structure"],
   answer:"Introduction → Overview → Body 1 → Body 2",
   explanation:"Paraphrase the question → overview (key trends) → detailed body paragraphs. No personal conclusion. B."},
  {id:"q70",exam:"IELTS",section:"Writing Task 1",difficulty:2,
   question:"Which phrase most accurately describes a gradual decrease?",
   options:["plummeted","witnessed a slight decline","collapsed dramatically","surged downward"],
   answer:"witnessed a slight decline",
   explanation:"'Plummeted' and 'collapsed' imply sudden, dramatic falls. 'Surged downward' is contradictory. 'Witnessed a slight decline' fits a gradual decrease. B."},
  {id:"q71",exam:"IELTS",section:"Writing Task 1",difficulty:2,
   question:"When describing a process diagram, which grammatical feature is most essential?",
   options:["Comparative adjectives","Passive voice constructions","Future predictions","Causal connectors only"],
   answer:"Passive voice constructions",
   explanation:"Processes describe what happens TO materials: 'The mixture is heated... the liquid is then filtered.' Passive is central to process description. B."},
  {id:"q72",exam:"IELTS",section:"Writing Task 1",difficulty:3,
   question:"Which phrase best describes data that fluctuated before eventually stabilising?",
   options:["rose steadily throughout the period","experienced erratic movement before levelling off","declined sharply and never recovered","remained constant throughout"],
   answer:"experienced erratic movement before levelling off",
   explanation:"'Fluctuated before stabilising' = erratic movement then levelling off. This matches the data pattern described. B."},
  {id:"q73",exam:"IELTS",section:"Writing Task 1",difficulty:1,
   question:"What is the minimum word count for IELTS Writing Task 1?",
   options:["100 words","150 words","200 words","250 words"],
   answer:"150 words",
   explanation:"Task 1 minimum is 150 words. Going below incurs a penalty. Most band 7+ responses reach 170–200 words. B."},
  {id:"q74",exam:"IELTS",section:"Writing Task 1",difficulty:3,
   question:"When two line graphs show contrasting trends, what is the best structural approach?",
   options:["Describe each line completely separately with no comparison","State each data point in chronological order","Group comparisons by time period and highlight the contrast between lines","Focus only on the highest values and ignore the rest"],
   answer:"Group comparisons by time period and highlight the contrast between lines",
   explanation:"Grouping by time period and foregrounding the contrast between the two lines produces the most coherent, examiner-friendly Task 1 response. C."},

  /* ── IELTS · Writing Task 2 ── */
  {id:"q75",exam:"IELTS",section:"Writing Task 2",difficulty:1,
   question:"What is the minimum word count for IELTS Writing Task 2?",
   options:["200 words","250 words","300 words","350 words"],
   answer:"250 words",
   explanation:"Task 2 minimum is 250 words. Most band 7+ responses reach 280–320 words. B."},
  {id:"q76",exam:"IELTS",section:"Writing Task 2",difficulty:2,
   question:"Which is a 'Problems and Solutions' essay question?",
   options:["To what extent do you agree that social media is harmful?","Cities are becoming unaffordable. Discuss causes and suggest solutions.","Do advantages of studying abroad outweigh disadvantages?","Some believe universities should only teach practical subjects. Discuss both views."],
   answer:"Cities are becoming unaffordable. Discuss causes and suggest solutions.",
   explanation:"'Discuss causes and suggest solutions' explicitly signals a Problems/Solutions task. The others are Opinion, Adv/Disadv, and Two-Views formats. B."},
  {id:"q77",exam:"IELTS",section:"Writing Task 2",difficulty:2,
   question:"For a 'Discuss both views and give your opinion' question, the strongest approach is:",
   options:["Present only one view you agree with","Present both views without committing to a position","Present both views AND state and support a clear personal position","State your opinion first, then ignore the opposing view completely"],
   answer:"Present both views AND state and support a clear personal position",
   explanation:"The question asks you to discuss BOTH views AND give your opinion. Omitting your position loses Task Achievement marks. C."},
  {id:"q78",exam:"IELTS",section:"Writing Task 2",difficulty:1,
   question:"Is it acceptable to use first person (I/my) in IELTS Task 2?",
   options:["Never — all Task 2 must be impersonal","Yes — especially in opinion essays","Only in the conclusion","Only when writing about personal experience"],
   answer:"Yes — especially in opinion essays",
   explanation:"'I believe,' 'In my opinion,' 'I would argue' are correct and expected in opinion-type Task 2 essays. B."},
  {id:"q79",exam:"IELTS",section:"Writing Task 2",difficulty:2,
   question:"Which transitional phrase best signals a contrasting point?",
   options:["Furthermore","In addition to this","Nevertheless","Similarly"],
   answer:"Nevertheless",
   explanation:"'Nevertheless' = despite that / however — signals contrast. 'Furthermore' and 'In addition' signal addition. 'Similarly' signals comparison. C."},
  {id:"q80",exam:"IELTS",section:"Writing Task 2",difficulty:3,
   question:"The single most damaging mistake in Task 2, according to IELTS examiners, is:",
   options:["Exceeding 300 words","Not fully answering the question asked","Using too many discourse markers","Starting with a personal anecdote"],
   answer:"Not fully answering the question asked",
   explanation:"Task Achievement is 25% of the score. Addressing only part of the question — missing sub-parts or failing to state a position — is the most common and most damaging error. B."},
  {id:"q81",exam:"IELTS",section:"Writing Task 2",difficulty:3,
   question:"Why does band 7 writing sometimes look simpler than band 6 writing?",
   options:["Band 7 writers use shorter essays","Band 7 writers prioritise control and clarity over ambitious but broken complex sentences","Band 7 writers avoid all complex grammar","Examiners prefer shorter words at band 7"],
   answer:"Band 7 writers prioritise control and clarity over ambitious but broken complex sentences",
   explanation:"A clean, accurate simple sentence outperforms a collapsed complex one. Examiners reward control over ambition. Grammatical Range rewards variety, but Accuracy rewards precision. B."},
  {id:"q82",exam:"IELTS",section:"Writing Task 2",difficulty:2,
   question:"How much of the total Writing band score does Task 2 represent?",
   options:["25%","50% (equal to Task 1)","About 67% (twice the weight of Task 1)","75%"],
   answer:"About 67% (twice the weight of Task 1)",
   explanation:"Task 2 is worth twice as much as Task 1. Spending too long on Task 1 is therefore a costly time management error. C."},

  /* ── IELTS · Listening ── */
  {id:"q83",exam:"IELTS",section:"Listening",difficulty:1,
   question:"How many times is each recording played in IELTS Listening?",
   options:["Once only","Twice","Three times","As many times as needed"],
   answer:"Once only",
   explanation:"Each recording is played ONCE only. This is a key difference from some other exams. Active, predictive listening is essential. A."},
  {id:"q84",exam:"IELTS",section:"Listening",difficulty:1,
   question:"How many sections does the IELTS Listening test contain?",
   options:["3","4","5","6"],
   answer:"4",
   explanation:"IELTS Listening has 4 sections of 10 questions each = 40 total. Sections 1–2 are social/everyday; 3–4 are academic. B."},
  {id:"q85",exam:"IELTS",section:"Listening",difficulty:2,
   question:"What is the most common trap in form-completion tasks?",
   options:["Answers always come as numbers","Speakers often self-correct — the SECOND piece of information is correct","Answers appear in reverse order","The first option mentioned is always correct"],
   answer:"Speakers often self-correct — the SECOND piece of information is correct",
   explanation:"Classic trap: 'It starts at 7... actually, 7:30.' Always follow the speaker's final, corrected statement. B."},
  {id:"q86",exam:"IELTS",section:"Listening",difficulty:2,
   question:"In IELTS Listening, if the instruction says 'write NO MORE THAN TWO WORDS,' which answer would be marked wrong?",
   options:["river bank","stone bridge","the old river bank","footpath"],
   answer:"the old river bank",
   explanation:"'The old river bank' = three words. Exceeds the word limit even with 'the.' Always count articles and prepositions. C."},
  {id:"q87",exam:"IELTS",section:"Listening",difficulty:1,
   question:"Sections 1 and 2 of IELTS Listening are typically set in which context?",
   options:["Academic lectures and seminars","Everyday social contexts — bookings, enquiries, local information","Formal board meetings","Radio news broadcasts"],
   answer:"Everyday social contexts — bookings, enquiries, local information",
   explanation:"Sections 1–2 use everyday transactional settings. Sections 3–4 shift to academic contexts. B."},
  {id:"q88",exam:"IELTS",section:"Listening",difficulty:3,
   question:"How many correct answers are typically needed for Band 7 in IELTS Listening?",
   options:["23–25 out of 40","28–30 out of 40","30–31 out of 40","35+ out of 40"],
   answer:"30–31 out of 40",
   explanation:"According to the 2025 IELTS listening band score conversion table, approximately 30–31 correct answers from 40 equates to Band 7. B."},
  {id:"q89",exam:"IELTS",section:"Listening",difficulty:3,
   question:"A student hears a speaker say: 'The meeting is on Tuesday... no wait, it's Wednesday.' What should the student write?",
   options:["Tuesday","Wednesday","Either — both are correct","The student should leave it blank"],
   answer:"Wednesday",
   explanation:"When a speaker self-corrects, always take the corrected (final) information. The initial statement is the distractor. B."},

  /* ── IELTS · Exam Strategy ── */
  {id:"q90",exam:"IELTS",section:"Exam Strategy",difficulty:1,
   question:"IELTS Academic and IELTS General Training differ in which components?",
   options:["Listening and Speaking","Reading and Writing","All four components","Speaking only"],
   answer:"Reading and Writing",
   explanation:"Listening and Speaking are identical for both. Reading texts and Writing tasks differ significantly between Academic and General Training. B."},
  {id:"q91",exam:"IELTS",section:"Exam Strategy",difficulty:1,
   question:"IELTS overall band scores are reported in increments of:",
   options:["0.25","0.5","1.0","Whole numbers only"],
   answer:"0.5",
   explanation:"IELTS reports in half-band increments: 5.0, 5.5, 6.0, 6.5, 7.0, etc. There is no 5.25 or 5.75. B."},
  {id:"q92",exam:"IELTS",section:"Exam Strategy",difficulty:2,
   question:"For which IELTS Reading question type do answers NOT follow the order of the passage?",
   options:["True/False/Not Given","Sentence completion","Matching headings to paragraphs","Short answer questions"],
   answer:"Matching headings to paragraphs",
   explanation:"T/F/NG, sentence completion, and short answers follow passage order. Matching headings requires non-linear scanning. C."},
  {id:"q93",exam:"IELTS",section:"Exam Strategy",difficulty:2,
   question:"In IELTS Reading, what happens if your answer exceeds the specified word limit?",
   options:["Nothing — word limits are suggestions","The answer is marked incorrect","You receive a warning but keep the mark","The examiner averages your words"],
   answer:"The answer is marked incorrect",
   explanation:"Exceeding the word limit renders the answer wrong, even if the content is correct. This is strictly enforced. B."},
  {id:"q94",exam:"IELTS",section:"Exam Strategy",difficulty:3,
   question:"How much time should Task 2 receive in the 60-minute IELTS Writing test?",
   options:["20 minutes","30 minutes","40 minutes","50 minutes"],
   answer:"40 minutes",
   explanation:"Standard allocation: Task 1 = 20 minutes (20% of marks), Task 2 = 40 minutes (doubled weighting). Over-investing in Task 1 is a costly error. C."},

  /* ══════════════════════════════════════════════════
     CEP (C2 Proficiency) QUESTIONS
  ══════════════════════════════════════════════════ */

  /* ── CEP · Open Cloze ── */
  {id:"q95",exam:"CEP (C2)",section:"Use of English – Open Cloze",difficulty:1,
   question:"The law came ___ effect on the first of January.",
   options:["to","in","into","for"],answer:"into",
   explanation:"'Come into effect' = fixed phrasal verb meaning to become operative/active. No other preposition works here. C."},
  {id:"q96",exam:"CEP (C2)",section:"Use of English – Open Cloze",difficulty:2,
   question:"Rarely ___ such groundbreaking research been conducted in this field.",
   options:["there has","has there","have there","had there"],answer:"has there",
   explanation:"Negative adverbials (rarely, seldom, never) at the start of a clause require subject-auxiliary inversion: Rarely + has + subject + past participle. B."},
  {id:"q97",exam:"CEP (C2)",section:"Use of English – Open Cloze",difficulty:2,
   question:"The proposal was rejected ___ a result of insufficient evidence.",
   options:["as","like","for","by"],answer:"as",
   explanation:"'As a result of' is the fixed prepositional phrase expressing cause. 'Like,' 'for,' and 'by' do not complete this collocation. A."},
  {id:"q98",exam:"CEP (C2)",section:"Use of English – Open Cloze",difficulty:3,
   question:"By the time the report was submitted, the team ___ working on it for six months.",
   options:["was","has been","had been","were"],answer:"had been",
   explanation:"Past perfect continuous: 'had been + verb-ing' describes ongoing action up to a point in the past. C."},
  {id:"q99",exam:"CEP (C2)",section:"Use of English – Open Cloze",difficulty:2,
   question:"She was puzzled ___ the unexpected results of the experiment.",
   options:["from","by","with","of"],answer:"by",
   explanation:"Passive adjective + agent preposition: 'puzzled by [something]' — 'by' introduces the cause of the feeling. B."},
  {id:"q100",exam:"CEP (C2)",section:"Use of English – Open Cloze",difficulty:3,
   question:"It was not ___ she had left the building that she realised her phone was missing.",
   options:["until","when","before","since"],answer:"until",
   explanation:"'Not until X that Y' is a cleft structure emphasising timing: the realisation occurred at the point of leaving. A."},
  {id:"q101",exam:"CEP (C2)",section:"Use of English – Open Cloze",difficulty:2,
   question:"___ the complexity of the issue, a simple solution seems unlikely.",
   options:["Despite","Given","Although","Even if"],answer:"Given",
   explanation:"'Given [noun phrase]' = taking into account / considering. Introduces a concessive reason, not a contrast. B."},

  /* ── CEP · Word Formation ── */
  {id:"q102",exam:"CEP (C2)",section:"Word Formation",difficulty:1,
   question:"ROOT: SIGNIFY → 'The discovery had enormous ___ for modern medicine.'",
   options:["significance","significant","signification","significantly"],answer:"significance",
   explanation:"A noun is required after 'enormous.' 'Significance' (noun) = importance/meaning. A."},
  {id:"q103",exam:"CEP (C2)",section:"Word Formation",difficulty:2,
   question:"ROOT: PREDICT → 'The market's behaviour has become increasingly ___.'",
   options:["predictive","prediction","predictable","predicted"],answer:"predictable",
   explanation:"'Predictable' = able to be predicted (adjective after 'become'). 'Predictive' = relating to making predictions — different meaning. C."},
  {id:"q104",exam:"CEP (C2)",section:"Word Formation",difficulty:2,
   question:"ROOT: RELY → 'Communities depend on the ___ of their water supply.'",
   options:["reliability","reliance","reliable","relying"],answer:"reliability",
   explanation:"A noun is needed after 'the.' 'Reliability' = quality of being reliable. 'Reliance' = dependence on something. A."},
  {id:"q105",exam:"CEP (C2)",section:"Word Formation",difficulty:1,
   question:"ROOT: ENTHUSE → 'Her opening speech was met with ___ applause.'",
   options:["enthusiasm","enthusiastic","enthusiastically","enthused"],answer:"enthusiastic",
   explanation:"An adjective is needed to modify 'applause.' 'Enthusiastic' is the adjective form. B."},
  {id:"q106",exam:"CEP (C2)",section:"Word Formation",difficulty:2,
   question:"ROOT: CONCLUDE → 'The available evidence was far from ___.'",
   options:["conclusive","conclusion","conclude","concludingly"],answer:"conclusive",
   explanation:"'Far from conclusive' = not definitive. 'Conclusive' is the adjective needed after 'from.' A."},
  {id:"q107",exam:"CEP (C2)",section:"Word Formation",difficulty:3,
   question:"ROOT: SUSTAIN → 'Experts raised concerns about the ___ of current practices.'",
   options:["sustainability","sustainable","sustainably","sustained"],answer:"sustainability",
   explanation:"A noun is needed after 'the.' 'Sustainability' = the quality of being sustainable. A."},
  {id:"q108",exam:"CEP (C2)",section:"Word Formation",difficulty:2,
   question:"ROOT: APPRECIATE → 'We should show greater ___ for frontline workers.'",
   options:["appreciative","appreciated","appreciation","appreciating"],answer:"appreciation",
   explanation:"A noun is needed after 'greater.' 'Appreciation' = recognition/gratitude. C."},

  /* ── CEP · Key Word Transformation ── */
  {id:"q109",exam:"CEP (C2)",section:"Key Word Transformation",difficulty:2,
   question:"Original: 'People say he wrote the novel in three weeks.' KEY WORD: SAID\nSelect the correct passive reporting structure:",
   options:["He is said to have written the novel in three weeks.","He is said to write the novel in three weeks.","He was said to write the novel in three weeks.","He said to have written the novel in three weeks."],
   answer:"He is said to have written the novel in three weeks.",
   explanation:"Passive reporting: 'He is said to have [done]' — present passive + perfect infinitive (action occurred before now). A."},
  {id:"q110",exam:"CEP (C2)",section:"Key Word Transformation",difficulty:2,
   question:"Original: 'I regret not applying for that position.' KEY WORD: WISH\nSelect the correct transformation:",
   options:["I wish I had applied for that position.","I wish I applied for that position.","I wished to apply for that position.","I wish I have applied for that position."],
   answer:"I wish I had applied for that position.",
   explanation:"'Wish + past perfect' = regret about a past event that cannot now be changed. A."},
  {id:"q111",exam:"CEP (C2)",section:"Key Word Transformation",difficulty:2,
   question:"Original: 'She was so tired that she could not continue.' KEY WORD: TOO\nSelect the correct transformation:",
   options:["She was too tired to continue.","She was too tired for continuing.","She was too tired that she continue.","She was tired too to continue."],
   answer:"She was too tired to continue.",
   explanation:"'Too + adjective + to + infinitive' = so...that...cannot. Standard C2 transformation. A."},
  {id:"q112",exam:"CEP (C2)",section:"Key Word Transformation",difficulty:3,
   question:"Original: 'It was wrong of him to criticise her publicly.' KEY WORD: SHOULD\nSelect the correct transformation:",
   options:["He should not have criticised her in public.","He should not criticise her in public.","He should have not criticised her in public.","He must not have criticised her in public."],
   answer:"He should not have criticised her in public.",
   explanation:"'Should not have + past participle' = past criticism or regret about a completed action. A."},
  {id:"q113",exam:"CEP (C2)",section:"Key Word Transformation",difficulty:3,
   question:"Original: 'Despite training intensely, she failed to qualify.' KEY WORD: MATTER\nSelect the correct transformation:",
   options:["No matter how intensely she trained, she failed to qualify.","No matter if she trained, she failed to qualify.","No mattering how she trained, she failed.","No matter that she trained intensely, she failed."],
   answer:"No matter how intensely she trained, she failed to qualify.",
   explanation:"'No matter how + adverb + subject + verb' = regardless of the degree of effort. Standard C2 concessive. A."},
  {id:"q114",exam:"CEP (C2)",section:"Key Word Transformation",difficulty:3,
   question:"Original: 'She had barely sat down when the phone rang.' KEY WORD: SOONER\nSelect the correct transformation:",
   options:["No sooner had she sat down than the phone rang.","No sooner she had sat down when the phone rang.","No sooner had sat she down than the phone rang.","No sooner had she sat down when the phone rang."],
   answer:"No sooner had she sat down than the phone rang.",
   explanation:"'No sooner had [subject + past participle] THAN...' — inversion required after 'no sooner'; 'than' not 'when.' A."},
  {id:"q115",exam:"CEP (C2)",section:"Key Word Transformation",difficulty:3,
   question:"Original: 'I am certain she did not intend to cause offence.' KEY WORD: MEANT\nSelect the correct transformation:",
   options:["She cannot have meant to cause offence.","She could not mean to cause offence.","She had not meant to cause offence.","She must not have meant to cause offence."],
   answer:"She cannot have meant to cause offence.",
   explanation:"'Cannot have + past participle' = strong past deduction that something did NOT happen. Equivalent to 'I am certain she did not.' A."},

  /* ── CEP · Multiple Choice Cloze ── */
  {id:"q116",exam:"CEP (C2)",section:"Multiple Choice Cloze",difficulty:2,
   question:"The company decided to ___ its losses and exit the market.",
   options:["cut","trim","slash","reduce"],answer:"cut",
   explanation:"'Cut one's losses' is a fixed idiom = stop a failing activity to prevent further loss. The other verbs do not complete this idiom. A."},
  {id:"q117",exam:"CEP (C2)",section:"Multiple Choice Cloze",difficulty:2,
   question:"His sudden resignation came ___ a surprise to his colleagues.",
   options:["as","like","for","with"],answer:"as",
   explanation:"'Come as a surprise' is a fixed collocation. 'Like' is informal; 'for' and 'with' do not complete the phrase. A."},
  {id:"q118",exam:"CEP (C2)",section:"Multiple Choice Cloze",difficulty:2,
   question:"Her contribution to the project went largely ___.",
   options:["unnoticed","unknown","unremarked","unseen"],answer:"unnoticed",
   explanation:"'Go unnoticed' is the standard fixed expression for something being overlooked. A."},
  {id:"q119",exam:"CEP (C2)",section:"Multiple Choice Cloze",difficulty:3,
   question:"The prime minister's speech was designed to ___ public support for the new policy.",
   options:["garner","gather","collect","compile"],answer:"garner",
   explanation:"'Garner support' is a formal C2-level collocation meaning to accumulate or acquire. A."},
  {id:"q120",exam:"CEP (C2)",section:"Multiple Choice Cloze",difficulty:2,
   question:"The documentary ___ an important question about data privacy.",
   options:["raises","lifts","elevates","arouses"],answer:"raises",
   explanation:"'Raise a question' is the standard collocation. 'Arouse' collocates with suspicion or curiosity, not questions. A."},
  {id:"q121",exam:"CEP (C2)",section:"Multiple Choice Cloze",difficulty:3,
   question:"The new regulations will ___ a significant change in data collection practices.",
   options:["bring about","bring in","bring up","bring out"],answer:"bring about",
   explanation:"'Bring about' = cause or produce a change. 'Bring in' = introduce a law. 'Bring up' = raise a topic. 'Bring out' = publish. A."},

  /* ── CEP · Exam Strategy ── */
  {id:"q122",exam:"CEP (C2)",section:"Exam Strategy",difficulty:1,
   question:"In Cambridge C2 Proficiency Part 4 (Key Word Transformation), how many words must the answer contain?",
   options:["1–2 words","2–5 words including key word","3–8 words including key word","Up to 12 words"],
   answer:"3–8 words including key word",
   explanation:"C2 Proficiency Part 4 requires 3–8 words including the unchanged key word. (B2 First requires 2–5 — a common confusion.) C."},
  {id:"q123",exam:"CEP (C2)",section:"Exam Strategy",difficulty:1,
   question:"How is the C2 Proficiency Speaking test conducted?",
   options:["Alone with a computer microphone","With an interlocutor and one other candidate","With a panel of three examiners","Over the phone with a remote examiner"],
   answer:"With an interlocutor and one other candidate",
   explanation:"C2 Proficiency Speaking is conducted in pairs with an interlocutor. This contrasts with IELTS (one-to-one) and CELPIP (fully computerised). B."},
  {id:"q124",exam:"CEP (C2)",section:"Exam Strategy",difficulty:2,
   question:"In C2 Proficiency Writing, which task type appears ONLY in Part 1, never in Part 2?",
   options:["Review","Report","Essay","Letter or email"],answer:"Essay",
   explanation:"The compulsory essay is always Part 1. Part 2 options: article, letter/email, report, review. Essay never appears in Part 2. C."},

  /* ══════════════════════════════════════════════════
     CELPIP QUESTIONS
  ══════════════════════════════════════════════════ */

  {id:"q125",exam:"CELPIP",section:"Exam Overview",difficulty:1,
   question:"CELPIP scores are reported on a scale of:",
   options:["0–9","1–12","10–100","1–10"],answer:"1–12",
   explanation:"CELPIP uses a 1–12 scale aligned directly with CLB (Canadian Language Benchmarks). 'M' indicates below CLB 1. B."},
  {id:"q126",exam:"CELPIP",section:"Exam Overview",difficulty:1,
   question:"How does CELPIP Speaking differ fundamentally from IELTS Speaking?",
   options:["CELPIP Speaking is face-to-face with a human examiner","CELPIP Speaking is fully computer-delivered with no live examiner","CELPIP Speaking requires written responses","CELPIP Speaking is 30 minutes longer"],
   answer:"CELPIP Speaking is fully computer-delivered with no live examiner",
   explanation:"CELPIP Speaking is entirely computer-administered and AI-scored. No human examiner is present — a defining difference from IELTS. B."},
  {id:"q127",exam:"CELPIP",section:"Exam Overview",difficulty:2,
   question:"For Canadian Express Entry (Federal Skilled Worker), what minimum CELPIP score is required in each component?",
   options:["5","6","7","8"],answer:"7",
   explanation:"FSW Express Entry requires CLB 7 in all four components. CELPIP 7 = CLB 7. C."},
  {id:"q128",exam:"CELPIP",section:"Reading",difficulty:1,
   question:"In CELPIP Reading Part 1, what type of text do you typically encounter?",
   options:["Academic journal articles","Everyday texts such as emails, memos, or notices","Literary fiction","Legal documents"],
   answer:"Everyday texts such as emails, memos, or notices",
   explanation:"CELPIP Part 1 (Reading Correspondence) uses real-life everyday texts — emails, memos, notices — reflecting Canadian daily life. B."},
  {id:"q129",exam:"CELPIP",section:"Writing",difficulty:1,
   question:"What form does CELPIP Writing Task 1 take?",
   options:["A formal academic essay","A short story","An email","A business report"],answer:"An email",
   explanation:"CELPIP Writing Task 1 requires writing an email in response to a given situation (approximately 150–200 words, 27 minutes). C."},
  {id:"q130",exam:"CELPIP",section:"Writing",difficulty:2,
   question:"CELPIP Writing is scored on which criteria?",
   options:["Grammar only","Vocabulary and content only","Content, Coherence/Cohesion, Vocabulary, and Grammar/Sentence Structure","Spelling and punctuation exclusively"],
   answer:"Content, Coherence/Cohesion, Vocabulary, and Grammar/Sentence Structure",
   explanation:"CELPIP Writing uses four scoring dimensions mirroring IELTS's four criteria. C."},
  {id:"q131",exam:"CELPIP",section:"Speaking",difficulty:1,
   question:"Who or what scores your CELPIP Speaking responses?",
   options:["A live human examiner","An automated AI scoring system","A panel of three raters","Both human and AI equally"],
   answer:"An automated AI scoring system",
   explanation:"CELPIP Speaking is fully computer-scored using automated AI. No human examiner is involved — a defining feature. B."},
  {id:"q132",exam:"CELPIP",section:"Exam Strategy",difficulty:1,
   question:"CELPIP is accepted for immigration to which country?",
   options:["United Kingdom","Australia","Canada","United States"],answer:"Canada",
   explanation:"CELPIP is accepted by IRCC for Canadian permanent residence and citizenship. It is not accepted by the UK, Australia, or US for immigration. C."},
  {id:"q133",exam:"CELPIP",section:"Exam Strategy",difficulty:2,
   question:"A CELPIP score of 9 is approximately equivalent to which IELTS band score?",
   options:["6.5","7.0","7.5","8.0"],answer:"7.5",
   explanation:"CELPIP 9 = CLB 9 ≈ IELTS 7.5 overall. Component equivalences vary slightly. C."},
];

/* ═══════════════════════════════════════════════════════
   LEARNING PATH CONTENT (synthesised from community research)
═══════════════════════════════════════════════════════ */
export { QB };

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
      {title:"Use your 30-second preparation time",body:"Most tasks give 30 seconds before you begin speaking. Use every second: identify the main point you want to make, a supporting example, and how you will conclude. Speak clearly and at a measured pace — the AI scores listenability."},
      {title:"CELPIP Speaking scoring criteria",body:"Vocabulary Range, Listenability (clarity and ease of understanding), Rhythm/Fluency/Pronunciation, and Content (relevance and completeness). Unlike IELTS, you cannot adjust for an examiner's reactions. Natural, clear, organised speech is the priority."},
      {title:"Task types to practise specifically",body:"Task 1 (Giving Advice), Task 3 (Describing a Scene), Task 6 (Dealing with a Difficult Situation), and Task 8 (Describing an Unlikely Situation) are the most cognitively demanding. Practise each type so the format is automatic on test day."},
    ]
  },
};

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const EXAMS = ["All","IELTS","CEP (C2)","CELPIP"];
const DIFF_LABEL = {1:"Easy",2:"Medium",3:"Hard"};
const DIFF_COLOR = {1:"#2ECC71",2:"#E09020",3:"#E05252"};
const EXAM_COLOR = {"IELTS":"#E8A020","CEP (C2)":"#5BA3C9","CELPIP":"#D95858"};
const C = {bg:"#070A12",surface:"#0C1020",border:"#141824",text:"#CCC8C0",muted:"#3A4055",faint:"#1A1E2E",accent:"#8899CC",green:"#2ECC71",red:"#E05252",amber:"#E09020"};

const SECTIONS_BY_EXAM = {
  "IELTS":["Reading – T/F/NG","Reading – Multiple Choice","Grammar","Academic Vocabulary","Writing Task 1","Writing Task 2","Listening","Exam Strategy"],
  "CEP (C2)":["Use of English – Open Cloze","Word Formation","Key Word Transformation","Multiple Choice Cloze","Exam Strategy"],
  "CELPIP":["Exam Overview","Reading","Writing","Speaking","Exam Strategy"],
};
const ALL_SECTIONS = [...new Set(QB.map(q=>q.section))];

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

/* Weighted question selector — boosts weak sections */
function selectQueue(allQ, weakSections, exam, count=20){
  let pool = exam==="All" ? allQ : allQ.filter(q=>q.exam===exam);
  if(!pool.length) return [];
  if(weakSections.length===0) return shuffle(pool).slice(0,count);
  const weak = pool.filter(q=>weakSections.includes(q.section));
  const other = pool.filter(q=>!weakSections.includes(q.section));
  const weakCount = Math.min(Math.round(count*0.6), weak.length);
  const otherCount = Math.min(count - weakCount, other.length);
  return shuffle([...shuffle(weak).slice(0,weakCount), ...shuffle(other).slice(0,otherCount)]);
}

/* Compute section accuracy from all sessions */
function computeWeakSections(sessions, threshold=0.55){
  const sectionData={};
  sessions.forEach(s=>{
    s.results.forEach(r=>{
      if(!sectionData[r.section]) sectionData[r.section]={correct:0,total:0};
      sectionData[r.section].total++;
      if(r.correct) sectionData[r.section].correct++;
    });
  });
  return Object.entries(sectionData)
    .filter(([,d])=>d.total>=3 && d.correct/d.total < threshold)
    .map(([s])=>s);
}

/* ═══════════════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════════════ */
async function loadSessions(){
  try{const r=await window.storage.get("precious_sessions");return r?JSON.parse(r.value):[];}
  catch{return [];}
}
async function saveSessions(sessions){
  try{await window.storage.set("precious_sessions",JSON.stringify(sessions));}
  catch{}
}

/* ═══════════════════════════════════════════════════════
   SMALL UI ATOMS
═══════════════════════════════════════════════════════ */
function Chip({label,color,small}){
  return <span style={{fontSize:small?8:9,letterSpacing:"0.12em",textTransform:"uppercase",padding:small?"2px 6px":"3px 9px",border:`1px solid ${color}40`,background:`${color}12`,color,fontFamily:"system-ui,sans-serif",whiteSpace:"nowrap"}}>{label}</span>;
}
function TabBtn({label,active,onClick,badge}){
  return <button onClick={onClick} style={{background:active?C.faint:"transparent",border:`1px solid ${active?C.accent+"50":C.border}`,color:active?C.accent:C.muted,padding:"7px 14px",fontSize:11,letterSpacing:"0.06em",cursor:"pointer",fontFamily:"system-ui,sans-serif",position:"relative"}}>
    {label}
    {badge>0&&<span style={{position:"absolute",top:3,right:3,background:C.red,color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:8,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui"}}>{badge}</span>}
  </button>;
}
function PrimaryBtn({children,onClick,disabled}){
  return <button onClick={!disabled?onClick:undefined} disabled={disabled} style={{background:disabled?"#1A1E2E":C.text,color:disabled?C.muted:C.bg,border:"none",padding:"11px 30px",fontSize:11,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",cursor:disabled?"not-allowed":"pointer",fontWeight:700,opacity:disabled?.5:1}}>{children}</button>;
}
function GhostBtn({children,onClick}){
  return <button onClick={onClick} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,padding:"9px 22px",fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",cursor:"pointer"}}>{children}</button>;
}

/* ═══════════════════════════════════════════════════════
   PRACTICE VIEW
═══════════════════════════════════════════════════════ */
function PracticeView({sessions,onSessionComplete}){
  const [phase,setPhase]=useState("setup");
  const [selExam,setSelExam]=useState("IELTS");
  const [timed,setTimed]=useState(false);
  const [queue,setQueue]=useState([]);
  const [idx,setIdx]=useState(0);
  const [chosen,setChosen]=useState(null);
  const [revealed,setRevealed]=useState(false);
  const [score,setScore]=useState(0);
  const [results,setResults]=useState([]);
  const [timeLeft,setTimeLeft]=useState(40);
  const [timerOn,setTimerOn]=useState(false);
  const topRef=useRef(null);

  const weakSections = computeWeakSections(sessions);

  const check=useCallback(()=>{
    if(chosen===null)return;
    setTimerOn(false);setRevealed(true);
    const q=queue[idx];const ok=chosen===q.answer;
    if(ok)setScore(s=>s+1);
    setResults(r=>[...r,{qid:q.id,section:q.section,exam:q.exam,correct:ok,chosen,answer:q.answer}]);
  },[chosen,queue,idx]);

  useEffect(()=>{
    if(!timed||!timerOn||revealed)return;
    if(timeLeft<=0){check();return;}
    const t=setTimeout(()=>setTimeLeft(x=>x-1),1000);
    return()=>clearTimeout(t);
  },[timeLeft,timerOn,revealed,timed,check]);

  const startQuiz=()=>{
    const q=selectQueue(QB,weakSections,selExam,20);
    setQueue(q);setIdx(0);setChosen(null);setRevealed(false);
    setScore(0);setResults([]);setTimeLeft(40);setTimerOn(timed);
    setPhase("quiz");
  };

  const next=()=>{
    if(idx+1>=queue.length){
      const sess={date:new Date().toISOString(),score,total:queue.length,exam:selExam,results};
      onSessionComplete(sess);setPhase("done");
      return;
    }
    setIdx(i=>i+1);setChosen(null);setRevealed(false);
    setTimeLeft(40);setTimerOn(timed);
    topRef.current?.scrollIntoView({behavior:"smooth"});
  };

  const q=queue[idx]||{};
  const passage=q.pid?PASSAGES[q.pid]:null;
  const pct=queue.length?((idx)/queue.length)*100:0;

  if(phase==="setup") return(
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:10}}>Exam</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {EXAMS.map(e=><button key={e} onClick={()=>setSelExam(e)} style={{background:selExam===e?`${EXAM_COLOR[e]||C.accent}15`:C.surface,border:`1px solid ${selExam===e?(EXAM_COLOR[e]||C.accent):C.border}`,color:selExam===e?(EXAM_COLOR[e]||C.accent):C.muted,padding:"8px 18px",fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>{e}</button>)}
        </div>
      </div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:10}}>Mode</div>
        <div style={{display:"flex",gap:6}}>
          {[["Practice","No timer"],["Timed","40s/question"]].map(([label,sub],i)=><button key={i} onClick={()=>setTimed(i===1)} style={{background:timed===(i===1)?C.faint:C.surface,border:`1px solid ${timed===(i===1)?C.accent+"50":C.border}`,color:timed===(i===1)?C.accent:C.muted,padding:"10px 20px",fontSize:11,cursor:"pointer",fontFamily:"system-ui,sans-serif",textAlign:"left"}}>
            <div>{label}</div><div style={{fontSize:9,marginTop:2,color:C.muted}}>{sub}</div>
          </button>)}
        </div>
      </div>
      {weakSections.length>0&&<div style={{background:"#1F0808",border:`1px solid ${C.red}25`,padding:"12px 16px",marginBottom:24,borderLeft:`3px solid ${C.red}`}}>
        <div style={{fontSize:9,color:C.red,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:6}}>Weak sections detected — boosted in this session</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{weakSections.map(s=><Chip key={s} label={s} color={C.red} small/>)}</div>
      </div>}
      <div style={{fontSize:12,color:C.muted,fontFamily:"system-ui,sans-serif",marginBottom:20}}>{QB.filter(q=>selExam==="All"||q.exam===selExam).length} questions available · 20 per session · {weakSections.length>0?"weighted toward weak areas":"balanced random"}</div>
      <PrimaryBtn onClick={startQuiz}>Start Session →</PrimaryBtn>
    </div>
  );

  if(phase==="done") return(
    <div>
      <div style={{marginBottom:32}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:8}}>Session Complete</div>
        <div style={{fontSize:56,letterSpacing:"-0.04em"}}>{score}<span style={{fontSize:20,color:C.muted}}>/{queue.length}</span></div>
        <div style={{fontSize:12,color:C.muted,fontFamily:"system-ui,sans-serif",marginTop:4}}>{Math.round(score/queue.length*100)}% · {score>=queue.length*.85?"Strong session.":score>=queue.length*.65?"Solid — review the explanation for each wrong answer.":"Study the learning path for your weakest sections before the next session."}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:24}}>
        {results.map((r,i)=><div key={i} style={{background:C.surface,padding:"10px 14px",borderLeft:`3px solid ${r.correct?C.green:C.red}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
          <div style={{fontSize:11,color:C.muted,fontFamily:"system-ui,sans-serif",flex:1}}>{queue[i]?.question?.slice(0,60)}…</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
            <Chip label={r.section} color={r.correct?C.green:C.red} small/>
            <span style={{fontSize:10,color:r.correct?C.green:C.red,fontFamily:"system-ui"}}>{r.correct?"✓":"✗"}</span>
          </div>
        </div>)}
      </div>
      <div style={{display:"flex",gap:8}}><GhostBtn onClick={()=>setPhase("setup")}>New Session</GhostBtn><PrimaryBtn onClick={startQuiz}>Retry Same Exam</PrimaryBtn></div>
    </div>
  );

  return(
    <div ref={topRef}>
      <div style={{height:2,background:C.faint,marginBottom:24}}>
        <div style={{height:"100%",background:EXAM_COLOR[q.exam]||C.accent,width:`${pct}%`,transition:"width .4s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <Chip label={q.exam} color={EXAM_COLOR[q.exam]||C.accent}/>
          <Chip label={q.section} color={C.muted}/>
          <Chip label={DIFF_LABEL[q.difficulty]} color={DIFF_COLOR[q.difficulty]}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:11,color:C.muted,fontFamily:"system-ui,sans-serif"}}>{idx+1}/{queue.length}</span>
          {timed&&!revealed&&<span style={{fontSize:12,color:timeLeft<=8?C.red:C.muted,fontFamily:"system-ui,sans-serif",fontWeight:600}}>{timeLeft}s</span>}
        </div>
      </div>
      {passage&&<div style={{background:`${EXAM_COLOR[q.exam]||C.accent}08`,border:`1px solid ${EXAM_COLOR[q.exam]||C.accent}20`,padding:"14px 18px",marginBottom:22,borderLeft:`3px solid ${EXAM_COLOR[q.exam]||C.accent}40`}}>
        <div style={{fontSize:9,color:EXAM_COLOR[q.exam]||C.accent,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:8}}>Passage</div>
        <div style={{fontSize:12,lineHeight:1.9,color:"#7A8090",fontStyle:"italic"}}>{passage}</div>
      </div>}
      <div style={{fontSize:15,lineHeight:1.8,marginBottom:22,color:C.text,whiteSpace:"pre-line"}}>{q.question}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:22}}>
        {q.options?.map(opt=>{
          const sel=chosen===opt,ok=opt===q.answer;
          let bg=C.surface,border=C.border,col=C.muted;
          if(revealed){if(ok){bg="#0B2019";border=C.green;col=C.green;}else if(sel&&!ok){bg="#200E0E";border=C.red;col=C.red;}}
          else if(sel){bg=C.faint;border=EXAM_COLOR[q.exam]||C.accent;col=C.text;}
          return<button key={opt} onClick={()=>!revealed&&setChosen(opt)} style={{background:bg,border:`1px solid ${border}`,color:col,padding:"12px 16px",textAlign:"left",fontSize:13,cursor:revealed?"default":"pointer",fontFamily:"'Palatino Linotype',Georgia,serif",lineHeight:1.6,display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{width:16,height:16,border:`1px solid ${border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,flexShrink:0,marginTop:3,fontFamily:"system-ui",color:revealed?(ok?C.green:sel?C.red:C.muted):(sel?EXAM_COLOR[q.exam]||C.accent:C.muted)}}>
              {revealed?(ok?"✓":sel?"✗":""):(sel?"●":"")}
            </span>{opt}
          </button>;
        })}
      </div>
      {revealed&&<div style={{background:"#0A1810",border:`1px solid ${C.green}20`,padding:"14px 18px",marginBottom:20,borderLeft:`3px solid ${C.green}50`}}>
        <div style={{fontSize:9,color:C.green,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:6}}>Explanation</div>
        <div style={{fontSize:12,lineHeight:1.85,color:"#6A8870"}}>{q.explanation}</div>
      </div>}
      <div style={{display:"flex",gap:8}}>
        {!revealed?<PrimaryBtn disabled={chosen===null} onClick={check}>Check Answer</PrimaryBtn>
          :<PrimaryBtn onClick={next}>{idx+1>=queue.length?"Finish Session →":"Next →"}</PrimaryBtn>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PROGRESS VIEW
═══════════════════════════════════════════════════════ */
function ProgressView({sessions}){
  if(!sessions.length) return <div style={{color:C.muted,fontFamily:"system-ui,sans-serif",fontSize:13,paddingTop:20}}>No sessions recorded yet. Complete your first practice session to see your progress.</div>;
  const last10=sessions.slice(-10);
  const sectionAcc={};
  sessions.forEach(s=>s.results.forEach(r=>{
    if(!sectionAcc[r.section]) sectionAcc[r.section]={c:0,t:0};
    sectionAcc[r.section].t++;
    if(r.correct) sectionAcc[r.section].c++;
  }));
  const sectionList=Object.entries(sectionAcc).map(([s,d])=>({section:s,acc:Math.round(d.c/d.t*100),total:d.t})).sort((a,b)=>a.acc-b.acc);
  return(
    <div>
      <div style={{fontSize:9,color:C.muted,letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:12}}>Score History (last {last10.length} sessions)</div>
      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:80,marginBottom:24}}>
        {last10.map((s,i)=>{
          const pct=Math.round(s.score/s.total*100);
          const col=pct>=80?C.green:pct>=60?C.amber:C.red;
          return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{fontSize:9,color:col,fontFamily:"system-ui,sans-serif"}}>{pct}%</div>
            <div style={{width:"100%",background:col,height:`${Math.max(pct*.6,4)}px`,minHeight:4}}/>
            <div style={{fontSize:8,color:C.muted,fontFamily:"system-ui,sans-serif"}}>{new Date(s.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</div>
          </div>;
        })}
      </div>
      <div style={{fontSize:9,color:C.muted,letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:12}}>Section Accuracy (all sessions)</div>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {sectionList.map(({section,acc,total})=>{
          const col=acc>=80?C.green:acc>=60?C.amber:C.red;
          return<div key={section} style={{background:C.surface,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:11,color:C.text,flex:1,fontFamily:"system-ui,sans-serif"}}>{section}</div>
            <div style={{fontSize:10,color:C.muted,fontFamily:"system-ui,sans-serif",minWidth:40}}>{total}q</div>
            <div style={{width:100,height:3,background:C.faint}}>
              <div style={{width:`${acc}%`,height:"100%",background:col}}/>
            </div>
            <div style={{fontSize:12,color:col,fontFamily:"system-ui,sans-serif",minWidth:36,textAlign:"right"}}>{acc}%</div>
          </div>;
        })}
      </div>
      <div style={{marginTop:24,borderTop:`1px solid ${C.border}`,paddingTop:16}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:10}}>Session Log</div>
        {[...sessions].reverse().map((s,i)=><div key={i} style={{background:C.surface,padding:"10px 14px",marginBottom:2,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:11,color:C.muted,fontFamily:"system-ui,sans-serif"}}>{new Date(s.date).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
          <Chip label={s.exam} color={EXAM_COLOR[s.exam]||C.accent} small/>
          <div style={{fontSize:12,color:Math.round(s.score/s.total*100)>=70?C.green:C.amber,fontFamily:"system-ui,sans-serif"}}>{s.score}/{s.total} · {Math.round(s.score/s.total*100)}%</div>
        </div>)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   WEAK AREAS VIEW
═══════════════════════════════════════════════════════ */
function WeakAreasView({sessions}){
  const weak=computeWeakSections(sessions);
  const sectionAcc={};
  sessions.forEach(s=>s.results.forEach(r=>{
    if(!sectionAcc[r.section]) sectionAcc[r.section]={c:0,t:0};
    sectionAcc[r.section].t++;if(r.correct) sectionAcc[r.section].c++;
  }));
  if(!sessions.length||Object.keys(sectionAcc).length===0) return<div style={{color:C.muted,fontFamily:"system-ui,sans-serif",fontSize:13,paddingTop:20}}>No data yet. Complete at least one session to see your weak areas.</div>;
  return(
    <div>
      {weak.length>0&&<div style={{background:"#1F0808",border:`1px solid ${C.red}25`,padding:"14px 16px",marginBottom:24,borderLeft:`3px solid ${C.red}`}}>
        <div style={{fontSize:9,color:C.red,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:8}}>Flagged as weak (below 55% across 3+ questions)</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{weak.map(s=><Chip key={s} label={s} color={C.red}/>)}</div>
        <div style={{fontSize:11,color:"#8A5050",fontFamily:"system-ui,sans-serif",marginTop:10,lineHeight:1.7}}>These sections are weighted higher in your next practice session. Open the Learning Path tab to study targeted guidance for each one.</div>
      </div>}
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {Object.entries(sectionAcc).sort((a,b)=>a[1].c/a[1].t-b[1].c/b[1].t).map(([sec,d])=>{
          const acc=Math.round(d.c/d.t*100);const col=acc>=80?C.green:acc>=60?C.amber:C.red;
          const isWeak=weak.includes(sec);
          return<div key={sec} style={{background:isWeak?"#150808":C.surface,border:`1px solid ${isWeak?C.red+"30":C.border}`,padding:"14px 16px",borderLeft:`3px solid ${col}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:12,color:C.text}}>{sec}</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {isWeak&&<Chip label="WEAK" color={C.red} small/>}
                <span style={{fontSize:14,color:col,fontFamily:"system-ui,sans-serif",fontWeight:600}}>{acc}%</span>
              </div>
            </div>
            <div style={{height:3,background:C.faint}}><div style={{width:`${acc}%`,height:"100%",background:col}}/></div>
            <div style={{fontSize:10,color:C.muted,fontFamily:"system-ui,sans-serif",marginTop:6}}>{d.c} correct of {d.t} questions attempted</div>
          </div>;
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LEARNING PATH VIEW
═══════════════════════════════════════════════════════ */
function LearningPathView({sessions}){
  const [open,setOpen]=useState(null);
  const weak=computeWeakSections(sessions);
  const allSections=Object.keys(LEARNING_PATH).filter(s=>LEARNING_PATH[s].steps&&LEARNING_PATH[s].steps.length>0);
  const sorted=[...weak,...allSections.filter(s=>!weak.includes(s))];
  return(
    <div>
      {weak.length>0&&<div style={{background:C.surface,border:`1px solid ${C.red}20`,padding:"10px 14px",marginBottom:20,borderLeft:`3px solid ${C.red}`,fontSize:11,color:"#9A7070",fontFamily:"system-ui,sans-serif",lineHeight:1.7}}>
        Your weak sections are shown first. Study these guides before your next session.
      </div>}
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {sorted.map(sec=>{
          const lp=LEARNING_PATH[sec];
          if(!lp||!lp.steps||!lp.steps.length) return null;
          const isWeak=weak.includes(sec);
          const isOpen=open===sec;
          return<div key={sec} style={{border:`1px solid ${isWeak?C.red+"30":C.border}`,borderLeft:`3px solid ${isWeak?C.red:lp.color}`,background:isWeak?"#100808":C.surface}}>
            <button onClick={()=>setOpen(isOpen?null:sec)} style={{width:"100%",background:"none",border:"none",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:16}}>{lp.icon}</span>
                <div>
                  <div style={{fontSize:13,color:C.text}}>{sec}</div>
                  {isWeak&&<div style={{fontSize:9,color:C.red,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginTop:2}}>⚠ Flagged weak — study this first</div>}
                </div>
              </div>
              <span style={{fontSize:10,color:C.muted,fontFamily:"system-ui,sans-serif",flexShrink:0}}>{isOpen?"▲":"▼"}</span>
            </button>
            {isOpen&&<div style={{padding:"0 16px 18px"}}>
              {lp.summary&&<div style={{fontSize:12,color:"#7A8090",lineHeight:1.8,marginBottom:16,fontFamily:"system-ui,sans-serif",borderBottom:`1px solid ${C.border}`,paddingBottom:14}}>{lp.summary}</div>}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {lp.steps.map((step,i)=><div key={i} style={{background:"#070A12",padding:"12px 14px",borderLeft:`2px solid ${lp.color}50`}}>
                  <div style={{fontSize:11,color:lp.color,marginBottom:6,fontFamily:"system-ui,sans-serif",fontWeight:600}}>{i+1}. {step.title}</div>
                  <div style={{fontSize:12,color:"#7A8090",lineHeight:1.85,fontFamily:"system-ui,sans-serif"}}>{step.body}</div>
                </div>)}
              </div>
            </div>}
          </div>;
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════ */
export default function App(){
  const [tab,setTab]=useState("practice");
  const [sessions,setSessions]=useState([]);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{loadSessions().then(s=>{setSessions(s);setLoaded(true);});},[]);

  const onSessionComplete=async(sess)=>{
    const updated=[...sessions,sess];
    setSessions(updated);
    await saveSessions(updated);
  };

  const resetData=async()=>{
    if(!window.confirm("Reset all session data? This cannot be undone.")) return;
    setSessions([]);await saveSessions([]);
  };

  const weak=computeWeakSections(sessions);

  if(!loaded) return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"system-ui,sans-serif",fontSize:12}}>Loading your data…</div>;

  const tabs=[
    {id:"practice",label:"Practice"},
    {id:"progress",label:"Progress"},
    {id:"weak",label:"Weak Areas",badge:weak.length},
    {id:"learning",label:"Learning Path"},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Palatino Linotype',Georgia,serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"0 20px 80px"}}>
      <div style={{width:"100%",maxWidth:860,paddingTop:24}}>
        <div style={{borderBottom:`1px solid ${C.border}`,paddingBottom:16,marginBottom:22}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:"0.22em",textTransform:"uppercase",fontFamily:"system-ui,sans-serif",marginBottom:4}}>Precious Ajayi · IELTS + Proficiency Prep</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <h1 style={{fontSize:20,letterSpacing:"-0.02em",margin:0}}>Language Exam Engine</h1>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {sessions.length>0&&<span style={{fontSize:10,color:C.muted,fontFamily:"system-ui,sans-serif"}}>{sessions.length} session{sessions.length!==1?"s":""} recorded</span>}
              {sessions.length>0&&<button onClick={resetData} style={{fontSize:9,color:C.muted,background:"none",border:`1px solid ${C.border}`,padding:"3px 8px",cursor:"pointer",fontFamily:"system-ui,sans-serif",letterSpacing:"0.1em",textTransform:"uppercase"}}>Reset</button>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,marginBottom:22,flexWrap:"wrap"}}>
          {tabs.map(t=><TabBtn key={t.id} label={t.label} active={tab===t.id} onClick={()=>setTab(t.id)} badge={t.badge}/>)}
        </div>
        {tab==="practice"&&<PracticeView sessions={sessions} onSessionComplete={onSessionComplete}/>}
        {tab==="progress"&&<ProgressView sessions={sessions}/>}
        {tab==="weak"&&<WeakAreasView sessions={sessions}/>}
        {tab==="learning"&&<LearningPathView sessions={sessions}/>}
      </div>
    </div>
  );
}