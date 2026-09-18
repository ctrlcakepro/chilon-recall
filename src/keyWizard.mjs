import { recommendModels } from "./models.mjs";

// Turns a fetched model list into copy-paste-ready environment variable commands.
// This is pure formatting: it never writes the key anywhere, it only renders text
// for the caller (the CLI) to print to the user's own terminal.
export function renderKeySetup({ baseUrl, apiKey, envName, rerankEnvName, modelIds }) {
  const recommendation = recommendModels(modelIds);
  const notes = [
    "This output only goes to your terminal; chilon-recall itself never writes the key to a file.",
    "The \"persists\" commands do, though, if you choose to run them: `setx` stores the key in your Windows user environment (registry), and the `>> ~/.bashrc` line appends it in plaintext to that file. Either command will also remain in your shell history and terminal scrollback.",
    "setx / the persistent export only affect new terminals — restart your MCP client after running them."
  ];
  if (rerankEnvName && rerankEnvName !== envName) {
    notes.push(
      `If your reranker uses a different credential, re-run \`chilon-recall key --env ${rerankEnvName}\` for it.`
    );
  }
  return {
    baseUrl,
    envName,
    modelCount: modelIds.length,
    recommendation,
    commands: {
      powershell: {
        thisWindowOnly: `$env:${envName} = "${apiKey}"`,
        persistent: `setx ${envName} "${apiKey}"`
      },
      bash: {
        thisShellOnly: `export ${envName}="${apiKey}"`,
        persistent: `echo 'export ${envName}="${apiKey}"' >> ~/.bashrc   # or ~/.zshrc`
      }
    },
    notes
  };
}
