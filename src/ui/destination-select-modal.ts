import { App, SuggestModal } from 'obsidian';
import { ConfluenceDestination } from '../settings';
import { validateDestination } from '../domain/validation';

export class DestinationSelectModal extends SuggestModal<ConfluenceDestination> {
	private destinations: ConfluenceDestination[];
	private onChoose_: (dest: ConfluenceDestination) => void;

	constructor(
		app: App,
		destinations: ConfluenceDestination[],
		onChoose: (dest: ConfluenceDestination) => void,
	) {
		super(app);
		this.destinations = destinations;
		this.onChoose_ = onChoose;
		this.setPlaceholder('Select a publish destination...');
	}

	getSuggestions(query: string): ConfluenceDestination[] {
		const lower = query.toLowerCase();
		const valid = this.destinations.filter((destination) =>
			validateDestination(destination).length === 0,
		);
		if (!lower) return valid;
		return valid.filter(
			(d) =>
				d.label.toLowerCase().includes(lower) ||
				d.spaceKey.toLowerCase().includes(lower),
		);
	}

	renderSuggestion(dest: ConfluenceDestination, el: HTMLElement): void {
		const label = dest.label || dest.spaceKey;
		el.createEl('div', { text: label, cls: 'suggestion-title' });
		el.createEl('small', {
			text: `Space: ${dest.spaceKey}  /  Parent ID: ${dest.parentPageId}`,
			cls: 'suggestion-note',
		});
	}

	onChooseSuggestion(dest: ConfluenceDestination): void {
		this.onChoose_(dest);
	}
}
