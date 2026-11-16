import { ok } from "./helpers.jsx";
import { daysAgo, lectureFixture } from "./chatBackend.js";

/*
  A small in-memory Exams API for the exam tests: start, read (polled while generating),
  list, discard, submit (graded by `grade` below) and regrade. Install it on a MockAdapter;
  the returned state can be changed and inspected by a test.
*/

export const KI02 = lectureFixture("l-ki02", "KI 02 Classification Part1", { count: 65 });
export const KI03 = lectureFixture("l-ki03", "KI 03 Classification Part2", { count: 40 });
export const SLIDES = lectureFixture("l-slides", "Search slides", { fileType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", status: "processing" });

export const QUESTIONS = [
  {
    id: "q1",
    position: 1,
    type: "multiple_choice",
    question: "Which split does Hunt's algorithm choose at a node?",
    choices: [
      { id: "a", text: "The attribute with the most values" },
      { id: "b", text: "The test that gives the purest subsets" },
      { id: "c", text: "A random attribute" },
      { id: "d", text: "A test that lowers the impurity" },
    ],
    points: 1,
    lecture_id: KI02.id,
    source_pages: [12, 13],
  },
  { id: "q2", position: 2, type: "short_answer", question: "When does a node become a leaf?", choices: null, points: 3, lecture_id: KI02.id, source_pages: [11] },
  {
    id: "q3",
    position: 3,
    type: "multiple_choice",
    question: "What is the impurity of a pure node?",
    choices: [
      { id: "a", text: "0" },
      { id: "b", text: "1" },
    ],
    points: 1,
    lecture_id: KI02.id,
    source_pages: [20],
  },
];

/*
  The questions after the first three, for exams of 5 to 10 questions (QUESTIONS stays the
  3-question exam most tests use): a short answer, then multiple choice.
*/
export const MORE_QUESTIONS = [
  { id: "q-4", position: 4, type: "short_answer", question: "What does the Gini index measure?", choices: null, points: 2, lecture_id: KI02.id, source_pages: [24] },
  ...Array.from({ length: 6 }, (_, offset) => ({
    id: `q-${offset + 5}`,
    position: offset + 5,
    type: "multiple_choice",
    question: `Which statement about split ${offset + 5} is true?`,
    choices: [
      { id: "a", text: `Split ${offset + 5} lowers the impurity` },
      { id: "b", text: `Split ${offset + 5} raises the impurity` },
    ],
    points: 1,
    lecture_id: KI02.id,
    source_pages: [30 + offset],
  })),
];
const ALL_QUESTIONS = [...QUESTIONS, ...MORE_QUESTIONS];

// What the backend keeps for grading: the correct choices, the reference answers and the rubrics.
export const SOLUTIONS = {
  "q-4": { correct_choice_ids: null, reference_solution: "How mixed the classes in a node are.", rubric: [{ id: "c1", description: "Names the impurity", points: 2 }] },
  ...Object.fromEntries(
    MORE_QUESTIONS.slice(1).map((question) => [question.id, { correct_choice_ids: ["a"], reference_solution: "It lowers the impurity.", rubric: [{ id: "c1", description: "Selects the correct choices", points: 1 }] }])
  ),
  q1: { correct_choice_ids: ["b", "d"], reference_solution: "The test that gives the **purest** subsets.", rubric: [{ id: "c1", description: "Selects the correct choices", points: 1 }] },
  q2: {
    correct_choice_ids: null,
    reference_solution: "When all records have the same class, or no attribute is left.",
    rubric: [
      { id: "c1", description: "Names the pure-node case", points: 2 },
      { id: "c2", description: "Names the case without attributes", points: 1 },
    ],
  },
  q3: { correct_choice_ids: ["a"], reference_solution: "A pure node has impurity 0.", rubric: [{ id: "c1", description: "Selects the correct choices", points: 1 }] },
};

export function examFixture(id, { status = "ready", count = 3, ready, title = KI02.title, error = null, createdAt = daysAgo(0), lectures = [{ lecture_id: KI02.id, title: KI02.title }] } = {}) {
  return {
    id,
    title,
    status,
    question_count: count,
    questions_ready: ready ?? (status === "ready" || status === "submitted" ? count : 0),
    lectures,
    error,
    total_points: null,
    max_points: null,
    score_percent: null,
    questions_ungraded: 0,
    created_at: createdAt,
    updated_at: createdAt,
    submitted_at: null,
  };
}

/* A question's `result` as GET /exams/{id} gives it once the exam is submitted. */
export function resultFixture(question, overrides = {}) {
  const solution = SOLUTIONS[question.id] ?? { correct_choice_ids: null, reference_solution: "", rubric: [] };
  const lecture = question.lecture_id ? [KI02, KI03].find((item) => item.id === question.lecture_id) : null;
  return {
    answer_text: null,
    selected_choice_ids: null,
    answered: true,
    graded: true,
    verdict: "correct",
    points: question.points,
    max_points: question.points,
    feedback: "Correct.",
    scores: solution.rubric.map((criterion) => ({ criterion_id: criterion.id, description: criterion.description, points: criterion.points, max_points: criterion.points, justification: "Fine." })),
    corrected: false,
    correction_comment: null,
    correct_choice_ids: solution.correct_choice_ids,
    reference_solution: solution.reference_solution,
    sources: question.source_pages.map((page) => ({
      lecture_id: lecture?.id ?? null,
      lecture_title: lecture?.title ?? null,
      page_number: page,
      source_type: "page",
      location: `Page ${page}`,
    })),
    ...overrides,
  };
}

/* A submitted exam: right, partly right (corrected), wrong, and not answered from a deleted lecture. */
export function submittedExam({ ungraded = false } = {}) {
  const [q1, q2, q3] = QUESTIONS;
  const q4 = { id: "q4", position: 4, type: "short_answer", question: "What does *entropy* measure?", choices: null, points: 2, lecture_id: null, source_pages: [44] };
  const questions = [
    { ...q1, result: resultFixture(q1, { selected_choice_ids: ["b", "d"], feedback: "Correct. The test that gives the **purest** subsets." }) },
    {
      ...q2,
      result: ungraded
        ? resultFixture(q2, { answer_text: "When all records have one class", graded: false, verdict: null, points: null, feedback: null, scores: [] })
        : resultFixture(q2, {
            answer_text: "When all records have one class",
            verdict: "partially_correct",
            points: 2.5,
            feedback: "You named the **main case**.",
            scores: [
              { criterion_id: "c1", description: "Names the pure-node case", points: 2, max_points: 2, justification: "Named clearly." },
              { criterion_id: "c2", description: "Names the case without attributes", points: 0.5, max_points: 1, justification: "Only hinted at." },
            ],
            corrected: true,
            correction_comment: "Half a point for the hint at the attributes.",
          }),
    },
    { ...q3, result: resultFixture(q3, { selected_choice_ids: ["b"], verdict: "incorrect", points: 0, feedback: "You selected b, the correct answer is a." }) },
    {
      ...q4,
      result: {
        ...resultFixture(q4, { answer_text: "", answered: false, verdict: "incorrect", points: 0, feedback: "Not answered. Disorder.", reference_solution: "The disorder of the class labels." }),
        sources: [{ lecture_id: null, lecture_title: null, page_number: 44, source_type: "page", location: "Page 44" }],
      },
    },
  ];
  return {
    ...examFixture("e-done", { status: "submitted", count: 4, title: "KI 02 and KI 03", lectures: [{ lecture_id: KI02.id, title: KI02.title }, { lecture_id: null, title: "Entropy (deleted)" }] }),
    submitted_at: daysAgo(0),
    max_points: 7,
    total_points: ungraded ? null : 3.5,
    score_percent: ungraded ? null : 50,
    questions_ungraded: ungraded ? 1 : 0,
    questions,
  };
}

/*
  The fake's grading: multiple choice by the choices (all right: correct, some: partly,
  none: wrong); a short answer containing "class" is partly correct (2 of 3), any other
  text wrong; nothing is "Not answered.". With `state.ungradable`, short answers stay
  ungraded until a regrade.
*/
function grade(question, answer, state) {
  const solution = SOLUTIONS[question.id];
  const base = { ...resultFixture(question), answer_text: null, selected_choice_ids: null };
  if (question.type === "multiple_choice") base.selected_choice_ids = answer?.selected_choice_ids ?? [];
  else base.answer_text = answer?.answer_text ?? "";
  if (!answer) {
    return { ...base, answered: false, verdict: "incorrect", points: 0, feedback: `Not answered. ${solution.reference_solution}`, scores: base.scores.map((score) => ({ ...score, points: 0, justification: "Not answered." })) };
  }
  if (question.type === "short_answer" && state.ungradable) return { ...base, graded: false, verdict: null, points: null, feedback: null, scores: [] };
  if (question.type === "multiple_choice") {
    const right = answer.selected_choice_ids.filter((id) => solution.correct_choice_ids.includes(id)).length;
    const wrong = answer.selected_choice_ids.length - right;
    const share = Math.max(0, (right - wrong) / solution.correct_choice_ids.length);
    const verdict = share === 1 ? "correct" : share > 0 ? "partially_correct" : "incorrect";
    return { ...base, verdict, points: share * question.points, feedback: verdict === "correct" ? "Correct." : `You selected ${answer.selected_choice_ids.join(", ")}.` };
  }
  if (question.id === "q-4") {
    const right = answer.answer_text.includes("mixed");
    return { ...base, verdict: right ? "correct" : "incorrect", points: right ? 2 : 0, feedback: right ? "Correct." : "That is not what the Gini index measures." };
  }
  const partly = answer.answer_text.includes("class");
  return {
    ...base,
    verdict: partly ? "partially_correct" : "incorrect",
    points: partly ? 2 : 0,
    feedback: partly ? "You named the **main case**. The lecture also stops when no attribute is left." : "That is not when a node becomes a leaf.",
    scores: [
      { criterion_id: "c1", description: "Names the pure-node case", points: partly ? 2 : 0, max_points: 2, justification: partly ? "Named." : "Missing." },
      { criterion_id: "c2", description: "Names the case without attributes", points: 0, max_points: 1, justification: "Missing." },
    ],
  };
}

function totals(exam) {
  const results = exam.questions.map((question) => question.result);
  const ungraded = results.filter((result) => !result.graded).length;
  const max = exam.questions.reduce((sum, question) => sum + question.points, 0);
  const total = ungraded > 0 ? null : results.reduce((sum, result) => sum + result.points, 0);
  return { max_points: max, total_points: total, score_percent: total === null ? null : Math.round((100 * total) / max), questions_ungraded: ungraded };
}

/*
  A generating exam gets one more question on every read, in order (QUESTIONS, then
  MORE_QUESTIONS), and every read returns the questions written so far, like the backend.
  It becomes ready once `question_count` are written. An exam given with `questions` keeps
  them (e.g. a submitted exam with its results).

  state.paused       reads don't write a question; state.advance(id) writes the next one
  state.failAt       generation fails instead of writing question number `failAt`
                     (the questions before it stay, the exam can't be submitted)
  state.finalCount   the exam is ready with this many questions (the others failed)

  state.submitGate   a promise the submit waits for (to see the grading state)
  state.submitError  [status, body] to answer the submit with (regradeError: the regrade)
  state.ungradable   short answers can't be graded (until regrade, when it is false again)
*/
export function installExamBackend(api, { exams = [], startError = null } = {}) {
  const state = {
    exams: exams.map((item) => ({ ...item })),
    started: [],
    deleted: [],
    submitted: [],
    regraded: [],
    reads: 0,
    nextId: 1,
    startError,
    paused: false,
    failAt: null,
    finalCount: null,
    submitGate: null,
    submitError: null,
    regradeError: null,
    ungradable: false,
  };
  const idAt = (config, fromEnd = 1) => config.url.split("/").at(-fromEnd);
  const find = (id) => state.exams.find((item) => item.id === id);
  const summary = (exam) => {
    const { questions: _questions, ...rest } = exam;
    return rest;
  };
  const written = (exam) => ALL_QUESTIONS.slice(0, Math.max(0, exam.questions_ready));
  const withQuestions = (exam) => (exam.questions ? exam : { ...exam, questions_ready: Math.max(0, exam.questions_ready), questions: written(exam) });
  // One more question, or the end of the generation (ready, or failed with `failAt`).
  const writeNext = (exam) => {
    if (exam.status !== "generating") return;
    if (state.failAt !== null && exam.questions_ready + 1 >= state.failAt) {
      exam.status = "failed";
      exam.error = "Not enough questions could be generated. Please try again in a minute";
      return;
    }
    const target = Math.min(state.finalCount ?? exam.question_count, exam.question_count);
    if (exam.questions_ready < target) exam.questions_ready += 1;
    if (exam.questions_ready >= target) exam.status = "ready";
  };
  state.advance = (id, count = 1) => {
    for (let step = 0; step < count; step += 1) writeNext(find(id));
  };

  api.onGet("/exams").reply(() => [200, ok({ exams: state.exams.map(summary), page: 1, page_size: 100, total: state.exams.length, total_pages: 1 })]);
  api.onGet(/\/exams\/[^/]+$/).reply((config) => {
    const exam = find(idAt(config));
    if (!exam) return [404, { status: false, message: "Exam not found", data: null }];
    state.reads += 1;
    if (!state.paused) writeNext(exam);
    return [200, ok(withQuestions(exam))];
  });
  api.onPost("/exams").reply((config) => {
    const body = JSON.parse(config.data);
    state.started.push(body);
    if (state.startError) return state.startError;
    const exam = examFixture(`e-new-${state.nextId++}`, { status: "generating", count: body.question_count });
    exam.questions_ready = -1; // the first read after starting still shows 0 ready
    state.exams.unshift(exam);
    return [202, ok({ ...exam, questions_ready: 0 }, "The exam is being generated")];
  });
  api.onDelete(/\/exams\/[^/]+$/).reply((config) => {
    const exam = find(idAt(config));
    if (!exam) return [404, { status: false, message: "Exam not found", data: null }];
    state.deleted.push(exam.id);
    state.exams = state.exams.filter((item) => item !== exam);
    return [200, ok({ id: exam.id }, "Exam deleted")];
  });
  api.onPost(/\/exams\/[^/]+\/submit$/).reply(async (config) => {
    const exam = find(idAt(config, 2));
    const body = JSON.parse(config.data);
    state.submitted.push({ id: exam?.id, ...body });
    if (state.submitGate) await state.submitGate;
    if (state.submitError) return state.submitError;
    if (!exam) return [404, { status: false, message: "Exam not found", data: null }];
    if (exam.status !== "ready") return [409, { status: false, message: "This exam was already submitted", data: null }];
    const questions = written(exam).map((question) => ({
      ...question,
      result: grade(question, body.answers.find((answer) => answer.task_id === question.id), state),
    }));
    Object.assign(exam, { status: "submitted", submitted_at: new Date().toISOString(), questions });
    Object.assign(exam, totals(exam));
    return [200, ok(summary(exam), "Exam submitted and graded")];
  });
  api.onPost(/\/exams\/[^/]+\/regrade$/).reply((config) => {
    const exam = find(idAt(config, 2));
    state.regraded.push(exam?.id);
    if (state.regradeError) return state.regradeError;
    if (!exam) return [404, { status: false, message: "Exam not found", data: null }];
    if (exam.questions_ungraded === 0) return [409, { status: false, message: "Every answer of this exam is graded already", data: null }];
    if (state.ungradable) return [200, ok(summary(exam), "Exam graded")];
    exam.questions = exam.questions.map((question) =>
      question.result.graded ? question : { ...question, result: grade(question, { task_id: question.id, answer_text: question.result.answer_text }, state) }
    );
    Object.assign(exam, totals(exam));
    return [200, ok(summary(exam), "Exam graded")];
  });
  return state;
}
