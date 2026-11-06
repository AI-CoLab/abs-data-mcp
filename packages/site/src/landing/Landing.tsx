/**
 * The front door's landing page: what the connector is, how to add it to the AI
 * tool you use, what to ask it, and how to tell us what to improve.
 */
import "./landing.css";
import {
  Accordion,
  AccordionItem,
  ButtonLink,
  FeatureGrid,
  Segmented,
  Steps,
  ThemeToggle,
  ToastHost,
} from "@aicolab/ui-solid";
import { createSignal, For, onSettled, Show } from "solid-js";
import { stored } from "../shared/copy.ts";
import { claudeInstallUrl, connectorUrl, REGISTRY_NAME, REPOSITORY_URL } from "../shared/connector.ts";
import { FeedbackForm } from "./FeedbackForm.tsx";
import { type Guide, guideFor, isToolId, type ToolId, TOOLS } from "./guides.tsx";
import { CopyBlock, CopyLine, DensityKey, Mark, StatusLine } from "./parts.tsx";
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
        <Connect />
        <TryIt />
        <Different />
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
        <a class="lp-wordmark" href="/" aria-label="ABS Data, observed — home">
          <Mark size={26} />
          <span>
            ABS Data <span class="lp-wordmark-dot">·</span> <span class="lp-wordmark-sub">observed</span>
          </span>
        </a>
        <nav class="lp-nav" aria-label="Page">
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
          <p class="lp-eyebrow">Australian Bureau of Statistics · MCP connector</p>
          <h1 id="hero-title">Give your AI assistant the ABS's data — only the parts that exist.</h1>
          <p class="lp-lede">
            1,227 tables and 621,536,714 series, every option confirmed to serve data by retrieval. ABS's metadata
            implies 23.8 times more than exists; this connector offers only what does. Free, public, no sign-in.
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
        <aside class="lp-legend" aria-label="The connector at a glance">
          <p class="lp-legend-title">Legend</p>
          <CopyLine label="Connector URL" value={connectorUrl()} copied="Connector URL copied" />
          <p class="lp-legend-note">Paste it into your AI tool's connector settings. No account, no key.</p>
          <DensityKey />
          <StatusLine />
        </aside>
      </div>
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
          Pick yours. It takes about a minute and nothing is installed — the connector runs on the web, and your
          assistant asks it questions.
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
          Copy one into a chat with the connector switched on. The connector also ships ready-made prompts —{" "}
          <code>suburb_dossier</code>, <code>compare_capitals</code> and <code>explain_metadata_gap</code> — and, in
          tools that show them, charts of the data right in the chat.
        </p>
      </header>
      <ul class="lp-prompts">
        <For each={PROMPTS}>
          {(prompt) => (
            <li class="lp-prompt">
              <CopyBlock label={prompt.label} value={prompt.text} copied="Prompt copied" prose />
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

function Different() {
  return (
    <section class="lp-section" aria-labelledby="why-title">
      <header class="lp-section-head">
        <p class="lp-eyebrow">Why it's different</p>
        <h2 id="why-title">Mapped by retrieval, not by the documentation</h2>
        <p class="lp-section-lede">
          ABS's per-dimension metadata is exact, but multiplied together it implies combinations that don't exist. This
          connector was built from a full crawl of what the API actually serves.
        </p>
      </header>
      <FeatureGrid
        columns={3}
        iconPlacement="inline"
        items={[
          {
            title: "Only what exists",
            body: <p>Every table and option was confirmed to serve data. Nothing comes from documentation alone.</p>,
            accent: "var(--carto-observed)",
          },
          {
            title: "Checked before it's fetched",
            body: <p>Each selection is verified live against ABS, so a call that succeeds returns real numbers.</p>,
            accent: "var(--carto-observed)",
          },
          {
            title: "Errors that help",
            body: <p>Ask for an option that doesn't exist and the answer lists the ones that do, so your assistant can correct itself.</p>,
            accent: "var(--carto-accent)",
          },
          {
            title: "Provenance on every answer",
            body: <p>Each response names the crawl it answers from, and the exact ABS URL for the complete pull.</p>,
            accent: "var(--carto-accent)",
          },
          {
            title: "Kept fresh",
            body: <p>A daily check compares a seventh of the tables with ABS's live availability — all of them each week.</p>,
            accent: "var(--carto-declared)",
          },
          {
            title: "One map, many doors",
            body: (
              <p>
                The same catalogue as an MCP connector, an <a href="/api/docs">HTTP API</a>, a typed TypeScript SDK and a{" "}
                <a href="/catalogue">browsable catalogue</a>.
              </p>
            ),
            accent: "var(--carto-declared)",
          },
        ]}
      />
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
          A wrong-looking number, a table you expected, a guide that didn't match your screen — all of it helps.
        </p>
      </header>
      <div class="lp-feedback-grid">
        <FeedbackForm />
        <aside class="lp-feedback-aside">
          <div class="lp-aside-card">
            <h3>Or ask your assistant</h3>
            <p>
              With the connector on, say something like{" "}
              <em>“Send feedback to the ABS connector: the CPI table had no Darwin series for 2024.”</em> It shows you the
              draft before anything is sent.
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
            An independent, unofficial front door to the ABS Data API — not an ABS product, and not endorsed by the
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
