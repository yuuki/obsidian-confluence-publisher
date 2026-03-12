import { App, Modal, TFile } from 'obsidian';

const STYLES = `
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

interface Section {
  label: string;
  files: TFile[];
  collapsedByDefault: boolean;
}

export class FileSelectModal extends Modal {
  private selectedFiles: Set<TFile> = new Set();
  private onSubmit: (files: TFile[]) => void;
  private searchInput: HTMLInputElement;
  private listContainer: HTMLElement;
  private submitBtn: HTMLButtonElement;
  private styleEl: HTMLStyleElement;
  private collapsedSections: Set<string> = new Set();

  constructor(app: App, onSubmit: (files: TFile[]) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('confluence-file-select');

    // Inject styles
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = STYLES;
    document.head.appendChild(this.styleEl);

    // Title
    contentEl.createEl('h2', { text: 'Select notes to publish' });

    // Search input
    this.searchInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Search notes...',
      cls: 'confluence-search-input',
    });
    this.searchInput.setAttribute('aria-label', 'Filter notes by name');
    this.searchInput.addEventListener('input', () => this.renderList());

    // File list container
    this.listContainer = contentEl.createDiv({ cls: 'confluence-file-list' });
    this.listContainer.setAttribute('role', 'list');

    // Submit button
    this.submitBtn = contentEl.createEl('button', {
      text: 'Publish (0 files)',
      cls: 'confluence-publish-btn mod-cta',
    });
    this.submitBtn.addEventListener('click', () => {
      if (this.selectedFiles.size === 0) return;
      this.close();
      this.onSubmit(Array.from(this.selectedFiles));
    });

    // Pre-select the active file
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.selectedFiles.add(activeFile);
    }

    // "All Notes" starts collapsed
    this.collapsedSections.add('All Notes');

    this.renderList();

    // Focus search input after render
    this.searchInput.focus();
  }

  /**
   * Resolve outgoing links and backlinks for a given file using the
   * metadataCache.resolvedLinks map.
   */
  private getRelatedFiles(file: TFile | null): { outgoing: TFile[]; backlinks: TFile[] } {
    if (!file) return { outgoing: [], backlinks: [] };

    // Outgoing links: entries where the active file links to other files
    const resolved = this.app.metadataCache.resolvedLinks[file.path] || {};
    const outgoing = Object.keys(resolved)
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((f): f is TFile => f instanceof TFile && f.extension === 'md');

    // Backlinks: other files that link to the active file
    const backlinks: TFile[] = [];
    const allLinks = this.app.metadataCache.resolvedLinks;
    for (const [sourcePath, links] of Object.entries(allLinks)) {
      if (file.path in (links as Record<string, number>)) {
        const src = this.app.vault.getAbstractFileByPath(sourcePath);
        if (src instanceof TFile && src.extension === 'md') {
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
  private renderList(): void {
    this.listContainer.empty();

    const query = this.searchInput.value.trim().toLowerCase();
    const activeFile = this.app.workspace.getActiveFile();
    const { outgoing, backlinks } = this.getRelatedFiles(activeFile);

    // Track files already placed in earlier sections to avoid duplication
    const shown = new Set<string>();

    const sections: Section[] = [];

    // 1. Current Note
    if (activeFile && activeFile.extension === 'md') {
      sections.push({
        label: 'Current Note',
        files: [activeFile],
        collapsedByDefault: false,
      });
      shown.add(activeFile.path);
    }

    // 2. Outgoing Links (deduplicated against earlier sections)
    const dedupedOutgoing = outgoing.filter((f) => {
      if (shown.has(f.path)) return false;
      shown.add(f.path);
      return true;
    });
    if (dedupedOutgoing.length > 0) {
      sections.push({
        label: 'Outgoing Links',
        files: dedupedOutgoing,
        collapsedByDefault: false,
      });
    }

    // 3. Backlinks (deduplicated against earlier sections)
    const dedupedBacklinks = backlinks.filter((f) => {
      if (shown.has(f.path)) return false;
      shown.add(f.path);
      return true;
    });
    if (dedupedBacklinks.length > 0) {
      sections.push({
        label: 'Backlinks',
        files: dedupedBacklinks,
        collapsedByDefault: false,
      });
    }

    // 4. All Notes (excludes files already shown)
    const allMarkdown = this.app.vault
      .getMarkdownFiles()
      .filter((f) => !shown.has(f.path))
      .sort((a, b) => a.basename.localeCompare(b.basename));

    if (allMarkdown.length > 0) {
      sections.push({
        label: 'All Notes',
        files: allMarkdown,
        collapsedByDefault: true,
      });
    }

    // Render each section, applying the search filter
    let totalVisible = 0;
    for (const section of sections) {
      const filtered = query
        ? section.files.filter(
            (f) =>
              f.basename.toLowerCase().includes(query) ||
              f.path.toLowerCase().includes(query),
          )
        : section.files;

      if (filtered.length === 0) continue;

      totalVisible += filtered.length;
      this.renderSection(this.listContainer, section.label, filtered, section.collapsedByDefault);
    }

    if (totalVisible === 0) {
      this.listContainer.createDiv({
        cls: 'confluence-empty-state',
        text: query ? 'No notes match your search.' : 'No markdown notes found in vault.',
      });
    }

    this.updateSubmitButton();
  }

  /**
   * Render a single collapsible section with a header checkbox for bulk
   * selection and individual file rows.
   */
  private renderSection(
    container: HTMLElement,
    label: string,
    files: TFile[],
    _collapsedByDefault: boolean,
  ): void {
    const sectionEl = container.createDiv({ cls: 'confluence-section' });

    // Determine collapsed state (use default only if user has not toggled yet)
    const isCollapsed = this.collapsedSections.has(label);

    // --- Header ---
    const header = sectionEl.createDiv({ cls: 'confluence-section-header' });

    // Bulk checkbox
    const headerCheckbox = header.createEl('input', { type: 'checkbox' });
    headerCheckbox.setAttribute('aria-label', `Select all in ${label}`);
    const allSelected = files.length > 0 && files.every((f) => this.selectedFiles.has(f));
    const someSelected = files.some((f) => this.selectedFiles.has(f));
    headerCheckbox.checked = allSelected;
    headerCheckbox.indeterminate = someSelected && !allSelected;

    headerCheckbox.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    headerCheckbox.addEventListener('change', () => {
      if (headerCheckbox.checked) {
        files.forEach((f) => this.selectedFiles.add(f));
      } else {
        files.forEach((f) => this.selectedFiles.delete(f));
      }
      this.renderList();
    });

    // Label text
    header.createSpan({ cls: 'confluence-section-label', text: label });

    // Count
    header.createSpan({
      cls: 'confluence-section-count',
      text: `(${files.length})`,
    });

    // Collapse toggle arrow
    header.createSpan({
      cls: `confluence-section-toggle ${isCollapsed ? 'is-collapsed' : ''}`,
      text: '\u25BC',
    });

    // Click header to toggle collapse (but not when clicking the checkbox)
    header.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (this.collapsedSections.has(label)) {
        this.collapsedSections.delete(label);
      } else {
        this.collapsedSections.add(label);
      }
      this.renderList();
    });

    // --- Items container ---
    const itemsEl = sectionEl.createDiv({
      cls: `confluence-section-items ${isCollapsed ? 'is-collapsed' : ''}`,
    });

    for (const file of files) {
      this.renderFileItem(itemsEl, file);
    }
  }

  /**
   * Render a single file row with a checkbox, file name, and path.
   */
  private renderFileItem(container: HTMLElement, file: TFile): void {
    const row = container.createDiv({ cls: 'confluence-file-item' });
    row.setAttribute('role', 'listitem');

    const checkbox = row.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.selectedFiles.has(file);
    checkbox.setAttribute('aria-label', `Select ${file.basename}`);

    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selectedFiles.add(file);
      } else {
        this.selectedFiles.delete(file);
      }
      this.renderList();
    });

    // File name (without extension)
    row.createSpan({ cls: 'confluence-file-name', text: file.basename });

    // Parent folder path for disambiguation
    const parentPath = file.parent ? file.parent.path : '';
    if (parentPath) {
      row.createSpan({ cls: 'confluence-file-path', text: parentPath });
    }

    // Clicking the row toggles the checkbox
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });
  }

  /**
   * Update the submit button label to reflect the current selection count.
   */
  private updateSubmitButton(): void {
    const count = this.selectedFiles.size;
    this.submitBtn.textContent = `Publish (${count} file${count !== 1 ? 's' : ''})`;
    this.submitBtn.disabled = count === 0;
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.styleEl) {
      this.styleEl.remove();
    }
  }
}
