import { Link } from "react-router-dom";

import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { useApi } from "../../api/useApi.js";
import { getOverview } from "../../api/services/statistics.js";
import { DWELL_MS } from "../lectures/readingTracker.js";
import { t, useI18n } from "../../i18n/i18n.js";
import {
  chatsText,
  isNewStudent,
  lastActivityText,
  numberText,
  pagesTotalText,
  questionsAnsweredText,
  streakText,
} from "./overviewText.js";
import "./overviewCards.css";

/*
  Statistics → "Overall": five cards with the student's own numbers (GET /api/stats/overview).

    Exams taken       12      58 questions answered
    Average score     68%     61% of answers correct      ("—" without a graded exam)
    Pages read        214     of 340 pages in your materials
    Study streak      5 days  Last activity today / yesterday / on 12 Nov (UTC days, like the streak)
    Questions asked   87      in 14 chats

  Zeros are shown as they are once the student has done anything. A new student (no
  lectures, no activity) sees how to start instead of a row of zeros: upload a lecture,
  read it, take an exam (only the upload has a link: an exam needs a lecture first). While loading the cards keep their place; an error shows the
  message with "Try again".
*/

// The card labels, in their order (also shown while loading).
const LABELS = [
  () => t("Exams taken"),
  () => t("Average score"),
  () => t("Pages read"),
  () => t("Study streak"),
  () => t("Questions asked"),
];

function cards(overview, now) {
  const average = overview.average_score_percent;
  const correct = overview.correct_percent;
  return [
    {
      value: numberText(overview.exams_taken),
      note: overview.exams_taken ? questionsAnsweredText(overview.questions_answered ?? 0) : t("No exam submitted yet"),
    },
    {
      value:
        typeof average === "number" ? (
          t("{percent}%", { percent: average })
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="visually-hidden">{t("no score yet")}</span>
          </>
        ),
      note: typeof correct === "number" ? t("{percent}% of answers correct", { percent: correct }) : t("No graded exam yet"),
    },
    { value: numberText(overview.pages_read), note: pagesTotalText(overview.pages_total) },
    { value: streakText(overview.current_streak), note: lastActivityText(overview.last_activity_at, now) },
    { value: numberText(overview.questions_asked), note: chatsText(overview.chats) },
  ];
}

function Card({ label, value, note }) {
  return (
    <div className="overview__card">
      <dt className="overview__label">{label}</dt>
      <dd className="overview__value">{value}</dd>
      <dd className="overview__note">{note}</dd>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="overview__cards overview__cards--loading" aria-hidden="true">
      {LABELS.map((label) => (
        <div key={label()} className="overview__card">
          <span className="overview__label">{label()}</span>
          <span className="overview__placeholder overview__placeholder--value" />
          <span className="overview__placeholder" />
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  {
    icon: "upload",
    title: () => t("Upload a lecture"),
    text: () => t("A PDF, slides, a notebook or an image, in a chat."),
    link: { to: "/workspace", label: () => t("Upload a lecture") },
  },
  {
    icon: "book",
    title: () => t("Read it"),
    text: () => t("A page counts once it has been on screen for {seconds} seconds.", { seconds: DWELL_MS / 1000 }),
  },
  {
    icon: "graduation",
    title: () => t("Take an exam"),
    text: () => t("Questions written from your own materials, checked at once."),
  },
];

function GettingStarted() {
  return (
    <div className="overview__empty">
      <p className="overview__empty-title">{t("Your numbers will show here")}</p>
      <p className="overview__empty-text">{t("Start in three steps:")}</p>
      <ol className="overview__steps">
        {STEPS.map((step, index) => (
          <li key={step.icon} className="overview__step">
            <span className="overview__step-icon" aria-hidden="true">
              <Icon name={step.icon} size={18} />
            </span>
            <span className="overview__step-body">
              <span className="overview__step-title">
                <span className="visually-hidden">{t("Step {number}:", { number: index + 1 })} </span>
                {step.title()}
              </span>
              <span className="overview__step-text">{step.text()}</span>
            </span>
            {step.link && (
              <Link to={step.link.to} className="btn btn--primary btn--sm overview__step-link">
                {step.link.label()}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* The numbers, with the moment they came: "today" in the card is the day they were counted. */
async function loadOverview(options) {
  const overview = await getOverview(options);
  return { overview, loadedAt: new Date() };
}

export default function OverviewCards() {
  useI18n(); // re-render in a new interface language
  const { data: loaded, error, loading, refetch } = useApi(loadOverview, { immediate: true });
  const data = loaded?.overview;

  let body;
  if (loading) {
    body = (
      <>
        <p className="visually-hidden" role="status">
          {t("Loading your overall numbers…")}
        </p>
        <Skeleton />
      </>
    );
  } else if (error) {
    body = (
      <div className="overview__error" role="alert">
        <p>{error.message || t("Unable to load your overall numbers.")}</p>
        <Button size="sm" icon="refresh" onClick={() => refetch().catch(() => {})}>
          {t("Try again")}
        </Button>
      </div>
    );
  } else if (isNewStudent(data)) {
    body = <GettingStarted />;
  } else if (data) {
    const values = cards(data, loaded.loadedAt);
    body = (
      <dl className="overview__cards">
        {LABELS.map((label, index) => (
          <Card key={label()} label={label()} {...values[index]} />
        ))}
      </dl>
    );
  }

  return (
    <section className="overview" aria-labelledby="overview-title" aria-busy={loading || undefined}>
      <h2 id="overview-title" className="overview__title">
        {t("Overall")}
      </h2>
      {body}
    </section>
  );
}
