# WebDrop iOS App — 安裝教學

## 需要準備
- Mac（裝了 Xcode 15 或以上）
- iPhone（用 Lightning / USB-C 接 Mac）
- 一個 Apple ID（免費，不需付費開發者帳號）

---

## 第一步：建立 Xcode 專案

1. 打開 **Xcode**
2. 選 **Create New Project...**
3. 選 **iOS → App** → Next
4. 填入：
   - Product Name: `WebDrop`
   - Bundle Identifier: `tw.funcity.webdrop`（或任何你喜歡的，例如 `com.yourname.webdrop`）
   - Interface: **Storyboard**
   - Language: **Swift**
5. 存放位置選這個 `ios/` 資料夾 → **Create**

---

## 第二步：替換程式碼

Xcode 建好後，把這三個檔案的內容**全部替換**：

| 你在 Xcode 看到的檔案 | 用這個資料夾裡的檔案替換 |
|---|---|
| `ViewController.swift` | `WebDrop/ViewController.swift` |
| `AppDelegate.swift` | `WebDrop/AppDelegate.swift` |
| `SceneDelegate.swift` | `WebDrop/SceneDelegate.swift` |

方法：在 Xcode 點開該檔案 → 全選（⌘A）→ 貼上新內容

然後**刪掉** Xcode 自動建的 `Main.storyboard`（因為我們用 code 建 UI）：
- 在左側 Project Navigator 找到 `Main.storyboard` → 右鍵 → Delete → Move to Trash

接著更新 Info.plist，移除 Storyboard 設定：
- 點左側的 project 根目錄（藍色 icon）
- 選 **Targets → WebDrop → Info** tab
- 找到 `Main storyboard file base name`（或 `UIMainStoryboardFile`）→ 按 `-` 刪掉它
- 找到 `Application Scene Manifest → Scene Configuration → Application Session Role → Item 0 → Storyboard Name` → 刪掉這個 key 的值（或刪掉整個 `Storyboard Name` row）

---

## 第三步：設定簽署（用你的 Apple ID）

1. 點左側 **Project Navigator 最上方** 的 `WebDrop`（藍色 icon）
2. 選 **Signing & Capabilities** tab
3. **Automatically manage signing** 打勾
4. **Team** 下拉 → **Add an Account...**
5. 登入你的 Apple ID（免費帳號即可）
6. 回來選你的帳號（會顯示 "Personal Team"）
7. 如果 Bundle ID 衝突，改成獨特一點的，例如 `com.yourname.webdrop`

---

## 第四步：接手機、執行

1. iPhone 用 USB 接 Mac
2. 第一次連接：iPhone 上會跳出「信任此電腦？」→ 點**信任**，輸入密碼
3. Xcode 上方的 scheme 選你的 iPhone（不是 Simulator）
4. 按 **▶ Run**（或 ⌘R）
5. Xcode 會編譯、安裝到手機（第一次約 1-2 分鐘）

---

## 第五步：信任開發者（只需做一次）

App 第一次在手機打開會說「未受信任的開發者」：
1. 手機進入 **設定 → 一般 → VPN 與裝置管理**
2. 找到你的 Apple ID → 點進去 → **信任**
3. 回去打開 WebDrop

---

## 注意事項

| 限制 | 說明 |
|---|---|
| **7 天效期** | 免費帳號安裝的 app 7 天後失效，需要用 Xcode 重新安裝（重新 ⌘R 即可） |
| **只能裝自己手機** | 最多 3 台自己的裝置 |
| **不能上架 App Store** | 需要付費帳號（$99/年） |
| **需要連網** | App 本身只是個 WebView，內容從 webdrop-6l1u.onrender.com 載入 |
