import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import PageShell from "../../components/PageShell.jsx";
import OverviewCards from "./OverviewCards.jsx";
import ExamPerformance from "./ExamPerformance.jsx";
import CourseCompletion from "./CourseCompletion.jsx";
import ProjectPicker from "./ProjectPicker.jsx";
import { useI18n } from "../../i18n/i18n.js";

/*
  Statistics: only the student's own numbers, from the backend.
    - Project (ProjectPicker.jsx): all projects, or one project; kept in the URL
      (?project=<id>), so a reload or a shared link keeps it. Every section below then
      loads that project's numbers.
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
  const [params, setParams] = useSearchParams();
  const projectId = params.get("project") || null;

  const chooseProject = useCallback(
    (id, { replace = false, dropped = false } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (id) next.set("project", id);
          else next.delete("project");
          return next;
        },
        { replace, state: dropped ? { droppedProject: true } : null }
      );
    },
    [setParams]
  );

  // A new project loads every section again.
  const key = projectId ?? "all";
  return (
    <PageShell title={t("Statistics")} subtitle={t("How you are doing across your lectures and exams.")}>
      <ProjectPicker projectId={projectId} onChange={chooseProject} />
      <OverviewCards key={`overview-${key}`} projectId={projectId} />
      <ExamPerformance key={`exams-${key}`} projectId={projectId} />
      <CourseCompletion key={`completion-${key}`} projectId={projectId} />
    </PageShell>
  );
}
