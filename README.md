# うおtube用のapi
原則うおtube以外の使用を認めません。


## ベースURLとパラメータ
 * **ベースURL**: http://localhost:3000/ （環境に応じて変更してください）
 * **必須パラメータ**: action （どのアクションを実行するかを指定）
## URLエンドポイント一覧
### 1. 検索 (action=search)
動画をキーワードで検索します。検索キーワード（q）が必須です。
 * **URL例**:
   ```text
   http://localhost:3000/?action=search&q=プログラミング
   
   ```
### 2. 動画詳細情報の取得 (action=video)
指定した動画のタイトル、説明、再生回数などの詳細情報を取得します。動画のID（id）が必須です。
 * **URL例**:
   ```text
   http://localhost:3000/?action=video&id=dQw4w9WgXcQ
   
   ```
### 3. コメント一覧の取得 (action=comments)
指定した動画のコメント一覧を取得します。動画のID（id）が必須です。
 * **URL例**:
   ```text
   http://localhost:3000/?action=comments&id=dQw4w9WgXcQ
   
   ```
### 4. 関連動画の取得 (action=related)
指定した動画の関連動画（おすすめ動画）のリストを取得します。動画のID（id）が必須です。
 * **URL例**:
   ```text
   http://localhost:3000/?action=related&id=dQw4w9WgXcQ
   
   ```
### 5. フルデータ（動画＋コメント＋関連動画）の取得 (action=full)
動画詳細情報、コメント（最大20件）、関連動画（最大20件）を一度にまとめて取得します。動画のID（id）が必須です。
 * **URL例**:
   ```text
   http://localhost:3000/?action=full&id=dQw4w9WgXcQ
   
   ```
### 6. 急上昇（トレンド）の取得 (action=trending)
現在の急上昇動画の一覧を取得します。追加のパラメータは不要です。
 * **URL例**:
   ```text
   http://localhost:3000/?action=trending
   
   ```
