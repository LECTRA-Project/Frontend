import { RouterProvider } from "react-router-dom";
import { router } from "./router.jsx";
import AuthProvider from "../features/auth/AuthProvider.jsx";
import I18nProvider from "../i18n/I18nProvider.jsx";
import ThemeProvider from "../theme/ThemeProvider.jsx";

/* The root component. Routing (which screen shows for which URL) lives in router.jsx. */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
