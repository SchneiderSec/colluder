import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setNonce } from "get-nonce";
import "./index.css";
import App from "./App";
import { applyTypeScale, readTypeScale } from "./lib/typeScale";
import "./lib/display"; // the theme, inks and motion, before the first paint

// Radix's scroll lock injects a <style> tag; the server's CSP allows it only with this per-load nonce.
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
if (nonce && nonce !== "__CSP_NONCE__") setNonce(nonce);

applyTypeScale(readTypeScale(), false);

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
