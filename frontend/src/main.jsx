import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";
import Caller from "./pages/Caller.jsx";

const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const isCallerRoute = pathname === "/caller";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isCallerRoute ? <Caller /> : <App />}
  </StrictMode>
);
