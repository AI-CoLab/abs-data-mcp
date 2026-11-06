import "@aicolab/ui-solid/styles.css";
import "../theme/cartography.css";
import "./admin.css";
import { render } from "@solidjs/web";
import { Admin } from "./Admin.tsx";

const root = document.getElementById("app");
if (!root) throw new Error("the page has no #app element");
render(() => <Admin />, root);
