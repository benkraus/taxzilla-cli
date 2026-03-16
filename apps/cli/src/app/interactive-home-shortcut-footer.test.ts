import { describe, expect, it } from "vitest";

import { formatShortcutFooterRow, shortcutFooterRows } from "./shortcut-footer";

describe("ShortcutFooter", () => {
  it("formats shortcut labels without raw backticks", () => {
    const lines = shortcutFooterRows.map((row) => formatShortcutFooterRow(row));

    expect(lines).toEqual([
      "ctrl+n new  ctrl+o open  ctrl+s save",
      "a add form or payment  backspace remove list item  ctrl+r run  ctrl+e export",
      "pageup  pagedown step  tab field  escape quit",
    ]);
    expect(lines.join("\n")).not.toContain("`");
  });
});
