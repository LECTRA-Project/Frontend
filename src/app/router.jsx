import { createBrowserRouter, Navigate } from "react-router-dom";

import SignInPage from "../features/auth/SignInPage.jsx";
import CreateAccountPage from "../features/auth/CreateAccountPage.jsx";
import ForgetPasswordPage from "../features/auth/ForgetPasswordPage.jsx";
import ResetPasswordPage from "../features/auth/ResetPasswordPage.jsx";
import { GuestOnly, RequireAuth } from "../features/auth/RouteGuards.jsx";
import WorkspaceLayout from "../features/workspace/WorkspaceLayout.jsx";
import NotebookPage from "../features/workspace/pages/NotebookPage.jsx";
import ExamPage from "../features/workspace/pages/ExamPage.jsx";
import MyProfilePage from "../features/profile/MyProfilePage.jsx";
import AccountSettingsPage from "../features/profile/AccountSettingsPage.jsx";
import StatisticsPage from "../features/statistics/StatisticsPage.jsx";

/*
  All screens of the app and their URLs.

  Guests only (signed-in users are sent on to the workspace):
  /                    Sign in
  /create-account      Create account
  /forget-password     Request a password reset link
  /reset-password      Choose a new password

  Signed-in users only (guests are sent to sign-in):
  /workspace           Study workspace with the Notebook in the centre
  /workspace/exam      Study workspace with the Exam view in the centre
  /profile             My profile
  /settings            Account settings
  /statistics          Statistics
*/
export const routes = [
  {
    element: <GuestOnly />,
    children: [
      { path: "/", element: <SignInPage /> },
      { path: "/create-account", element: <CreateAccountPage /> },
      { path: "/forget-password", element: <ForgetPasswordPage /> },
    ],
  },
  // Reset links must work even when a user still has an authenticated session.
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/workspace",
        element: <WorkspaceLayout />,
        // The child route is rendered in the centre panel of WorkspaceLayout (<Outlet />).
        children: [
          { index: true, element: <NotebookPage /> },
          { path: "exam", element: <ExamPage /> },
        ],
      },
      { path: "/profile", element: <MyProfilePage /> },
      { path: "/settings", element: <AccountSettingsPage /> },
      { path: "/statistics", element: <StatisticsPage /> },
    ],
  },
  // Unknown URLs go back to sign-in.
  { path: "*", element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
