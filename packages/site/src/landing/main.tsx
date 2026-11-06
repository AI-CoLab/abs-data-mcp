import "@aicolab/ui-solid/styles.css";
import "../theme/cartography.css";
import { render } from "@solidjs/web";
import { Landing } from "./Landing.tsx";

const root = document.getElementById("app");
if (!root) throw new Error("the page has no #app element");
render(() => <Landing />, root);
