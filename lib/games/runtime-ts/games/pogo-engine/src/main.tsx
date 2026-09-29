import { createRoot } from "react-dom/client";
import PogoMan from "./PogoMan";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Pogo Man root element is missing.");
}

createRoot(root).render(<PogoMan />);
