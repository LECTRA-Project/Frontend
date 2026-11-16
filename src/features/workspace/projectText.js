import { dateLocale } from "../../i18n/i18n.js";

/* A project's or chat's last activity: "16 Nov" (German "16. Nov."), with the year when it isn't this year. */
export function activityDate(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day: "numeric", month: "short" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(dateLocale("en-GB"), options);
}
