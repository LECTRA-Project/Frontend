import { RouterProvider } from "react-router-dom";
import { router } from "./router.jsx";
import AuthProvider from "../features/auth/AuthProvider.jsx";

/* The root component. Routing (which screen shows for which URL) lives in router.jsx. */
export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
