import { RouterProvider } from "react-router-dom";
import { router } from "./router.jsx";
import AuthProvider from "../features/auth/AuthProvider.jsx";
import I18nProvider from "../i18n/I18nProvider.jsx";

/* The root component. Routing (which screen shows for which URL) lives in router.jsx. */
export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </AuthProvider>
  );
}
