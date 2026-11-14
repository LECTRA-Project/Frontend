/* German interface texts: English text → German. See src/i18n/i18n.js. */
export default {
  // Kernel status
  "Kernel: ": "Kernel: ",
  "Loading Python…": "Python wird geladen …",
  "Starting Python…": "Python wird gestartet …",
  "Busy · loading packages": "Beschäftigt · Pakete werden geladen",
  "Busy": "Beschäftigt",
  "Running code. {version}": "Code wird ausgeführt. {version}",
  "Error": "Fehler",
  "Idle": "Bereit",
  "Unavailable": "Nicht verfügbar",
  "Not started": "Nicht gestartet",
  "The last cell raised an error. The kernel is still running. {version}":
    "Die letzte Zelle hat einen Fehler ausgelöst. Der Kernel läuft weiter. {version}",
  "Python is ready. {version}": "Python ist bereit. {version}",
  "Python starts when the notebook opens.": "Python startet, wenn das Notebook geöffnet wird.",
  "Python {pythonVersion} (Pyodide {pyodideVersion}), running in your browser.":
    "Python {pythonVersion} (Pyodide {pyodideVersion}), läuft in deinem Browser.",

  // Progress messages
  "Downloading Python…": "Python wird heruntergeladen …",
  "Loading the package installer (micropip)…": "Paketinstallation (micropip) wird geladen …",
  "Loading {packages} (included with Pyodide)…": "{packages} wird geladen (in Pyodide enthalten) …",
  "Loading {packages}…": "{packages} wird geladen …",
  "Installing {packages}…": "{packages} wird installiert …",

  // Kernel start errors
  "Python did not finish loading within {seconds} seconds. Check your internet connection (Python is downloaded from the Pyodide CDN) and retry.":
    "Python wurde nicht innerhalb von {seconds} Sekunden fertig geladen. Prüfe deine Internetverbindung (Python wird vom Pyodide-CDN heruntergeladen) und versuche es erneut.",
  "This browser could not start a Python worker: {error}": "Dieser Browser konnte keinen Python-Worker starten: {error}",
  "Python could not be loaded: {error}": "Python konnte nicht geladen werden: {error}",
};
