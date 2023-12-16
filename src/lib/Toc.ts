import { Position, Range, TextDocument, TextEditorEdit, window } from "vscode";
import TocConfig from "./TocConfig";
import TocHeaderManager from "./TocHeaderManager";
import RegexStrings from "./RegexStrings";
import TocHeader from "./TocHeader";

export default class Toc {
  config = new TocConfig();

  private isCodeBlockStartOrEnd(line: number, doc: TextDocument): boolean {
    const lineText = doc.lineAt(line).text;
    return lineText.match(RegexStrings.CODE_BLOCK) !== null;
  }

  private getNextLineOutsideCodeBlock(line: number, doc: TextDocument): number {
    for (let i = line + 1; i < doc.lineCount; i++) {
      if (this.isCodeBlockStartOrEnd(i, doc)) {
        return i + 1;
      }
    }

    return doc.lineCount - 1;
  }

  private getTocRange(): Range {
    const editor = window.activeTextEditor;
    if (!editor) {
      return new Range(0, 0, 0, 0);
    }

    let start: Position | undefined;
    let end: Position | undefined;
    const doc = editor.document;

    for (let line = 0; line < doc.lineCount; line++) {
      if (this.isCodeBlockStartOrEnd(line, doc)) {
        line = this.getNextLineOutsideCodeBlock(line, doc);
      }

      const lineText = doc.lineAt(line).text;
      if (start === undefined && lineText.match(RegexStrings.TOC_START)) {
        start = new Position(line, 0);
      } else if (lineText.match(RegexStrings.TOC_END)) {
        end = new Position(line, lineText.length);
      }
    }

    if (start === undefined && end === undefined) {
      start = end = editor.selection.active;
    } else if (start === undefined) {
      start = end;
    } else if (end === undefined) {
      end = start;
    }

    if (start === undefined || end === undefined) {
      start = new Position(0, 0);
      end = new Position(0, 0);
    }

    return new Range(start, end);
  }

  private deleteToc(editBuilder: TextEditorEdit, tocRange: Range) {
    editBuilder.delete(tocRange);
  }

  private createToc(
    editBuilder: TextEditorEdit,
    headers: TocHeader[],
    insertPos: Position
  ) {
    let minHeaderDepth = 6;
    headers.forEach((header) => {
      minHeaderDepth = Math.min(minHeaderDepth, header.depth);
    });

    const headerText: string[] = [];
    headers.forEach((header) => {
      headerText.push(
        "\t".repeat(header.depth - minHeaderDepth) +
          "- " +
          header.generateHeaderText()
      );
    });

    editBuilder.insert(
      insertPos,
      `<!-- MarkdownHelperToc minDepth=${this.config.minDepth} maxDepth=${
        this.config.maxDepth
      } -->\n<!-- prettier-ignore -->\n${headerText.join(
        "\n"
      )}\n<!-- /MarkdownHelperToc -->`
    );
  }

  public async insertOrUpdate() {
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    const tocHeaderManager = new TocHeaderManager(this.config);
    const headers = await tocHeaderManager.getHeaders();
    const tocRange = this.getTocRange();
    editor
      .edit((editBuilder) => {
        this.deleteToc(editBuilder, tocRange);
        this.createToc(editBuilder, headers, tocRange.start);
      })
      .then(async () => {
        await editor.document.save();
      });
  }

  public async removeTocFromDoc() {
    const tocRange = this.getTocRange();
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    editor.edit((editBuilder) => {
      this.deleteToc(editBuilder, tocRange);
    });
  }
}