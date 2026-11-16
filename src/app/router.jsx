import { createBrowserRouter, Navigate } from "react-router-dom";

import SignInPage from "../features/auth/SignInPage.jsx";
import CreateAccountPage from "../features/auth/CreateAccountPage.jsx";
import ForgetPasswordPage from "../features/auth/ForgetPasswordPage.jsx";
import ResetPasswordPage from "../features/auth/ResetPasswordPage.jsx";
import { GuestOnly, RequireAuth } from "../features/auth/RouteGuards.jsx";
import WorkspaceLayout from "../features/workspace/WorkspaceLayout.jsx";
import ChatPage from "../features/workspace/pages/ChatPage.jsx";
import ExamPage from "../features/workspace/pages/ExamPage.jsx";
import ProjectPage from "../features/workspace/pages/ProjectPage.jsx";
import ProjectsPage from "../features/workspace/pages/ProjectsPage.jsx";
import MyProfilePage from "../features/profile/MyProfilePage.jsx";
import AccountSettingsPage from "../features/profile/AccountSettingsPage.jsx";
import StatisticsPage from "../features/statistics/StatisticsPage.jsx";

/*
  All screens of the app and their URLs.

  Guests only (signed-in users are sent on to a new chat in the workspace):
  /                    Sign in
  /create-account      Create account
  /forget-password     Request a password reset link
  /reset-password      Choose a new password

  Signed-in users only (guests are sent to sign-in):
  /workspace           Study workspace with the chat in the centre (notebook and viewer beside it);
                       without ?chat= it is a new chat, where sign-in lands
  /workspace/exam      Study workspace with the Exam view in place of the chat
                       (?project=<id>: the project's materials preselected)
  /workspace/projects  All projects (?page=2: 30 per page)
  /workspace/projects/<id>  A project: its materials and chats, and a box that starts a chat in it
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
        // The child route is rendered in the centre of WorkspaceLayout (<Outlet />).
        children: [
          { index: true, element: <ChatPage /> },
          { path: "exam", element: <ExamPage /> },
          { path: "projects", element: <ProjectsPage /> },
          { path: "projects/:projectId", element: <ProjectPage /> },
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
