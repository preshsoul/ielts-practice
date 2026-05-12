export const PRACTICE_MODULES = {
  listening: {
    title: "Listening",
    summary: "Listen once, catch the correction, and write the answer you can defend.",
    timerSeconds: 60,
    prompts: [
      {
        id: "listening-1",
        title: "Answer type prediction",
        prompt: "Before the section starts, identify the answer type for each blank: number, name, date, or place.",
        modelAnswer: "A strong answer names the expected format before listening begins.",
        feedback: "This is the fastest way to stop obvious traps.",
      },
      {
        id: "listening-2",
        title: "Self-correction trap",
        prompt: "A speaker says Tuesday, then corrects themselves to Wednesday. Which answer do you write?",
        modelAnswer: "Wednesday.",
        feedback: "Always keep the final corrected detail, not the first version.",
      },
      {
        id: "listening-3",
        title: "Word limit check",
        prompt: "The instruction says NO MORE THAN TWO WORDS. Is 'the river bank' valid?",
        modelAnswer: "No. It has three words.",
        feedback: "Word limits are strict and include articles.",
      },
    ],
  },
  writing: {
    title: "Writing",
    summary: "Plan fast, write clearly, and stay on task from the first sentence.",
    timerSeconds: 120,
    prompts: [
      {
        id: "writing-1",
        title: "Task 1 overview",
        prompt: "Write a one-sentence overview for a chart that rises steadily while a second line declines.",
        modelAnswer: "Overall, the first measure increased steadily, while the second fell over the same period.",
        feedback: "This trains the overview line, not the full essay.",
      },
      {
        id: "writing-2",
        title: "Task 2 thesis",
        prompt: "State a clear opinion on whether governments should fund university tuition.",
        modelAnswer: "Governments should fund tuition because access to education is a public good.",
        feedback: "A direct position makes the rest of the essay easier to control.",
      },
      {
        id: "writing-3",
        title: "Register check",
        prompt: "Rewrite this line in a formal register: 'Kids need loads of help to pass.'",
        modelAnswer: "Students require substantial support in order to succeed.",
        feedback: "Avoid informal vocabulary and vague phrasing.",
      },
    ],
  },
  speaking: {
    title: "Speaking",
    summary: "Answer clearly, keep moving, and finish a thought cleanly.",
    timerSeconds: 90,
    prompts: [
      {
        id: "speaking-1",
        title: "Part 1 warm-up",
        prompt: "Describe your daily study routine and what helps you stay consistent.",
        modelAnswer: "A strong answer is short, fluent, and specific about habits.",
        feedback: "Keep it natural and stable.",
      },
      {
        id: "speaking-2",
        title: "Part 2 cue card",
        prompt: "Describe a time you solved a problem under pressure.",
        modelAnswer: "Use a quick structure: situation, action, result, and lesson.",
        feedback: "Give one vivid example and keep the pace steady.",
      },
      {
        id: "speaking-3",
        title: "Part 3 expansion",
        prompt: "Why do deadlines change the way people communicate?",
        modelAnswer: "Deadlines make people more direct, more selective, and less tolerant of unnecessary detail.",
        feedback: "Answer the why, not just the what.",
      },
    ],
  },
};

export function getPracticeModule(module) {
  return PRACTICE_MODULES[module] || PRACTICE_MODULES.listening;
}
