import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./extra.css";
import { AppProvider, useApp, type Route } from "./lib/store";
import { Shell } from "./components/Shell";
import { Splash } from "./components/Splash";
import { DialogHost, ToastHost } from "./components/ui";
import { Mission } from "./mission/Mission";

const START: Record<string, Route> = { Home: { name: "home" }, Installations: { name: "installations" }, Explore: { name: "explore" }, Servers: { name: "servers" } };

function Launcher() {
  const app = useApp();
  const [booting, setBooting] = useState(true);
  return (
    <>
      <Shell />
      <DialogHost />
      <ToastHost />
      {booting && <Splash onDone={() => { setBooting(false); const r = START[app.settings.startOn]; if (r && r.name !== "home") app.navigate(r); }} />}
    </>
  );
}

const isMission = new URLSearchParams(location.search).get("view") === "mission";
createRoot(document.getElementById("root")!).render(
  <StrictMode>{isMission ? <Mission /> : <AppProvider><Launcher /></AppProvider>}</StrictMode>,
);
