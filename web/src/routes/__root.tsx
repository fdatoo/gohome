import { Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/theme/provider";
import "@/theme/index.css";

export function RootLayout() {
  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
