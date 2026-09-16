# Fluorine7 PixInsight Batch Scripts

[English](#english) | [中文](#中文)

> This repository supersedes the former **Rename-By-Fitsheader** repository.

## English

Four batch-processing scripts for **PixInsight 1.9.4 or later** and its V8 JavaScript runtime. All four appear under `Script > Batch Processing`.

| Script | Version | Purpose | License |
|---|---:|---|---|
| Batch XISF Cleaner | 1.0 | Keep one image per XISF and remove companion images; optionally delete originals | MIT |
| Rename By FITS Header | 1.3 | Copy or rename FITS/XISF files with customizable header keyword templates | MIT |
| Expand Integration | 1.3 | Perform sliding-window ImageIntegration for time-series data | MIT |
| Batch Image Keyword Editor | 4.0 | Add, edit, or remove FITS-compatible keywords in FITS/XISF files | GPL-3.0-only |

### Update repository installation

1. Open `Resources > Updates > Manage Repositories` in PixInsight.
2. Add this repository URL:

   ```text
   https://raw.githubusercontent.com/Fluorine7/Fluorine7-PixInsight-Scripts/main/
   ```

3. Open `Resources > Updates > Check for Updates` and install **Fluorine7 PixInsight Batch Scripts**.
4. Restart PixInsight if requested.

Release 1.0.2 includes script signatures and a signed update index using the Fluorine7 Certified PixInsight Developer identity. Install the latest PixInsight developer database updates and restart PixInsight before checking signature verification.

### Manual installation

Download the current package archive from this repository, extract it, then use `Script > Feature Scripts... > Add` and select its `src/scripts/Fluorine7` directory.

### Rename By FITS Header

- Templates such as `{OBJECT}_{FILTER}_{timestamp}`
- FITS, FIT, FTS, and XISF input
- First-file preview and non-destructive preview of all files
- Copy mode by default; optional move/delete-original mode with confirmation
- Collision-safe sequential names
- Optional millisecond timestamps and output directory

Changing the forced suffix only changes the filename. It does **not** convert the image format.

### Expand Integration

- Sliding window size and step
- Configurable ImageIntegration combination, normalization, rejection, and range clipping
- Optional LocalNormalization files
- Multiple ImageIntegration weighting modes
- Observation-time metadata written to generated integrations

### Batch Image Keyword Editor

Based on `BatchFITSKeywordEdit` by Mike Cranfield and substantially reworked by Fluorine Zhu. It remains GPL-3.0-only and preserves original attribution.

- FITS/XISF metadata validation
- Add, edit, and remove keyword operations
- Reference keyword copying and manual fallback
- Output conflict planning and transactional replacement

### Batch XISF Cleaner

Open `src/scripts/Fluorine7/BatchXISFCleaner.js` in PixInsight's Script Editor and run it, or register the source directory in Feature Scripts. The signed 1.0.2 archive includes this script.

- Add XISF files, then use **Inspect contents** to list the contained images in order (loads the images into memory temporarily).
- Automatically identify the main image per file using native image types first, falling back to known companion identifiers for unknown types (clip/rejection high/low, drizzle weights/maps, weight images/maps, crop masks, slope maps). Processing requires exactly one remaining candidate; ambiguous files retain their originals. Inspect Contents shows the retained image. Disable automatic identification to select a manual image number for the batch. All images except the selected one are removed.
- Set **Output directory** and **Filename suffix** separately. The default suffix `_clean` produces `M31_clean.xisf` from `M31.xisf`; a live example shows the naming rule. Leave the directory empty to save beside each source. Name collisions get numbered suffixes.
- Original deletion is off by default and requires confirmation. Each output is reopened and every retained pixel is compared before the output is installed and the original is deleted. Metadata is saved through PixInsight’s native ImageWindow.saveAs; exact metadata equality is not checked. Failed files retain their originals; single-image files are skipped.
- Uses native XISF saving for the retained image and its supported metadata. Companion images are discarded, not arbitrary properties, thumbnails, or separate `.xdrz` files. Complex-valued images are rejected.
- Processing loads a complete source container and the verification image into memory. Large integrations require sufficient RAM. Review the first cleaned output before using original deletion for important data.

### Licensing

This is a multi-license repository:

- `Rename By FITS Header`, `Expand Integration`, and `Batch XISF Cleaner`: [MIT](LICENSES/MIT.txt)
- `Batch Image Keyword Editor`: [GPL-3.0-only](LICENSES/GPL-3.0-only.txt)

See each source file's copyright and SPDX notice. The GPL script is not relicensed under MIT.

### Source and issue tracker

- Repository: <https://github.com/Fluorine7/Fluorine7-PixInsight-Scripts>
- Issues: <https://github.com/Fluorine7/Fluorine7-PixInsight-Scripts/issues>

---

## 中文

这是面向 **PixInsight 1.9.4 或更高版本**、使用 V8 JavaScript 运行时的批处理脚本合集。四个脚本均位于 `Script > Batch Processing`。

| 脚本 | 版本 | 用途 | 许可证 |
|---|---:|---|---|
| Batch XISF Cleaner | 1.0 | 批量保留 XISF 主图、移除附带图像，可选删除原文件 | MIT |
| Rename By FITS Header | 1.3 | 根据 FITS/XISF 头关键字模板复制或重命名文件 | MIT |
| Expand Integration | 1.3 | 对时间序列图像执行滑动窗口叠加 | MIT |
| Batch Image Keyword Editor | 4.0 | 批量添加、编辑或删除 FITS 兼容关键字 | GPL-3.0-only |

### 通过更新仓库安装

1. 在 PixInsight 中打开 `Resources > Updates > Manage Repositories`。
2. 添加：

   ```text
   https://raw.githubusercontent.com/Fluorine7/Fluorine7-PixInsight-Scripts/main/
   ```

3. 打开 `Resources > Updates > Check for Updates`，安装 **Fluorine7 PixInsight Batch Scripts**。
4. 如有提示，重启 PixInsight。

1.0.2 版本包含使用 Fluorine7 Certified PixInsight Developer 身份生成的脚本签名和更新索引签名。请安装最新的 PixInsight 开发者数据库更新并重启，再检查签名验证结果。

### 手动安装

下载并解压当前安装包，然后打开 `Script > Feature Scripts... > Add`，选择其中的 `src/scripts/Fluorine7` 目录。

### Batch XISF Cleaner

在 PixInsight 的 Script Editor 中打开 `src/scripts/Fluorine7/BatchXISFCleaner.js` 并运行，或通过 Feature Scripts 注册源码目录。签名版 1.0.2 压缩包已包含此脚本。

1. 点击 **Add files...** 添加 XISF，使用 **Inspect contents** 检查内部图像顺序。
2. 默认优先按 XISF 图像类型逐文件自动识别，类型未知时才使用名称辅助：排除 clip/rejection high/low、drizzle weights/map、weight image/map、crop mask、slope map 等已知附图后，仅剩一个候选时保留该图。无法唯一识别则保留原文件并提示；Inspect Contents 显示识别结果。取消自动识别可手动指定整批保留序号。其余图像全部移除。
3. **Output directory** 设置保存目录，留空则使用原目录；**Filename suffix** 单独设置文件名后缀，默认 `_clean`，例如 `M31.xisf → M31_clean.xisf`。示例随输入更新；后缀留空保留原名，重名自动编号，不覆盖已有文件。
4. 默认保留原文件。勾选 **Delete original files...** 并确认后，仅在输出重新打开、逐像素核验通过后删除原文件。元数据由 PixInsight 原生另存接口保存，不保证逐项完全一致。失败时保留原文件，单图文件直接跳过。

保留图像通过 PixInsight 原生保存接口写出及携带其支持的元数据；不清理任意属性、缩略图或独立 `.xdrz` 文件。检查和处理时会加载整份源文件，核验时还会加载输出图像，需要足够内存。复杂数图像不支持。建议先保留原文件检查清理结果。

### 许可证

本仓库采用多许可证方式：

- `Rename By FITS Header`、`Expand Integration`、`Batch XISF Cleaner`：[MIT](LICENSES/MIT.txt)
- `Batch Image Keyword Editor`：[GPL-3.0-only](LICENSES/GPL-3.0-only.txt)

Batch Image Keyword Editor 基于 Mike Cranfield 的 GPLv3 项目修改，已保留原作者署名和 GPLv3 条款，不能按 MIT 重新授权。

### 源码与问题反馈

- 仓库：<https://github.com/Fluorine7/Fluorine7-PixInsight-Scripts>
- Issues：<https://github.com/Fluorine7/Fluorine7-PixInsight-Scripts/issues>
