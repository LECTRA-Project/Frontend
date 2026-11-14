import chat from "./chat.js";
import common from "./common.js";
import exam from "./exam.js";
import files from "./files.js";
import models from "./models.js";
import notebook from "./notebook.js";
import python from "./python.js";
import settings from "./settings.js";
import statistics from "./statistics.js";
import workspace from "./workspace.js";

/* All German texts, one file per area of the app (a text used in several areas may be in any of them). */
export default {
  ...common,
  ...settings,
  ...models,
  ...workspace,
  ...chat,
  ...notebook,
  ...python,
  ...exam,
  ...files,
  ...statistics,
};
