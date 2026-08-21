# FinBox Fund Monitor VSIX

VSCode extension MVP for Fund Monitor.

## Development

```powershell
npm install
npm run compile
```

Open the repository in VSCode and run the `Run FinBox VSIX` launch configuration.

## Package And Install From Source

从项目源码打包并安装 VSIX：

```powershell
cd vsix
npm install
npm run compile
npx @vscode/vsce package
```

打包完成后会在 `vsix/` 目录生成类似 `finbox-0.0.2.vsix` 的文件。安装该 VSIX：

```powershell
code --install-extension .\finbox-0.0.2.vsix
```

也可以在 VSCode 扩展面板右上角选择 `... -> Install from VSIX...`，然后选择生成的 `.vsix` 文件。

发布或交付新的 VSIX 前，必须先递增 `package.json` 和 `package-lock.json` 中的 `version`。VSIX 文件名由 `package.json` 的 `name` 和 `version` 生成，格式为 `<name>-<version>.vsix`；版本号不变时，VSCode 可能不会把同名同版本包识别为更新。

## Debugging

1. Open the repository root folder in VSCode, not the `vsix/` folder alone.
2. Install dependencies and compile from the VSIX subproject:

```powershell
cd vsix
npm install
npm run compile
```

3. Open the VSCode Run and Debug view.
4. Select `Run FinBox VSIX`.
5. Press `F5` to launch Extension Development Host.
6. In the new VSCode window, open the `FinBox` Activity Bar entry.
7. Open the native `FINBOX` tree view.

The debug configuration uses:

```json
"--extensionDevelopmentPath=${workspaceFolder}/vsix"
```

## Manual Verification

### Sidebar Startup

Open `FinBox -> FINBOX` in Extension Development Host.

Expected result:

- The native TreeView loads under the FinBox Activity Bar entry.
- The view title shows `FINBOX`.
- Root sections are `FUND`, `STOCK`, and `SETTINGS`.
- Empty state is visible when no funds are saved.
- Fund actions are hidden under the `FUND` node context/inline menu instead of the view title bar.

### Add Funds

Use the `FUND` node menu action or run `FinBox: Add Fund`, then enter:

```text
003026,110022,161725
```

Expected result:

- Valid six-digit codes are added to the default group.
- Funds appear under `FUND -> <fund group>`.
- The tree refreshes automatically.
- Fund name appears as the tree item label.
- Estimated change and estimated NAV appear in the tree item description when Eastmoney data is available.
- Positive values use an up icon, negative values use a down icon, and failures use an error icon.

### Refresh Quotes

Use the `FUND` node refresh action or run `FinBox: Refresh Fund Monitor`.

Expected result:

- VSCode shows progress in the Fund Monitor view.
- Latest refresh time updates after completion.
- Failed codes show a recoverable failed state.
- Partial failures show a VSCode warning without clearing successful fund rows.

### Persistence

Run `Developer: Reload Window` in Extension Development Host.

Expected result:

- Saved funds and groups are restored from VSCode `globalState`.
- Quote values can be refreshed again after reload.

### Single-Fund Trend

Click a fund item in the tree.

Expected result:

- An editor webview opens for that fund.
- The trend page shows title, data source timestamp, summary cards, SVG trend chart, and metric cards.
- The page has a `刷新` button that reloads historical NAV data.

### Group Trend

Click a group item or use its context menu `Open Group Trend` action.

Expected result:

- An editor webview opens for the group.
- Groups with one or more valid funds show a multi-line trend comparison.
- Empty groups show a readable empty state.

### Remove Funds

Use a fund item's context menu `Remove Fund` action.

Expected result:

- The fund disappears from the sidebar.
- Reloading the window does not restore the removed fund.

### Groups

Use the `FUND` node create group action or run `FinBox: Create Group`, then enter a group name.

Expected result:

- The new group appears in the tree.
- Deleting a custom group from its context menu removes the group and moves contained funds back to `default`.

### Invalid Input And Network Errors

Try adding invalid input:

```text
abc,123,000000
```

Expected result:

- Non-six-digit values are ignored.
- Invalid six-digit codes may be saved but should show failed refresh state if Eastmoney returns no valid data.
- Network failures show recoverable VSCode warnings or errors.

## Logs

For trend webview issues, run `Developer: Toggle Developer Tools` in Extension Development Host and inspect the Console.

For extension host issues, open `View -> Output` and select `Log (Extension Host)`.

## Common Issues

- If `FinBox` is not visible, confirm VSCode was opened at the repository root and launched with `Run FinBox VSIX`.
- If compilation fails before launch, run `npm install` and `npm run compile` in `vsix/`.
- If the tree view is empty unexpectedly, inspect `Log (Extension Host)` and run `FinBox: Refresh Fund Monitor`.
- If quote refresh fails, retry with common fund codes such as `003026` or `110022` and check network access to Eastmoney.
- If the trend page opens without a chart, confirm the fund has historical NAV data and check `Log (Extension Host)` for request errors.
