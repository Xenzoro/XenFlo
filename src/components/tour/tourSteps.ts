/** The tour's stops, in order. `selector` finds the element to spotlight. */
export interface TourStep {
  id: string;
  selector: string;
  title: string;
  text: string;
  /** Only shown once scrape results are on screen */
  needsResults?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "scrape",
    selector: '[data-tour="scrape"]',
    title: "Start with your website",
    text: "Paste your web address and Flo reads your most important pages first, politely and within the site's rules. You can dig deeper after.",
  },
  {
    id: "tabs",
    selector: '[data-tour="tabs"] [role="tablist"]',
    title: "Everything Flo found",
    text: "Your knowledge is sorted into tabs. Click any value to edit it, or a dashed + pill to add something new.",
    needsResults: true,
  },
  {
    id: "health",
    selector: '[data-tour="health"]',
    title: "Knowledge Health",
    text: "Your score out of 100. The Next to do cards show what to add for the biggest boost.",
    needsResults: true,
  },
  {
    id: "advanced",
    selector: '[data-tour="advanced"]',
    title: "Advanced view",
    text: "Turn this on for insights, the content kit, sources, raw JSON and a badge on every field showing where it came from.",
    needsResults: true,
  },
  {
    id: "save",
    selector: '[data-tour="save"]',
    title: "Save it",
    text: "Saving stores a new version under Saved. Flo uses it to write posts, emails and blogs that sound like you.",
    needsResults: true,
  },
];
