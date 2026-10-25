import { RouterProvider } from "react-router-dom";
import { router } from "./router.jsx";

/* The root component. Routing (which screen shows for which URL) lives in router.jsx. */
export default function App() {
  return <RouterProvider router={router} />;
}
