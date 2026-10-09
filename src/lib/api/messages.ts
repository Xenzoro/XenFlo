/*
  Friendly, non-technical wording for every error code the API can return.
  The server's own message is shown underneath as detail when it adds something.
*/
export interface FriendlyError {
  title: string;
  text: string;
}

export const ERROR_MESSAGES: Record<string, FriendlyError> = {
  INVALID_URL: { title: "That address doesn't look right", text: "Check the spelling and try again, for example yourbusiness.com." },
  TIMEOUT: { title: "The website took too long to answer", text: "It might be slow or busy right now. Try again in a minute." },
  UNREACHABLE: { title: "We couldn't reach that website", text: "Make sure the address is correct and the site is online." },
  BLOCKED_ROBOTS: { title: "This site limits automated access", text: "Its robots.txt file asks bots like ours not to read it, so we stopped." },
  BLOCKED_ACCESS: { title: "This site blocked our request", text: "The website refused automated access (it may use bot protection)." },
  HTTP_ERROR: { title: "The website returned an error", text: "The page didn't load properly. Try again, or check the address." },
  NO_CONTENT: { title: "We couldn't find readable content", text: "The site may be built in a way we can't read yet (for example, all text inside images)." },
  CONFLICT: { title: "Someone saved a newer version", text: "Reload the saved record to see the latest changes before saving again." },
  NOT_FOUND: { title: "That knowledge base no longer exists", text: "It may have been deleted. Save again to create a new one." },
  NOT_CONFIGURED: { title: "Saving isn't set up", text: "The database connection is missing. Add the Supabase keys to .env.local." },
  NETWORK: { title: "You seem to be offline", text: "We couldn't reach XenFlo. Check your connection and try again." },
};

const FALLBACK: FriendlyError = { title: "Something went wrong", text: "Please try again." };

export function friendlyError(code: string): FriendlyError {
  return ERROR_MESSAGES[code] ?? FALLBACK;
}

/** Codes that should offer the upload fallback instead of a retry. */
export const BLOCKED_CODES = new Set(["BLOCKED_ROBOTS", "BLOCKED_ACCESS"]);
