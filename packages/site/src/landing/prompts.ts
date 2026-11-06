/** Example questions for the "Try it" section — each answerable from the connector alone. */
export const PROMPTS: { label: string; text: string }[] = [
  {
    label: "Prices",
    text: "Using ABS Data, what's the latest annual change in the CPI for Sydney, and how does it compare with the weighted average of the eight capital cities?",
  },
  {
    label: "Rents",
    text: "Using ABS Data, compare rents across Australia's eight capital cities: the latest index and the change over the past year, ranked.",
  },
  {
    label: "A suburb",
    text: "Using ABS Data, build a dossier for Fitzroy, Victoria, at SA2 level: population history, age profile and dwelling approvals over the last five years.",
  },
  {
    label: "Jobs",
    text: "Using ABS Data, how has Tasmania's unemployment rate moved over the last five years? Show the series key you used.",
  },
  {
    label: "Census",
    text: "Using ABS Data, which tables have 2021 Census data on languages spoken at home by local government area?",
  },
  {
    label: "The metadata gap",
    text: "Using ABS Data, why does ABS's metadata imply 23.8 times more data than actually exists? Show me one example table.",
  },
];
