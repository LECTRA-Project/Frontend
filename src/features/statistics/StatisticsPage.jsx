import PageShell from "../../components/PageShell.jsx";
import PerformanceChart from "./PerformanceChart.jsx";
import { useI18n } from "../../i18n/i18n.js";
import { SAMPLE_PERFORMANCE } from "../../data/sampleStatistics.js";
import "./statistics.css";

/*
  Statistics — overall performance graph.
  The values are SAMPLE DATA (src/data/sampleStatistics.js), clearly labelled on screen.
*/
export default function StatisticsPage() {
  const { t } = useI18n();
  return (
    <PageShell title={t("Statistics")} subtitle={t("Your overall performance over time.")}>
      <section className="card stats" aria-labelledby="perf-title">
        <div className="stats__head">
          <div>
            <h2 id="perf-title" className="card__title">
              {t("Overall performance")}
            </h2>
            <p className="card__subtitle">{t("Average score per week")}</p>
          </div>
          <span className="pill pill--dashed">{t("Sample data — illustrative only")}</span>
        </div>

        <PerformanceChart data={SAMPLE_PERFORMANCE} />

        <p className="stats__note">{t("Values are demo placeholders and do not represent real student results.")}</p>
      </section>
    </PageShell>
  );
}
