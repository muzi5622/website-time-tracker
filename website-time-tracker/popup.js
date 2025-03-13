document.addEventListener("DOMContentLoaded", () => {
  const timeList = document.getElementById("timeList");
  const homeButton = document.getElementById("homeButton");
  const resetButton = document.getElementById("resetButton");
  const settingsButton = document.getElementById("settingsButton");
  const domainsButton = document.getElementById("domainsButton");
  const settingsMenu = document.getElementById("settingsMenu");
  const domainsMenu = document.getElementById("domainsMenu");
  const domainInput = document.getElementById("domainInput");
  const addDomainButton = document.getElementById("addDomainButton");
  const domainList = document.getElementById("domainList");

  // Function to format time (e.g., "2h 15m 30s")
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    let timeStr = "";
    if (hours > 0) timeStr += `${hours}h `;
    if (minutes > 0 || hours > 0) timeStr += `${minutes}m `;
    timeStr += `${remainingSeconds}s`;
    return timeStr.trim();
  }

  // Store local time data and last sync timestamp
  let localTimeData = {};
  let lastSyncTime = Date.now();
  let trackedDomains = [];
  let lastUpdateTime = Date.now();

  // Load tracked domains from storage
  function loadTrackedDomains(callback) {
    chrome.storage.local.get(["trackedDomains"], (result) => {
      trackedDomains = result.trackedDomains || [];
      console.log("Loaded trackedDomains in popup:", trackedDomains);
      callback();
    });
  }

  // Function to sync with background data and update UI
  function syncAndUpdateUI() {
    chrome.storage.local.get(["timeData"], (result) => {
      const storedTimeData = result.timeData || {};
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastSyncTime) / 1000);

      // Update localTimeData with the latest from storage
      const updatedTimeData = {};
      for (const [hostname, seconds] of Object.entries(storedTimeData)) {
        if (trackedDomains.includes(hostname)) {
          updatedTimeData[hostname] = seconds;
        }
      }
      lastSyncTime = now;

      // Check if there are actual changes
      const hasChanges = JSON.stringify(localTimeData) !== JSON.stringify(updatedTimeData);
      localTimeData = updatedTimeData;

      if (!hasChanges && timeList.innerHTML !== "") return; // Skip UI update if no changes

      // Calculate max time for progress bars
      const maxTime = Math.max(...Object.values(localTimeData), 0) || 1;

      // Sort by time spent (descending)
      const sortedSites = Object.entries(localTimeData).sort((a, b) => b[1] - a[1]);

      // Update UI
      timeList.innerHTML = "";
      chrome.tabs.query({}, (tabs) => {
        const openHostnames = new Set(tabs.map(tab => {
          try {
            return new URL(tab.url).hostname;
          } catch (e) {
            console.error(`Failed to parse tab URL in popup: ${tab.url}`, e);
            return null;
          }
        }).filter(h => h));
        sortedSites.forEach(([hostname, seconds], index) => {
          const progressWidth = index === 0 ? 100 : Math.min((seconds / maxTime) * 80, 80); // Full for first, capped at 80% for others
          const li = document.createElement("li");
          li.innerHTML = `
            <div class="site-info">
              <span class="site-name">${hostname}</span>
              <span class="time-spent" data-hostname="${hostname}">${formatTime(seconds)}</span>
              ${!trackedDomains.includes(hostname) && openHostnames.has(hostname) ? 
                `<button class="add-to-list" data-hostname="${hostname}">Add to List</button>` : ""}
            </div>
            <div class="progress-bar">
              <div class="progress progress-${index + 1}" style="width: ${progressWidth}%"></div>
            </div>
          `;
          timeList.appendChild(li);
        });

        // Add event listeners to "Add to List" buttons
        document.querySelectorAll(".add-to-list").forEach(button => {
          button.addEventListener("click", () => {
            const hostname = button.dataset.hostname;
            if (!trackedDomains.includes(hostname)) {
              trackedDomains.push(hostname);
              chrome.storage.local.get(["timeData"], (result) => {
                const storedTimeData = result.timeData || {};
                storedTimeData[hostname] = 0;
                chrome.storage.local.set({ timeData: storedTimeData, trackedDomains }, syncAndUpdateUI);
              });
            }
          });
        });
      });
    });
  }

  // Real-time update function
  function startRealTimeUpdates() {
    loadTrackedDomains(() => {
      syncAndUpdateUI(); // Initial sync

      // Update UI every second for real-time display
      setInterval(() => {
        const now = Date.now();
        lastUpdateTime = now;
        syncAndUpdateUI();
      }, 1000); // Update every 1 second for real-time feel
    });
  }

  // Show main screen (hide menus)
  function showMainScreen() {
    settingsMenu.style.display = "none";
    domainsMenu.style.display = "none";
    timeList.style.display = "block";
  }

  // Reset button functionality
  resetButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "resetTimeData" }, () => {
      localTimeData = {};
      chrome.storage.local.set({ timeData: {} }, () => {
        syncAndUpdateUI();
        showMainScreen();
      });
    });
  });

  // Home button functionality
  homeButton.addEventListener("click", showMainScreen);

  // Settings menu toggle
  settingsButton.addEventListener("click", () => {
    settingsMenu.style.display = settingsMenu.style.display === "none" ? "block" : "none";
    domainsMenu.style.display = "none";
    timeList.style.display = "none";
  });

  // Domains menu toggle
  domainsButton.addEventListener("click", () => {
    domainsMenu.style.display = domainsMenu.style.display === "none" ? "block" : "none";
    settingsMenu.style.display = "none";
    timeList.style.display = "none";
    updateDomainList();
  });

  // Add domain to tracked list
  addDomainButton.addEventListener("click", () => {
    const domain = domainInput.value.trim();
    if (domain && !trackedDomains.includes(domain)) {
      trackedDomains.push(domain);
      chrome.storage.local.get(["timeData"], (result) => {
        const storedTimeData = result.timeData || {};
        storedTimeData[domain] = 0;
        chrome.storage.local.set({ timeData: storedTimeData, trackedDomains }, () => {
          updateDomainList();
          domainInput.value = "";
        });
      });
    }
  });

  // Update domain list in domains menu
  function updateDomainList() {
    domainList.innerHTML = "";
    trackedDomains.forEach(domain => {
      const li = document.createElement("li");
      li.textContent = domain;
      const removeButton = document.createElement("button");
      removeButton.textContent = "Remove";
      removeButton.className = "remove-domain";
      removeButton.addEventListener("click", () => {
        trackedDomains = trackedDomains.filter(d => d !== domain);
        chrome.storage.local.set({ trackedDomains }, updateDomainList);
      });
      li.appendChild(removeButton);
      domainList.appendChild(li);
    });
  }

  // Start real-time updates
  startRealTimeUpdates();
});