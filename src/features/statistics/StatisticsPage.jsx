import PageShell from "../../components/PageShell.jsx";
import OverviewCards from "./OverviewCards.jsx";
import CourseCompletion from "./CourseCompletion.jsx";
import { useI18n } from "../../i18n/i18n.js";

/*
  Statistics: only the student's own numbers, from the backend.
    - Overall (OverviewCards.jsx, GET /api/stats/overview): exams, average score, pages read,
      study streak and questions asked.
    - Course completion (CourseCompletion.jsx, GET /api/stats/completion): per lecture.
  PerformanceChart.jsx (a line chart of scores per week) is not shown yet; it is kept for
  the weekly exam averages.
*/
export default function StatisticsPage() {
  const { t } = useI18n();
  return (
    <PageShell title={t("Statistics")} subtitle={t("How you are doing across your lectures and exams.")}>
      <OverviewCards />
      <CourseCompletion />
    </PageShell>
  );
}
