var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ConfluencePublisherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  confluenceUrl: "",
  destinations: [],
  authType: "pat",
  token: "",
  username: "",
  password: "",
  stripFrontmatter: true,
  titleSource: "frontmatter"
};
function migrateSettings(data) {
  const settings = Object.assign({}, DEFAULT_SETTINGS, data);
  if (!settings.destinations) {
    settings.destinations = [];
  }
  if (settings.spaceKey && settings.parentPageId && settings.destinations.length === 0) {
    settings.destinations.push({
      label: settings.spaceKey,
      spaceKey: settings.spaceKey,
      parentPageId: settings.parentPageId
    });
  }
  delete settings.spaceKey;
  delete settings.parentPageId;
  return settings;
}
var ConfluenceSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.authContainerEl = null;
    this.destinationsContainerEl = null;
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Confluence Publisher Settings" });
    this.addConnectionSection(containerEl);
    this.addDestinationsSection(containerEl);
    this.addAuthSection(containerEl);
    this.addPublishingSection(containerEl);
  }
  addConnectionSection(containerEl) {
    containerEl.createEl("h3", { text: "Connection" });
    new import_obsidian.Setting(containerEl).setName("Confluence URL").setDesc(
      "Base URL of your Confluence Server/DC instance (e.g. https://confluence.example.com)"
    ).addText(
      (text) => text.setPlaceholder("https://confluence.example.com").setValue(this.plugin.settings.confluenceUrl).onChange(async (value) => {
        this.plugin.settings.confluenceUrl = value.replace(
          /\/+$/,
          ""
        );
        await this.plugin.saveData(this.plugin.settings);
      })
    );
  }
  addDestinationsSection(containerEl) {
    containerEl.createEl("h3", { text: "Destinations" });
    containerEl.createEl("p", {
      text: "Configure one or more publish targets. You will choose a destination each time you publish.",
      cls: "setting-item-description"
    });
    this.destinationsContainerEl = containerEl.createDiv();
    this.renderDestinations();
    new import_obsidian.Setting(containerEl).addButton(
      (btn) => btn.setButtonText("Add destination").setCta().onClick(async () => {
        this.plugin.settings.destinations.push({
          label: "",
          spaceKey: "",
          parentPageId: ""
        });
        await this.plugin.saveData(this.plugin.settings);
        this.renderDestinations();
      })
    );
  }
  renderDestinations() {
    if (!this.destinationsContainerEl) return;
    this.destinationsContainerEl.empty();
    const dests = this.plugin.settings.destinations;
    for (let i = 0; i < dests.length; i++) {
      const dest = dests[i];
      const row = this.destinationsContainerEl.createDiv({
        cls: "confluence-destination-row"
      });
      row.style.border = "1px solid var(--background-modifier-border)";
      row.style.borderRadius = "6px";
      row.style.padding = "8px 12px";
      row.style.marginBottom = "8px";
      new import_obsidian.Setting(row).setName("Label").addText(
        (text) => text.setPlaceholder("e.g. Research Space").setValue(dest.label).onChange(async (value) => {
          dest.label = value.trim();
          await this.plugin.saveData(this.plugin.settings);
        })
      );
      new import_obsidian.Setting(row).setName("Space key").addText(
        (text) => text.setPlaceholder("RESEARCH").setValue(dest.spaceKey).onChange(async (value) => {
          dest.spaceKey = value.trim();
          await this.plugin.saveData(this.plugin.settings);
        })
      );
      new import_obsidian.Setting(row).setName("Parent page ID").addText(
        (text) => text.setPlaceholder("12345").setValue(dest.parentPageId).onChange(async (value) => {
          dest.parentPageId = value.trim();
          await this.plugin.saveData(this.plugin.settings);
        })
      );
      new import_obsidian.Setting(row).addButton(
        (btn) => btn.setButtonText("Delete").setWarning().onClick(async () => {
          this.plugin.settings.destinations.splice(i, 1);
          await this.plugin.saveData(this.plugin.settings);
          this.renderDestinations();
        })
      );
    }
  }
  addAuthSection(containerEl) {
    containerEl.createEl("h3", { text: "Authentication" });
    new import_obsidian.Setting(containerEl).setName("Authentication type").setDesc("Choose between Personal Access Token or Basic Auth").addDropdown(
      (dropdown) => dropdown.addOption("pat", "Personal Access Token").addOption("basic", "Basic Auth (username/password)").setValue(this.plugin.settings.authType).onChange(async (value) => {
        this.plugin.settings.authType = value;
        await this.plugin.saveData(this.plugin.settings);
        this.renderAuthFields();
      })
    );
    this.authContainerEl = containerEl.createDiv();
    this.renderAuthFields();
  }
  renderAuthFields() {
    if (!this.authContainerEl) {
      return;
    }
    this.authContainerEl.empty();
    if (this.plugin.settings.authType === "pat") {
      new import_obsidian.Setting(this.authContainerEl).setName("Personal Access Token").setDesc(
        "Generate a PAT in your Confluence profile settings"
      ).addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text.setPlaceholder("Enter your PAT").setValue(this.plugin.settings.token).onChange(async (value) => {
          this.plugin.settings.token = value;
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    } else {
      new import_obsidian.Setting(this.authContainerEl).setName("Username").setDesc("Your Confluence username").addText(
        (text) => text.setPlaceholder("jdoe").setValue(this.plugin.settings.username).onChange(async (value) => {
          this.plugin.settings.username = value;
          await this.plugin.saveData(this.plugin.settings);
        })
      );
      new import_obsidian.Setting(this.authContainerEl).setName("Password").setDesc("Your Confluence password").addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text.setPlaceholder("Enter your password").setValue(this.plugin.settings.password).onChange(async (value) => {
          this.plugin.settings.password = value;
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    }
  }
  addPublishingSection(containerEl) {
    containerEl.createEl("h3", { text: "Publishing" });
    new import_obsidian.Setting(containerEl).setName("Strip frontmatter").setDesc(
      "Remove YAML frontmatter from the note before publishing to Confluence"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.stripFrontmatter).onChange(async (value) => {
        this.plugin.settings.stripFrontmatter = value;
        await this.plugin.saveData(this.plugin.settings);
      })
    );
    new import_obsidian.Setting(containerEl).setName("Title source").setDesc(
      'Determine the Confluence page title from frontmatter "title" field or the filename'
    ).addDropdown(
      (dropdown) => dropdown.addOption("frontmatter", 'Frontmatter "title" field').addOption("filename", "Note filename").setValue(this.plugin.settings.titleSource).onChange(async (value) => {
        this.plugin.settings.titleSource = value;
        await this.plugin.saveData(this.plugin.settings);
      })
    );
  }
};

// src/ui/file-select-modal.ts
var import_obsidian2 = require("obsidian");
var STYLES = `
.confluence-file-select {
  padding: 0;
}

.confluence-file-select h2 {
  margin: 0 0 12px 0;
  font-size: 1.2em;
  font-weight: 600;
}

.confluence-search-input {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.95em;
  outline: none;
  box-sizing: border-box;
}

.confluence-search-input:focus {
  border-color: var(--interactive-accent);
  box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
}

.confluence-file-list {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
}

.confluence-section {
  border-bottom: 1px solid var(--background-modifier-border);
}

.confluence-section:last-child {
  border-bottom: none;
}

.confluence-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--background-secondary);
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  font-size: 0.85em;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.confluence-section-header:hover {
  background: var(--background-secondary-alt);
}

.confluence-section-header input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.confluence-section-label {
  flex: 1;
}

.confluence-section-count {
  font-weight: 400;
  color: var(--text-faint);
  font-size: 0.9em;
}

.confluence-section-toggle {
  font-size: 0.8em;
  color: var(--text-faint);
  transition: transform 120ms ease;
}

.confluence-section-toggle.is-collapsed {
  transform: rotate(-90deg);
}

.confluence-section-items {
  padding: 0;
}

.confluence-section-items.is-collapsed {
  display: none;
}

.confluence-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 20px;
  cursor: pointer;
  font-size: 0.9em;
  color: var(--text-normal);
}

.confluence-file-item:hover {
  background: var(--background-secondary);
}

.confluence-file-item input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.confluence-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confluence-file-path {
  color: var(--text-faint);
  font-size: 0.85em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.confluence-publish-btn {
  width: 100%;
  padding: 10px 16px;
  font-size: 0.95em;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
}

.confluence-publish-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confluence-empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-faint);
  font-size: 0.9em;
}
`;
var FileSelectModal = class extends import_obsidian2.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.selectedFiles = /* @__PURE__ */ new Set();
    this.collapsedSections = /* @__PURE__ */ new Set();
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("confluence-file-select");
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = STYLES;
    document.head.appendChild(this.styleEl);
    contentEl.createEl("h2", { text: "Select notes to publish" });
    this.searchInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "Search notes...",
      cls: "confluence-search-input"
    });
    this.searchInput.setAttribute("aria-label", "Filter notes by name");
    this.searchInput.addEventListener("input", () => this.renderList());
    this.listContainer = contentEl.createDiv({ cls: "confluence-file-list" });
    this.listContainer.setAttribute("role", "list");
    this.submitBtn = contentEl.createEl("button", {
      text: "Publish (0 files)",
      cls: "confluence-publish-btn mod-cta"
    });
    this.submitBtn.addEventListener("click", () => {
      if (this.selectedFiles.size === 0) return;
      this.close();
      this.onSubmit(Array.from(this.selectedFiles));
    });
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.selectedFiles.add(activeFile);
    }
    this.collapsedSections.add("All Notes");
    this.renderList();
    this.searchInput.focus();
  }
  /**
   * Resolve outgoing links and backlinks for a given file using the
   * metadataCache.resolvedLinks map.
   */
  getRelatedFiles(file) {
    if (!file) return { outgoing: [], backlinks: [] };
    const resolved = this.app.metadataCache.resolvedLinks[file.path] || {};
    const outgoing = Object.keys(resolved).map((path) => this.app.vault.getAbstractFileByPath(path)).filter((f) => f instanceof import_obsidian2.TFile && f.extension === "md");
    const backlinks = [];
    const allLinks = this.app.metadataCache.resolvedLinks;
    for (const [sourcePath, links] of Object.entries(allLinks)) {
      if (file.path in links) {
        const src = this.app.vault.getAbstractFileByPath(sourcePath);
        if (src instanceof import_obsidian2.TFile && src.extension === "md") {
          backlinks.push(src);
        }
      }
    }
    return { outgoing, backlinks };
  }
  /**
   * Build sections and render the full file list, respecting the current
   * search query.
   */
  renderList() {
    this.listContainer.empty();
    const query = this.searchInput.value.trim().toLowerCase();
    const activeFile = this.app.workspace.getActiveFile();
    const { outgoing, backlinks } = this.getRelatedFiles(activeFile);
    const shown = /* @__PURE__ */ new Set();
    const sections = [];
    if (activeFile && activeFile.extension === "md") {
      sections.push({
        label: "Current Note",
        files: [activeFile],
        collapsedByDefault: false
      });
      shown.add(activeFile.path);
    }
    const dedupedOutgoing = outgoing.filter((f) => {
      if (shown.has(f.path)) return false;
      shown.add(f.path);
      return true;
    });
    if (dedupedOutgoing.length > 0) {
      sections.push({
        label: "Outgoing Links",
        files: dedupedOutgoing,
        collapsedByDefault: false
      });
    }
    const dedupedBacklinks = backlinks.filter((f) => {
      if (shown.has(f.path)) return false;
      shown.add(f.path);
      return true;
    });
    if (dedupedBacklinks.length > 0) {
      sections.push({
        label: "Backlinks",
        files: dedupedBacklinks,
        collapsedByDefault: false
      });
    }
    const allMarkdown = this.app.vault.getMarkdownFiles().filter((f) => !shown.has(f.path)).sort((a, b) => a.basename.localeCompare(b.basename));
    if (allMarkdown.length > 0) {
      sections.push({
        label: "All Notes",
        files: allMarkdown,
        collapsedByDefault: true
      });
    }
    let totalVisible = 0;
    for (const section of sections) {
      const filtered = query ? section.files.filter(
        (f) => f.basename.toLowerCase().includes(query) || f.path.toLowerCase().includes(query)
      ) : section.files;
      if (filtered.length === 0) continue;
      totalVisible += filtered.length;
      this.renderSection(this.listContainer, section.label, filtered, section.collapsedByDefault);
    }
    if (totalVisible === 0) {
      this.listContainer.createDiv({
        cls: "confluence-empty-state",
        text: query ? "No notes match your search." : "No markdown notes found in vault."
      });
    }
    this.updateSubmitButton();
  }
  /**
   * Render a single collapsible section with a header checkbox for bulk
   * selection and individual file rows.
   */
  renderSection(container, label, files, _collapsedByDefault) {
    const sectionEl = container.createDiv({ cls: "confluence-section" });
    const isCollapsed = this.collapsedSections.has(label);
    const header = sectionEl.createDiv({ cls: "confluence-section-header" });
    const headerCheckbox = header.createEl("input", { type: "checkbox" });
    headerCheckbox.setAttribute("aria-label", `Select all in ${label}`);
    const allSelected = files.length > 0 && files.every((f) => this.selectedFiles.has(f));
    const someSelected = files.some((f) => this.selectedFiles.has(f));
    headerCheckbox.checked = allSelected;
    headerCheckbox.indeterminate = someSelected && !allSelected;
    headerCheckbox.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    headerCheckbox.addEventListener("change", () => {
      if (headerCheckbox.checked) {
        files.forEach((f) => this.selectedFiles.add(f));
      } else {
        files.forEach((f) => this.selectedFiles.delete(f));
      }
      this.renderList();
    });
    header.createSpan({ cls: "confluence-section-label", text: label });
    header.createSpan({
      cls: "confluence-section-count",
      text: `(${files.length})`
    });
    header.createSpan({
      cls: `confluence-section-toggle ${isCollapsed ? "is-collapsed" : ""}`,
      text: "\u25BC"
    });
    header.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (this.collapsedSections.has(label)) {
        this.collapsedSections.delete(label);
      } else {
        this.collapsedSections.add(label);
      }
      this.renderList();
    });
    const itemsEl = sectionEl.createDiv({
      cls: `confluence-section-items ${isCollapsed ? "is-collapsed" : ""}`
    });
    for (const file of files) {
      this.renderFileItem(itemsEl, file);
    }
  }
  /**
   * Render a single file row with a checkbox, file name, and path.
   */
  renderFileItem(container, file) {
    const row = container.createDiv({ cls: "confluence-file-item" });
    row.setAttribute("role", "listitem");
    const checkbox = row.createEl("input", { type: "checkbox" });
    checkbox.checked = this.selectedFiles.has(file);
    checkbox.setAttribute("aria-label", `Select ${file.basename}`);
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.selectedFiles.add(file);
      } else {
        this.selectedFiles.delete(file);
      }
      this.renderList();
    });
    row.createSpan({ cls: "confluence-file-name", text: file.basename });
    const parentPath = file.parent ? file.parent.path : "";
    if (parentPath) {
      row.createSpan({ cls: "confluence-file-path", text: parentPath });
    }
    row.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });
  }
  /**
   * Update the submit button label to reflect the current selection count.
   */
  updateSubmitButton() {
    const count = this.selectedFiles.size;
    this.submitBtn.textContent = `Publish (${count} file${count !== 1 ? "s" : ""})`;
    this.submitBtn.disabled = count === 0;
  }
  onClose() {
    this.contentEl.empty();
    if (this.styleEl) {
      this.styleEl.remove();
    }
  }
};

// src/ui/destination-select-modal.ts
var import_obsidian3 = require("obsidian");
var DestinationSelectModal = class extends import_obsidian3.SuggestModal {
  constructor(app, destinations, onChoose) {
    super(app);
    this.destinations = destinations;
    this.onChoose_ = onChoose;
    this.setPlaceholder("Select a publish destination...");
  }
  getSuggestions(query) {
    const lower = query.toLowerCase();
    if (!lower) return this.destinations;
    return this.destinations.filter(
      (d) => d.label.toLowerCase().includes(lower) || d.spaceKey.toLowerCase().includes(lower)
    );
  }
  renderSuggestion(dest, el) {
    const label = dest.label || dest.spaceKey;
    el.createEl("div", { text: label, cls: "suggestion-title" });
    el.createEl("small", {
      text: `Space: ${dest.spaceKey}  /  Parent ID: ${dest.parentPageId}`,
      cls: "suggestion-note"
    });
  }
  onChooseSuggestion(dest) {
    this.onChoose_(dest);
  }
};

// src/ui/progress-modal.ts
var import_obsidian4 = require("obsidian");
var ProgressModal = class extends import_obsidian4.Modal {
  constructor(app) {
    super(app);
    this.total = 0;
    this.current = 0;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("confluence-progress");
    contentEl.createEl("h2", { text: "Publishing to Confluence" });
    this.statusEl = contentEl.createDiv({ cls: "confluence-progress-status" });
    this.statusEl.textContent = "Preparing...";
    this.progressBar = contentEl.createEl("progress", {
      cls: "confluence-progress-bar"
    });
    this.progressBar.max = 100;
    this.progressBar.value = 0;
    this.progressBar.style.width = "100%";
    this.progressBar.style.height = "8px";
    this.logEl = contentEl.createDiv({ cls: "confluence-progress-log" });
    this.logEl.style.maxHeight = "300px";
    this.logEl.style.overflowY = "auto";
    this.logEl.style.marginTop = "12px";
    this.logEl.style.fontSize = "0.85em";
    this.closeBtn = contentEl.createEl("button", {
      text: "Close",
      cls: "mod-cta"
    });
    this.closeBtn.style.marginTop = "12px";
    this.closeBtn.disabled = true;
    this.closeBtn.addEventListener("click", () => this.close());
  }
  handleEvent(event) {
    switch (event.type) {
      case "start":
        this.total = event.total * 2;
        this.current = 0;
        this.statusEl.textContent = `Publishing 0 / ${event.total} pages...`;
        break;
      case "page_created":
        this.current++;
        this.updateProgress();
        this.appendLog("created", event.title);
        break;
      case "image_uploaded":
        this.appendLog("image", event.filename);
        break;
      case "page_updated":
        this.current++;
        this.updateProgress();
        this.appendLog("updated", event.title);
        break;
      case "error":
        this.appendLog("error", `${event.title}: ${event.error}`);
        break;
      case "complete":
        this.statusEl.textContent = `Done \u2014 ${event.succeeded} succeeded, ${event.failed} failed, ${event.skipped} skipped`;
        this.progressBar.value = 100;
        this.closeBtn.disabled = false;
        break;
    }
  }
  updateProgress() {
    if (this.total > 0) {
      this.progressBar.value = Math.round(this.current / this.total * 100);
    }
    this.statusEl.textContent = `Publishing ${this.current} / ${this.total} pages...`;
  }
  appendLog(kind, message) {
    const line = this.logEl.createDiv({ cls: "confluence-log-line" });
    const icon = { created: "\u2795", updated: "\u2705", image: "\u{1F5BC}", error: "\u274C" }[kind];
    line.style.padding = "2px 0";
    if (kind === "error") {
      line.style.color = "var(--text-error, #e53e3e)";
    }
    line.textContent = `${icon} ${message}`;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/publisher.ts
var import_obsidian5 = require("obsidian");

// src/confluence/client.ts
var nodeHttps = require("https");
var nodeHttp = require("http");
var ConfluenceClient = class {
  constructor(confluenceUrl, authType, token, username, password) {
    this.baseUrl = confluenceUrl.replace(/\/+$/, "");
    let authValue;
    if (authType === "pat") {
      authValue = `Bearer ${token}`;
    } else {
      const bytes = new TextEncoder().encode(`${username}:${password}`);
      const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
      authValue = `Basic ${btoa(binary)}`;
    }
    this.headers = {
      "Authorization": authValue,
      "Accept": "application/json"
    };
  }
  /** Extra headers for mutating requests (POST/PUT/DELETE). */
  get mutationHeaders() {
    return {
      ...this.headers,
      "Content-Type": "application/json",
      "X-Atlassian-Token": "nocheck"
    };
  }
  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  async findPageByTitle(spaceKey, title) {
    const params = new URLSearchParams({
      spaceKey,
      title,
      type: "page",
      expand: "version"
    });
    const url = `${this.baseUrl}/rest/api/content?${params.toString()}`;
    const response = await this.request({ url, method: "GET" });
    const data = response.json;
    if (data.results && data.results.length > 0) {
      return data.results[0].id;
    }
    return null;
  }
  /**
   * List filenames of existing attachments on a page.
   */
  async getAttachmentFilenames(pageId) {
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?limit=500`;
    const response = await this.request({ url, method: "GET" });
    const data = response.json;
    return new Set((data.results || []).map((a) => a.title));
  }
  async getPage(pageId) {
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}?expand=version,ancestors`;
    const response = await this.request({ url, method: "GET" });
    return response.json;
  }
  async createPage(spaceKey, parentId, title, body) {
    const url = `${this.baseUrl}/rest/api/content`;
    const payload = {
      type: "page",
      title,
      space: { key: spaceKey },
      ancestors: [{ id: parentId }],
      body: {
        storage: {
          value: body,
          representation: "storage"
        }
      }
    };
    const response = await this.request({
      url,
      method: "POST",
      body: JSON.stringify(payload)
    });
    return response.json;
  }
  async updatePage(pageId, title, body, version) {
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}`;
    const payload = {
      type: "page",
      title,
      body: {
        storage: {
          value: body,
          representation: "storage"
        }
      },
      version: {
        number: version + 1
      }
    };
    await this.request({
      url,
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }
  /**
   * Upload (or update) a file attachment on a page.
   *
   * Uses Node.js https directly (same as other methods) to avoid the
   * redirect / auth-header-stripping issue with Obsidian's requestUrl.
   */
  async uploadAttachment(pageId, filename, data, mimeType) {
    const boundary = `----ObsidianConfluence${Date.now()}${Math.random().toString(36).slice(2)}`;
    const headerPart = `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${filename}"\r
Content-Type: ${mimeType}\r
\r
`;
    const footerPart = `\r
--${boundary}--\r
`;
    const headerBytes = new TextEncoder().encode(headerPart);
    const footerBytes = new TextEncoder().encode(footerPart);
    const fileBytes = new Uint8Array(data);
    const combined = new Uint8Array(
      headerBytes.byteLength + fileBytes.byteLength + footerBytes.byteLength
    );
    combined.set(headerBytes, 0);
    combined.set(fileBytes, headerBytes.byteLength);
    combined.set(footerBytes, headerBytes.byteLength + fileBytes.byteLength);
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`;
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? nodeHttps : nodeHttp;
    const reqHeaders = {
      ...this.headers,
      "X-Atlassian-Token": "nocheck",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(combined.byteLength)
    };
    console.log(`[confluence-publisher] POST ${url} (attachment: ${filename})`);
    await new Promise((resolve, reject) => {
      const req = mod.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "POST",
          headers: reqHeaders
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            var _a;
            const status = (_a = res.statusCode) != null ? _a : 0;
            console.log(`[confluence-publisher] Attachment response: ${status}`);
            if (status >= 200 && status < 300) {
              resolve();
            } else {
              const body = Buffer.concat(chunks).toString("utf-8").slice(0, 300);
              reject(new Error(`Attachment upload failed (${status}): ${body}`));
            }
          });
        }
      );
      req.on("error", (err) => {
        reject(new Error(`Network error uploading attachment: ${err.message}`));
      });
      req.write(Buffer.from(combined.buffer, combined.byteOffset, combined.byteLength));
      req.end();
    });
  }
  async testConnection(spaceKey) {
    const url = `${this.baseUrl}/rest/api/space/${encodeURIComponent(spaceKey)}`;
    try {
      await this.request({ url, method: "GET" });
      return true;
    } catch (e) {
      return false;
    }
  }
  // ---------------------------------------------------------------------------
  // Internal — Node.js https (no auto-redirect, matches curl behaviour)
  // ---------------------------------------------------------------------------
  async request(params) {
    const isMutation = params.method !== "GET" && params.method !== "HEAD";
    const reqHeaders = isMutation ? this.mutationHeaders : this.headers;
    console.log(`[confluence-publisher] ${params.method} ${params.url}`);
    const parsed = new URL(params.url);
    const mod = parsed.protocol === "https:" ? nodeHttps : nodeHttp;
    return new Promise((resolve, reject) => {
      const req = mod.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: params.method,
          headers: reqHeaders
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            var _a, _b, _c, _d;
            const text = Buffer.concat(chunks).toString("utf-8");
            const status = (_a = res.statusCode) != null ? _a : 0;
            const ct = (_b = res.headers["content-type"]) != null ? _b : "";
            console.log(
              `[confluence-publisher] Response: ${status}, content-type: ${ct}`
            );
            const responseHeaders = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === "string") responseHeaders[k] = v;
            }
            if (status >= 300 && status < 400) {
              reject(
                new Error(
                  `Confluence returned redirect (${status}) to: ${(_c = res.headers.location) != null ? _c : "unknown"}. This usually means authentication failed or the URL needs adjustment. Check your credentials and Confluence URL.`
                )
              );
              return;
            }
            if (status < 200 || status >= 300) {
              let detail = text.slice(0, 200);
              try {
                const body = JSON.parse(text);
                if (body.message) detail = body.message;
                else if ((_d = body.data) == null ? void 0 : _d.message) detail = body.data.message;
              } catch (e) {
              }
              reject(new Error(`Confluence API error ${status}: ${detail}`));
              return;
            }
            if (text && !ct.includes("application/json")) {
              reject(
                new Error(
                  `Confluence returned non-JSON response (content-type: ${ct || "unknown"}). URL: ${params.url} \u2014 Response preview: ${text.slice(0, 300)}`
                )
              );
              return;
            }
            let json;
            try {
              json = text ? JSON.parse(text) : void 0;
            } catch (e) {
              reject(
                new Error(
                  `Failed to parse Confluence JSON: ${e instanceof Error ? e.message : String(e)}. Preview: ${text.slice(0, 200)}`
                )
              );
              return;
            }
            resolve({ status, text, json, headers: responseHeaders });
          });
        }
      );
      req.on("error", (err) => {
        reject(
          new Error(`Network error connecting to Confluence: ${err.message}`)
        );
      });
      if (params.body) req.write(params.body);
      req.end();
    });
  }
};

// src/converter/obsidian-syntax.ts
var IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|svg|webp)$/i;
async function preprocessObsidianSyntax(content, file, app, publishedFiles, spaceKey) {
  const images = [];
  const imageEmbedRe = /!\[\[([^\]|]+?\.(png|jpe?g|gif|svg|webp))(?:\|([^\]]*))?\]\]/gi;
  content = content.replace(
    imageEmbedRe,
    (match, filename, _ext, sizeOrAlt) => {
      const parsed = sizeOrAlt ? parseInt(sizeOrAlt, 10) : NaN;
      const width = !isNaN(parsed) ? parsed : null;
      const resolved = app.metadataCache.getFirstLinkpathDest(filename, file.path);
      const resolvedPath = resolved ? resolved.path : null;
      const safeFilename = filenameOnly(filename);
      images.push({
        originalSyntax: match,
        filename: safeFilename,
        resolvedPath,
        width
      });
      const widthAttr = width !== null ? ` ac:width="${width}"` : "";
      return `<ac:image${widthAttr}><ri:attachment ri:filename="${escapeXml(safeFilename)}"/></ac:image>`;
    }
  );
  const noteEmbedRe = /!\[\[([^\]]+?)\]\]/g;
  content = content.replace(noteEmbedRe, (_match, linkPath) => {
    if (IMAGE_EXT_PATTERN.test(linkPath)) {
      return _match;
    }
    const resolved = app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
    if (resolved && publishedFiles.has(resolved.path)) {
      const title = publishedFiles.get(resolved.path);
      return `<ac:link><ri:page ri:content-title="${escapeXml(title)}" ri:space-key="${escapeXml(spaceKey)}"/></ac:link>`;
    }
    return `<em>(see: ${escapeXml(linkPath)})</em>`;
  });
  const wikilinkRe = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  content = content.replace(
    wikilinkRe,
    (_match, linkPath, alias) => {
      const display = alias != null ? alias : linkPath;
      const resolved = app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
      if (resolved && publishedFiles.has(resolved.path)) {
        const title = publishedFiles.get(resolved.path);
        return `<ac:link><ri:page ri:content-title="${escapeXml(title)}" ri:space-key="${escapeXml(spaceKey)}"/><ac:link-body>${escapeXml(display)}</ac:link-body></ac:link>`;
      }
      return escapeXml(display);
    }
  );
  const calloutRe = /^> \[!(\w+)\]\s*(.*)?$(?:\r?\n)((?:^>.*$(?:\r?\n|$))*)/gm;
  content = content.replace(
    calloutRe,
    (_match, type, titleLine, body) => {
      const macroName = mapCalloutType(type);
      const title = (titleLine != null ? titleLine : "").trim();
      const bodyContent = stripCalloutPrefix(body);
      const titleParam = title ? `<ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter>` : "";
      return `<ac:structured-macro ac:name="${macroName}">` + titleParam + `<ac:rich-text-body><p>${escapeXml(bodyContent)}</p></ac:rich-text-body></ac:structured-macro>
`;
    }
  );
  return { content, images };
}
function mapCalloutType(type) {
  switch (type.toUpperCase()) {
    case "NOTE":
    case "INFO":
      return "info";
    case "WARNING":
    case "CAUTION":
      return "warning";
    case "TIP":
    case "HINT":
      return "tip";
    case "IMPORTANT":
      return "note";
    default:
      return "info";
  }
}
function stripCalloutPrefix(body) {
  return body.split("\n").map((line) => line.replace(/^>\s?/, "")).filter((line) => line.length > 0).join(" ").trim();
}
function filenameOnly(linkPath) {
  const parts = linkPath.split("/");
  return parts[parts.length - 1];
}
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// node_modules/marked/lib/marked.esm.js
function _getDefaults() {
  return {
    async: false,
    breaks: false,
    extensions: null,
    gfm: true,
    hooks: null,
    pedantic: false,
    renderer: null,
    silent: false,
    tokenizer: null,
    walkTokens: null
  };
}
var _defaults = _getDefaults();
function changeDefaults(newDefaults) {
  _defaults = newDefaults;
}
var escapeTest = /[&<>"']/;
var escapeReplace = new RegExp(escapeTest.source, "g");
var escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
var escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, "g");
var escapeReplacements = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
var getEscapeReplacement = (ch) => escapeReplacements[ch];
function escape$1(html2, encode) {
  if (encode) {
    if (escapeTest.test(html2)) {
      return html2.replace(escapeReplace, getEscapeReplacement);
    }
  } else {
    if (escapeTestNoEncode.test(html2)) {
      return html2.replace(escapeReplaceNoEncode, getEscapeReplacement);
    }
  }
  return html2;
}
var caret = /(^|[^\[])\^/g;
function edit(regex, opt) {
  let source = typeof regex === "string" ? regex : regex.source;
  opt = opt || "";
  const obj = {
    replace: (name, val) => {
      let valSource = typeof val === "string" ? val : val.source;
      valSource = valSource.replace(caret, "$1");
      source = source.replace(name, valSource);
      return obj;
    },
    getRegex: () => {
      return new RegExp(source, opt);
    }
  };
  return obj;
}
function cleanUrl(href) {
  try {
    href = encodeURI(href).replace(/%25/g, "%");
  } catch (e) {
    return null;
  }
  return href;
}
var noopTest = { exec: () => null };
function splitCells(tableRow, count) {
  const row = tableRow.replace(/\|/g, (match, offset, str) => {
    let escaped = false;
    let curr = offset;
    while (--curr >= 0 && str[curr] === "\\")
      escaped = !escaped;
    if (escaped) {
      return "|";
    } else {
      return " |";
    }
  }), cells = row.split(/ \|/);
  let i = 0;
  if (!cells[0].trim()) {
    cells.shift();
  }
  if (cells.length > 0 && !cells[cells.length - 1].trim()) {
    cells.pop();
  }
  if (count) {
    if (cells.length > count) {
      cells.splice(count);
    } else {
      while (cells.length < count)
        cells.push("");
    }
  }
  for (; i < cells.length; i++) {
    cells[i] = cells[i].trim().replace(/\\\|/g, "|");
  }
  return cells;
}
function rtrim(str, c, invert) {
  const l = str.length;
  if (l === 0) {
    return "";
  }
  let suffLen = 0;
  while (suffLen < l) {
    const currChar = str.charAt(l - suffLen - 1);
    if (currChar === c && !invert) {
      suffLen++;
    } else if (currChar !== c && invert) {
      suffLen++;
    } else {
      break;
    }
  }
  return str.slice(0, l - suffLen);
}
function findClosingBracket(str, b) {
  if (str.indexOf(b[1]) === -1) {
    return -1;
  }
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\") {
      i++;
    } else if (str[i] === b[0]) {
      level++;
    } else if (str[i] === b[1]) {
      level--;
      if (level < 0) {
        return i;
      }
    }
  }
  return -1;
}
function outputLink(cap, link2, raw, lexer2) {
  const href = link2.href;
  const title = link2.title ? escape$1(link2.title) : null;
  const text = cap[1].replace(/\\([\[\]])/g, "$1");
  if (cap[0].charAt(0) !== "!") {
    lexer2.state.inLink = true;
    const token = {
      type: "link",
      raw,
      href,
      title,
      text,
      tokens: lexer2.inlineTokens(text)
    };
    lexer2.state.inLink = false;
    return token;
  }
  return {
    type: "image",
    raw,
    href,
    title,
    text: escape$1(text)
  };
}
function indentCodeCompensation(raw, text) {
  const matchIndentToCode = raw.match(/^(\s+)(?:```)/);
  if (matchIndentToCode === null) {
    return text;
  }
  const indentToCode = matchIndentToCode[1];
  return text.split("\n").map((node) => {
    const matchIndentInNode = node.match(/^\s+/);
    if (matchIndentInNode === null) {
      return node;
    }
    const [indentInNode] = matchIndentInNode;
    if (indentInNode.length >= indentToCode.length) {
      return node.slice(indentToCode.length);
    }
    return node;
  }).join("\n");
}
var _Tokenizer = class {
  // set by the lexer
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "rules");
    // set by the lexer
    __publicField(this, "lexer");
    this.options = options2 || _defaults;
  }
  space(src) {
    const cap = this.rules.block.newline.exec(src);
    if (cap && cap[0].length > 0) {
      return {
        type: "space",
        raw: cap[0]
      };
    }
  }
  code(src) {
    const cap = this.rules.block.code.exec(src);
    if (cap) {
      const text = cap[0].replace(/^(?: {1,4}| {0,3}\t)/gm, "");
      return {
        type: "code",
        raw: cap[0],
        codeBlockStyle: "indented",
        text: !this.options.pedantic ? rtrim(text, "\n") : text
      };
    }
  }
  fences(src) {
    const cap = this.rules.block.fences.exec(src);
    if (cap) {
      const raw = cap[0];
      const text = indentCodeCompensation(raw, cap[3] || "");
      return {
        type: "code",
        raw,
        lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2],
        text
      };
    }
  }
  heading(src) {
    const cap = this.rules.block.heading.exec(src);
    if (cap) {
      let text = cap[2].trim();
      if (/#$/.test(text)) {
        const trimmed = rtrim(text, "#");
        if (this.options.pedantic) {
          text = trimmed.trim();
        } else if (!trimmed || / $/.test(trimmed)) {
          text = trimmed.trim();
        }
      }
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[1].length,
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  hr(src) {
    const cap = this.rules.block.hr.exec(src);
    if (cap) {
      return {
        type: "hr",
        raw: rtrim(cap[0], "\n")
      };
    }
  }
  blockquote(src) {
    const cap = this.rules.block.blockquote.exec(src);
    if (cap) {
      let lines = rtrim(cap[0], "\n").split("\n");
      let raw = "";
      let text = "";
      const tokens = [];
      while (lines.length > 0) {
        let inBlockquote = false;
        const currentLines = [];
        let i;
        for (i = 0; i < lines.length; i++) {
          if (/^ {0,3}>/.test(lines[i])) {
            currentLines.push(lines[i]);
            inBlockquote = true;
          } else if (!inBlockquote) {
            currentLines.push(lines[i]);
          } else {
            break;
          }
        }
        lines = lines.slice(i);
        const currentRaw = currentLines.join("\n");
        const currentText = currentRaw.replace(/\n {0,3}((?:=+|-+) *)(?=\n|$)/g, "\n    $1").replace(/^ {0,3}>[ \t]?/gm, "");
        raw = raw ? `${raw}
${currentRaw}` : currentRaw;
        text = text ? `${text}
${currentText}` : currentText;
        const top = this.lexer.state.top;
        this.lexer.state.top = true;
        this.lexer.blockTokens(currentText, tokens, true);
        this.lexer.state.top = top;
        if (lines.length === 0) {
          break;
        }
        const lastToken = tokens[tokens.length - 1];
        if ((lastToken == null ? void 0 : lastToken.type) === "code") {
          break;
        } else if ((lastToken == null ? void 0 : lastToken.type) === "blockquote") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.blockquote(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
          break;
        } else if ((lastToken == null ? void 0 : lastToken.type) === "list") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.list(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.raw.length) + newToken.raw;
          lines = newText.substring(tokens[tokens.length - 1].raw.length).split("\n");
          continue;
        }
      }
      return {
        type: "blockquote",
        raw,
        tokens,
        text
      };
    }
  }
  list(src) {
    let cap = this.rules.block.list.exec(src);
    if (cap) {
      let bull = cap[1].trim();
      const isordered = bull.length > 1;
      const list2 = {
        type: "list",
        raw: "",
        ordered: isordered,
        start: isordered ? +bull.slice(0, -1) : "",
        loose: false,
        items: []
      };
      bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
      if (this.options.pedantic) {
        bull = isordered ? bull : "[*+-]";
      }
      const itemRegex = new RegExp(`^( {0,3}${bull})((?:[	 ][^\\n]*)?(?:\\n|$))`);
      let endsWithBlankLine = false;
      while (src) {
        let endEarly = false;
        let raw = "";
        let itemContents = "";
        if (!(cap = itemRegex.exec(src))) {
          break;
        }
        if (this.rules.block.hr.test(src)) {
          break;
        }
        raw = cap[0];
        src = src.substring(raw.length);
        let line = cap[2].split("\n", 1)[0].replace(/^\t+/, (t) => " ".repeat(3 * t.length));
        let nextLine = src.split("\n", 1)[0];
        let blankLine = !line.trim();
        let indent = 0;
        if (this.options.pedantic) {
          indent = 2;
          itemContents = line.trimStart();
        } else if (blankLine) {
          indent = cap[1].length + 1;
        } else {
          indent = cap[2].search(/[^ ]/);
          indent = indent > 4 ? 1 : indent;
          itemContents = line.slice(indent);
          indent += cap[1].length;
        }
        if (blankLine && /^[ \t]*$/.test(nextLine)) {
          raw += nextLine + "\n";
          src = src.substring(nextLine.length + 1);
          endEarly = true;
        }
        if (!endEarly) {
          const nextBulletRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`);
          const hrRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`);
          const fencesBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`);
          const headingBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`);
          const htmlBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}<(?:[a-z].*>|!--)`, "i");
          while (src) {
            const rawLine = src.split("\n", 1)[0];
            let nextLineWithoutTabs;
            nextLine = rawLine;
            if (this.options.pedantic) {
              nextLine = nextLine.replace(/^ {1,4}(?=( {4})*[^ ])/g, "  ");
              nextLineWithoutTabs = nextLine;
            } else {
              nextLineWithoutTabs = nextLine.replace(/\t/g, "    ");
            }
            if (fencesBeginRegex.test(nextLine)) {
              break;
            }
            if (headingBeginRegex.test(nextLine)) {
              break;
            }
            if (htmlBeginRegex.test(nextLine)) {
              break;
            }
            if (nextBulletRegex.test(nextLine)) {
              break;
            }
            if (hrRegex.test(nextLine)) {
              break;
            }
            if (nextLineWithoutTabs.search(/[^ ]/) >= indent || !nextLine.trim()) {
              itemContents += "\n" + nextLineWithoutTabs.slice(indent);
            } else {
              if (blankLine) {
                break;
              }
              if (line.replace(/\t/g, "    ").search(/[^ ]/) >= 4) {
                break;
              }
              if (fencesBeginRegex.test(line)) {
                break;
              }
              if (headingBeginRegex.test(line)) {
                break;
              }
              if (hrRegex.test(line)) {
                break;
              }
              itemContents += "\n" + nextLine;
            }
            if (!blankLine && !nextLine.trim()) {
              blankLine = true;
            }
            raw += rawLine + "\n";
            src = src.substring(rawLine.length + 1);
            line = nextLineWithoutTabs.slice(indent);
          }
        }
        if (!list2.loose) {
          if (endsWithBlankLine) {
            list2.loose = true;
          } else if (/\n[ \t]*\n[ \t]*$/.test(raw)) {
            endsWithBlankLine = true;
          }
        }
        let istask = null;
        let ischecked;
        if (this.options.gfm) {
          istask = /^\[[ xX]\] /.exec(itemContents);
          if (istask) {
            ischecked = istask[0] !== "[ ] ";
            itemContents = itemContents.replace(/^\[[ xX]\] +/, "");
          }
        }
        list2.items.push({
          type: "list_item",
          raw,
          task: !!istask,
          checked: ischecked,
          loose: false,
          text: itemContents,
          tokens: []
        });
        list2.raw += raw;
      }
      list2.items[list2.items.length - 1].raw = list2.items[list2.items.length - 1].raw.trimEnd();
      list2.items[list2.items.length - 1].text = list2.items[list2.items.length - 1].text.trimEnd();
      list2.raw = list2.raw.trimEnd();
      for (let i = 0; i < list2.items.length; i++) {
        this.lexer.state.top = false;
        list2.items[i].tokens = this.lexer.blockTokens(list2.items[i].text, []);
        if (!list2.loose) {
          const spacers = list2.items[i].tokens.filter((t) => t.type === "space");
          const hasMultipleLineBreaks = spacers.length > 0 && spacers.some((t) => /\n.*\n/.test(t.raw));
          list2.loose = hasMultipleLineBreaks;
        }
      }
      if (list2.loose) {
        for (let i = 0; i < list2.items.length; i++) {
          list2.items[i].loose = true;
        }
      }
      return list2;
    }
  }
  html(src) {
    const cap = this.rules.block.html.exec(src);
    if (cap) {
      const token = {
        type: "html",
        block: true,
        raw: cap[0],
        pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
        text: cap[0]
      };
      return token;
    }
  }
  def(src) {
    const cap = this.rules.block.def.exec(src);
    if (cap) {
      const tag2 = cap[1].toLowerCase().replace(/\s+/g, " ");
      const href = cap[2] ? cap[2].replace(/^<(.*)>$/, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "";
      const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : cap[3];
      return {
        type: "def",
        tag: tag2,
        raw: cap[0],
        href,
        title
      };
    }
  }
  table(src) {
    const cap = this.rules.block.table.exec(src);
    if (!cap) {
      return;
    }
    if (!/[:|]/.test(cap[2])) {
      return;
    }
    const headers = splitCells(cap[1]);
    const aligns = cap[2].replace(/^\||\| *$/g, "").split("|");
    const rows = cap[3] && cap[3].trim() ? cap[3].replace(/\n[ \t]*$/, "").split("\n") : [];
    const item = {
      type: "table",
      raw: cap[0],
      header: [],
      align: [],
      rows: []
    };
    if (headers.length !== aligns.length) {
      return;
    }
    for (const align of aligns) {
      if (/^ *-+: *$/.test(align)) {
        item.align.push("right");
      } else if (/^ *:-+: *$/.test(align)) {
        item.align.push("center");
      } else if (/^ *:-+ *$/.test(align)) {
        item.align.push("left");
      } else {
        item.align.push(null);
      }
    }
    for (let i = 0; i < headers.length; i++) {
      item.header.push({
        text: headers[i],
        tokens: this.lexer.inline(headers[i]),
        header: true,
        align: item.align[i]
      });
    }
    for (const row of rows) {
      item.rows.push(splitCells(row, item.header.length).map((cell, i) => {
        return {
          text: cell,
          tokens: this.lexer.inline(cell),
          header: false,
          align: item.align[i]
        };
      }));
    }
    return item;
  }
  lheading(src) {
    const cap = this.rules.block.lheading.exec(src);
    if (cap) {
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[2].charAt(0) === "=" ? 1 : 2,
        text: cap[1],
        tokens: this.lexer.inline(cap[1])
      };
    }
  }
  paragraph(src) {
    const cap = this.rules.block.paragraph.exec(src);
    if (cap) {
      const text = cap[1].charAt(cap[1].length - 1) === "\n" ? cap[1].slice(0, -1) : cap[1];
      return {
        type: "paragraph",
        raw: cap[0],
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  text(src) {
    const cap = this.rules.block.text.exec(src);
    if (cap) {
      return {
        type: "text",
        raw: cap[0],
        text: cap[0],
        tokens: this.lexer.inline(cap[0])
      };
    }
  }
  escape(src) {
    const cap = this.rules.inline.escape.exec(src);
    if (cap) {
      return {
        type: "escape",
        raw: cap[0],
        text: escape$1(cap[1])
      };
    }
  }
  tag(src) {
    const cap = this.rules.inline.tag.exec(src);
    if (cap) {
      if (!this.lexer.state.inLink && /^<a /i.test(cap[0])) {
        this.lexer.state.inLink = true;
      } else if (this.lexer.state.inLink && /^<\/a>/i.test(cap[0])) {
        this.lexer.state.inLink = false;
      }
      if (!this.lexer.state.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
        this.lexer.state.inRawBlock = true;
      } else if (this.lexer.state.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
        this.lexer.state.inRawBlock = false;
      }
      return {
        type: "html",
        raw: cap[0],
        inLink: this.lexer.state.inLink,
        inRawBlock: this.lexer.state.inRawBlock,
        block: false,
        text: cap[0]
      };
    }
  }
  link(src) {
    const cap = this.rules.inline.link.exec(src);
    if (cap) {
      const trimmedUrl = cap[2].trim();
      if (!this.options.pedantic && /^</.test(trimmedUrl)) {
        if (!/>$/.test(trimmedUrl)) {
          return;
        }
        const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
        if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
          return;
        }
      } else {
        const lastParenIndex = findClosingBracket(cap[2], "()");
        if (lastParenIndex > -1) {
          const start = cap[0].indexOf("!") === 0 ? 5 : 4;
          const linkLen = start + cap[1].length + lastParenIndex;
          cap[2] = cap[2].substring(0, lastParenIndex);
          cap[0] = cap[0].substring(0, linkLen).trim();
          cap[3] = "";
        }
      }
      let href = cap[2];
      let title = "";
      if (this.options.pedantic) {
        const link2 = /^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(href);
        if (link2) {
          href = link2[1];
          title = link2[3];
        }
      } else {
        title = cap[3] ? cap[3].slice(1, -1) : "";
      }
      href = href.trim();
      if (/^</.test(href)) {
        if (this.options.pedantic && !/>$/.test(trimmedUrl)) {
          href = href.slice(1);
        } else {
          href = href.slice(1, -1);
        }
      }
      return outputLink(cap, {
        href: href ? href.replace(this.rules.inline.anyPunctuation, "$1") : href,
        title: title ? title.replace(this.rules.inline.anyPunctuation, "$1") : title
      }, cap[0], this.lexer);
    }
  }
  reflink(src, links) {
    let cap;
    if ((cap = this.rules.inline.reflink.exec(src)) || (cap = this.rules.inline.nolink.exec(src))) {
      const linkString = (cap[2] || cap[1]).replace(/\s+/g, " ");
      const link2 = links[linkString.toLowerCase()];
      if (!link2) {
        const text = cap[0].charAt(0);
        return {
          type: "text",
          raw: text,
          text
        };
      }
      return outputLink(cap, link2, cap[0], this.lexer);
    }
  }
  emStrong(src, maskedSrc, prevChar = "") {
    let match = this.rules.inline.emStrongLDelim.exec(src);
    if (!match)
      return;
    if (match[3] && prevChar.match(/[\p{L}\p{N}]/u))
      return;
    const nextChar = match[1] || match[2] || "";
    if (!nextChar || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
      const lLength = [...match[0]].length - 1;
      let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
      const endReg = match[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      endReg.lastIndex = 0;
      maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
      while ((match = endReg.exec(maskedSrc)) != null) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim)
          continue;
        rLength = [...rDelim].length;
        if (match[3] || match[4]) {
          delimTotal += rLength;
          continue;
        } else if (match[5] || match[6]) {
          if (lLength % 3 && !((lLength + rLength) % 3)) {
            midDelimTotal += rLength;
            continue;
          }
        }
        delimTotal -= rLength;
        if (delimTotal > 0)
          continue;
        rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
        const lastCharLength = [...match[0]][0].length;
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        if (Math.min(lLength, rLength) % 2) {
          const text2 = raw.slice(1, -1);
          return {
            type: "em",
            raw,
            text: text2,
            tokens: this.lexer.inlineTokens(text2)
          };
        }
        const text = raw.slice(2, -2);
        return {
          type: "strong",
          raw,
          text,
          tokens: this.lexer.inlineTokens(text)
        };
      }
    }
  }
  codespan(src) {
    const cap = this.rules.inline.code.exec(src);
    if (cap) {
      let text = cap[2].replace(/\n/g, " ");
      const hasNonSpaceChars = /[^ ]/.test(text);
      const hasSpaceCharsOnBothEnds = /^ /.test(text) && / $/.test(text);
      if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
        text = text.substring(1, text.length - 1);
      }
      text = escape$1(text, true);
      return {
        type: "codespan",
        raw: cap[0],
        text
      };
    }
  }
  br(src) {
    const cap = this.rules.inline.br.exec(src);
    if (cap) {
      return {
        type: "br",
        raw: cap[0]
      };
    }
  }
  del(src) {
    const cap = this.rules.inline.del.exec(src);
    if (cap) {
      return {
        type: "del",
        raw: cap[0],
        text: cap[2],
        tokens: this.lexer.inlineTokens(cap[2])
      };
    }
  }
  autolink(src) {
    const cap = this.rules.inline.autolink.exec(src);
    if (cap) {
      let text, href;
      if (cap[2] === "@") {
        text = escape$1(cap[1]);
        href = "mailto:" + text;
      } else {
        text = escape$1(cap[1]);
        href = text;
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  url(src) {
    var _a, _b;
    let cap;
    if (cap = this.rules.inline.url.exec(src)) {
      let text, href;
      if (cap[2] === "@") {
        text = escape$1(cap[0]);
        href = "mailto:" + text;
      } else {
        let prevCapZero;
        do {
          prevCapZero = cap[0];
          cap[0] = (_b = (_a = this.rules.inline._backpedal.exec(cap[0])) == null ? void 0 : _a[0]) != null ? _b : "";
        } while (prevCapZero !== cap[0]);
        text = escape$1(cap[0]);
        if (cap[1] === "www.") {
          href = "http://" + cap[0];
        } else {
          href = cap[0];
        }
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  inlineText(src) {
    const cap = this.rules.inline.text.exec(src);
    if (cap) {
      let text;
      if (this.lexer.state.inRawBlock) {
        text = cap[0];
      } else {
        text = escape$1(cap[0]);
      }
      return {
        type: "text",
        raw: cap[0],
        text
      };
    }
  }
};
var newline = /^(?:[ \t]*(?:\n|$))+/;
var blockCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var bullet = /(?:[*+-]|\d{1,9}[.)])/;
var lheading = edit(/^(?!bull |blockCode|fences|blockquote|heading|html)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html))+?)\n {0,3}(=+|-+) *(?:\n+|$)/).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).getRegex();
var _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var blockText = /^[^\n]+/;
var _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
var def = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", _blockLabel).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, bullet).getRegex();
var _tag = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var html = edit("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", _comment).replace("tag", _tag).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var paragraph = edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", paragraph).getRegex();
var blockNormal = {
  blockquote,
  code: blockCode,
  def,
  fences,
  heading,
  hr,
  html,
  lheading,
  list,
  newline,
  paragraph,
  table: noopTest,
  text: blockText
};
var gfmTable = edit("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockGfm = {
  ...blockNormal,
  table: gfmTable,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", gfmTable).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex()
};
var blockPedantic = {
  ...blockNormal,
  html: edit(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", _comment).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
  def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
  heading: /^(#{1,6})(.*)(?:\n+|$)/,
  fences: noopTest,
  // fences not supported
  lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " *#{1,6} *[^\n]").replace("lheading", lheading).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
};
var escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var br = /^( {2,}|\\)\n(?!\s*$)/;
var inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var _punctuation = "\\p{P}\\p{S}";
var punctuation = edit(/^((?![*_])[\spunctuation])/, "u").replace(/punctuation/g, _punctuation).getRegex();
var blockSkip = /\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g;
var emStrongLDelim = edit(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/, "u").replace(/punct/g, _punctuation).getRegex();
var emStrongRDelimAst = edit("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)[punct](\\*+)(?=[\\s]|$)|[^punct\\s](\\*+)(?!\\*)(?=[punct\\s]|$)|(?!\\*)[punct\\s](\\*+)(?=[^punct\\s])|[\\s](\\*+)(?!\\*)(?=[punct])|(?!\\*)[punct](\\*+)(?!\\*)(?=[punct])|[^punct\\s](\\*+)(?=[^punct\\s])", "gu").replace(/punct/g, _punctuation).getRegex();
var emStrongRDelimUnd = edit("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)[punct](_+)(?=[\\s]|$)|[^punct\\s](_+)(?!_)(?=[punct\\s]|$)|(?!_)[punct\\s](_+)(?=[^punct\\s])|[\\s](_+)(?!_)(?=[punct])|(?!_)[punct](_+)(?!_)(?=[punct])", "gu").replace(/punct/g, _punctuation).getRegex();
var anyPunctuation = edit(/\\([punct])/, "gu").replace(/punct/g, _punctuation).getRegex();
var autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var _inlineComment = edit(_comment).replace("(?:-->|$)", "-->").getRegex();
var tag = edit("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", _inlineComment).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
var link = edit(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/).replace("label", _inlineLabel).replace("href", /<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var reflink = edit(/^!?\[(label)\]\[(ref)\]/).replace("label", _inlineLabel).replace("ref", _blockLabel).getRegex();
var nolink = edit(/^!?\[(ref)\](?:\[\])?/).replace("ref", _blockLabel).getRegex();
var reflinkSearch = edit("reflink|nolink(?!\\()", "g").replace("reflink", reflink).replace("nolink", nolink).getRegex();
var inlineNormal = {
  _backpedal: noopTest,
  // only used for GFM url
  anyPunctuation,
  autolink,
  blockSkip,
  br,
  code: inlineCode,
  del: noopTest,
  emStrongLDelim,
  emStrongRDelimAst,
  emStrongRDelimUnd,
  escape,
  link,
  nolink,
  punctuation,
  reflink,
  reflinkSearch,
  tag,
  text: inlineText,
  url: noopTest
};
var inlinePedantic = {
  ...inlineNormal,
  link: edit(/^!?\[(label)\]\((.*?)\)/).replace("label", _inlineLabel).getRegex(),
  reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", _inlineLabel).getRegex()
};
var inlineGfm = {
  ...inlineNormal,
  escape: edit(escape).replace("])", "~|])").getRegex(),
  url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i").replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
  _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
  del: /^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,
  text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
};
var inlineBreaks = {
  ...inlineGfm,
  br: edit(br).replace("{2,}", "*").getRegex(),
  text: edit(inlineGfm.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
};
var block = {
  normal: blockNormal,
  gfm: blockGfm,
  pedantic: blockPedantic
};
var inline = {
  normal: inlineNormal,
  gfm: inlineGfm,
  breaks: inlineBreaks,
  pedantic: inlinePedantic
};
var _Lexer = class __Lexer {
  constructor(options2) {
    __publicField(this, "tokens");
    __publicField(this, "options");
    __publicField(this, "state");
    __publicField(this, "tokenizer");
    __publicField(this, "inlineQueue");
    this.tokens = [];
    this.tokens.links = /* @__PURE__ */ Object.create(null);
    this.options = options2 || _defaults;
    this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
    this.tokenizer = this.options.tokenizer;
    this.tokenizer.options = this.options;
    this.tokenizer.lexer = this;
    this.inlineQueue = [];
    this.state = {
      inLink: false,
      inRawBlock: false,
      top: true
    };
    const rules = {
      block: block.normal,
      inline: inline.normal
    };
    if (this.options.pedantic) {
      rules.block = block.pedantic;
      rules.inline = inline.pedantic;
    } else if (this.options.gfm) {
      rules.block = block.gfm;
      if (this.options.breaks) {
        rules.inline = inline.breaks;
      } else {
        rules.inline = inline.gfm;
      }
    }
    this.tokenizer.rules = rules;
  }
  /**
   * Expose Rules
   */
  static get rules() {
    return {
      block,
      inline
    };
  }
  /**
   * Static Lex Method
   */
  static lex(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.lex(src);
  }
  /**
   * Static Lex Inline Method
   */
  static lexInline(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.inlineTokens(src);
  }
  /**
   * Preprocessing
   */
  lex(src) {
    src = src.replace(/\r\n|\r/g, "\n");
    this.blockTokens(src, this.tokens);
    for (let i = 0; i < this.inlineQueue.length; i++) {
      const next = this.inlineQueue[i];
      this.inlineTokens(next.src, next.tokens);
    }
    this.inlineQueue = [];
    return this.tokens;
  }
  blockTokens(src, tokens = [], lastParagraphClipped = false) {
    if (this.options.pedantic) {
      src = src.replace(/\t/g, "    ").replace(/^ +$/gm, "");
    }
    let token;
    let lastToken;
    let cutSrc;
    while (src) {
      if (this.options.extensions && this.options.extensions.block && this.options.extensions.block.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.space(src)) {
        src = src.substring(token.raw.length);
        if (token.raw.length === 1 && tokens.length > 0) {
          tokens[tokens.length - 1].raw += "\n";
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.code(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.fences(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.heading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.hr(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.blockquote(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.list(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.html(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.def(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.raw;
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else if (!this.tokens.links[token.tag]) {
          this.tokens.links[token.tag] = {
            href: token.href,
            title: token.title
          };
        }
        continue;
      }
      if (token = this.tokenizer.table(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.lheading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      cutSrc = src;
      if (this.options.extensions && this.options.extensions.startBlock) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startBlock.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
        lastToken = tokens[tokens.length - 1];
        if (lastParagraphClipped && (lastToken == null ? void 0 : lastToken.type) === "paragraph") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else {
          tokens.push(token);
        }
        lastParagraphClipped = cutSrc.length !== src.length;
        src = src.substring(token.raw.length);
        continue;
      }
      if (token = this.tokenizer.text(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && lastToken.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue[this.inlineQueue.length - 1].src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    this.state.top = true;
    return tokens;
  }
  inline(src, tokens = []) {
    this.inlineQueue.push({ src, tokens });
    return tokens;
  }
  /**
   * Lexing/Compiling
   */
  inlineTokens(src, tokens = []) {
    let token, lastToken, cutSrc;
    let maskedSrc = src;
    let match;
    let keepPrevChar, prevChar;
    if (this.tokens.links) {
      const links = Object.keys(this.tokens.links);
      if (links.length > 0) {
        while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) {
          if (links.includes(match[0].slice(match[0].lastIndexOf("[") + 1, -1))) {
            maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
          }
        }
      }
    }
    while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    }
    while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "++" + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    }
    while (src) {
      if (!keepPrevChar) {
        prevChar = "";
      }
      keepPrevChar = false;
      if (this.options.extensions && this.options.extensions.inline && this.options.extensions.inline.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.escape(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.tag(src)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && token.type === "text" && lastToken.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.link(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.reflink(src, this.tokens.links)) {
        src = src.substring(token.raw.length);
        lastToken = tokens[tokens.length - 1];
        if (lastToken && token.type === "text" && lastToken.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.codespan(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.br(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.del(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.autolink(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (!this.state.inLink && (token = this.tokenizer.url(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      cutSrc = src;
      if (this.options.extensions && this.options.extensions.startInline) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startInline.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (token = this.tokenizer.inlineText(cutSrc)) {
        src = src.substring(token.raw.length);
        if (token.raw.slice(-1) !== "_") {
          prevChar = token.raw.slice(-1);
        }
        keepPrevChar = true;
        lastToken = tokens[tokens.length - 1];
        if (lastToken && lastToken.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    return tokens;
  }
};
var _Renderer = class {
  // set by the parser
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "parser");
    this.options = options2 || _defaults;
  }
  space(token) {
    return "";
  }
  code({ text, lang, escaped }) {
    var _a;
    const langString = (_a = (lang || "").match(/^\S*/)) == null ? void 0 : _a[0];
    const code = text.replace(/\n$/, "") + "\n";
    if (!langString) {
      return "<pre><code>" + (escaped ? code : escape$1(code, true)) + "</code></pre>\n";
    }
    return '<pre><code class="language-' + escape$1(langString) + '">' + (escaped ? code : escape$1(code, true)) + "</code></pre>\n";
  }
  blockquote({ tokens }) {
    const body = this.parser.parse(tokens);
    return `<blockquote>
${body}</blockquote>
`;
  }
  html({ text }) {
    return text;
  }
  heading({ tokens, depth }) {
    return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>
`;
  }
  hr(token) {
    return "<hr>\n";
  }
  list(token) {
    const ordered = token.ordered;
    const start = token.start;
    let body = "";
    for (let j = 0; j < token.items.length; j++) {
      const item = token.items[j];
      body += this.listitem(item);
    }
    const type = ordered ? "ol" : "ul";
    const startAttr = ordered && start !== 1 ? ' start="' + start + '"' : "";
    return "<" + type + startAttr + ">\n" + body + "</" + type + ">\n";
  }
  listitem(item) {
    let itemBody = "";
    if (item.task) {
      const checkbox = this.checkbox({ checked: !!item.checked });
      if (item.loose) {
        if (item.tokens.length > 0 && item.tokens[0].type === "paragraph") {
          item.tokens[0].text = checkbox + " " + item.tokens[0].text;
          if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
            item.tokens[0].tokens[0].text = checkbox + " " + item.tokens[0].tokens[0].text;
          }
        } else {
          item.tokens.unshift({
            type: "text",
            raw: checkbox + " ",
            text: checkbox + " "
          });
        }
      } else {
        itemBody += checkbox + " ";
      }
    }
    itemBody += this.parser.parse(item.tokens, !!item.loose);
    return `<li>${itemBody}</li>
`;
  }
  checkbox({ checked }) {
    return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens }) {
    return `<p>${this.parser.parseInline(tokens)}</p>
`;
  }
  table(token) {
    let header = "";
    let cell = "";
    for (let j = 0; j < token.header.length; j++) {
      cell += this.tablecell(token.header[j]);
    }
    header += this.tablerow({ text: cell });
    let body = "";
    for (let j = 0; j < token.rows.length; j++) {
      const row = token.rows[j];
      cell = "";
      for (let k = 0; k < row.length; k++) {
        cell += this.tablecell(row[k]);
      }
      body += this.tablerow({ text: cell });
    }
    if (body)
      body = `<tbody>${body}</tbody>`;
    return "<table>\n<thead>\n" + header + "</thead>\n" + body + "</table>\n";
  }
  tablerow({ text }) {
    return `<tr>
${text}</tr>
`;
  }
  tablecell(token) {
    const content = this.parser.parseInline(token.tokens);
    const type = token.header ? "th" : "td";
    const tag2 = token.align ? `<${type} align="${token.align}">` : `<${type}>`;
    return tag2 + content + `</${type}>
`;
  }
  /**
   * span level renderer
   */
  strong({ tokens }) {
    return `<strong>${this.parser.parseInline(tokens)}</strong>`;
  }
  em({ tokens }) {
    return `<em>${this.parser.parseInline(tokens)}</em>`;
  }
  codespan({ text }) {
    return `<code>${text}</code>`;
  }
  br(token) {
    return "<br>";
  }
  del({ tokens }) {
    return `<del>${this.parser.parseInline(tokens)}</del>`;
  }
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text;
    }
    href = cleanHref;
    let out = '<a href="' + href + '"';
    if (title) {
      out += ' title="' + title + '"';
    }
    out += ">" + text + "</a>";
    return out;
  }
  image({ href, title, text }) {
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text;
    }
    href = cleanHref;
    let out = `<img src="${href}" alt="${text}"`;
    if (title) {
      out += ` title="${title}"`;
    }
    out += ">";
    return out;
  }
  text(token) {
    return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens) : token.text;
  }
};
var _TextRenderer = class {
  // no need for block level renderers
  strong({ text }) {
    return text;
  }
  em({ text }) {
    return text;
  }
  codespan({ text }) {
    return text;
  }
  del({ text }) {
    return text;
  }
  html({ text }) {
    return text;
  }
  text({ text }) {
    return text;
  }
  link({ text }) {
    return "" + text;
  }
  image({ text }) {
    return "" + text;
  }
  br() {
    return "";
  }
};
var _Parser = class __Parser {
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "renderer");
    __publicField(this, "textRenderer");
    this.options = options2 || _defaults;
    this.options.renderer = this.options.renderer || new _Renderer();
    this.renderer = this.options.renderer;
    this.renderer.options = this.options;
    this.renderer.parser = this;
    this.textRenderer = new _TextRenderer();
  }
  /**
   * Static Parse Method
   */
  static parse(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parse(tokens);
  }
  /**
   * Static Parse Inline Method
   */
  static parseInline(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parseInline(tokens);
  }
  /**
   * Parse Loop
   */
  parse(tokens, top = true) {
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[anyToken.type]) {
        const genericToken = anyToken;
        const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
        if (ret !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "paragraph", "text"].includes(genericToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "space": {
          out += this.renderer.space(token);
          continue;
        }
        case "hr": {
          out += this.renderer.hr(token);
          continue;
        }
        case "heading": {
          out += this.renderer.heading(token);
          continue;
        }
        case "code": {
          out += this.renderer.code(token);
          continue;
        }
        case "table": {
          out += this.renderer.table(token);
          continue;
        }
        case "blockquote": {
          out += this.renderer.blockquote(token);
          continue;
        }
        case "list": {
          out += this.renderer.list(token);
          continue;
        }
        case "html": {
          out += this.renderer.html(token);
          continue;
        }
        case "paragraph": {
          out += this.renderer.paragraph(token);
          continue;
        }
        case "text": {
          let textToken = token;
          let body = this.renderer.text(textToken);
          while (i + 1 < tokens.length && tokens[i + 1].type === "text") {
            textToken = tokens[++i];
            body += "\n" + this.renderer.text(textToken);
          }
          if (top) {
            out += this.renderer.paragraph({
              type: "paragraph",
              raw: body,
              text: body,
              tokens: [{ type: "text", raw: body, text: body }]
            });
          } else {
            out += body;
          }
          continue;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
  /**
   * Parse Inline Tokens
   */
  parseInline(tokens, renderer) {
    renderer = renderer || this.renderer;
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions && this.options.extensions.renderers && this.options.extensions.renderers[anyToken.type]) {
        const ret = this.options.extensions.renderers[anyToken.type].call({ parser: this }, anyToken);
        if (ret !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(anyToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "escape": {
          out += renderer.text(token);
          break;
        }
        case "html": {
          out += renderer.html(token);
          break;
        }
        case "link": {
          out += renderer.link(token);
          break;
        }
        case "image": {
          out += renderer.image(token);
          break;
        }
        case "strong": {
          out += renderer.strong(token);
          break;
        }
        case "em": {
          out += renderer.em(token);
          break;
        }
        case "codespan": {
          out += renderer.codespan(token);
          break;
        }
        case "br": {
          out += renderer.br(token);
          break;
        }
        case "del": {
          out += renderer.del(token);
          break;
        }
        case "text": {
          out += renderer.text(token);
          break;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
};
var _Hooks = class {
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "block");
    this.options = options2 || _defaults;
  }
  /**
   * Process markdown before marked
   */
  preprocess(markdown) {
    return markdown;
  }
  /**
   * Process HTML after marked is finished
   */
  postprocess(html2) {
    return html2;
  }
  /**
   * Process all tokens before walk tokens
   */
  processAllTokens(tokens) {
    return tokens;
  }
  /**
   * Provide function to tokenize markdown
   */
  provideLexer() {
    return this.block ? _Lexer.lex : _Lexer.lexInline;
  }
  /**
   * Provide function to parse tokens
   */
  provideParser() {
    return this.block ? _Parser.parse : _Parser.parseInline;
  }
};
__publicField(_Hooks, "passThroughHooks", /* @__PURE__ */ new Set([
  "preprocess",
  "postprocess",
  "processAllTokens"
]));
var Marked = class {
  constructor(...args) {
    __publicField(this, "defaults", _getDefaults());
    __publicField(this, "options", this.setOptions);
    __publicField(this, "parse", this.parseMarkdown(true));
    __publicField(this, "parseInline", this.parseMarkdown(false));
    __publicField(this, "Parser", _Parser);
    __publicField(this, "Renderer", _Renderer);
    __publicField(this, "TextRenderer", _TextRenderer);
    __publicField(this, "Lexer", _Lexer);
    __publicField(this, "Tokenizer", _Tokenizer);
    __publicField(this, "Hooks", _Hooks);
    this.use(...args);
  }
  /**
   * Run callback for every token
   */
  walkTokens(tokens, callback) {
    var _a, _b;
    let values = [];
    for (const token of tokens) {
      values = values.concat(callback.call(this, token));
      switch (token.type) {
        case "table": {
          const tableToken = token;
          for (const cell of tableToken.header) {
            values = values.concat(this.walkTokens(cell.tokens, callback));
          }
          for (const row of tableToken.rows) {
            for (const cell of row) {
              values = values.concat(this.walkTokens(cell.tokens, callback));
            }
          }
          break;
        }
        case "list": {
          const listToken = token;
          values = values.concat(this.walkTokens(listToken.items, callback));
          break;
        }
        default: {
          const genericToken = token;
          if ((_b = (_a = this.defaults.extensions) == null ? void 0 : _a.childTokens) == null ? void 0 : _b[genericToken.type]) {
            this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
              const tokens2 = genericToken[childTokens].flat(Infinity);
              values = values.concat(this.walkTokens(tokens2, callback));
            });
          } else if (genericToken.tokens) {
            values = values.concat(this.walkTokens(genericToken.tokens, callback));
          }
        }
      }
    }
    return values;
  }
  use(...args) {
    const extensions = this.defaults.extensions || { renderers: {}, childTokens: {} };
    args.forEach((pack) => {
      const opts = { ...pack };
      opts.async = this.defaults.async || opts.async || false;
      if (pack.extensions) {
        pack.extensions.forEach((ext) => {
          if (!ext.name) {
            throw new Error("extension name required");
          }
          if ("renderer" in ext) {
            const prevRenderer = extensions.renderers[ext.name];
            if (prevRenderer) {
              extensions.renderers[ext.name] = function(...args2) {
                let ret = ext.renderer.apply(this, args2);
                if (ret === false) {
                  ret = prevRenderer.apply(this, args2);
                }
                return ret;
              };
            } else {
              extensions.renderers[ext.name] = ext.renderer;
            }
          }
          if ("tokenizer" in ext) {
            if (!ext.level || ext.level !== "block" && ext.level !== "inline") {
              throw new Error("extension level must be 'block' or 'inline'");
            }
            const extLevel = extensions[ext.level];
            if (extLevel) {
              extLevel.unshift(ext.tokenizer);
            } else {
              extensions[ext.level] = [ext.tokenizer];
            }
            if (ext.start) {
              if (ext.level === "block") {
                if (extensions.startBlock) {
                  extensions.startBlock.push(ext.start);
                } else {
                  extensions.startBlock = [ext.start];
                }
              } else if (ext.level === "inline") {
                if (extensions.startInline) {
                  extensions.startInline.push(ext.start);
                } else {
                  extensions.startInline = [ext.start];
                }
              }
            }
          }
          if ("childTokens" in ext && ext.childTokens) {
            extensions.childTokens[ext.name] = ext.childTokens;
          }
        });
        opts.extensions = extensions;
      }
      if (pack.renderer) {
        const renderer = this.defaults.renderer || new _Renderer(this.defaults);
        for (const prop in pack.renderer) {
          if (!(prop in renderer)) {
            throw new Error(`renderer '${prop}' does not exist`);
          }
          if (["options", "parser"].includes(prop)) {
            continue;
          }
          const rendererProp = prop;
          const rendererFunc = pack.renderer[rendererProp];
          const prevRenderer = renderer[rendererProp];
          renderer[rendererProp] = (...args2) => {
            let ret = rendererFunc.apply(renderer, args2);
            if (ret === false) {
              ret = prevRenderer.apply(renderer, args2);
            }
            return ret || "";
          };
        }
        opts.renderer = renderer;
      }
      if (pack.tokenizer) {
        const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
        for (const prop in pack.tokenizer) {
          if (!(prop in tokenizer)) {
            throw new Error(`tokenizer '${prop}' does not exist`);
          }
          if (["options", "rules", "lexer"].includes(prop)) {
            continue;
          }
          const tokenizerProp = prop;
          const tokenizerFunc = pack.tokenizer[tokenizerProp];
          const prevTokenizer = tokenizer[tokenizerProp];
          tokenizer[tokenizerProp] = (...args2) => {
            let ret = tokenizerFunc.apply(tokenizer, args2);
            if (ret === false) {
              ret = prevTokenizer.apply(tokenizer, args2);
            }
            return ret;
          };
        }
        opts.tokenizer = tokenizer;
      }
      if (pack.hooks) {
        const hooks = this.defaults.hooks || new _Hooks();
        for (const prop in pack.hooks) {
          if (!(prop in hooks)) {
            throw new Error(`hook '${prop}' does not exist`);
          }
          if (["options", "block"].includes(prop)) {
            continue;
          }
          const hooksProp = prop;
          const hooksFunc = pack.hooks[hooksProp];
          const prevHook = hooks[hooksProp];
          if (_Hooks.passThroughHooks.has(prop)) {
            hooks[hooksProp] = (arg) => {
              if (this.defaults.async) {
                return Promise.resolve(hooksFunc.call(hooks, arg)).then((ret2) => {
                  return prevHook.call(hooks, ret2);
                });
              }
              const ret = hooksFunc.call(hooks, arg);
              return prevHook.call(hooks, ret);
            };
          } else {
            hooks[hooksProp] = (...args2) => {
              let ret = hooksFunc.apply(hooks, args2);
              if (ret === false) {
                ret = prevHook.apply(hooks, args2);
              }
              return ret;
            };
          }
        }
        opts.hooks = hooks;
      }
      if (pack.walkTokens) {
        const walkTokens2 = this.defaults.walkTokens;
        const packWalktokens = pack.walkTokens;
        opts.walkTokens = function(token) {
          let values = [];
          values.push(packWalktokens.call(this, token));
          if (walkTokens2) {
            values = values.concat(walkTokens2.call(this, token));
          }
          return values;
        };
      }
      this.defaults = { ...this.defaults, ...opts };
    });
    return this;
  }
  setOptions(opt) {
    this.defaults = { ...this.defaults, ...opt };
    return this;
  }
  lexer(src, options2) {
    return _Lexer.lex(src, options2 != null ? options2 : this.defaults);
  }
  parser(tokens, options2) {
    return _Parser.parse(tokens, options2 != null ? options2 : this.defaults);
  }
  parseMarkdown(blockType) {
    const parse = (src, options2) => {
      const origOpt = { ...options2 };
      const opt = { ...this.defaults, ...origOpt };
      const throwError = this.onError(!!opt.silent, !!opt.async);
      if (this.defaults.async === true && origOpt.async === false) {
        return throwError(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      }
      if (typeof src === "undefined" || src === null) {
        return throwError(new Error("marked(): input parameter is undefined or null"));
      }
      if (typeof src !== "string") {
        return throwError(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(src) + ", string expected"));
      }
      if (opt.hooks) {
        opt.hooks.options = opt;
        opt.hooks.block = blockType;
      }
      const lexer2 = opt.hooks ? opt.hooks.provideLexer() : blockType ? _Lexer.lex : _Lexer.lexInline;
      const parser2 = opt.hooks ? opt.hooks.provideParser() : blockType ? _Parser.parse : _Parser.parseInline;
      if (opt.async) {
        return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src).then((src2) => lexer2(src2, opt)).then((tokens) => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens).then((tokens) => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens).then((tokens) => parser2(tokens, opt)).then((html2) => opt.hooks ? opt.hooks.postprocess(html2) : html2).catch(throwError);
      }
      try {
        if (opt.hooks) {
          src = opt.hooks.preprocess(src);
        }
        let tokens = lexer2(src, opt);
        if (opt.hooks) {
          tokens = opt.hooks.processAllTokens(tokens);
        }
        if (opt.walkTokens) {
          this.walkTokens(tokens, opt.walkTokens);
        }
        let html2 = parser2(tokens, opt);
        if (opt.hooks) {
          html2 = opt.hooks.postprocess(html2);
        }
        return html2;
      } catch (e) {
        return throwError(e);
      }
    };
    return parse;
  }
  onError(silent, async) {
    return (e) => {
      e.message += "\nPlease report this to https://github.com/markedjs/marked.";
      if (silent) {
        const msg = "<p>An error occurred:</p><pre>" + escape$1(e.message + "", true) + "</pre>";
        if (async) {
          return Promise.resolve(msg);
        }
        return msg;
      }
      if (async) {
        return Promise.reject(e);
      }
      throw e;
    };
  }
};
var markedInstance = new Marked();
function marked(src, opt) {
  return markedInstance.parse(src, opt);
}
marked.options = marked.setOptions = function(options2) {
  markedInstance.setOptions(options2);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.getDefaults = _getDefaults;
marked.defaults = _defaults;
marked.use = function(...args) {
  markedInstance.use(...args);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.walkTokens = function(tokens, callback) {
  return markedInstance.walkTokens(tokens, callback);
};
marked.parseInline = markedInstance.parseInline;
marked.Parser = _Parser;
marked.parser = _Parser.parse;
marked.Renderer = _Renderer;
marked.TextRenderer = _TextRenderer;
marked.Lexer = _Lexer;
marked.lexer = _Lexer.lex;
marked.Tokenizer = _Tokenizer;
marked.Hooks = _Hooks;
marked.parse = marked;
var options = marked.options;
var setOptions = marked.setOptions;
var use = marked.use;
var walkTokens = marked.walkTokens;
var parseInline = marked.parseInline;
var parser = _Parser.parse;
var lexer = _Lexer.lex;

// src/converter/markdown-to-storage.ts
function markdownToStorageFormat(markdown) {
  const placeholders = /* @__PURE__ */ new Map();
  let phId = 0;
  const cfXmlRe = /<ac:(image|structured-macro|link)\b[\s\S]*?<\/ac:\1>/g;
  const prepared = markdown.replace(cfXmlRe, (match) => {
    const key = `CFXMLPH${phId++}ENDPH`;
    placeholders.set(key, match);
    return key;
  });
  const renderer = new _Renderer();
  renderer.heading = function({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    return `<h${depth}>${text}</h${depth}>
`;
  };
  renderer.code = function(_token) {
    const { text, lang } = _token;
    const langParam = lang ? `<ac:parameter ac:name="language">${escapeXml2(lang)}</ac:parameter>` : "";
    return `<ac:structured-macro ac:name="code">` + langParam + `<ac:plain-text-body><![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]></ac:plain-text-body></ac:structured-macro>
`;
  };
  renderer.blockquote = function({ tokens }) {
    const body = this.parser.parse(tokens);
    return `<blockquote>${body}</blockquote>
`;
  };
  renderer.hr = function(_token) {
    return `<hr/>
`;
  };
  renderer.list = function(token) {
    const tag2 = token.ordered ? "ol" : "ul";
    let body = "";
    for (const item of token.items) {
      body += this.listitem(item);
    }
    return `<${tag2}>
${body}</${tag2}>
`;
  };
  renderer.listitem = function(item) {
    let itemBody = "";
    if (item.task) {
      const checkbox = item.checked ? "<ac:task-status>complete</ac:task-status>" : "<ac:task-status>incomplete</ac:task-status>";
      const innerText = this.parser.parse(item.tokens);
      itemBody = `<ac:task>${checkbox}<ac:task-body>${innerText}</ac:task-body></ac:task>`;
    } else {
      itemBody = this.parser.parse(item.tokens);
    }
    return `<li>${itemBody}</li>
`;
  };
  renderer.paragraph = function({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<p>${text}</p>
`;
  };
  renderer.table = function(token) {
    let headerRow = "<tr>\n";
    for (const cell of token.header) {
      const content = this.parser.parseInline(cell.tokens);
      headerRow += `<th>${content}</th>
`;
    }
    headerRow += "</tr>\n";
    let bodyRows = "";
    for (const row of token.rows) {
      bodyRows += "<tr>\n";
      for (const cell of row) {
        const content = this.parser.parseInline(cell.tokens);
        bodyRows += `<td>${content}</td>
`;
      }
      bodyRows += "</tr>\n";
    }
    return `<table><tbody>
${headerRow}${bodyRows}</tbody></table>
`;
  };
  renderer.html = function({ text }) {
    return text;
  };
  renderer.strong = function({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<strong>${text}</strong>`;
  };
  renderer.em = function({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<em>${text}</em>`;
  };
  renderer.codespan = function({ text }) {
    return `<code>${text}</code>`;
  };
  renderer.br = function(_token) {
    return `<br/>`;
  };
  renderer.del = function({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<del>${text}</del>`;
  };
  renderer.link = function({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeXml2(title)}"` : "";
    return `<a href="${escapeXml2(href)}"${titleAttr}>${text}</a>`;
  };
  renderer.image = function({ href, title, text }) {
    const altAttr = text || title ? ` ac:alt="${escapeXml2(text || title || "")}"` : "";
    const xml = `<ac:image${altAttr}><ri:url ri:value="${escapeXml2(href)}"/></ac:image>`;
    const key = `CFXMLPH${phId++}ENDPH`;
    placeholders.set(key, xml);
    return key;
  };
  renderer.text = function(token) {
    if ("tokens" in token && token.tokens && token.tokens.length > 0) {
      return this.parser.parseInline(token.tokens);
    }
    return token.text;
  };
  renderer.space = function(_token) {
    return "";
  };
  const marked2 = new Marked({ renderer });
  let result = marked2.parse(prepared);
  const blockTags = /* @__PURE__ */ new Set(["image", "structured-macro"]);
  for (const [key, xml] of placeholders) {
    const tagMatch = xml.match(/^<ac:(\w[\w-]*)/);
    const isBlock = tagMatch ? blockTags.has(tagMatch[1]) : false;
    if (isBlock) {
      result = result.replace(
        new RegExp(`<p>\\s*${key}\\s*</p>`),
        xml + "\n"
      );
    }
    result = result.replace(new RegExp(key, "g"), xml);
  }
  return result;
}
function escapeXml2(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/publisher.ts
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function getMimeType(ext) {
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp"
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}
var Publisher = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.client = new ConfluenceClient(
      settings.confluenceUrl,
      settings.authType,
      settings.token,
      settings.username,
      settings.password
    );
  }
  async *publish(files, spaceKey, parentPageId) {
    var _a, _b;
    yield { type: "start", total: files.length };
    const entries = [];
    for (const file of files) {
      const raw = await this.app.vault.cachedRead(file);
      const { frontmatter, body } = this.parseFrontmatter(raw);
      const title = this.resolveTitle(file, frontmatter);
      const existingId = frontmatter["confluence-page-id"] || null;
      entries.push({ file, title, frontmatter, body, confluenceId: existingId });
    }
    const titleToPath = /* @__PURE__ */ new Map();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        if (entry.confluenceId) {
          titleToPath.set(entry.title, entry.file.path);
          yield { type: "page_created", title: entry.title, index: i };
          continue;
        }
        const existingId = await this.client.findPageByTitle(
          spaceKey,
          entry.title
        );
        if (existingId) {
          entry.confluenceId = existingId;
        } else {
          const page = await this.client.createPage(
            spaceKey,
            parentPageId,
            entry.title,
            "<p>Importing from Obsidian...</p>"
          );
          entry.confluenceId = page.id;
        }
        titleToPath.set(entry.title, entry.file.path);
        yield { type: "page_created", title: entry.title, index: i };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        yield { type: "error", title: entry.title, error: msg };
        entry.confluenceId = null;
      }
    }
    const publishedFiles = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      if (entry.confluenceId) {
        publishedFiles.set(entry.file.path, entry.title);
      }
    }
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.confluenceId) {
        skipped++;
        continue;
      }
      try {
        const { content: preprocessed, images } = await preprocessObsidianSyntax(
          entry.body,
          entry.file,
          this.app,
          publishedFiles,
          spaceKey
        );
        const storageBody = markdownToStorageFormat(preprocessed);
        const { uploaded } = await this.uploadImages(entry.confluenceId, images);
        for (const filename of uploaded) {
          yield { type: "image_uploaded", filename };
        }
        const currentPage = await this.client.getPage(entry.confluenceId);
        await this.client.updatePage(
          entry.confluenceId,
          entry.title,
          storageBody,
          currentPage.version.number
        );
        const webui = (_b = (_a = currentPage._links) == null ? void 0 : _a.webui) != null ? _b : `/pages/viewpage.action?pageId=${entry.confluenceId}`;
        await this.writeFrontmatterId(
          entry.file,
          entry.confluenceId,
          webui
        );
        succeeded++;
        yield { type: "page_updated", title: entry.title, index: i };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        yield { type: "error", title: entry.title, error: msg };
      }
    }
    yield { type: "complete", succeeded, failed, skipped };
  }
  parseFrontmatter(raw) {
    const match = raw.match(FRONTMATTER_RE);
    if (!match) {
      return { frontmatter: {}, body: raw };
    }
    try {
      const fm = (0, import_obsidian5.parseYaml)(match[1]) || {};
      const body = raw.slice(match[0].length);
      return { frontmatter: fm, body };
    } catch (e) {
      return { frontmatter: {}, body: raw };
    }
  }
  resolveTitle(file, frontmatter) {
    let title;
    if (this.settings.titleSource === "frontmatter" && typeof frontmatter["title"] === "string" && frontmatter["title"].trim()) {
      title = frontmatter["title"].trim();
    } else {
      title = file.basename;
    }
    return title;
  }
  async uploadImages(pageId, images) {
    const uploaded = [];
    const skipped = [];
    let existing;
    try {
      existing = await this.client.getAttachmentFilenames(pageId);
    } catch (e) {
      existing = /* @__PURE__ */ new Set();
    }
    for (const img of images) {
      if (!img.resolvedPath) continue;
      const file = this.app.vault.getAbstractFileByPath(img.resolvedPath);
      if (!file || !(file instanceof import_obsidian5.TFile)) continue;
      if (existing.has(img.filename)) {
        console.log(`[confluence-publisher] Skipping already uploaded: ${img.filename}`);
        skipped.push(img.filename);
        continue;
      }
      try {
        const data = await this.app.vault.readBinary(file);
        const mimeType = getMimeType(file.extension);
        await this.client.uploadAttachment(
          pageId,
          img.filename,
          data,
          mimeType
        );
        uploaded.push(img.filename);
      } catch (e) {
        console.warn(
          `Failed to upload attachment ${img.filename}:`,
          e
        );
      }
    }
    return { uploaded, skipped };
  }
  async writeFrontmatterId(file, pageId, webui) {
    const raw = await this.app.vault.read(file);
    const confluenceUrl = `${this.settings.confluenceUrl}${webui}`;
    const match = raw.match(FRONTMATTER_RE);
    if (match) {
      try {
        const fm = (0, import_obsidian5.parseYaml)(match[1]) || {};
        fm["confluence-page-id"] = pageId;
        fm["confluence-url"] = confluenceUrl;
        const newFm = `---
${(0, import_obsidian5.stringifyYaml)(fm)}---
`;
        const newContent = newFm + raw.slice(match[0].length);
        await this.app.vault.modify(file, newContent);
      } catch (e) {
      }
    } else {
      const fm = {
        "confluence-page-id": pageId,
        "confluence-url": confluenceUrl
      };
      const newContent = `---
${(0, import_obsidian5.stringifyYaml)(fm)}---
${raw}`;
      await this.app.vault.modify(file, newContent);
    }
  }
};

// src/main.ts
var ConfluencePublisherPlugin = class extends import_obsidian6.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ConfluenceSettingTab(this.app, this));
    this.addCommand({
      id: "publish-selected",
      name: "Publish selected notes to Confluence",
      callback: () => {
        if (!this.validateSettings()) return;
        new FileSelectModal(
          this.app,
          (files) => this.selectDestinationAndPublish(files)
        ).open();
      }
    });
    this.addCommand({
      id: "publish-current",
      name: "Publish current note to Confluence",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (checking) return true;
        if (!this.validateSettings()) return true;
        this.selectDestinationAndPublish([file]);
        return true;
      }
    });
    this.addCommand({
      id: "update-published",
      name: "Update already published notes",
      callback: async () => {
        if (!this.validateSettings()) return;
        const publishedFiles = this.findPublishedFiles();
        if (publishedFiles.length === 0) {
          new import_obsidian6.Notice("No published notes found (no confluence-page-id in frontmatter)");
          return;
        }
        this.selectDestinationAndPublish(publishedFiles);
      }
    });
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = data ? migrateSettings(data) : { ...DEFAULT_SETTINGS };
  }
  validateSettings() {
    const s = this.settings;
    if (!s.confluenceUrl) {
      new import_obsidian6.Notice("Please configure Confluence URL in settings.");
      return false;
    }
    if (s.destinations.length === 0) {
      new import_obsidian6.Notice("Please add at least one destination in settings.");
      return false;
    }
    if (s.authType === "pat" && !s.token) {
      new import_obsidian6.Notice("Please set your Personal Access Token in settings.");
      return false;
    }
    if (s.authType === "basic" && (!s.username || !s.password)) {
      new import_obsidian6.Notice("Please set username and password in settings.");
      return false;
    }
    return true;
  }
  selectDestinationAndPublish(files) {
    if (files.length === 0) {
      new import_obsidian6.Notice("No files selected.");
      return;
    }
    const dests = this.settings.destinations;
    if (dests.length === 1) {
      this.runPublish(files, dests[0]);
      return;
    }
    new DestinationSelectModal(this.app, dests, (dest) => {
      this.runPublish(files, dest);
    }).open();
  }
  async runPublish(files, destination) {
    const progressModal = new ProgressModal(this.app);
    progressModal.open();
    const publisher = new Publisher(this.app, this.settings);
    try {
      for await (const event of publisher.publish(
        files,
        destination.spaceKey,
        destination.parentPageId
      )) {
        progressModal.handleEvent(event);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new import_obsidian6.Notice(`Publishing failed: ${msg}`);
      progressModal.handleEvent({
        type: "complete",
        succeeded: 0,
        failed: files.length,
        skipped: 0
      });
    }
  }
  findPublishedFiles() {
    var _a;
    const files = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if ((_a = cache == null ? void 0 : cache.frontmatter) == null ? void 0 : _a["confluence-page-id"]) {
        files.push(file);
      }
    }
    return files;
  }
};
