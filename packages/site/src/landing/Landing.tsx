/**
 * The front door's landing page, person first (DESIGN.md decision 36): ask the
 * question you actually have; how that works (Declare, Investigate, Generate);
 * why it's needed (public isn't the same as accessible); how to add it to the AI
 * tool you use; things to ask; the case for whoever has to approve it; feedback.
 * The framing follows the "From available to accessible" workshop (6 Nov 2026).
 */
import "./landing.css";
import { Accordion, AccordionItem, ButtonLink, Segmented, Steps, ThemeToggle, ToastHost } from "@aicolab/ui-solid";
import { createSignal, For, onSettled, Show } from "solid-js";
import { stored } from "../shared/copy.ts";
import { claudeInstallUrl, connectorUrl, origin, REGISTRY_NAME, REPOSITORY_URL } from "../shared/connector.ts";
import { FeedbackForm } from "./FeedbackForm.tsx";
import { type Guide, guideFor, isToolId, type ToolId, TOOLS } from "./guides.tsx";
import { CopyBlock, CopyLine, Mark } from "./parts.tsx";
import { PROMPTS } from "./prompts.ts";

const TOOL_KEY = "abs-data:tool";

export function Landing() {
  return (
    <>
      <a class="lp-skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <HowItWorks />
        <WhyItHelps />
        <Connect />
        <TryIt />
        <ForApprovers />
        <Feedback />
      </main>
      <Footer />
      <ToastHost />
    </>
  );
}

function Header() {
  return (
    <header class="lp-top">
      <div class="lp-top-inner">
        <a class="lp-wordmark" href="/" aria-label="ABS Data — home">
          <Mark size={26} />
          <span>
            ABS Data <span class="lp-wordmark-sub">for your AI assistant</span>
          </span>
        </a>
        <nav class="lp-nav" aria-label="Page">
          <a href="#how">How it works</a>
          <a href="#connect">Connect</a>
          <a href="#try">Try it</a>
          <a href="#feedback">Feedback</a>
        </nav>
        <nav class="lp-nav lp-nav-out" aria-label="Elsewhere">
          <a href="/catalogue">Catalogue</a>
          <a href="/api/docs">API docs</a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <ThemeToggle class="lp-theme" size="sm" variant="ghost" colorBase="neutral" />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section class="lp-hero" aria-labelledby="hero-title">
      <div class="lp-hero-grid" aria-hidden="true" />
      <div class="lp-hero-inner">
        <div class="lp-hero-words">
          <p class="lp-eyebrow">Australian Bureau of Statistics data · for your AI assistant</p>
          <h1 id="hero-title">Ask the question you actually have.</h1>
          <p class="lp-lede">
            Say what you care about. Your AI assistant finds the right ABS data, fetches it live, and explains it — with
            its caveats. It works in Claude, ChatGPT and Copilot, and it's free.
          </p>
          <div class="lp-hero-actions">
            <ButtonLink href={claudeInstallUrl()} target="_blank" rel="noreferrer" class="lp-cta-main">
              Add to Claude
            </ButtonLink>
            <ButtonLink href="#connect" variant="outline" class="lp-cta-main">
              Other AI tools ↓
            </ButtonLink>
          </div>
        </div>
        <aside class="lp-legend" aria-label="Adding the connector">
          <p class="lp-legend-title">One web address</p>
          <CopyLine label="Connector URL" value={connectorUrl()} copied="Connector URL copied" />
          <p class="lp-legend-note">
            Add it to the AI tool you already use. No account, no key, nothing to install.
          </p>
          <ul class="lp-facts">
            <li>
              <span>
                <strong>Anonymous.</strong> No sign-in; nothing about you is needed.
              </span>
            </li>
            <li>
              <span>
                <strong>Read-only.</strong> It looks things up and can't change anything.
              </span>
            </li>
            <li>
              <span>
                <strong>Live from the ABS.</strong> Every number comes with its source.
              </span>
            </li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

const DIG = [
  {
    letter: "D",
    tag: "You speak, it listens",
    title: "Say what you care about",
    body: "Who you are, what you're trying to decide, and why. You don't need to know which dataset, code or table — just describe the problem.",
  },
  {
    letter: "I",
    tag: "Your AI as librarian",
    title: "It finds and fetches",
    body: "Your assistant works out which ABS tables bear on your question, picks the places and time periods, and pulls the latest figures live from the ABS.",
  },
  {
    letter: "G",
    tag: "It speaks, you listen",
    title: "An answer in your terms",
    body: "An explanation shaped by what you said matters to you, with every number traceable to its ABS source and the caveats spelled out.",
  },
];

function HowItWorks() {
  return (
    <section id="how" class="lp-section" aria-labelledby="how-title">
      <header class="lp-section-head">
        <p class="lp-eyebrow">How it works</p>
        <h2 id="how-title">Declare, investigate, generate</h2>
        <p class="lp-section-lede">
          You only do the first step. The words you use to ask pick the data, then shape the answer.
        </p>
      </header>
      <ol class="lp-dig">
        <For each={DIG}>
          {(step) => (
            <li class="lp-dig-step">
              <span class="lp-dig-letter" aria-hidden="true">
                {step.letter}
              </span>
              <p class="lp-dig-tag">{step.tag}</p>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          )}
        </For>
      </ol>
      <p class="lp-plainline">
        If what you ask for isn't published, it says so and tells you what is — rather than guessing.
      </p>
    </section>
  );
}

const STALLS = [
  {
    title: "Finding",
    was: "Knowing the dataset exists, and what it's called.",
    now: "Describe the problem; your assistant searches the ABS's 1,227 tables for you.",
  },
  {
    title: "Retrieving",
    was: "Choosing the right codes, places and time periods.",
    now: "It picks them, and checks the figures exist before it fetches them.",
  },
  {
    title: "Interpreting",
    was: "Knowing what a number means, and what it doesn't.",
    now: "It explains the measure and its caveats in plain words.",
  },
  {
    title: "Applying",
    was: "Connecting the numbers back to the question you had.",
    now: "The answer is about your question, not the dataset's.",
  },
];

function WhyItHelps() {
  return (
    <section id="why" class="lp-section" aria-labelledby="why-title">
      <header class="lp-section-head">
        <p class="lp-eyebrow">Why it helps</p>
        <h2 id="why-title">Public isn't the same as accessible</h2>
        <p class="lp-section-lede">
          ABS data is free and open. But between publication and an answer there are four places people get stuck —
          whether they're designing policy, evaluating a program, delivering a service, doing research, or trying to
          understand their own situation.
        </p>
      </header>
      <ol class="lp-stalls">
        <For each={STALLS}>
          {(stall, i) => (
            <li class="lp-stall">
              <span class="lp-stall-n" aria-hidden="true">
                {i() + 1}
              </span>
              <h3>{stall.title}</h3>
              <p class="lp-stall-was">{stall.was}</p>
              <p class="lp-stall-now">{stall.now}</p>
            </li>
          )}
        </For>
      </ol>
      <blockquote class="lp-quote">
        <p>
          Available is a property of the data. Accessible is a property of the relationship between the data and the
          person.
        </p>
      </blockquote>
    </section>
  );
}

function initialTool(): ToolId {
  const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
  if (isToolId(hash)) return hash;
  const remembered = stored.get(TOOL_KEY);
  return remembered && isToolId(remembered) ? remembered : "claude";
}

function Connect() {
  const [tool, setTool] = createSignal<ToolId>(initialTool());
  const choose = (next: ToolId, updateHash = true) => {
    setTool(next);
    stored.set(TOOL_KEY, next);
    if (updateHash) history.replaceState(null, "", `#${next}`);
  };
  onSettled(() => {
    // Arriving at /#chatgpt (or following an in-page link to a guide) opens it.
    const hash = window.location.hash.slice(1);
    if (isToolId(hash)) document.getElementById("connect")?.scrollIntoView();
    const onHash = () => {
      const next = window.location.hash.slice(1);
      if (isToolId(next)) {
        choose(next, false);
        document.getElementById("connect")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
  return (
    <section id="connect" class="lp-section lp-connect" aria-labelledby="connect-title">
      <header class="lp-section-head">
        <p class="lp-eyebrow">Connect</p>
        <h2 id="connect-title">Add it to the AI tool you use</h2>
        <p class="lp-section-lede">
          One web address, added to an AI tool you already have. Pick yours — it takes about a minute, and nothing is
          installed.
        </p>
      </header>
      <div class="lp-picker">
        <Segmented label="Your AI tool" options={TOOLS} value={tool()} onChange={(next) => choose(next)} />
      </div>
      <Show when={tool()} keyed>
        {(id) => <GuideView guide={guideFor(id)} />}
      </Show>
    </section>
  );
}

function GuideView(props: { guide: Guide }) {
  const g = props.guide;
  return (
    <article class="lp-guide" id={`guide-${g.id}`} role="tabpanel" aria-label={g.title}>
      <header class="lp-guide-head">
        <h3>{g.title}</h3>
        <p class="lp-guide-who">{g.who}</p>
        <ul class="lp-plans" aria-label="Who can use this">
          <For each={g.plans}>{(plan) => <li>{plan}</li>}</For>
        </ul>
        <Show when={g.notice}>{(notice) => notice()()}</Show>
      </header>
      <div class="lp-guide-grid">
        <div class="lp-guide-main">
          <For each={g.routes}>
            {(route) => (
              <section class="lp-route">
                <Show when={route.heading}>{(heading) => <h3 class="lp-route-h">{heading()}</h3>}</Show>
                <Show when={route.intro}>{route.intro}</Show>
                <Show when={route.actions}>
                  {(actions) => <div class="lp-actions">{actions()()}</div>}
                </Show>
                <Steps
                  variant="rail"
                  node="sm"
                  class="lp-steps"
                  steps={route.steps.map((step) => ({
                    title: step.title,
                    body: (
                      <>
                        {step.body}
                        {step.screenshot ? (
                          <figure class="lp-shot">
                            <img src={step.screenshot.src} alt={step.screenshot.alt} loading="lazy" />
                          </figure>
                        ) : null}
                      </>
                    ),
                  }))}
                />
              </section>
            )}
          </For>
        </div>
        <aside class="lp-guide-aside" aria-label={`${g.title}: checks and help`}>
          <CopyBlock label="Check it worked — ask" value={g.check} copied="Question copied" prose />
          <Show when={g.snippets}>
            {(snippets) => (
              <For each={snippets()}>{(s) => <CopyBlock label={s.label} value={s.value} copied={`${s.label} copied`} />}</For>
            )}
          </Show>
          <Show when={g.ask}>
            {(ask) => <CopyBlock label={ask().label} value={ask().message} copied="Message copied" prose />}
          </Show>
          <div class="lp-trouble">
            <h4>If something's not right</h4>
            <Accordion spacing="joined" density="compact">
              <For each={g.troubleshooting}>
                {(item) => <AccordionItem summary={item.q}>{item.a}</AccordionItem>}
              </For>
            </Accordion>
          </div>
        </aside>
      </div>
    </article>
  );
}

function TryIt() {
  return (
    <section id="try" class="lp-section" aria-labelledby="try-title">
      <header class="lp-section-head">
        <p class="lp-eyebrow">Try it</p>
        <h2 id="try-title">Things to ask</h2>
        <p class="lp-section-lede">
          Start with who you are and what you care about, not which dataset. Copy one into a chat with the connector
          switched on — in tools that show them, charts of the data appear right in the chat.
        </p>
      </header>
      <ul class="lp-prompts">
        <For each={PROMPTS}>
          {(prompt) => (
            <li class="lp-prompt">
              <CopyBlock label={prompt.label} value={prompt.text} copied="Question copied" prose />
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

const forwardable = (): string => `ABS Data — a connector for our AI tool

What it is: one web address that lets an AI tool we already use (Claude, ChatGPT or Copilot) answer questions with the Australian Bureau of Statistics' public data, fetched live, with the source for each number.

Low risk: anonymous, read-only access to data that is already public (ABS, CC BY 4.0). No sign-in, and nothing about the person asking is needed.
Low complexity: not new software and not a chatbot — a web address added to an AI tool we've already approved.
High impact: a statistical librarian for anyone who can describe a problem.

What it can change: nothing. Every tool only reads, except an optional feedback tool, which shows the person the message and asks before sending it.

Connector URL: ${connectorUrl()}
Setup guides for each AI tool: ${origin()}/#connect`;

function ForApprovers() {
  return (
    <section id="approvers" class="lp-section" aria-labelledby="approvers-title">
      <header class="lp-section-head">
        <p class="lp-eyebrow">For managers and IT</p>
        <h2 id="approvers-title">Low risk, low complexity, high impact</h2>
        <p class="lp-section-lede">
          In many organisations someone has to switch connectors on. This is the case for doing it, written to be
          forwarded.
        </p>
      </header>
      <div class="lp-approve">
        <div>
          <ul class="lp-three">
            <li>
              <strong>Low risk</strong>
              <span>Anonymous, read-only access to data that's already public.</span>
            </li>
            <li>
              <strong>Low complexity</strong>
              <span>One web address, added to an AI tool you've already approved.</span>
            </li>
            <li>
              <strong>High impact</strong>
              <span>A statistical librarian for everyone who can describe a problem.</span>
            </li>
          </ul>
          <p class="lp-tagline">Not new software. Not a chatbot. A door from an approved AI tool to trusted information.</p>
        </div>
        <div class="lp-approve-side">
          <dl class="lp-approve-facts">
            <div>
              <dt>What it connects to</dt>
              <dd>The Australian Bureau of Statistics' public data, licensed CC BY 4.0.</dd>
            </div>
            <div>
              <dt>What it's sent</dt>
              <dd>Lookups from the AI tool — a table, the places and periods wanted. No sign-in, no personal details.</dd>
            </div>
            <div>
              <dt>What it can change</dt>
              <dd>
                Nothing. Every tool only reads, except an optional feedback tool, which shows the person the message and
                asks before sending.
              </dd>
            </div>
            <div>
              <dt>How to switch it on</dt>
              <dd>
                <a href="#claude-org">Claude Team and Enterprise</a> · <a href="#chatgpt">ChatGPT workspaces</a> ·{" "}
                <a href="#copilot">Microsoft 365 Copilot</a>
              </dd>
            </div>
          </dl>
          <CopyBlock label="Summary to forward" value={forwardable()} copied="Summary copied" prose />
        </div>
      </div>
    </section>
  );
}

function Feedback() {
  return (
    <section id="feedback" class="lp-section lp-feedback-section" aria-labelledby="feedback-title">
      <header class="lp-section-head">
        <p class="lp-eyebrow">Feedback</p>
        <h2 id="feedback-title">Tell us what to improve</h2>
        <p class="lp-section-lede">
          A number that looks wrong, a table you expected, a guide that didn't match your screen — all of it helps.
        </p>
      </header>
      <div class="lp-feedback-grid">
        <FeedbackForm />
        <aside class="lp-feedback-aside">
          <div class="lp-aside-card">
            <h3>Or ask your assistant</h3>
            <p>
              With the connector on, say something like{" "}
              <em>“Send feedback to the ABS Data connector: it couldn't find rents for Darwin.”</em> It shows you the draft
              before anything is sent.
            </p>
          </div>
          <div class="lp-aside-card lp-notice">
            <h3>What happens to it</h3>
            <p>
              <strong>What's kept:</strong> what you write, the AI tool you name, your email if you give one, the date, and
              the connector version. Your IP address isn't stored — only a salted hash that changes daily, used to stop
              abuse.
            </p>
            <p>
              <strong>Who sees it:</strong> the people who maintain this connector. Reports about ABS's data are passed on
              to ABS only if you tick the box.
            </p>
            <p>
              <strong>Removal:</strong> send a note through this form quoting your reference, and we'll delete it.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer class="lp-footer">
      <div class="lp-footer-inner">
        <div class="lp-footer-brand">
          <Mark size={22} />
          <p>
            An independent, unofficial connector to the ABS Data API — not an ABS product, and not endorsed by the
            Australian Bureau of Statistics. Data: Australian Bureau of Statistics, CC BY 4.0.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul class="lp-footer-links">
            <li>
              <a href="/catalogue">Catalogue</a>
            </li>
            <li>
              <a href="/api/docs">API docs</a>
            </li>
            <li>
              <a href="/api/openapi.json">OpenAPI</a>
            </li>
            <li>
              <a href="/api/status">Status (JSON)</a>
            </li>
            <li>
              <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
        </nav>
        <p class="lp-footer-meta">
          MCP Registry: <code>{REGISTRY_NAME}</code>
        </p>
      </div>
    </footer>
  );
}
