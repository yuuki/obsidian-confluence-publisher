# 所有権プロパティ取得エラーの回帰テスト設計

## 目的

Confluence の所有権プロパティ取得で 404 以外の HTTP エラーを受けた場合に、ページを未所有として扱わず、公開処理を失敗させる契約を回帰テストで固定する。

## 設計

`ConfluenceRepository` の既存実装は、`fetchOwnership` 内で property GET の 404 だけを `null` に変換し、その他の `TransportError` は送出する。この振る舞いを変更せず、`getPage` と `findPagesByTitle` について、ページ取得が成功した後の property GET が 500 を返すテストを追加する。

テストは fake transport にページ応答と 500 エラーを順に与え、同じエラーが呼び出し元に伝播することを検証する。所有権 property の URL と `AbortSignal` も確認し、呼び出し先や中断伝播の退行を防ぐ。

## 範囲外

- 所有権取得の並列化や API 形状の変更
- 公開処理・ドメインモデルの変更
- 404 の既存動作の変更

## リリース

マージ後、`package.json`、`package-lock.json`、`manifest.json` を `0.1.1` に揃え、`v0.1.1` タグを push して既存の Release workflow から `main.js` と `manifest.json` を公開する。
