var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ConfluencePublisherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_crypto3 = require("crypto");
var import_obsidian6 = require("obsidian");

// src/settings.ts
var import_crypto = require("crypto");
var import_obsidian = require("obsidian");

// src/domain/validation.ts
function validateDestination(destination) {
  const value = isRecord(destination) ? destination : {};
  const errors = [];
  if (!isNonEmptyString(value.id)) errors.push("Destination ID is required.");
  if (!isNonEmptyString(value.spaceKey)) errors.push("Space key is required.");
  if (!isNonEmptyString(value.parentPageId)) errors.push("Parent page ID is required.");
  return errors;
}
function validatePublishFiles(files) {
  if (files.length === 0) return ["Select at least one Markdown file."];
  return files.filter((file) => file.extension.toLowerCase() !== "md").map((file) => `${file.path} is not a Markdown file.`);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// src/domain/settings.ts
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
function migrateSettings(data, createId) {
  const validSource = isRecord2(data);
  const source = validSource ? data : {};
  let changed = !validSource;
  let rawDestinations = Array.isArray(source.destinations) ? source.destinations : [];
  if (!Array.isArray(source.destinations)) changed = true;
  const hasValidatedLegacyPair = typeof source.spaceKey === "string" && typeof source.parentPageId === "string";
  if (rawDestinations.length === 0 && hasValidatedLegacyPair) {
    rawDestinations = [{
      id: createId(),
      label: source.spaceKey,
      spaceKey: source.spaceKey,
      parentPageId: source.parentPageId
    }];
    changed = true;
  }
  const destinations = rawDestinations.map((value) => {
    const destination = isRecord2(value) ? value : {};
    const id = typeof destination.id === "string" && destination.id.trim().length > 0 ? destination.id : createId();
    const label = typeof destination.label === "string" ? destination.label : "";
    const spaceKey = typeof destination.spaceKey === "string" ? destination.spaceKey : "";
    const parentPageId = typeof destination.parentPageId === "string" ? destination.parentPageId : "";
    if (!isRecord2(value) || destination.id !== id || destination.label !== label || destination.spaceKey !== spaceKey || destination.parentPageId !== parentPageId) {
      changed = true;
    }
    return { ...destination, id, label, spaceKey, parentPageId };
  });
  if (hasValidatedLegacyPair) changed = true;
  const confluenceUrl = normalizeStringSetting(source.confluenceUrl, DEFAULT_SETTINGS.confluenceUrl);
  const token = normalizeStringSetting(source.token, DEFAULT_SETTINGS.token);
  const username = normalizeStringSetting(source.username, DEFAULT_SETTINGS.username);
  const password = normalizeStringSetting(source.password, DEFAULT_SETTINGS.password);
  const authType = source.authType === "pat" || source.authType === "basic" ? source.authType : DEFAULT_SETTINGS.authType;
  const stripFrontmatter = typeof source.stripFrontmatter === "boolean" ? source.stripFrontmatter : DEFAULT_SETTINGS.stripFrontmatter;
  const titleSource = source.titleSource === "frontmatter" || source.titleSource === "filename" ? source.titleSource : DEFAULT_SETTINGS.titleSource;
  if (source.confluenceUrl !== confluenceUrl || source.authType !== authType || source.token !== token || source.username !== username || source.password !== password || source.stripFrontmatter !== stripFrontmatter || source.titleSource !== titleSource) {
    changed = true;
  }
  const settings = {
    ...source,
    confluenceUrl,
    destinations,
    authType,
    token,
    username,
    password,
    stripFrontmatter,
    titleSource
  };
  if (hasValidatedLegacyPair) {
    delete settings.spaceKey;
    delete settings.parentPageId;
  }
  return { settings, changed };
}
async function loadMigratedSettings(data, createId, save) {
  const migration = migrateSettings(data, createId);
  if (migration.changed) await save(migration.settings);
  return migration.settings;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeStringSetting(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

// src/settings.ts
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
          id: (0, import_crypto.randomUUID)(),
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
      const validationEl = row.createDiv({ cls: "setting-item-description" });
      const updateValidation = () => {
        const errors = validateDestination(dest).filter(
          (error) => error === "Space key is required." || error === "Parent page ID is required."
        );
        validationEl.textContent = errors.join(" ");
        validationEl.style.color = errors.length > 0 ? "var(--text-error)" : "";
      };
      updateValidation();
      new import_obsidian.Setting(row).setName("Label").addText(
        (text) => text.setPlaceholder("e.g. Research Space").setValue(dest.label).onChange(async (value) => {
          dest.label = value.trim();
          await this.plugin.saveData(this.plugin.settings);
        })
      );
      new import_obsidian.Setting(row).setName("Space key").addText(
        (text) => text.setPlaceholder("RESEARCH").setValue(dest.spaceKey).onChange(async (value) => {
          dest.spaceKey = value.trim();
          updateValidation();
          await this.plugin.saveData(this.plugin.settings);
        })
      );
      new import_obsidian.Setting(row).setName("Parent page ID").addText(
        (text) => text.setPlaceholder("12345").setValue(dest.parentPageId).onChange(async (value) => {
          dest.parentPageId = value.trim();
          updateValidation();
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

.confluence-child-pages-option {
  margin: 0 0 12px;
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
      const files = Array.from(this.selectedFiles).filter(isMarkdownFile);
      if (files.length === 0) return;
      this.close();
      const mainFile = this.app.workspace.getActiveFile();
      const outgoing = this.getRelatedFiles(mainFile).outgoing;
      this.onSubmit({
        files,
        mainFile: mainFile instanceof import_obsidian2.TFile ? mainFile : null,
        outgoingChildPaths: this.childPagesOption.checked ? new Set(outgoing.filter((file) => this.selectedFiles.has(file)).map((file) => file.path)) : /* @__PURE__ */ new Set()
      });
    });
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && isMarkdownFile(activeFile)) {
      this.selectedFiles.add(activeFile);
    }
    const option = contentEl.createEl("label", { cls: "confluence-child-pages-option" });
    this.childPagesOption = option.createEl("input", { type: "checkbox" });
    option.appendText(" Publish selected outgoing links as child pages of the current note");
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
    this.updateChildPagesOption(activeFile, outgoing);
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
    if (!isMarkdownFile(file)) return;
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
  updateChildPagesOption(activeFile, outgoing) {
    const eligible = activeFile instanceof import_obsidian2.TFile && this.selectedFiles.has(activeFile) && outgoing.some((file) => this.selectedFiles.has(file));
    this.childPagesOption.disabled = !eligible;
    if (!eligible) this.childPagesOption.checked = false;
  }
  onClose() {
    this.contentEl.empty();
    if (this.styleEl) {
      this.styleEl.remove();
    }
  }
};
function isMarkdownFile(file) {
  return file.extension.toLowerCase() === "md";
}

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
    const valid = this.destinations.filter(
      (destination) => validateDestination(destination).length === 0
    );
    if (!lower) return valid;
    return valid.filter(
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

// src/ui/progress-state.ts
function initialProgressState() {
  return {
    totalPages: 0,
    completedPages: 0,
    succeeded: 0,
    failed: 0,
    done: false,
    cancelled: false,
    label: "Preparing..."
  };
}
function createCancelHandler(onCancel) {
  let cancelled = false;
  return () => {
    if (cancelled) return;
    cancelled = true;
    onCancel();
  };
}
function reduceProgress(state, event) {
  if (state.done) return state;
  switch (event.type) {
    case "planned":
      return runningState(state, { totalPages: event.total });
    case "page-updated":
      return runningState(state, {
        completedPages: Math.min(state.completedPages + 1, state.totalPages)
      });
    case "failed":
      if (event.phase !== "content-update") return state;
      return runningState(state, {
        completedPages: Math.min(state.completedPages + 1, state.totalPages)
      });
    case "cancelled":
      return {
        ...state,
        succeeded: event.succeeded,
        failed: event.failed,
        done: true,
        cancelled: true,
        label: "Publishing cancelled."
      };
    case "complete":
      return {
        ...state,
        completedPages: state.totalPages,
        succeeded: event.succeeded,
        failed: event.failed,
        done: true,
        label: `Done \u2014 ${event.succeeded} succeeded, ${event.failed} failed`
      };
    case "page-created":
    case "attachment-created":
    case "attachment-updated":
      return state;
  }
}
function runningState(state, changes) {
  const next = { ...state, ...changes };
  return {
    ...next,
    label: `Publishing ${next.completedPages} / ${next.totalPages} pages...`
  };
}

// src/ui/progress-modal.ts
var ProgressModal = class extends import_obsidian4.Modal {
  constructor(app, onCancel) {
    super(app);
    this.state = initialProgressState();
    this.cancel = createCancelHandler(onCancel);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("confluence-progress");
    contentEl.createEl("h2", { text: "Publishing to Confluence" });
    this.statusEl = contentEl.createDiv({ cls: "confluence-progress-status" });
    this.statusEl.textContent = this.state.label;
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
    this.actionBtn = contentEl.createEl("button", {
      text: "Cancel",
      cls: "mod-cta"
    });
    this.actionBtn.style.marginTop = "12px";
    this.actionBtn.addEventListener("click", () => {
      if (this.state.done) this.close();
      else this.cancel();
    });
  }
  handleEvent(event) {
    this.appendEvent(event);
    this.state = reduceProgress(this.state, event);
    this.statusEl.textContent = this.state.label;
    this.progressBar.value = progressPercent(this.state);
    if (this.state.done) this.actionBtn.textContent = "Close";
  }
  appendEvent(event) {
    var _a;
    switch (event.type) {
      case "page-created":
        this.appendLog("created", event.title);
        break;
      case "attachment-created":
      case "attachment-updated":
        this.appendLog("image", event.filename);
        break;
      case "page-updated":
        this.appendLog("updated", event.title);
        break;
      case "failed":
        this.appendLog("error", `${(_a = event.title) != null ? _a : "Publish"}: ${event.error}`);
        break;
      case "planned":
      case "cancelled":
      case "complete":
        break;
    }
  }
  appendLog(kind, message) {
    const line = this.logEl.createDiv({ cls: "confluence-log-line" });
    const icon = { created: "\u2795", updated: "\u2705", image: "\u{1F5BC}", error: "\u274C" }[kind];
    line.style.padding = "2px 0";
    if (kind === "error") line.style.color = "var(--text-error, #e53e3e)";
    line.textContent = `${icon} ${message}`;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  onClose() {
    if (!this.state.done) this.cancel();
    this.contentEl.empty();
  }
};
function progressPercent(state) {
  if (state.done) return 100;
  if (state.totalPages === 0) return 0;
  return Math.round(state.completedPages / state.totalPages * 100);
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

// src/converter/attachment-name.ts
var import_crypto2 = require("crypto");
function attachmentNameForPath(vaultPath) {
  const normalizedPath = vaultPath.replace(/\\/g, "/");
  const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  const dot = basename.lastIndexOf(".");
  const stem = dot > 0 ? basename.slice(0, dot) : basename;
  const safeExtension = dot > 0 ? basename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") : "";
  const extension = safeExtension ? `.${safeExtension}` : "";
  const safeStem = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
  const digest = (0, import_crypto2.createHash)("sha256").update(normalizedPath).digest("hex").slice(0, 12);
  return `${safeStem}-${digest}${extension}`;
}

// src/converter/obsidian-marked-extension.ts
var IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|svg|webp|bmp)$/i;
var CALLOUT_START = /^>[ \t]?\[!(\w+)\]([+-])?[ \t]*(.*?)(\r?\n|$)/;
var NEXT_CALLOUT = /^>[ \t]?\[!\w+\]/;
function nullablePart(value) {
  return value ? value : null;
}
function splitAlias(body) {
  const separator = body.indexOf("|");
  if (separator === -1) {
    return { target: body, alias: null };
  }
  return {
    target: body.slice(0, separator),
    alias: nullablePart(body.slice(separator + 1))
  };
}
function isImageTarget(target) {
  return IMAGE_EXTENSION.test(target);
}
function openingFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
  if (!match || match[1][0] === "`" && match[2].includes("`")) {
    return null;
  }
  return { delimiter: match[1] };
}
function closesFence(line, fence) {
  const candidate = line.replace(/^ {0,3}/, "");
  return candidate.startsWith(fence.delimiter) && /^[~`]* *$/.test(candidate.slice(fence.delimiter.length));
}
var calloutExtension = {
  name: "obsidian-callout",
  level: "block",
  start(src) {
    return src.search(/^>[ \t]?\[!\w+\]/m);
  },
  tokenizer(src) {
    const header = CALLOUT_START.exec(src);
    if (!header) {
      return void 0;
    }
    let raw = header[0];
    let body = "";
    let offset = raw.length;
    let fence = null;
    while (offset < src.length) {
      const remaining = src.slice(offset);
      if (!remaining.startsWith(">")) {
        break;
      }
      const newline2 = remaining.indexOf("\n");
      const lineLength = newline2 === -1 ? remaining.length : newline2 + 1;
      const line = remaining.slice(0, lineLength);
      const bodyLine = line.replace(/^>[ \t]?/, "");
      const bodyLineWithoutEnding = bodyLine.replace(/\r?\n$/, "");
      if (fence === null && NEXT_CALLOUT.test(remaining)) {
        break;
      }
      raw += line;
      body += bodyLine;
      offset += lineLength;
      if (fence === null) {
        fence = openingFence(bodyLineWithoutEnding);
      } else if (closesFence(bodyLineWithoutEnding, fence)) {
        fence = null;
      }
    }
    const marker = header[2];
    const token = {
      type: "obsidian-callout",
      raw,
      calloutType: header[1],
      title: nullablePart(header[3].trim()),
      folded: marker === "-" ? true : marker === "+" ? false : null,
      tokens: body ? this.lexer.blockTokens(body) : []
    };
    return token;
  },
  childTokens: ["tokens"]
};
var imageExtension = {
  name: "obsidian-image",
  level: "inline",
  start(src) {
    return src.indexOf("![[");
  },
  tokenizer(src) {
    const match = /^!\[\[([^\]\r\n]*)\]\]/.exec(src);
    if (!match) {
      return void 0;
    }
    const body = match[1];
    if (!body || body.includes("[[")) {
      return void 0;
    }
    const { target, alias } = splitAlias(body);
    if (!isImageTarget(target)) {
      return void 0;
    }
    const numericWidth = alias !== null && /^\d+$/.test(alias) ? Number(alias) : null;
    const hasWidth = numericWidth !== null && Number.isFinite(numericWidth);
    const token = {
      type: "obsidian-image",
      raw: match[0],
      target,
      width: hasWidth ? numericWidth : null,
      alt: hasWidth ? null : alias
    };
    return token;
  }
};
var wikiLinkExtension = {
  name: "obsidian-wikilink",
  level: "inline",
  start(src) {
    return src.search(/!?\[\[/);
  },
  tokenizer(src) {
    const match = /^(!?)\[\[([^\]\r\n]*)\]\]/.exec(src);
    if (!match) {
      return void 0;
    }
    const body = match[2];
    if (!body || body.includes("[[")) {
      return void 0;
    }
    const embed = match[1] === "!";
    const { target: targetWithHeading, alias } = splitAlias(body);
    if (embed && isImageTarget(targetWithHeading)) {
      return void 0;
    }
    const headingSeparator = targetWithHeading.indexOf("#");
    const target = headingSeparator === -1 ? targetWithHeading : targetWithHeading.slice(0, headingSeparator);
    const heading2 = headingSeparator === -1 ? null : nullablePart(targetWithHeading.slice(headingSeparator + 1));
    if (!target && !heading2) {
      return void 0;
    }
    const token = {
      type: "obsidian-wikilink",
      raw: match[0],
      target,
      heading: heading2,
      alias,
      embed
    };
    return token;
  }
};
function createMarked() {
  return new Marked({
    extensions: [calloutExtension, imageExtension, wikiLinkExtension]
  });
}
function walkObsidianTokens(tokens) {
  const wikilinks = [];
  const images = [];
  const callouts = [];
  createMarked().walkTokens(tokens, (token) => {
    switch (token.type) {
      case "obsidian-wikilink":
        wikilinks.push(token);
        break;
      case "obsidian-image":
        images.push(token);
        break;
      case "obsidian-callout":
        callouts.push(token);
        break;
    }
  });
  return { wikilinks, images, callouts };
}
function parseObsidianMarkdown(markdown) {
  const tokens = createMarked().lexer(markdown);
  return {
    tokens,
    imageTokens: walkObsidianTokens(tokens).images
  };
}

// src/converter/storage-renderer.ts
function isXmlCharacter(codePoint) {
  return codePoint === 9 || codePoint === 10 || codePoint === 13 || codePoint >= 32 && codePoint <= 55295 || codePoint >= 57344 && codePoint <= 65533 || codePoint >= 65536 && codePoint <= 1114111;
}
function xmlCharacters(value) {
  return Array.from(
    value,
    (character) => {
      var _a;
      return isXmlCharacter((_a = character.codePointAt(0)) != null ? _a : 0) ? character : "\uFFFD";
    }
  ).join("");
}
function escapeXml(value) {
  return xmlCharacters(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function markedText(value) {
  return xmlCharacters(value).replace(/&#39;/g, "&apos;").replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, "&amp;");
}
function hasOnlyXmlEntities(value) {
  return xmlCharacters(value) === value && !/&(?!(?:amp|lt|gt|quot|apos);)/.test(value);
}
function hasSafeCharacterData(value) {
  return !value.includes("]]>") && hasOnlyXmlEntities(value);
}
function hasSafeAttributes(value) {
  let remaining = value;
  const names = /* @__PURE__ */ new Set();
  const attribute = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"]*"|'[^']*')/;
  while (remaining.trim()) {
    const match = attribute.exec(remaining);
    if (!match) return false;
    const name = match[1];
    const attributeValue = match[2].slice(1, -1);
    if (name.includes(":") || names.has(name)) return false;
    if (attributeValue.includes("<") || !hasOnlyXmlEntities(attributeValue)) {
      return false;
    }
    names.add(name);
    remaining = remaining.slice(match[0].length);
  }
  return true;
}
function scanXmlFragment(value, stack) {
  var _a;
  const markup = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>/g;
  let offset = 0;
  for (const match of value.matchAll(markup)) {
    const text = value.slice(offset, match.index);
    if (text.includes("<") || !hasSafeCharacterData(text)) return false;
    const tag2 = match[0];
    offset = ((_a = match.index) != null ? _a : 0) + tag2.length;
    if (tag2.startsWith("<!--")) {
      const comment = tag2.slice(4, -3);
      if (comment.includes("--") || comment.endsWith("-") || xmlCharacters(comment) !== comment) return false;
      continue;
    }
    if (tag2.startsWith("<![CDATA[")) {
      const cdata = tag2.slice(9, -3);
      if (xmlCharacters(cdata) !== cdata) return false;
      continue;
    }
    const closing = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(tag2);
    if (closing) {
      if (stack.pop() !== closing[1]) return false;
      continue;
    }
    const opening = /^<([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)>$/.exec(tag2);
    if (!opening || opening[1].includes(":") || !hasSafeAttributes(opening[2])) {
      return false;
    }
    if (!opening[3]) stack.push(opening[1]);
  }
  const tail = value.slice(offset);
  return !tail.includes("<") && hasSafeCharacterData(tail);
}
function markSafeHtml(tokens, safeTokens) {
  const inlineHtml = tokens.filter(
    (token) => token.type === "html" && !token.block
  );
  if (inlineHtml.length > 0) {
    const stack = [];
    if (inlineHtml.every((token) => scanXmlFragment(token.text, stack)) && stack.length === 0) {
      inlineHtml.forEach((token) => safeTokens.add(token));
    }
  }
  for (const token of tokens) {
    if (token.type === "html" && token.block) {
      const stack = [];
      if (scanXmlFragment(token.text, stack) && stack.length === 0) {
        safeTokens.add(token);
      }
    }
    if ("tokens" in token && Array.isArray(token.tokens)) {
      markSafeHtml(token.tokens, safeTokens);
    }
    if (token.type === "list") {
      for (const item of token.items) markSafeHtml(item.tokens, safeTokens);
    }
    if (token.type === "table") {
      for (const cell of token.header) markSafeHtml(cell.tokens, safeTokens);
      for (const row of token.rows) {
        for (const cell of row) markSafeHtml(cell.tokens, safeTokens);
      }
    }
  }
}
function displayText(token) {
  var _a;
  if (token.alias !== null) return token.alias;
  if (!token.target) return (_a = token.heading) != null ? _a : "";
  return token.heading === null ? token.target : `${token.target}#${token.heading}`;
}
function calloutMacroName(type) {
  switch (type.toUpperCase()) {
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
function parseItemBody(parser2, item) {
  return parser2.parse(item.tokens, !!item.loose);
}
function convertMarkdown(markdown, context) {
  const renderedImages = [];
  const issues = [];
  const safeHtmlTokens = /* @__PURE__ */ new WeakSet();
  let taskId = 0;
  const renderer = new _Renderer();
  renderer.heading = function(token) {
    return `<h${token.depth}>${this.parser.parseInline(token.tokens)}</h${token.depth}>
`;
  };
  renderer.code = function(token) {
    const language = token.lang ? `<ac:parameter ac:name="language">${escapeXml(token.lang)}</ac:parameter>` : "";
    const body = xmlCharacters(token.text).replace(/]]>/g, "]]]]><![CDATA[>");
    return `<ac:structured-macro ac:name="code">${language}<ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body></ac:structured-macro>
`;
  };
  renderer.blockquote = function(token) {
    return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>
`;
  };
  renderer.hr = function() {
    return "<hr/>\n";
  };
  renderer.list = function(token) {
    const normalTag = token.ordered ? "ol" : "ul";
    let output = "";
    let index = 0;
    while (index < token.items.length) {
      const segmentIndex = index;
      const taskSegment = token.items[index].task;
      const segment = [];
      while (index < token.items.length && token.items[index].task === taskSegment) {
        segment.push(token.items[index]);
        index++;
      }
      if (taskSegment) {
        const tasks = segment.map((item) => {
          const status = item.checked ? "complete" : "incomplete";
          const id = ++taskId;
          return `<ac:task><ac:task-id>${id}</ac:task-id><ac:task-status>${status}</ac:task-status><ac:task-body>${parseItemBody(this.parser, item)}</ac:task-body></ac:task>`;
        }).join("\n");
        output += `<ac:task-list>${tasks}</ac:task-list>
`;
      } else {
        const start = token.ordered ? (token.start || 1) + segmentIndex : 1;
        const startAttribute = token.ordered && start !== 1 ? ` start="${start}"` : "";
        const items = segment.map((item) => `<li>${parseItemBody(this.parser, item)}</li>`).join("\n");
        output += `<${normalTag}${startAttribute}>${items}</${normalTag}>
`;
      }
    }
    return output;
  };
  renderer.listitem = function(item) {
    return `<li>${this.parser.parse(item.tokens)}</li>
`;
  };
  renderer.paragraph = function(token) {
    return `<p>${this.parser.parseInline(token.tokens)}</p>
`;
  };
  renderer.table = function(token) {
    const header = token.header.map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`).join("\n");
    const rows = token.rows.map((row) => {
      const cells = row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join("\n");
      return `<tr>${cells}</tr>`;
    }).join("\n");
    return `<table><tbody><tr>${header}</tr>${rows}</tbody></table>
`;
  };
  renderer.html = function(token) {
    return safeHtmlTokens.has(token) ? token.text : escapeXml(token.text);
  };
  renderer.strong = function(token) {
    return `<strong>${this.parser.parseInline(token.tokens)}</strong>`;
  };
  renderer.em = function(token) {
    return `<em>${this.parser.parseInline(token.tokens)}</em>`;
  };
  renderer.codespan = function(token) {
    return `<code>${markedText(token.text)}</code>`;
  };
  renderer.br = function() {
    return "<br/>";
  };
  renderer.del = function(token) {
    return `<del>${this.parser.parseInline(token.tokens)}</del>`;
  };
  renderer.link = function(token) {
    const title = token.title ? ` title="${markedText(token.title)}"` : "";
    return `<a href="${escapeXml(token.href)}"${title}>${this.parser.parseInline(token.tokens)}</a>`;
  };
  renderer.image = function(token) {
    const alt = markedText(token.text || token.title || "");
    const altAttribute = alt ? ` ac:alt="${alt}"` : "";
    return `<ac:image${altAttribute}><ri:url ri:value="${escapeXml(token.href)}"/></ac:image>`;
  };
  renderer.text = function(token) {
    var _a;
    if ("tokens" in token && ((_a = token.tokens) == null ? void 0 : _a.length)) {
      return this.parser.parseInline(token.tokens);
    }
    return markedText(token.text);
  };
  renderer.space = function() {
    return "";
  };
  const wikiLinkRenderer = {
    name: "obsidian-wikilink",
    renderer(genericToken) {
      const token = genericToken;
      const display = escapeXml(displayText(token));
      const anchor = token.heading === null ? "" : ` ac:anchor="${escapeXml(token.heading)}"`;
      if (!token.target && token.heading !== null) {
        return `<ac:link${anchor}><ac:link-body>${display}</ac:link-body></ac:link>`;
      }
      const resolvedPath = context.resolveLink(token.target, context.sourcePath);
      const title = resolvedPath === null ? void 0 : context.pageTitles.get(resolvedPath);
      if (title !== void 0) {
        return `<ac:link${anchor}><ri:page ri:content-title="${escapeXml(title)}" ri:space-key="${escapeXml(context.spaceKey)}"/><ac:link-body>${display}</ac:link-body></ac:link>`;
      }
      return token.embed ? `<em>(see: ${display})</em>` : display;
    }
  };
  const imageRenderer = {
    name: "obsidian-image",
    renderer(genericToken) {
      var _a;
      const token = genericToken;
      const resolvedPath = context.resolveLink(token.target, context.sourcePath);
      if (resolvedPath === null) {
        issues.push({ code: "unresolved-image", target: token.target });
        return escapeXml((_a = token.alt) != null ? _a : token.target);
      }
      const attachmentName = attachmentNameForPath(resolvedPath);
      renderedImages.push({
        sourcePath: token.target,
        resolvedPath,
        attachmentName,
        width: token.width
      });
      const width = token.width !== null && Number.isFinite(token.width) ? ` ac:width="${token.width}"` : "";
      const alt = token.alt === null ? "" : ` ac:alt="${escapeXml(token.alt)}"`;
      return `<ac:image${width}${alt}><ri:attachment ri:filename="${escapeXml(attachmentName)}"/></ac:image>`;
    }
  };
  const calloutRenderer = {
    name: "obsidian-callout",
    renderer(genericToken) {
      const token = genericToken;
      const title = token.title === null ? "" : `<ac:parameter ac:name="title">${escapeXml(token.title)}</ac:parameter>`;
      const body = this.parser.parse(token.tokens);
      return `<ac:structured-macro ac:name="${calloutMacroName(token.calloutType)}">${title}<ac:rich-text-body>${body}</ac:rich-text-body></ac:structured-macro>
`;
    }
  };
  const marked2 = new Marked({
    renderer,
    extensions: [wikiLinkRenderer, imageRenderer, calloutRenderer]
  });
  const parsed = parseObsidianMarkdown(markdown);
  markSafeHtml(parsed.tokens, safeHtmlTokens);
  const storage = marked2.parser(parsed.tokens);
  const images = renderedImages.filter(
    (image, index, all) => all.findIndex(
      (candidate) => candidate.resolvedPath === image.resolvedPath && candidate.attachmentName === image.attachmentName
    ) === index
  );
  return { storage, images, issues };
}

// src/domain/publication.ts
var PAGE_OWNERSHIP_PROPERTY = "obsidian-confluence-publisher";
function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}
function destinationSnapshot(baseUrl, destination) {
  return {
    destinationId: destination.id,
    baseUrl: normalizeBaseUrl(baseUrl),
    spaceKey: destination.spaceKey.trim(),
    parentPageId: destination.parentPageId.trim()
  };
}
function isSameDestination(left, right) {
  return left.destinationId === right.destinationId && normalizeBaseUrl(left.baseUrl) === normalizeBaseUrl(right.baseUrl) && left.spaceKey === right.spaceKey && left.parentPageId === right.parentPageId;
}
function isSamePublicationDestination(record, destination) {
  var _a;
  return record.destinationId === destination.destinationId && normalizeBaseUrl(record.baseUrl) === normalizeBaseUrl(destination.baseUrl) && record.spaceKey === destination.spaceKey && ((_a = record.destinationParentPageId) != null ? _a : record.parentPageId) === destination.parentPageId;
}

// src/domain/publication-metadata.ts
var PUBLICATIONS_KEY = "confluence-publications";
function readPublication(frontmatter, destinationId) {
  const publications = frontmatter[PUBLICATIONS_KEY];
  if (!isRecord3(publications)) return null;
  const value = publications[destinationId];
  if (!isRecord3(value)) return null;
  const required = ["base-url", "space-key", "parent-page-id", "page-id", "page-url"];
  if (required.some((key) => typeof value[key] !== "string" || value[key].length === 0)) return null;
  const destinationParentPageId = value["destination-parent-page-id"];
  if (destinationParentPageId !== void 0 && (typeof destinationParentPageId !== "string" || destinationParentPageId.length === 0)) return null;
  return {
    destinationId,
    baseUrl: value["base-url"],
    spaceKey: value["space-key"],
    parentPageId: value["parent-page-id"],
    pageId: value["page-id"],
    pageUrl: value["page-url"],
    ...destinationParentPageId === void 0 ? {} : { destinationParentPageId }
  };
}
function readLegacyPublication(frontmatter) {
  const pageId = frontmatter["confluence-page-id"];
  if (typeof pageId !== "string" || pageId.length === 0) return null;
  const pageUrl2 = frontmatter["confluence-url"];
  return { pageId, pageUrl: typeof pageUrl2 === "string" ? pageUrl2 : null };
}
function writePublication(frontmatter, record) {
  const current = isRecord3(frontmatter[PUBLICATIONS_KEY]) ? { ...frontmatter[PUBLICATIONS_KEY] } : {};
  current[record.destinationId] = {
    "base-url": record.baseUrl,
    "space-key": record.spaceKey,
    "parent-page-id": record.parentPageId,
    "page-id": record.pageId,
    "page-url": record.pageUrl,
    ...record.destinationParentPageId === void 0 ? {} : { "destination-parent-page-id": record.destinationParentPageId }
  };
  const next = { ...frontmatter, [PUBLICATIONS_KEY]: current };
  delete next["confluence-page-id"];
  delete next["confluence-url"];
  return next;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/domain/publication-planner.ts
async function buildPublicationPlan(input) {
  var _a;
  const { snapshot, issues: localIssues } = validatePublicationPlanInput(input.baseUrl, input.destination, input.notes);
  const parentPageId = (_a = input.parentPageId) != null ? _a : snapshot.parentPageId;
  if (localIssues.length > 0) return { ok: false, issues: localIssues };
  const pages = [];
  const remoteIssues = [];
  for (const note of input.notes) {
    input.signal.throwIfAborted();
    const resolution = await resolveNote(snapshot, parentPageId, note, input.repository, input.signal);
    if ("issue" in resolution) remoteIssues.push(resolution.issue);
    else pages.push(resolution.page);
  }
  return remoteIssues.length > 0 ? { ok: false, issues: remoteIssues } : { ok: true, snapshot, pages };
}
function validatePublicationPlanInput(baseUrl, destination, notes) {
  const snapshot = destinationSnapshot(baseUrl, destination);
  return { snapshot, issues: validateLocalInput(snapshot, notes) };
}
function validateLocalInput(snapshot, notes) {
  var _a;
  const issues = [];
  if (snapshot.spaceKey === "" || snapshot.parentPageId === "") {
    issues.push({
      code: "invalid-destination",
      path: null,
      message: "\u516C\u958B\u5148\u306E\u30B9\u30DA\u30FC\u30B9\u30AD\u30FC\u3068\u89AA\u30DA\u30FC\u30B8ID\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    });
  }
  issues.push(...collectDuplicates(notes, (note) => note.title.trim(), "duplicate-title", "\u540C\u3058\u516C\u958B\u30BF\u30A4\u30C8\u30EB"));
  issues.push(...collectDuplicates(
    notes,
    (note) => {
      var _a2, _b, _c, _d;
      return (_d = (_c = (_a2 = note.publication) == null ? void 0 : _a2.pageId) != null ? _c : (_b = note.legacyPublication) == null ? void 0 : _b.pageId) != null ? _d : "";
    },
    "duplicate-page-id",
    "\u540C\u3058Confluence\u30DA\u30FC\u30B8ID"
  ));
  for (const note of notes) {
    for (const image of note.images) {
      if (image.resolvedPath === null) {
        issues.push({
          code: "unresolved-image",
          path: note.path,
          message: `\u753B\u50CF\u300C${image.sourcePath}\u300D\u3092\u89E3\u6C7A\u3067\u304D\u307E\u305B\u3093\u3002\u30EA\u30F3\u30AF\u5148\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`
        });
      }
    }
    if (note.publication !== null && !isSamePublicationDestination(note.publication, snapshot)) {
      issues.push({
        code: "destination-mismatch",
        path: note.path,
        message: "\u4FDD\u5B58\u6E08\u307F\u306E\u516C\u958B\u5148\u60C5\u5831\u304C\u3001\u9078\u629E\u4E2D\u306E\u516C\u958B\u5148\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002"
      });
    }
    const legacyPageUrl = (_a = note.legacyPublication) == null ? void 0 : _a.pageUrl;
    if (legacyPageUrl !== null && legacyPageUrl !== void 0 && !isUrlWithinBase(legacyPageUrl, snapshot.baseUrl)) {
      issues.push({
        code: "destination-mismatch",
        path: note.path,
        message: "\u65E7\u5F62\u5F0F\u306EConfluence URL\u304C\u3001\u9078\u629E\u4E2D\u306E\u30D9\u30FC\u30B9URL\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002"
      });
    }
  }
  return issues;
}
function collectDuplicates(notes, valueOf, code, description) {
  const groups = /* @__PURE__ */ new Map();
  for (const note of notes) {
    const value = valueOf(note);
    if (value === "") continue;
    const group = groups.get(value);
    if (group === void 0) groups.set(value, [note]);
    else group.push(note);
  }
  const issues = [];
  for (const [value, group] of groups) {
    if (group.length < 2) continue;
    const paths = group.map((note) => note.path).join(", ");
    for (const note of group) {
      issues.push({
        code,
        path: note.path,
        message: `${description}\u300C${value}\u300D\u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059: ${paths}`
      });
    }
  }
  return issues;
}
function isUrlWithinBase(pageUrl2, baseUrl) {
  try {
    const page = new URL(pageUrl2);
    const base = new URL(baseUrl);
    if (page.origin !== base.origin) return false;
    const basePath = base.pathname.replace(/\/+$/, "");
    return page.pathname === basePath || page.pathname.startsWith(`${basePath}/`);
  } catch (e) {
    return false;
  }
}
async function resolveNote(snapshot, parentPageId, note, repository, signal) {
  var _a, _b, _c, _d;
  const isLegacy = note.publication === null && note.legacyPublication !== null;
  const savedPageId = (_d = (_c = (_a = note.publication) == null ? void 0 : _a.pageId) != null ? _c : (_b = note.legacyPublication) == null ? void 0 : _b.pageId) != null ? _d : null;
  if (savedPageId !== null) {
    const savedPage = await repository.getPage(savedPageId, signal);
    signal.throwIfAborted();
    if (savedPage !== null) return resolveSavedPage(snapshot, parentPageId, note, savedPage, isLegacy);
  }
  signal.throwIfAborted();
  const candidates = await repository.findPagesByTitle(snapshot.spaceKey, note.title, signal);
  signal.throwIfAborted();
  if (candidates.length === 0) {
    return {
      page: {
        note,
        ...parentPageId === snapshot.parentPageId ? {} : { parentPageId },
        pageId: null,
        operation: "create",
        migrateLegacy: isLegacy,
        claimOwnership: false
      }
    };
  }
  const candidate = candidates[0];
  if (candidates.length !== 1 || !isExactOwnedPage(candidate, snapshot, parentPageId, note.path)) {
    return {
      issue: {
        code: "ambiguous-page",
        path: note.path,
        message: `\u30BF\u30A4\u30C8\u30EB\u300C${note.title}\u300D\u306E\u65E2\u5B58\u30DA\u30FC\u30B8\u3092\u5B89\u5168\u306B\u4E00\u610F\u7279\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002\u516C\u958B\u5148\u3068\u6240\u6709\u60C5\u5831\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`
      }
    };
  }
  return {
    page: {
      note,
      ...parentPageId === snapshot.parentPageId ? {} : { parentPageId },
      pageId: candidate.id,
      operation: "update",
      migrateLegacy: isLegacy,
      claimOwnership: false
    }
  };
}
function resolveSavedPage(snapshot, parentPageId, note, page, isLegacy) {
  const exactLocation = page.spaceKey === snapshot.spaceKey && page.parentPageId === parentPageId;
  const exactOwnership = isExpectedOwnership(page.ownership, snapshot.destinationId, note.path);
  const acceptableLegacyOwnership = isLegacy && page.ownership === null;
  if (!exactLocation || !exactOwnership && !acceptableLegacyOwnership) {
    return {
      issue: {
        code: "destination-mismatch",
        path: note.path,
        message: `\u4FDD\u5B58\u6E08\u307F\u30DA\u30FC\u30B8ID\u300C${page.id}\u300D\u306E\u516C\u958B\u5148\u307E\u305F\u306F\u6240\u6709\u60C5\u5831\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002`
      }
    };
  }
  return {
    page: {
      note,
      ...parentPageId === snapshot.parentPageId ? {} : { parentPageId },
      pageId: page.id,
      operation: "update",
      migrateLegacy: isLegacy,
      claimOwnership: acceptableLegacyOwnership
    }
  };
}
function isExactOwnedPage(page, snapshot, parentPageId, sourcePath) {
  return page.spaceKey === snapshot.spaceKey && page.parentPageId === parentPageId && isExpectedOwnership(page.ownership, snapshot.destinationId, sourcePath);
}
function isExpectedOwnership(ownership, destinationId, sourcePath) {
  return (ownership == null ? void 0 : ownership.schemaVersion) === 1 && ownership.destinationId === destinationId && ownership.sourcePath === sourcePath;
}

// src/obsidian/note-repository.ts
var import_obsidian5 = require("obsidian");
var FRONTMATTER_START_RE = /^---\r?\n/;
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m;
var InvalidFrontmatterError = class extends Error {
  constructor(path, message) {
    super(`Invalid YAML frontmatter in ${path}.${message ? ` ${message}` : ""}`);
    this.path = path;
    this.name = "InvalidFrontmatterError";
  }
};
function parseNoteSource(path, basename, raw) {
  if (FRONTMATTER_START_RE.test(raw) && !FRONTMATTER_RE.test(raw)) {
    throw new InvalidFrontmatterError(path);
  }
  const match = FRONTMATTER_RE.exec(raw);
  if (match === null) return { path, basename, raw, frontmatter: {}, body: raw };
  let parsed;
  try {
    parsed = (0, import_obsidian5.parseYaml)(match[1]);
  } catch (error) {
    throw new InvalidFrontmatterError(path, error instanceof Error ? error.message : void 0);
  }
  if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new InvalidFrontmatterError(path, "Frontmatter must be an object.");
  }
  return {
    path,
    basename,
    raw,
    frontmatter: parsed != null ? parsed : {},
    body: raw.slice(match[0].length)
  };
}
function selectPublishContent(note, stripFrontmatter) {
  return stripFrontmatter ? note.body : note.raw;
}
function resolveNoteTitle(note, titleSource) {
  const title = note.frontmatter.title;
  return titleSource === "frontmatter" && typeof title === "string" && title.trim() ? title.trim() : note.basename;
}
var ObsidianNoteRepository = class {
  constructor(app) {
    this.app = app;
  }
  async read(file) {
    const obsidianFile = this.getFile(file.path);
    return parseNoteSource(file.path, file.basename, await this.app.vault.cachedRead(obsidianFile));
  }
  listMarkdownFiles() {
    return this.app.vault.getMarkdownFiles().map(toFileRef);
  }
  async listPublished(destination, titleSource) {
    const published = [];
    for (const file of this.listMarkdownFiles()) {
      const note = await this.readForVaultScan(file);
      if (note === null) continue;
      const record = readPublication(note.frontmatter, destination.destinationId);
      if (record !== null && isSameDestination(record, destination)) {
        published.push({ path: note.path, title: resolveNoteTitle(note, titleSource), record });
      }
    }
    return published;
  }
  async listPublicationCandidates(destinationId) {
    const candidates = [];
    for (const file of this.listMarkdownFiles()) {
      const note = await this.readForVaultScan(file);
      if (note === null) continue;
      if (readPublication(note.frontmatter, destinationId) !== null || readLegacyPublication(note.frontmatter) !== null) candidates.push(file);
    }
    return candidates;
  }
  resolveLink(target, sourcePath) {
    var _a, _b;
    return (_b = (_a = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath)) == null ? void 0 : _a.path) != null ? _b : null;
  }
  async readBinary(path) {
    return this.app.vault.readBinary(this.getFile(path));
  }
  async writePublication(file, record) {
    const obsidianFile = this.getFile(file.path);
    await this.app.fileManager.processFrontMatter(obsidianFile, (frontmatter) => {
      const next = writePublication(frontmatter, record);
      for (const key of Object.keys(frontmatter)) delete frontmatter[key];
      Object.assign(frontmatter, next);
    });
  }
  getFile(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file === null || !("extension" in file)) {
      throw new Error(`Vault file not found: ${path}`);
    }
    return file;
  }
  async readForVaultScan(file) {
    try {
      return await this.read(file);
    } catch (error) {
      if (error instanceof InvalidFrontmatterError) return null;
      throw error;
    }
  }
};
function toFileRef(file) {
  return { path: file.path, basename: file.basename, extension: file.extension };
}

// src/publisher.ts
var PLACEHOLDER_BODY = "<p>Importing from Obsidian...</p>";
var CLEANUP_TIMEOUT_MS = 5e3;
var Publisher = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  async *publish(files, destination, signal, options2 = {}) {
    var _a, _b, _c, _d;
    let succeeded = 0;
    let failed = 0;
    try {
      signal.throwIfAborted();
      const inputErrors = validateInput(files, destination, this.dependencies.settings.confluenceUrl);
      if (inputErrors.length > 0) {
        for (const error of inputErrors) {
          yield { type: "failed", title: error.title, phase: "preflight", error: error.message };
        }
        yield completeEvent(files.length, 0);
        return;
      }
      const prepared = await this.prepareCandidates(files, destination, signal);
      if ("failures" in prepared) {
        for (const failure of prepared.failures) yield failure;
        yield completeEvent(files.length, 0);
        return;
      }
      const childPaths = (_a = options2.outgoingChildPaths) != null ? _a : /* @__PURE__ */ new Set();
      const childCandidates = prepared.candidates.filter((candidate) => childPaths.has(candidate.path));
      const preservedChildCandidates = prepared.candidates.filter(
        (candidate) => {
          var _a2;
          return !childPaths.has(candidate.path) && ((_a2 = candidate.publication) == null ? void 0 : _a2.destinationParentPageId) !== void 0 && candidate.publication.parentPageId !== candidate.publication.destinationParentPageId;
        }
      );
      const initialCandidates = prepared.candidates.filter(
        (candidate) => !childPaths.has(candidate.path) && !preservedChildCandidates.includes(candidate)
      );
      if (childCandidates.length > 0 && (options2.mainPath === void 0 || childPaths.has(options2.mainPath) || !prepared.filesByPath.has(options2.mainPath))) {
        yield { type: "failed", title: null, phase: "preflight", error: "Child-page publishing requires the selected current note." };
        yield completeEvent(files.length, 0);
        return;
      }
      const childPreflight = validatePublicationPlanInput(
        this.dependencies.settings.confluenceUrl,
        destination,
        childCandidates
      );
      if (childPreflight.issues.length > 0) {
        for (const issue of childPreflight.issues) yield { type: "failed", title: issue.path, phase: "preflight", error: issue.message };
        yield completeEvent(files.length, 0);
        return;
      }
      const plan = await buildPublicationPlan({
        baseUrl: this.dependencies.settings.confluenceUrl,
        destination,
        notes: initialCandidates,
        repository: this.dependencies.repository,
        signal
      });
      if (!plan.ok) {
        for (const issue of plan.issues) {
          yield {
            type: "failed",
            title: issue.path,
            phase: "preflight",
            error: issue.message
          };
        }
        yield completeEvent(files.length, 0);
        return;
      }
      for (const child of preservedChildCandidates) {
        const childPlan = await this.buildChildPlan(
          [child],
          destination,
          plan.snapshot,
          child.publication.parentPageId,
          signal
        );
        if (!childPlan.ok) {
          for (const issue of childPlan.issues) yield { type: "failed", title: issue.path, phase: "preflight", error: issue.message };
          yield completeEvent(files.length, 0);
          return;
        }
        plan.pages.push(...childPlan.pages);
      }
      const pageTitles = await this.loadPublishedPageTitles(
        plan.snapshot,
        new Set(prepared.candidates.map((candidate) => candidate.path)),
        signal
      );
      yield { type: "planned", total: prepared.candidates.length };
      const resolved = [];
      const plannedPages = [...plan.pages];
      let childrenPlanned = false;
      for (let index = 0; index < plannedPages.length; index++) {
        const planned = plannedPages[index];
        signal.throwIfAborted();
        const file = prepared.filesByPath.get(planned.note.path);
        if (file === void 0) throw new Error(`Prepared note is missing: ${planned.note.path}`);
        const ownership = pageOwnership(destination, planned.note.path);
        if (planned.operation === "create") {
          let page;
          try {
            page = await this.dependencies.repository.createPage(
              plan.snapshot.spaceKey,
              (_b = planned.parentPageId) != null ? _b : plan.snapshot.parentPageId,
              planned.note.title,
              PLACEHOLDER_BODY,
              signal
            );
          } catch (error) {
            if (isAbort(error)) throw error;
            failed++;
            yield resolutionFailure(planned.note.title, error);
            yield completeEvent(files.length, succeeded);
            return;
          }
          try {
            signal.throwIfAborted();
            await this.dependencies.repository.setPageOwnership(page.id, ownership, signal);
          } catch (ownershipError) {
            const cleanupError = await this.rollbackCreatedPage(page.id);
            if (cleanupError !== null) {
              failed++;
              yield {
                type: "failed",
                title: planned.note.title,
                phase: "page-resolution",
                error: orphanedPageError(page, ownershipError, cleanupError, plan.snapshot.baseUrl)
              };
            }
            if (isAbort(ownershipError)) throw ownershipError;
            if (cleanupError === null) {
              failed++;
              yield resolutionFailure(planned.note.title, ownershipError);
            }
            yield completeEvent(files.length, succeeded);
            return;
          }
          yield { type: "page-created", title: planned.note.title };
          resolved.push({ file, planned, pageId: page.id, webui: page.webui });
          if (planned.note.path === options2.mainPath && !childrenPlanned) {
            const childPlan = await this.buildChildPlan(childCandidates, destination, plan.snapshot, page.id, signal);
            if (!childPlan.ok) {
              for (const issue of childPlan.issues) yield { type: "failed", title: issue.path, phase: "preflight", error: issue.message };
              yield completeEvent(files.length, succeeded);
              return;
            }
            plannedPages.push(...childPlan.pages);
            childrenPlanned = true;
          }
          continue;
        }
        const pageId = planned.pageId;
        if (planned.claimOwnership) {
          try {
            signal.throwIfAborted();
            await this.dependencies.repository.setPageOwnership(pageId, ownership, signal);
          } catch (error) {
            if (isAbort(error)) throw error;
            failed++;
            yield resolutionFailure(planned.note.title, error);
            yield completeEvent(files.length, succeeded);
            return;
          }
        }
        resolved.push({ file, planned, pageId, webui: null });
        if (planned.note.path === options2.mainPath && !childrenPlanned) {
          const childPlan = await this.buildChildPlan(childCandidates, destination, plan.snapshot, pageId, signal);
          if (!childPlan.ok) {
            for (const issue of childPlan.issues) yield { type: "failed", title: issue.path, phase: "preflight", error: issue.message };
            yield completeEvent(files.length, succeeded);
            return;
          }
          plannedPages.push(...childPlan.pages);
          childrenPlanned = true;
        }
      }
      for (const item of resolved) pageTitles.set(item.planned.note.path, item.planned.note.title);
      for (const item of resolved) {
        signal.throwIfAborted();
        try {
          const conversion = convertMarkdown(
            selectPublishContent(item.planned.note, this.dependencies.settings.stripFrontmatter),
            {
              sourcePath: item.planned.note.path,
              spaceKey: plan.snapshot.spaceKey,
              pageTitles,
              resolveLink: (target, sourcePath) => this.dependencies.notes.resolveLink(target, sourcePath)
            }
          );
          if (conversion.issues.length > 0) {
            throw new Error(`Unresolved image attachments: ${conversion.issues.map((issue) => issue.target).join(", ")}`);
          }
          const images = new Map(conversion.images.map((image) => [image.attachmentName, image]));
          for (const image of images.values()) {
            signal.throwIfAborted();
            const data = await this.dependencies.notes.readBinary(image.resolvedPath);
            signal.throwIfAborted();
            const result = await this.dependencies.repository.putAttachment(
              item.pageId,
              image.attachmentName,
              data,
              mimeTypeForPath(image.resolvedPath),
              signal
            );
            yield {
              type: result === "created" ? "attachment-created" : "attachment-updated",
              title: item.planned.note.title,
              filename: image.attachmentName
            };
          }
          signal.throwIfAborted();
          const current = await this.dependencies.repository.getPage(item.pageId, signal);
          if (current === null) throw new Error(`Page ${item.pageId} disappeared.`);
          signal.throwIfAborted();
          await this.dependencies.repository.updatePage(
            item.pageId,
            item.planned.note.title,
            conversion.storage,
            current.version,
            signal
          );
          const record = {
            ...plan.snapshot,
            parentPageId: (_c = item.planned.parentPageId) != null ? _c : plan.snapshot.parentPageId,
            destinationParentPageId: plan.snapshot.parentPageId,
            pageId: item.pageId,
            pageUrl: pageUrl(plan.snapshot.baseUrl, item.pageId, (_d = current.webui) != null ? _d : item.webui)
          };
          await this.dependencies.notes.writePublication(item.file, record);
          succeeded++;
          yield { type: "page-updated", title: item.planned.note.title };
        } catch (error) {
          if (isAbort(error)) throw error;
          failed++;
          yield {
            type: "failed",
            title: item.planned.note.title,
            phase: "content-update",
            error: errorMessage(error)
          };
        }
      }
      yield completeEvent(files.length, succeeded);
    } catch (error) {
      if (isAbort(error)) {
        yield { type: "cancelled", succeeded, failed };
        return;
      }
      failed++;
      yield { type: "failed", title: null, phase: "preflight", error: errorMessage(error) };
      yield completeEvent(files.length, succeeded);
    }
  }
  async buildChildPlan(children, destination, snapshot, parentPageId, signal) {
    if (children.length === 0) return { ok: true, snapshot, pages: [] };
    return buildPublicationPlan({
      baseUrl: snapshot.baseUrl,
      destination,
      notes: children,
      repository: this.dependencies.repository,
      signal,
      parentPageId
    });
  }
  async prepareCandidates(files, destination, signal) {
    const candidates = [];
    const filesByPath = /* @__PURE__ */ new Map();
    const failures = [];
    for (const file of files) {
      signal.throwIfAborted();
      try {
        const note = await this.dependencies.notes.read(file);
        const title = resolveNoteTitle(note, this.dependencies.settings.titleSource);
        const conversion = convertMarkdown(
          selectPublishContent(note, this.dependencies.settings.stripFrontmatter),
          {
            sourcePath: note.path,
            spaceKey: destination.spaceKey,
            pageTitles: /* @__PURE__ */ new Map(),
            resolveLink: (target, sourcePath) => this.dependencies.notes.resolveLink(target, sourcePath)
          }
        );
        candidates.push({
          ...note,
          title,
          publication: readPublication(note.frontmatter, destination.id),
          legacyPublication: readLegacyPublication(note.frontmatter),
          images: [
            ...conversion.images,
            ...conversion.issues.map((issue) => ({ sourcePath: issue.target, resolvedPath: null }))
          ]
        });
        filesByPath.set(note.path, file);
      } catch (error) {
        if (isAbort(error)) throw error;
        failures.push({
          type: "failed",
          title: file.path,
          phase: "preflight",
          error: errorMessage(error)
        });
      }
    }
    return failures.length > 0 ? { failures } : { candidates, filesByPath };
  }
  async loadPublishedPageTitles(destination, selectedPaths, signal) {
    signal.throwIfAborted();
    const pageTitles = /* @__PURE__ */ new Map();
    for (const published of await this.dependencies.notes.listPublished(
      destination,
      this.dependencies.settings.titleSource
    )) {
      if (selectedPaths.has(published.path) || !isSamePublicationDestination(published.record, destination)) continue;
      signal.throwIfAborted();
      const page = await this.dependencies.repository.getPage(published.record.pageId, signal);
      if (page !== null && isPublishedPage(published.path, published.record, page, destination)) {
        pageTitles.set(published.path, page.title);
      }
    }
    signal.throwIfAborted();
    return pageTitles;
  }
  async rollbackCreatedPage(pageId) {
    const cleanup = createCleanupSignal();
    try {
      await this.dependencies.repository.deletePage(pageId, cleanup.signal);
      return null;
    } catch (error) {
      return error;
    } finally {
      cleanup.dispose();
    }
  }
};
function isPublishedPage(sourcePath, record, page, destination) {
  var _a;
  return page.id === record.pageId && page.spaceKey === destination.spaceKey && page.parentPageId === record.parentPageId && ((_a = page.ownership) == null ? void 0 : _a.schemaVersion) === 1 && page.ownership.destinationId === destination.destinationId && page.ownership.sourcePath === sourcePath;
}
function createCleanupSignal() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLEANUP_TIMEOUT_MS);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}
function validateInput(files, destination, baseUrl) {
  const failures = [];
  if (!destination.id.trim() || !destination.spaceKey.trim() || !destination.parentPageId.trim()) {
    failures.push({ title: null, message: "Destination is incomplete." });
  }
  try {
    const url = new URL(normalizeBaseUrl(baseUrl));
    if (!url.protocol || !url.host) throw new Error("invalid");
  } catch (e) {
    failures.push({ title: null, message: "Confluence base URL is invalid." });
  }
  for (const file of files) {
    if (file.extension.toLowerCase() !== "md") {
      failures.push({ title: file.path, message: `${file.path} is not a Markdown file.` });
    }
  }
  return failures;
}
function pageOwnership(destination, sourcePath) {
  return { schemaVersion: 1, destinationId: destination.id, sourcePath };
}
function resolutionFailure(title, error) {
  return { type: "failed", title, phase: "page-resolution", error: errorMessage(error) };
}
function orphanedPageError(page, ownershipError, cleanupError, baseUrl) {
  return [
    `Ownership creation failed: ${errorMessage(ownershipError)}.`,
    `Rollback failed: ${errorMessage(cleanupError)}.`,
    `Orphan page ${page.id}: ${pageUrl(baseUrl, page.id, page.webui)}`
  ].join(" ");
}
function pageUrl(baseUrl, pageId, webui) {
  const normalized = normalizeBaseUrl(baseUrl);
  const base = new URL(normalized);
  if (webui !== null) {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(webui)) {
      try {
        const candidate = new URL(webui);
        if (candidate.origin === base.origin && candidate.username === "" && candidate.password === "") return candidate.toString();
      } catch (e) {
      }
    } else if (!webui.startsWith("//")) {
      const basePath = base.pathname.replace(/\/+$/, "");
      const relativePath = webui.startsWith(`${basePath}/`) ? webui.slice(basePath.length) : webui;
      try {
        const candidate = new URL(`${normalized}/${relativePath.replace(/^\/+/, "")}`);
        const withinBasePath = basePath === "" || candidate.pathname === basePath || candidate.pathname.startsWith(`${basePath}/`);
        if (candidate.origin === base.origin && withinBasePath) return candidate.toString();
      } catch (e) {
      }
    }
  }
  return `${normalized}/pages/viewpage.action?pageId=${encodeURIComponent(pageId)}`;
}
function mimeTypeForPath(path) {
  var _a;
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return (_a = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp"
  }[extension]) != null ? _a : "application/octet-stream";
}
function isAbort(error) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return typeof error === "object" && error !== null && "code" in error && error.code === "aborted";
}
function completeEvent(total, succeeded) {
  return { type: "complete", succeeded, failed: Math.max(0, total - succeeded) };
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/confluence/transport.ts
var nodeHttp = __toESM(require("http"));
var nodeHttps = __toESM(require("https"));
var TransportError = class extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "TransportError";
  }
};
var DEFAULT_TIMEOUT_MS = 3e4;
var DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
function validateConfluenceBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (e) {
    throw new TransportError("invalid-url", "Confluence URL is invalid.");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new TransportError(
      "invalid-url",
      "Confluence URL must use HTTPS unless it targets loopback."
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TransportError(
      "invalid-url",
      "Confluence URL must not contain credentials, a query, or a fragment."
    );
  }
  return url;
}
var NodeHttpTransport = class {
  constructor(options2) {
    var _a, _b;
    this.baseUrl = validateConfluenceBaseUrl(options2.baseUrl);
    this.headers = { ...options2.headers };
    this.timeoutMs = (_a = options2.timeoutMs) != null ? _a : DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = (_b = options2.maxResponseBytes) != null ? _b : DEFAULT_MAX_RESPONSE_BYTES;
    if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes <= 0) {
      throw new TransportError(
        "invalid-options",
        "Confluence response byte limit must be a positive safe integer."
      );
    }
  }
  requestJson(request) {
    return this.request(request, true);
  }
  requestEmpty(request) {
    return this.request(request, false);
  }
  request(request, expectJson) {
    var _a;
    if ((_a = request.signal) == null ? void 0 : _a.aborted) {
      return Promise.reject(new TransportError("aborted", "Confluence request was cancelled."));
    }
    let url;
    try {
      url = joinRequestUrl(this.baseUrl, request.path);
    } catch (error) {
      return Promise.reject(error);
    }
    const transport = url.protocol === "https:" ? nodeHttps : nodeHttp;
    const headers = { ...this.headers, ...request.headers };
    if (request.body !== void 0 && !hasHeader(headers, "content-length") && !hasHeader(headers, "transfer-encoding")) {
      headers["Content-Length"] = String(
        typeof request.body === "string" ? Buffer.byteLength(request.body) : request.body.byteLength
      );
    }
    return new Promise((resolve, reject) => {
      var _a2;
      let settled = false;
      let timer;
      const cleanup = () => {
        var _a3;
        if (timer !== void 0) clearTimeout(timer);
        (_a3 = request.signal) == null ? void 0 : _a3.removeEventListener("abort", abort);
      };
      const succeed = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const abort = () => {
        fail(new TransportError("aborted", "Confluence request was cancelled."));
        req.destroy();
      };
      const req = transport.request({
        protocol: url.protocol,
        hostname: unbracketHostname(url.hostname),
        port: url.port || void 0,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers
      }, (response) => {
        var _a3;
        const chunks = [];
        const status = (_a3 = response.statusCode) != null ? _a3 : 0;
        let receivedBytes = 0;
        const failResponseTooLarge = () => {
          if (settled) return;
          fail(new TransportError(
            "response-too-large",
            "Confluence response exceeded the configured byte limit.",
            status
          ));
          response.destroy();
          req.destroy();
        };
        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.byteLength;
          if (receivedBytes > this.maxResponseBytes) {
            failResponseTooLarge();
            return;
          }
          chunks.push(buffer);
        });
        response.once("aborted", () => {
          fail(new TransportError("network", "Confluence response was interrupted."));
        });
        response.once("error", () => {
          fail(new TransportError("network", "Confluence response failed."));
        });
        const contentLength = parseContentLength(response.headers["content-length"]);
        if (contentLength !== null && contentLength > this.maxResponseBytes) {
          failResponseTooLarge();
          return;
        }
        response.once("end", () => {
          var _a4;
          if (settled) return;
          const body = Buffer.concat(chunks).toString("utf8");
          if (status >= 300 && status < 400) {
            const rawLocation = safeRedirectLocation(response.headers.location, url);
            const location = rawLocation === null ? null : sanitizeDiagnostic(rawLocation, headers);
            fail(new TransportError(
              "redirect",
              location ? `Confluence redirected the request to ${location}. Check the configured URL and authentication.` : "Confluence redirected the request. Check the configured URL and authentication.",
              status
            ));
            return;
          }
          if (status < 200 || status >= 300) {
            fail(new TransportError(
              "http",
              `Confluence request failed (${status}): ${sanitizeDiagnostic(body, headers).slice(0, 300)}`,
              status
            ));
            return;
          }
          if (!expectJson) {
            succeed(void 0);
            return;
          }
          const contentType = String((_a4 = response.headers["content-type"]) != null ? _a4 : "");
          if (!isJsonContentType(contentType)) {
            fail(new TransportError(
              "content-type",
              "Confluence returned a successful response that was not JSON.",
              status
            ));
            return;
          }
          try {
            succeed(JSON.parse(body));
          } catch (e) {
            fail(new TransportError(
              "json",
              "Confluence returned malformed JSON.",
              status
            ));
          }
        });
      });
      req.once("error", () => {
        fail(new TransportError("network", "Confluence request failed at the network layer."));
      });
      (_a2 = request.signal) == null ? void 0 : _a2.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        fail(new TransportError("timeout", "Confluence request timed out."));
        req.destroy();
      }, this.timeoutMs);
      if (request.body !== void 0) req.write(request.body);
      req.end();
    });
  }
};
function joinRequestUrl(baseUrl, path) {
  const url = new URL(baseUrl.toString());
  const question = path.indexOf("?");
  const pathname = question === -1 ? path : path.slice(0, question);
  const search = question === -1 ? "" : path.slice(question);
  if (/%(?:2f|5c)/i.test(pathname)) {
    throw new TransportError(
      "invalid-url",
      "Confluence request pathname must not contain encoded path separators."
    );
  }
  const contextPath = url.pathname.replace(/\/+$/, "");
  const requestPath = pathname.replace(/^\/+/, "");
  url.pathname = `${contextPath}/${requestPath}` || "/";
  url.search = search;
  url.hash = "";
  if (contextPath !== "" && url.pathname !== contextPath && !url.pathname.startsWith(`${contextPath}/`)) {
    throw new TransportError(
      "invalid-url",
      "Confluence request path must stay within the configured context path."
    );
  }
  return url;
}
function isJsonContentType(contentType) {
  return /^application\/(?:[A-Za-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType);
}
function parseContentLength(value) {
  if (value === void 0 || !/^\d+$/.test(value)) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}
function hasHeader(headers, expectedName) {
  return Object.keys(headers).some((name) => name.toLowerCase() === expectedName);
}
function unbracketHostname(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}
function safeRedirectLocation(location, requestUrl) {
  if (!location) return null;
  try {
    const url = new URL(location, requestUrl);
    return location.startsWith("/") ? url.pathname : `${url.origin}${url.pathname}`;
  } catch (e) {
    return null;
  }
}
function sanitizeDiagnostic(value, headers) {
  const secrets = collectCredentialSecrets(headers).flatMap(credentialVariants).filter((secret, index, values) => secret.length > 0 && values.indexOf(secret) === index).sort((left, right) => right.length - left.length);
  return secrets.reduce(
    (sanitized, secret) => sanitized.replace(
      new RegExp(escapeRegExp(secret), "gi"),
      "[REDACTED]"
    ),
    value
  );
}
function collectCredentialSecrets(headers) {
  var _a, _b;
  const secrets = [];
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (lowerName === "cookie") {
      secrets.push(value);
      for (const pair of value.split(";")) {
        const trimmed = pair.trim();
        if (trimmed.length === 0) continue;
        secrets.push(trimmed);
        const equals = trimmed.indexOf("=");
        if (equals !== -1) secrets.push(unquote(trimmed.slice(equals + 1).trim()));
      }
      continue;
    }
    if (lowerName !== "authorization" && lowerName !== "proxy-authorization") continue;
    secrets.push(value);
    const match = /^\s*(\S+)(?:\s+([\s\S]+))?$/.exec(value);
    const scheme = (_a = match == null ? void 0 : match[1]) == null ? void 0 : _a.toLowerCase();
    const credential = (_b = match == null ? void 0 : match[2]) == null ? void 0 : _b.trim();
    if (!credential) continue;
    secrets.push(credential);
    if (scheme === "basic") {
      const decoded = Buffer.from(credential, "base64").toString("utf8");
      if (decoded.length > 0) secrets.push(decoded);
      const colon = decoded.indexOf(":");
      if (colon !== -1) secrets.push(decoded.slice(colon + 1));
    }
  }
  return secrets;
}
function credentialVariants(secret) {
  const variants = [secret, encodeURIComponent(secret)];
  try {
    const decoded = decodeURIComponent(secret);
    if (decoded !== secret) variants.push(decoded, encodeURIComponent(decoded));
  } catch (e) {
  }
  return variants;
}
function unquote(value) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/confluence/repository.ts
var PAGE_EXPAND = "version,ancestors,space";
var ATTACHMENT_LIMIT = 100;
var ConfluenceRepository = class {
  constructor(transport) {
    this.transport = transport;
    this.attachmentCache = /* @__PURE__ */ new Map();
    this.uploadedAttachmentAliases = /* @__PURE__ */ new Map();
  }
  async getPage(pageId, signal) {
    let response;
    try {
      response = await this.transport.requestJson({
        method: "GET",
        path: `/rest/api/content/${encodeURIComponent(pageId)}?expand=${encodeURIComponent(PAGE_EXPAND)}`,
        signal
      });
    } catch (error) {
      if (error instanceof TransportError && error.status === 404) return null;
      throw error;
    }
    if (!isPageResponse(response)) throw new Error("Confluence returned an invalid page response.");
    const ownership = await this.fetchOwnership(pageId, signal);
    return resolvePage(response, ownership);
  }
  async fetchOwnership(pageId, signal) {
    let response;
    try {
      response = await this.transport.requestJson({
        method: "GET",
        path: `/rest/api/content/${encodeURIComponent(pageId)}/property/${encodeURIComponent(PAGE_OWNERSHIP_PROPERTY)}`,
        signal
      });
    } catch (error) {
      if (error instanceof TransportError && error.status === 404) return null;
      throw error;
    }
    return parseOwnershipProperty(pageId, response);
  }
  async findPagesByTitle(spaceKey, title, signal) {
    var _a;
    const query = new URLSearchParams({
      type: "page",
      spaceKey,
      title,
      expand: PAGE_EXPAND,
      limit: String(ATTACHMENT_LIMIT)
    });
    let path = `/rest/api/content?${query.toString()}`;
    const visited = /* @__PURE__ */ new Set();
    const pages = [];
    while (path !== void 0) {
      assertUnvisited(path, visited, "page search");
      const collection = pageCollection(await this.transport.requestJson({
        method: "GET",
        path,
        signal
      }), isPageResponse, "page");
      for (const page of collection.results) {
        const ownership = await this.fetchOwnership(page.id, signal);
        pages.push(resolvePage(page, ownership));
      }
      path = (_a = collection._links) == null ? void 0 : _a.next;
    }
    return pages;
  }
  async createPage(spaceKey, parentId, title, body, signal) {
    const page = await this.transport.requestJson({
      method: "POST",
      path: "/rest/api/content",
      body: JSON.stringify({
        type: "page",
        title,
        space: { key: spaceKey },
        ancestors: [{ id: parentId }],
        body: { storage: { value: body, representation: "storage" } }
      }),
      headers: { "Content-Type": "application/json" },
      signal
    });
    if (!isPageResponse(page)) throw new Error("Confluence returned an invalid page response.");
    return resolvePage(page, null, { spaceKey, parentPageId: parentId });
  }
  async setPageOwnership(pageId, ownership, signal) {
    await this.transport.requestJson({
      method: "POST",
      path: `/rest/api/content/${encodeURIComponent(pageId)}/property`,
      body: JSON.stringify({ key: PAGE_OWNERSHIP_PROPERTY, value: ownership }),
      headers: { "Content-Type": "application/json" },
      signal
    });
  }
  async deletePage(pageId, signal) {
    await this.transport.requestEmpty({
      method: "DELETE",
      path: `/rest/api/content/${encodeURIComponent(pageId)}`,
      signal
    });
  }
  async updatePage(pageId, title, body, currentVersion, signal) {
    await this.transport.requestEmpty({
      method: "PUT",
      path: `/rest/api/content/${encodeURIComponent(pageId)}`,
      body: JSON.stringify({
        type: "page",
        title,
        version: { number: currentVersion + 1 },
        body: { storage: { value: body, representation: "storage" } }
      }),
      headers: { "Content-Type": "application/json" },
      signal
    });
  }
  async listAttachments(pageId, signal) {
    var _a;
    const cached = this.attachmentCache.get(pageId);
    if (cached !== void 0) return cached;
    let path = `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?limit=${ATTACHMENT_LIMIT}&expand=metadata`;
    const visited = /* @__PURE__ */ new Set();
    const attachments = /* @__PURE__ */ new Map();
    while (path !== void 0) {
      assertUnvisited(path, visited, "attachment listing");
      const collection = pageCollection(await this.transport.requestJson({
        method: "GET",
        path,
        signal
      }), isAttachmentResponse, "attachment");
      for (const attachment of collection.results) {
        attachments.set(attachment.title, attachment);
      }
      path = (_a = collection._links) == null ? void 0 : _a.next;
    }
    this.attachmentCache.set(pageId, attachments);
    return attachments;
  }
  async putAttachment(pageId, filename, data, mimeType, signal) {
    var _a, _b;
    const multipart = buildMultipart(filename, data, mimeType);
    const attachments = await this.listAttachments(pageId, signal);
    const existing = (_b = attachments.get(filename)) != null ? _b : (_a = this.uploadedAttachmentAliases.get(pageId)) == null ? void 0 : _a.get(filename);
    const encodedPageId = encodeURIComponent(pageId);
    const path = existing === void 0 ? `/rest/api/content/${encodedPageId}/child/attachment` : `/rest/api/content/${encodedPageId}/child/attachment/${encodeURIComponent(existing.id)}/data`;
    const response = await this.transport.requestJson({
      method: "POST",
      path,
      body: multipart.body,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
        "X-Atlassian-Token": "nocheck"
      },
      signal
    });
    const returned = attachmentFromUpload(response);
    if (existing !== void 0) {
      attachments.delete(filename);
      attachments.delete(existing.title);
    }
    attachments.set(returned.title, returned);
    let aliases = this.uploadedAttachmentAliases.get(pageId);
    if (aliases === void 0) {
      aliases = /* @__PURE__ */ new Map();
      this.uploadedAttachmentAliases.set(pageId, aliases);
    }
    aliases.set(filename, returned);
    return existing === void 0 ? "created" : "updated";
  }
};
function resolvePage(page, ownership, fallback) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const ancestors = (_a = page.ancestors) != null ? _a : [];
  return {
    id: page.id,
    title: page.title,
    spaceKey: (_d = (_c = (_b = page.space) == null ? void 0 : _b.key) != null ? _c : fallback == null ? void 0 : fallback.spaceKey) != null ? _d : "",
    parentPageId: ancestors.length === 0 ? (_e = fallback == null ? void 0 : fallback.parentPageId) != null ? _e : null : (_g = (_f = ancestors[ancestors.length - 1]) == null ? void 0 : _f.id) != null ? _g : null,
    version: page.version.number,
    webui: (_i = (_h = page._links) == null ? void 0 : _h.webui) != null ? _i : null,
    ownership
  };
}
function parseOwnershipProperty(pageId, response) {
  const value = isRecord4(response) ? response.value : void 0;
  if (typeof value !== "object" || value === null || !("schemaVersion" in value) || value.schemaVersion !== 1 || !("destinationId" in value) || typeof value.destinationId !== "string" || value.destinationId.length === 0 || !("sourcePath" in value) || typeof value.sourcePath !== "string" || value.sourcePath.length === 0) {
    throw new Error(`Confluence page ${pageId} has invalid ownership property data.`);
  }
  return {
    schemaVersion: 1,
    destinationId: value.destinationId,
    sourcePath: value.sourcePath
  };
}
function assertUnvisited(path, visited, operation) {
  if (visited.has(path)) throw new Error(`Confluence returned a pagination cycle during ${operation}.`);
  visited.add(path);
}
function attachmentFromUpload(response) {
  const attachment = isRecord4(response) && "results" in response ? pageCollection(response, isAttachmentResponse, "attachment").results[0] : response;
  if (attachment === void 0) throw new Error("Confluence attachment upload returned no attachment.");
  if (!isAttachmentResponse(attachment)) {
    throw new Error("Confluence returned an invalid attachment response.");
  }
  return attachment;
}
function buildMultipart(filename, data, mimeType) {
  const quotedFilename = quoteMultipartFilename(filename);
  if (/[\r\n]/.test(mimeType)) throw new Error("Attachment MIME type contains a line break.");
  if (/[\x00-\x1f\x7f]/.test(mimeType)) {
    throw new Error("Attachment MIME type contains a control character.");
  }
  const fileBytes = new Uint8Array(data);
  let boundary = "----obsidian-confluence-publisher-1";
  while (containsBytes(fileBytes, new TextEncoder().encode(boundary))) boundary += "-1";
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${quotedFilename}"\r
Content-Type: ${mimeType}\r
\r
`
  );
  const suffix = encoder.encode(`\r
--${boundary}--\r
`);
  const body = new Uint8Array(prefix.length + fileBytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(fileBytes, prefix.length);
  body.set(suffix, prefix.length + fileBytes.length);
  return { boundary, body };
}
function quoteMultipartFilename(filename) {
  if (/[\r\n]/.test(filename)) throw new Error("Attachment filename contains a line break.");
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    throw new Error("Attachment filename contains a control character.");
  }
  return filename.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function pageCollection(value, isItem, itemName) {
  if (!isRecord4(value) || !Array.isArray(value.results) || !value.results.every(isItem) || typeof value.size !== "number") {
    throw new Error(`Confluence returned an invalid ${itemName} collection response.`);
  }
  if (value._links !== void 0 && (!isRecord4(value._links) || value._links.next !== void 0 && typeof value._links.next !== "string")) {
    throw new Error(`Confluence returned an invalid ${itemName} collection response.`);
  }
  return value;
}
function isPageResponse(value) {
  if (!isRecord4(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.title !== "string" || !isRecord4(value.version) || typeof value.version.number !== "number" || !Number.isSafeInteger(value.version.number)) return false;
  if (value.space !== void 0 && (!isRecord4(value.space) || typeof value.space.key !== "string")) return false;
  if (value.ancestors !== void 0 && (!Array.isArray(value.ancestors) || !value.ancestors.every((ancestor) => isRecord4(ancestor) && typeof ancestor.id === "string"))) return false;
  return true;
}
function isAttachmentResponse(value) {
  return isRecord4(value) && typeof value.id === "string" && value.id.length > 0 && typeof value.title === "string";
}
function isRecord4(value) {
  return typeof value === "object" && value !== null;
}
function containsBytes(haystack, needle) {
  outer: for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

// src/main.ts
var ConfluencePublisherPlugin = class extends import_obsidian6.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.activePublish = null;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ConfluenceSettingTab(this.app, this));
    this.addCommand({
      id: "publish-selected",
      name: "Publish selected notes to Confluence",
      callback: () => {
        new FileSelectModal(
          this.app,
          (selection) => this.selectDestinationAndPublish(selection)
        ).open();
      }
    });
    this.addCommand({
      id: "publish-current",
      name: "Publish current note to Confluence",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file === null || file.extension.toLowerCase() !== "md") return false;
        if (!checking) this.selectDestinationAndPublish({ files: [file], mainFile: file, outgoingChildPaths: /* @__PURE__ */ new Set() });
        return true;
      }
    });
    this.addCommand({
      id: "update-published",
      name: "Update already published notes",
      callback: () => this.selectDestination((destination) => {
        void this.updatePublished(destination);
      })
    });
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = await loadMigratedSettings(
      data,
      import_crypto3.randomUUID,
      (settings) => this.saveData(settings)
    );
  }
  selectDestinationAndPublish(selection) {
    const { files } = selection;
    if (files.length === 0) {
      new import_obsidian6.Notice("No files selected.");
      return;
    }
    this.selectDestination((destination) => this.runPublish(files, destination, selection));
  }
  selectDestination(onChoose) {
    if (this.activePublish !== null) {
      new import_obsidian6.Notice("A Confluence publish is already running.");
      return;
    }
    const destinations = this.settings.destinations.filter(
      (destination) => validateDestination(destination).length === 0
    );
    if (destinations.length === 0) {
      new import_obsidian6.Notice("Please configure a complete Confluence destination in settings.");
      return;
    }
    if (destinations.length === 1) {
      onChoose(destinations[0]);
      return;
    }
    new DestinationSelectModal(this.app, destinations, onChoose).open();
  }
  async updatePublished(destination) {
    try {
      const notes = new ObsidianNoteRepository(this.app);
      const files = await notes.listPublicationCandidates(destination.id);
      if (files.length === 0) {
        new import_obsidian6.Notice("No notes are published to this destination.");
        return;
      }
      await this.runPublish(files, destination);
    } catch (error) {
      new import_obsidian6.Notice(`Unable to scan published notes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async runPublish(files, destination, selection) {
    var _a;
    if (this.activePublish !== null) {
      new import_obsidian6.Notice("A Confluence publish is already running.");
      return;
    }
    const errors = [
      ...validateDestination(destination),
      ...validatePublishFiles(files)
    ];
    if (errors.length > 0) {
      new import_obsidian6.Notice(errors.join("\n"));
      return;
    }
    try {
      validateConfluenceBaseUrl(this.settings.confluenceUrl);
    } catch (error) {
      new import_obsidian6.Notice(error instanceof Error ? error.message : String(error));
      return;
    }
    const controller = new AbortController();
    this.activePublish = controller;
    const progressModal = new ProgressModal(this.app, () => controller.abort());
    progressModal.open();
    try {
      const publisher = this.createPublisher();
      for await (const event of publisher.publish(files, destination, controller.signal, {
        mainPath: (_a = selection == null ? void 0 : selection.mainFile) == null ? void 0 : _a.path,
        outgoingChildPaths: selection == null ? void 0 : selection.outgoingChildPaths
      })) {
        progressModal.handleEvent(event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian6.Notice(`Publishing failed: ${message}`);
      progressModal.handleEvent({
        type: "failed",
        title: null,
        phase: "preflight",
        error: message
      });
      progressModal.handleEvent({ type: "complete", succeeded: 0, failed: files.length });
    } finally {
      this.activePublish = null;
    }
  }
  createPublisher() {
    const authorization = this.authorizationHeader();
    const transport = new NodeHttpTransport({
      baseUrl: this.settings.confluenceUrl,
      headers: { Authorization: authorization, Accept: "application/json" }
    });
    return new Publisher({
      notes: new ObsidianNoteRepository(this.app),
      repository: new ConfluenceRepository(transport),
      settings: this.settings
    });
  }
  authorizationHeader() {
    if (this.settings.authType === "pat") {
      if (this.settings.token.length === 0) {
        throw new Error("Please set your Personal Access Token in settings.");
      }
      return `Bearer ${this.settings.token}`;
    }
    if (this.settings.username.length === 0 || this.settings.password.length === 0) {
      throw new Error("Please set username and password in settings.");
    }
    return `Basic ${Buffer.from(`${this.settings.username}:${this.settings.password}`).toString("base64")}`;
  }
};
