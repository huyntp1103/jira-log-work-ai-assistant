// Content script: runs on *.atlassian.net pages.
// Only job: capture the Jira domain and save it for the extension.

const domain = window.location.hostname;
chrome.storage.sync.set({ jiraDomain: domain });
console.log(`[Jira Report] Domain captured: ${domain}`);
