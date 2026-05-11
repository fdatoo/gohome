import { useTheme } from "./theme/provider";
import { DashboardSlug } from "./routes/_authed/dashboards/$slug";
import { Login } from "./routes/login";

export default function App() {
  const { mode } = useTheme();
  const path = window.location.pathname;
  if (path === "/login") {
    return <Login />;
  }
  if (path.startsWith("/dashboards/")) {
    return <DashboardSlug slug={decodeURIComponent(path.slice("/dashboards/".length))} />;
  }
  return (
    <div>
      <p>gohome — theme: {mode}</p>
    </div>
  );
}
