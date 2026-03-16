import { type ReactNode } from "react";

type ShortcutFooterEntry = {
  readonly key: string;
  readonly description?: string;
};

const shortcutKeyForeground = "#f3f8f5";
const shortcutKeyBackground = "#27443a";

export const shortcutFooterRows = [
  [
    { key: "ctrl+n", description: "new" },
    { key: "ctrl+o", description: "open" },
    { key: "ctrl+s", description: "save" },
  ],
  [
    { key: "a", description: "add form or payment" },
    { key: "backspace", description: "remove list item" },
    { key: "ctrl+r", description: "run" },
    { key: "ctrl+e", description: "export" },
  ],
  [
    { key: "pageup" },
    { key: "pagedown", description: "step" },
    { key: "tab", description: "field" },
    { key: "escape", description: "quit" },
  ],
] as const satisfies readonly (readonly ShortcutFooterEntry[])[];

export function ShortcutFooter() {
  return (
    <box border padding={1} flexDirection="column" gap={1} backgroundColor="#0b1e18">
      {shortcutFooterRows.map((row, index) => (
        <text key={`shortcut-row-${index}`}>{renderShortcutFooterRow(row)}</text>
      ))}
    </box>
  );
}

export function formatShortcutFooterRow(row: readonly ShortcutFooterEntry[]): string {
  return row
    .map((entry) =>
      entry.description == null ? entry.key : `${entry.key} ${entry.description}`,
    )
    .join("  ");
}

function ShortcutKey(props: {
  readonly children: ReactNode;
}) {
  return (
    <span fg={shortcutKeyForeground} bg={shortcutKeyBackground}>
      <strong> {props.children} </strong>
    </span>
  );
}

function renderShortcutFooterRow(row: readonly ShortcutFooterEntry[]): ReactNode[] {
  const nodes: ReactNode[] = [];

  for (const [index, entry] of row.entries()) {
    if (index > 0) {
      nodes.push("  ");
    }

    nodes.push(<ShortcutKey key={`shortcut-key-${entry.key}`}>{entry.key}</ShortcutKey>);

    if (entry.description != null) {
      nodes.push(` ${entry.description}`);
    }
  }

  return nodes;
}
