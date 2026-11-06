// The feedback form mounted as an MCP App view: the host hands it the
// feedback_form result (the model's draft) and proxies Send to submit_feedback.
import "@aicolab/ui-solid/styles.css";
import "../../theme/cartography.css";
import "../views.css";
import "./feedback.css";
import { mountMcpAppView } from "../shell.tsx";
import { FeedbackView } from "./FeedbackView.tsx";

const root = document.getElementById("view");
if (!root) throw new Error("the view has no root element");

void mountMcpAppView({ name: "ABS Data feedback", version: "0.1.0" }, root, (state) => (
  <FeedbackView host={state.host} result={state.result()} input={state.input()} />
));
