import { describe, expect, it } from 'vitest';
import type { ConversionContext } from './storage-renderer';
import { convertMarkdown } from './storage-renderer';

function context(
	pageTitles = new Map<string, string>([['notes/page.md', 'Published Page']]),
	resolveLink: ConversionContext['resolveLink'] = (target) => {
		if (target === 'Page') return 'notes/page.md';
		if (target === 'assets/diagram.png') return 'assets/diagram.png';
		return null;
	},
): ConversionContext {
	return {
		sourcePath: 'notes/source.md',
		spaceKey: 'DOC',
		pageTitles,
		resolveLink,
	};
}

describe('convertMarkdown', () => {
	it('renders the core Obsidian fixture directly as Confluence storage', () => {
		const markdown = [
			'`[[Code]]`',
			'',
			'> [!NOTE] Review',
			'> **Important** [[Page#Section|Shown]]',
			'',
			'- [x] shipped',
			'',
			'![[assets/diagram.png|600]]',
		].join('\n');

		const result = convertMarkdown(markdown, context());

		expect(result.storage).toContain('<code>[[Code]]</code>');
		expect(result.storage).toContain('<ac:structured-macro ac:name="info">');
		expect(result.storage).toContain('<ac:parameter ac:name="title">Review</ac:parameter>');
		expect(result.storage).toContain('<strong>Important</strong>');
		expect(result.storage).toContain('ri:content-title="Published Page"');
		expect(result.storage).toContain('ri:space-key="DOC"');
		expect(result.storage).toContain('ac:anchor="Section"');
		expect(result.storage).toContain('<ac:link-body>Shown</ac:link-body>');
		expect(result.storage).toContain('<ac:task-list>');
		expect(result.storage).toContain('<ac:task-status>complete</ac:task-status>');
		expect(result.storage).toContain('ac:width="600"');
		expect(result.storage).toContain('<ri:attachment ri:filename="diagram-');
		expect(result.images).toEqual([
			expect.objectContaining({
				sourcePath: 'assets/diagram.png',
				resolvedPath: 'assets/diagram.png',
				attachmentName: expect.stringMatching(/^diagram-[0-9a-f]{12}\.png$/),
				width: 600,
			}),
		]);
		expect(result.issues).toEqual([]);
	});

	it('reports an unresolved image without emitting a broken attachment', () => {
		const result = convertMarkdown('before ![[missing.png]] after', context(new Map(), () => null));

		expect(result.issues).toEqual([{ code: 'unresolved-image', target: 'missing.png' }]);
		expect(result.images).toEqual([]);
		expect(result.storage).not.toContain('ri:attachment');
		expect(result.storage).toContain('before');
		expect(result.storage).toContain('after');
	});

	it('deduplicates uploads while preserving references and separates basename collisions', () => {
		const resolve = (target: string): string | null => ({
			'one.png': 'a/diagram.png',
			'two.png': 'b/diagram.png',
		}[target] ?? null);
		const result = convertMarkdown(
			'![[one.png]] ![[one.png]] ![[two.png]]',
			context(new Map(), resolve),
		);

		expect(result.storage.match(/<ri:attachment/g)).toHaveLength(3);
		expect(result.images).toHaveLength(2);
		expect(result.images[0].attachmentName).not.toBe(result.images[1].attachmentName);
	});

	it('groups consecutive task and normal list segments using native schemas', () => {
		const result = convertMarkdown(
			['- [x] done', '- ordinary', '- [ ] later'].join('\n'),
			context(),
		);

		expect(result.storage.match(/<ac:task-list>/g)).toHaveLength(2);
		expect(result.storage).toMatch(
			/<ac:task-list>[\s\S]*?<\/ac:task-list>\s*<ul>[\s\S]*?<li>[\s\S]*?ordinary[\s\S]*?<\/li>[\s\S]*?<\/ul>\s*<ac:task-list>/,
		);
		expect(result.storage).toContain('<ac:task-status>complete</ac:task-status>');
		expect(result.storage).toContain('<ac:task-status>incomplete</ac:task-status>');
		expect(result.storage).not.toMatch(/<li>\s*<ac:task>/);
		expect(result.storage).not.toMatch(/<ac:task-body>\s*<p>/);
		expect(result.storage).not.toMatch(/<li>\s*<p>/);
	});

	it('preserves an ordered list starting number', () => {
		const result = convertMarkdown('3. third\n4. fourth', context());

		expect(result.storage).toContain('<ol start="3"><li>third</li>');
	});

	it('renders recursive and adjacent callouts without re-escaping child XML', () => {
		const markdown = [
			'> [!NOTE] Outer',
			'> [[Page]]',
			'> > [!TIP] Inner',
			'> > `[[literal]]` ![[assets/diagram.png]]',
			'> [!WARNING] Adjacent',
			'> warning',
		].join('\n');

		const result = convertMarkdown(markdown, context());

		expect(result.storage.match(/<ac:structured-macro/g)).toHaveLength(3);
		expect(result.storage).toContain('<code>[[literal]]</code>');
		expect(result.storage).toContain('<ri:page');
		expect(result.storage).toContain('<ri:attachment');
		expect(result.storage).not.toContain('&lt;ac:');
	});

	it('renders published links and embeds, degrades unpublished targets, and supports same-page anchors', () => {
		const markdown = [
			'[[Page#Section|Shown]] ![[Page#Section|Preview]]',
			'[[Missing|Plain]] ![[Missing#Part|Fallback]]',
			'[[#Heading|Here]]',
		].join('\n');
		const result = convertMarkdown(markdown, context());

		expect(result.storage.match(/<ri:page/g)).toHaveLength(2);
		expect(result.storage).toContain('<ac:link-body>Shown</ac:link-body>');
		expect(result.storage).toContain('<ac:link-body>Preview</ac:link-body>');
		expect(result.storage).toContain('Plain');
		expect(result.storage).toContain('<em>(see: Fallback)</em>');
		expect(result.storage).toContain('<ac:link ac:anchor="Heading"><ac:link-body>Here</ac:link-body></ac:link>');
	});

	it('escapes untrusted values and ordinary text exactly once', () => {
		const hostileContext: ConversionContext = {
			sourcePath: 'notes/source.md',
			spaceKey: 'D&"\'<>',
			pageTitles: new Map([['evil.md', 'T&"\'<>']]),
			resolveLink: (target) => target.startsWith('Page') ? 'evil.md' : null,
		};
		const markdown = [
			'[[Page#A&"\'<>|Alias & <tag>]]',
			'[link](<https://example.test/?x=1&y=\'bad\'> "T&\'<>")',
			'![Alt & <bad>](https://img.test/a?x=1&y=2)',
			'Plain & < > " \' and `Code & < >`',
		].join('\n\n');
		const result = convertMarkdown(markdown, hostileContext);

		expect(result.storage).toContain('ri:content-title="T&amp;&quot;&apos;&lt;&gt;"');
		expect(result.storage).toContain('ri:space-key="D&amp;&quot;&apos;&lt;&gt;"');
		expect(result.storage).toContain('ac:anchor="A&amp;&quot;&apos;&lt;&gt;"');
		expect(result.storage).toContain('Alias &amp; &lt;tag&gt;');
		expect(result.storage).toContain('href="https://example.test/?x=1&amp;y=&apos;bad&apos;"');
		expect(result.storage).toContain('title="T&amp;&apos;&lt;&gt;"');
		expect(result.storage).toContain('ac:alt="Alt &amp; &lt;bad&gt;"');
		expect(result.storage).toContain('Plain &amp; &lt; &gt; &quot; &apos;');
		expect(result.storage).toContain('<code>Code &amp; &lt; &gt;</code>');
		expect(result.storage).not.toContain('&amp;lt;');
	});

	it('renders standard Markdown structures and external media', () => {
		const markdown = [
			'# Heading',
			'',
			'**strong** *em* ~~del~~  ',
			'break [site](https://example.test "title")',
			'',
			'![alt](https://img.test/a.png "image title")',
			'',
			'| A | B |',
			'| - | - |',
			'| 1 | 2 |',
			'',
			'> quote',
			'',
			'---',
		].join('\n');
		const result = convertMarkdown(markdown, context());

		expect(result.storage).toContain('<h1>Heading</h1>');
		expect(result.storage).toContain('<strong>strong</strong>');
		expect(result.storage).toContain('<em>em</em>');
		expect(result.storage).toContain('<del>del</del>');
		expect(result.storage).toContain('<br/>');
		expect(result.storage).toContain('<a href="https://example.test" title="title">site</a>');
		expect(result.storage).toContain('<ac:image ac:alt="alt"><ri:url ri:value="https://img.test/a.png"/></ac:image>');
		expect(result.storage).toContain('<table><tbody>');
		expect(result.storage).toContain('<blockquote>');
		expect(result.storage).toContain('<hr/>');
	});

	it('uses an external image title as an XML-safe alt fallback', () => {
		const result = convertMarkdown(
			'![](https://img.test/a.png "Fallback & <image>")',
			context(),
		);

		expect(result.storage).toContain('ac:alt="Fallback &amp; &lt;image&gt;"');
		expect(result.storage).not.toContain('&amp;amp;');
	});

	it('keeps only well-formed raw HTML and XML-defined entities', () => {
		const markdown = [
			'<u>inline</u>',
			'',
			'<div class="safe"><span>block</span></div>',
			'',
			'<br/>',
			'',
			'<br>',
			'',
			'<img src=x>',
			'',
			'Named &copy; but XML &amp; stays valid.',
		].join('\n');
		const result = convertMarkdown(markdown, context());

		expect(result.storage).toContain('<u>inline</u>');
		expect(result.storage).toContain('<div class="safe"><span>block</span></div>');
		expect(result.storage).toContain('<br/>');
		expect(result.storage).toContain('&lt;br&gt;');
		expect(result.storage).toContain('&lt;img src=x&gt;');
		expect(result.storage).toContain('Named &amp;copy; but XML &amp; stays valid.');
		expect(result.storage).not.toContain('&amp;amp; stays');
	});

	it('rejects subtle raw XML errors and replaces XML 1.0 forbidden characters', () => {
		const markdown = [
			'<div id="a" id="b">duplicate</div>',
			'',
			'<x:div>namespace</x:div>',
			'',
			'<div>forbidden ]]> text</div>',
			'',
			'plain \0 text',
			'',
			'```text',
			'code \0 body',
			'```',
		].join('\n');
		const result = convertMarkdown(markdown, context());

		expect(result.storage).not.toContain('<div id="a" id="b">');
		expect(result.storage).not.toContain('<x:div>');
		expect(result.storage).not.toContain('<div>forbidden ]]> text</div>');
		expect(result.storage).not.toContain('\0');
		expect(result.storage.match(/�/g)?.length).toBeGreaterThanOrEqual(2);
	});

	it('renders fenced code as a code macro with safe language and CDATA boundaries', () => {
		const markdown = ['```x&<', '[[literal]]', 'a]]>b', '```'].join('\n');
		const result = convertMarkdown(markdown, context());

		expect(result.storage).toContain('<ac:structured-macro ac:name="code">');
		expect(result.storage).toContain('<ac:parameter ac:name="language">x&amp;&lt;</ac:parameter>');
		expect(result.storage).toContain('<![CDATA[[[literal]]\na]]]]><![CDATA[>b]]>');
		expect(result.storage).not.toContain('<ri:page');
	});
});
