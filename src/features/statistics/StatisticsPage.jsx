import PageShell from "../../components/PageShell.jsx";
import OverviewCards from "./OverviewCards.jsx";
import ExamPerformance from "./ExamPerformance.jsx";
import CourseCompletion from "./CourseCompletion.jsx";
import { useI18n } from "../../i18n/i18n.js";

/*
  Statistics: only the student's own numbers, from the backend.
    - Overall (OverviewCards.jsx, GET /api/stats/overview): exams, average score, pages read,
      study streak and questions asked.
    - Exam performance (ExamPerformance.jsx, GET /api/stats/exams): the average per week
      (PerformanceChart.jsx), per lecture and question type, the weakest concepts with
      "Practice this", and the history. It comes right after the overall cards, whose first
      two cards (exams taken, average score) it explains in detail.
    - Course completion (CourseCompletion.jsx, GET /api/stats/completion): per lecture.
*/
export default function StatisticsPage() {
  const { t } = useI18n();
  return (
    <PageShell title={t("Statistics")} subtitle={t("How you are doing across your lectures and exams.")}>
      <OverviewCards />
      <ExamPerformance />
      <CourseCompletion />
    </PageShell>
  );
}
