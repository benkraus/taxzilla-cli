import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { type ReactNode } from "react";

import type { CliRuntime } from "../core/runtime";
import { InteractiveHome } from "./interactive-home";

export async function launchInteractiveHome(options: {
  readonly initialInputPath: string | null;
  readonly runtime: CliRuntime;
}): Promise<number> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  return new Promise<number>((resolve) => {
    const root = createRoot(renderer);

    const handleExit = (): void => {
      renderer.destroy();
      resolve(0);
    };

    root.render(
      <RootApp
        initialInputPath={options.initialInputPath}
        onExit={handleExit}
        runtime={options.runtime}
      />,
    );
  });
}

function RootApp(props: {
  readonly initialInputPath: string | null;
  readonly onExit: () => void;
  readonly runtime: CliRuntime;
}): ReactNode {
  return (
    <InteractiveHome
      initialInputPath={props.initialInputPath}
      onExit={props.onExit}
      runtime={props.runtime}
    />
  );
}
