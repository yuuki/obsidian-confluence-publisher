# Obsidian Confluence Publisher 全面再設計

## 目的

本変更は、公開先の取り違え、部分更新によるリンク消失、Markdown変換時の内容破壊、添付更新の欠落、通信停止、入力検証不足を解消する。

既存のコマンド、設定画面、Confluence Server/Data Center向けREST API v1、デスクトップ専用という製品境界は維持する。

既存実装へ個別の条件分岐を積み重ねず、解析、公開計画、永続メタデータ、Confluence通信を独立した単位へ分割する。

## 対象外

Confluence Cloud対応、モバイル対応、公開済みページや添付の自動削除、ノート階層からのページ階層生成は対象外とする。

未公開ノートへのwikilinkは、現在と同じく表示文字列へ変換する。

Obsidianのnote embedは内容展開ではなく、公開済みページへのリンクとして扱う。

## アーキテクチャ

実装を次の四層へ分ける。

```text
Commands / UI
    ↓
Publish application service
    ↓
Publication planner ── Storage-format converter
    ↓                       ↓
Publication metadata    Markdown token tree
    ↓
Confluence repository / HTTP transport
```

**Commands / UI**は、入力の収集、destination選択、実行中の排他、キャンセル、進捗表示を担当する。

**Publish application service**は、事前検査、ページ解決、変換、添付反映、ページ更新、frontmatter書き戻しの順序を制御する。

**Publication planner**は、外部書き込み前にノートと既存publicationを読み、重複、設定不整合、未解決画像を検出する。

**Storage-format converter**は、Markdown token treeからConfluence Storage Formatを生成する。

**Publication metadata**は、destination別の公開記録と旧frontmatterの移行を担当する。

**Confluence repository / HTTP transport**は、REST APIの意味とNode.js HTTP通信を分離する。

## ファイル境界

主な責務は次のファイルへ配置する。

- `src/domain/publication.ts`：destination、publication record、公開対象ノート、公開計画の型を定義する。
- `src/domain/publication-metadata.ts`：新旧frontmatterを読み、新形式を書き戻す。
- `src/domain/publication-planner.ts`：事前検査と公開計画を生成する。
- `src/converter/obsidian-marked-extension.ts`：wikilink、embed、calloutのtokenizerを定義する。
- `src/converter/storage-renderer.ts`：型付きtokenからStorage Formatを生成する。
- `src/converter/attachment-name.ts`：vault内パスから衝突しない添付名を生成する。
- `src/confluence/transport.ts`：timeout、abort、protocol制約、HTTPレスポンス処理を担当する。
- `src/confluence/repository.ts`：ページと添付のREST操作を提供する。
- `src/publisher.ts`：application serviceとして公開処理を調停する。
- `src/main.ts`と`src/ui/`：コマンド、排他、destination選択、進捗、キャンセルを提供する。

既存の`src/confluence/client.ts`、`src/converter/obsidian-syntax.ts`、`src/converter/markdown-to-storage.ts`は、新しい責務へ移行した後に削除する。

## destinationとpublication record

各destinationへ永続的な`id`を追加する。

既存設定のdestinationに`id`がない場合、設定読み込み時に生成して保存する。

ラベル変更では`id`を維持する。

space keyまたはparent page IDを変更した場合も`id`は維持するが、保存済みpublicationのsnapshotと一致しないため、更新前検査で停止する。

利用者が別の公開先として扱う場合は、新しいdestinationを追加する。

ノートのfrontmatterには次の形式で記録する。

```yaml
confluence-publications:
  destination-id:
    base-url: https://confluence.example.com
    space-key: DOC
    parent-page-id: "12345"
    page-id: "67890"
    page-url: https://confluence.example.com/pages/viewpage.action?pageId=67890
```

旧`confluence-page-id`と`confluence-url`は読み取り互換性を保つ。

旧ページIDは、選択destinationのbase URL、space、直接のparentと一致することをConfluenceから確認できた場合だけ新形式へ移行する。

移行に成功した書き戻しで旧キーを削除する。

移行前の旧キーを持つノートも「Update already published notes」の候補へ含める。

## 公開計画

公開計画は、Confluenceへ変更を送る前に次の条件を検査する。

- すべての入力がMarkdownファイルである。
- destinationのspace keyとparent page IDが空でない。
- frontmatterが解析できる。
- 解決後のタイトルがバッチ内で一意である。
- 保存済みページIDがバッチ内で一意である。
- 埋め込み画像がvault内のファイルへ解決できる。
- publication recordのbase URL、space、parentが選択destinationと一致する。

いずれかに違反した場合は、対象ファイルと理由をまとめて返し、外部書き込みを開始しない。

ページIDが存在する場合、repositoryはページを取得してspaceと直接のparentを検証する。

ページIDが404の場合だけ、選択space、parent、titleで再探索する。

候補が一件なら再関連付けし、候補がなければ新規作成を計画する。

同名ページが別parentにある場合や候補を一件に決められない場合は、自動更新せずエラーにする。

ページIDがない場合も同じspace、parent、titleで検索し、一件なら関連付け、なければ新規作成を計画する。

## 二段階の適用

全面再設計後も、相互リンクを成立させるために適用処理は二段階とする。

第一段階は、必要なページをplaceholder本文で作成し、全ノートのfile path、title、page ID対応表を確定する。

第一段階で一件でも失敗した場合、リンク不整合を避けるため第二段階へ進まない。

第一段階で作成済みのplaceholderページは、再実行時にspace、parent、titleから回収する。

第二段階は、本文変換、添付反映、現在version取得、ページ更新、frontmatter書き戻しをページ単位で行う。

第二段階の一ページが失敗しても、他ページは処理を継続する。

frontmatterは、そのページの本文と添付が成功した後だけ書き換える。

## 部分更新とwikilink

application serviceは、選択destinationに属するpublication recordをvault全体から収集する。

今回の選択ファイルと、新規作成されたページを同じ対応表へ追加する。

これにより「Publish current note」でも、今回未選択の公開済みノートへのwikilinkを維持する。

別destinationのpublicationはリンク解決に使用しない。

headingを含むwikilinkは、ページ情報とanchorを分離してStorage Formatへ出力する。

aliasとnote embedのaliasは表示文字列として保持する。

## Markdown解析

文字列へConfluence XMLを先に挿入する方式を廃止する。

`marked`の拡張tokenizerでwikilink、image embed、note embed、calloutをtokenとして認識する。

拡張tokenizerは、Markdown parserが通常テキストとして処理する範囲でだけ動作する。

したがって、コードフェンスとインラインコードの内部は変換しない。

calloutはblock tokenとして解析し、本文を再帰的にMarkdown tokenへ変換する。

calloutのタイトル、省略タイトル、fold marker、EOFで終わる本文なしcallout、隣接calloutを別々に扱う。

callout本文の改行、強調、リスト、wikilink、画像を保持する。

固定文字列placeholderは使用しない。

標準Markdownのraw HTMLは、現行互換のためrendererへ渡す。

## Storage Format renderer

rendererはXMLエスケープを一箇所へ集約する。

通常の見出し、段落、引用、リスト、表、リンク、外部画像、コードブロックをStorage Formatへ変換する。

task itemの連続区間は`ac:task-list`で包み、通常のlist itemと構造を混在させない。

コードブロックはCDATA終端を分割して保持する。

calloutは`ac:structured-macro`と`ac:rich-text-body`へ変換する。

内部ページリンクはspace、title、anchor、表示文字列を型から生成する。

## 添付ライフサイクル

添付名は正規化したvault内パスとbasenameから決定的に生成する。

短いSHA-256を名前へ含め、異なるパスの同一basenameを区別する。

同じページ内で同じ画像を複数回参照した場合、添付操作は一回へまとめる。

既存添付一覧は全ページを取得し、titleからattachment IDを解決する。

同名添付がなければ新規作成APIを呼ぶ。

同名添付があればattachment ID付き更新APIを呼び、ローカルの変更を毎回反映する。

旧basename添付は削除しない。

添付一覧取得、ファイル読み込み、アップロードのいずれかが失敗したページは、成功として数えない。

multipart filenameはCRとLFを拒否し、quoted-stringをエスケープする。

## Confluence通信

transportは`https:`を標準とする。

`http:`は`localhost`、`127.0.0.1`、`::1`だけ許可する。

ほかのprotocolは認証情報を組み立てる前に拒否する。

通常APIと添付APIの両方へ既定30秒のtimeoutと`AbortSignal`を適用する。

timeout時はrequestを破棄し、型付きエラーを返す。

responseの`aborted`と`error`もPromiseの失敗へ変換する。

redirectは追跡せず、locationを含む認証またはURL設定エラーとして返す。

JSON APIはHTTP status、content type、parse errorを検査する。

添付一覧は`start`と`limit`を使って末尾まで取得する。

repositoryはtransportへ依存し、テストではfake transportへ差し替えられるようにする。

## UIとキャンセル

コマンドはactive fileがMarkdownの場合だけ実行可能にする。

file select modalはMarkdown以外を選択集合へ追加しない。

公開直前にも入力ファイルとdestinationを検証する。

pluginは公開中の実行を一件に制限し、二重実行をNoticeで拒否する。

ProgressModalは実行中にCloseではなくCancelを表示する。

Cancelとmodal closeは同じ`AbortController`を中止する。

中止後は新規ネットワーク操作を開始せず、実行中requestの終了を待って`cancelled`を表示する。

進捗イベントは`planned`、`page-created`、`attachment-created`、`attachment-updated`、`page-updated`、`failed`、`cancelled`、`complete`とする。

イベント名と表示文言を一致させ、ページ数と処理step数を混同しない。

「Update already published notes」はdestinationを先に選び、そのdestinationのpublicationを持つノートだけを対象にする。

## 設定移行

settings migrationは常に新しいobjectと配列を返し、`DEFAULT_SETTINGS`を変更しない。

legacy destinationを移行した場合とdestination IDを追加した場合は、読み込み後に一度だけ保存する。

空destinationは設定画面に残せるが、公開候補として選べず、行単位の入力不足を表示する。

## テスト

テストランナーとしてVitestを導入する。

converterはMarkdown入力と期待Storage Formatを比較するfixture testで検証する。

fixtureにはコード内wikilink、callout内Markdown、隣接callout、EOF callout、task list、anchor、alias、同名画像、外部画像、CDATA終端を含める。

publication plannerはdestination不一致、重複title、重複page ID、stale ID、別parentの同名ページ、未解決画像、部分更新リンク表を検証する。

publisherはfake repositoryとfake vaultを使い、第一段階失敗時の停止、第二段階のページ別継続、frontmatter書き戻し順序、strip frontmatter、cancelを検証する。

transportはローカルHTTP serverを使い、protocol制約、timeout、abort、response中断、redirect、JSON error、multipartを検証する。

repositoryはfake transportを使い、添付ページング、新規添付、既存添付更新を検証する。

設定とUIから分離したvalidationとprogress reducerはunit testで検証する。

実Confluenceを使うテストはCIへ含めない。

## セルフレビューと独立レビュー

実装を次の五トピックに分ける。

1. publication metadataと公開計画
2. Markdown parserとStorage Format renderer
3. Confluence clientと添付ライフサイクル
4. Publisher orchestration、設定、UI
5. ドキュメント、CI、Release

各トピックは、失敗する回帰テスト、最小実装、トピックテスト、全テスト、セルフレビューの順で進める。

セルフレビュー後に、実装担当と異なるsubagentが仕様、差分、テストを確認する。

CriticalまたはImportantの指摘があれば、一項目ずつ検証して修正し、同じreviewerへ再レビューを依頼する。

reviewerが明示的に`ACCEPT`を返すまで、次のトピックを完了扱いにしない。

全トピック後に統合reviewerが全差分と検証結果を確認する。

## CIとRelease

`npm run check`は型検査、全テスト、本番buildを実行する。

GitHub ActionsはNode.js 20で`npm ci`、`npm run check`、追跡済み`main.js`との差分、`package.json`と`manifest.json`のversion一致を検査する。

esbuildは既知のdevelopment server脆弱性を含まない版へ更新する。

正式なMIT `LICENSE`を追加し、`package.json`へlicenseを記載する。

READMEは新frontmatter、移行、HTTPS制約、画像更新、cancel、BRAT導入条件を反映する。

Pull Requestはdraftではなくready状態で作成する。

CI失敗は原因を検証し、修正、トピックreview、再実行を行う。

すべてのrequired check成功後にsquash mergeする。

merge後に`v0.1.0` tagを作成する。

tag workflowはversion一致と`npm run check`を再実行し、`main.js`と`manifest.json`をGitHub Releaseへ添付する。

Release公開後にassetsを取得できることを確認する。

## 受け入れ条件

- 選択destination以外のページを更新しない。
- 重複titleまたは重複page IDを外部変更前に拒否する。
- 部分更新で公開済みノートへのwikilinkを維持する。
- コード内のObsidian構文を変換しない。
- callout内のMarkdown、リンク、画像、改行を保持する。
- task listとanchor linkをConfluence Storage Formatで出力する。
- 同名画像を区別し、変更済み画像を更新する。
- 画像失敗を成功として表示しない。
- timeout、abort、HTTPS制約を通常APIと添付APIへ適用する。
- `Strip frontmatter`設定を公開本文へ反映する。
- Markdown以外と空destinationを公開しない。
- 二重実行を拒否し、実行中の公開をcancelできる。
- 旧設定と旧frontmatterを検証付きで移行する。
- 全トピックと統合レビューが`ACCEPT`になる。
- CI成功後にPRをmergeし、`v0.1.0` ReleaseへBRAT用assetsを添付する。
