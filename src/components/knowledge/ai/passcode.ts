/** The live AI passcode, kept for this browser tab only (shared by Enrich with AI and Read menus with AI). */
const PASSCODE_KEY = "xenflo.aiPasscode";

// sessionStorage can throw (private mode, blocked storage): treat that as "nothing saved".
export const readPasscode = () => {
  try {
    return window.sessionStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
};

export const savePasscode = (value: string) => {
  try {
    window.sessionStorage.setItem(PASSCODE_KEY, value);
  } catch {
    // not saved; the user types it again next time
  }
};
