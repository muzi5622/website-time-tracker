// Object to store time spent on each website
let timeData = {};
let trackedDomains = [];
let lastUpdateTime = Date.now();

// Load saved data from storage when the extension starts
chrome.storage.local.get(["timeData", "trackedDomains"], (result) => {
  if (result.timeData) {
    timeData = result.timeData;
  }
  trackedDomains = result.trackedDomains || [];
  console.log("Initial trackedDomains:", trackedDomains);
  console.log("Initial timeData:", timeData);
});

// Function to get the hostname from a URL
function getHostname(url) {
  try {
    if (!url || !url.startsWith("http")) {
      console.warn(`Skipping unsupported URL: ${url}`);
      return null;
    }
    const parsedUrl = new URL(url);
    let hostname = parsedUrl.hostname;

    // Normalize common domains
    if (hostname.includes("youtube.com")) {
      hostname = "youtube.com";
    }

    console.log(`Extracted hostname: ${hostname} from URL: ${url}`);
    return hostname;
  } catch (e) {
    console.error(`Failed to parse URL: ${url}`, e);
    return null;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "resetTimeData") {
    timeData = {};
    chrome.storage.local.set({ timeData }, () => {
      sendResponse({ status: "reset complete" });
      console.log("Time data reset:", timeData);
    });
    return true;
  }
});

// Track time for all tabs in trackedDomains with elapsed time
setInterval(() => {
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - lastUpdateTime) / 1000);
  if (elapsedSeconds > 0) {
    chrome.tabs.query({}, (tabs) => {
      const trackedTabs = new Set();
      tabs.forEach((tab) => {
        const hostname = getHostname(tab.url);
        if (!hostname) return; // Skip invalid URLs
        
        if (trackedDomains.includes(hostname)) {
          trackedTabs.add(hostname);
          if (timeData[hostname] === undefined) {
            timeData[hostname] = 0;
            console.log(`Initialized time for ${hostname} to 0`);
          }
          timeData[hostname] += elapsedSeconds;
          console.log(`Updated time for ${hostname}: ${timeData[hostname]}s (tab ID: ${tab.id})`);
        } else {
          console.log(`Hostname ${hostname} not in trackedDomains: ${trackedDomains}`);
        }
      });

      trackedDomains.forEach((domain) => {
        if (!trackedTabs.has(domain) && timeData[domain] === undefined) {
          timeData[domain] = 0;
          console.log(`Initialized time for ${domain} to 0 (not currently open)`);
        }
      });

      chrome.storage.local.set({ timeData }, () => {
        console.log("Saved timeData to storage:", timeData);
      });
      lastUpdateTime = now;
    });
  }
}, 1000);

// Reset or update time when tabs are updated or removed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const hostname = getHostname(tab.url);
  if (hostname && changeInfo.status === "complete" && trackedDomains.includes(hostname)) {
    if (timeData[hostname] === undefined) {
      timeData[hostname] = 0;
      console.log(`Tab updated - Initialized time for ${hostname} to 0 (tab ID: ${tabId})`);
      chrome.storage.local.set({ timeData });
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // No action needed here, time tracking stops when tab is closed
});

// Sync trackedDomains and timeData when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.trackedDomains) {
    trackedDomains = changes.trackedDomains.newValue || [];
    console.log("Updated trackedDomains:", trackedDomains);
  }
  if (area === "local" && changes.timeData) {
    timeData = changes.timeData.newValue || {};
    console.log("Updated timeData:", timeData);
  }
});
