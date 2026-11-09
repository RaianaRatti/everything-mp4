import { Navigate, Outlet, createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { SettingsButton } from "./components/SettingsButton";
import { Home } from "./routes/Home";
import { tools } from "./tools/registry";

function Root() {
  return (
    <>
      <Outlet />
      <SettingsButton />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <Home /> },
      ...tools.map((tool) => ({
        path: `/${tool.id}`,
        lazy: () => tool.load().then((m) => ({ Component: m.default })),
      })),
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
