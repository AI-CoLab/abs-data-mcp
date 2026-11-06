/**
 * Example questions for the "Try asking" section, written the way the workshop
 * taught: say who you are and what you care about, not which dataset. Each is
 * answerable from the connector alone.
 */
export const PROMPTS: { label: string; text: string }[] = [
  {
    label: "Cost of living",
    text: "I'm a financial counsellor. Many of the working families I see say they're going backwards. Using ABS Data, do the official numbers back that up — prices against wages, and which kinds of households are under the most pressure? Tell me what I shouldn't over-claim.",
  },
  {
    label: "Planning a service",
    text: "I manage a community health service in Western Sydney. Using ABS Data, how has our local population and its age mix changed over the last decade, and what does that suggest we should plan for?",
  },
  {
    label: "Housing policy",
    text: "I'm a policy officer working on housing. Using ABS Data, how have rents moved across the capital cities over the past few years, and where has the change been sharpest?",
  },
  {
    label: "A move",
    text: "I'm thinking of moving from Melbourne to Hobart. Using ABS Data, how do prices, rents and the jobs market compare between the two? Keep it plain.",
  },
  {
    label: "A classroom",
    text: "I'm a teacher preparing a lesson about my suburb, Fitzroy in Victoria. Using ABS Data, what does the 2021 Census say about the languages people speak at home there?",
  },
  {
    label: "Understanding a number",
    text: "Using ABS Data, explain what the unemployment rate actually measures — and what it doesn't — then show me how it has moved over the past year.",
  },
];
