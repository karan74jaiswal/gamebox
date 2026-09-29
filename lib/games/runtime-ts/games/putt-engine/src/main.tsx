import { createRoot } from "react-dom/client";
import { CenteredWorldExperience } from "./components/centered-world-experience";
import { hintMintCdn } from "./lib/mint-world-preload";
import "./globals.css";

hintMintCdn();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Putt Engine root element is missing.");
}

createRoot(root).render(<CenteredWorldExperience />);
