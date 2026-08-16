import { pathToFileURL } from "node:url";
import type { ManualNode, ManualRenderHook, ManualRenderHookContext } from "./types.js";

export async function loadRenderHooks(modulePaths: string[]): Promise<ManualRenderHook[]> {
  const hooks: ManualRenderHook[] = [];
  for (const modulePath of modulePaths) {
    const imported = await import(pathToFileURL(modulePath).href) as { default?: ManualRenderHook | ManualRenderHook[]; hooks?: ManualRenderHook[] };
    const exported = imported.default ?? imported.hooks;
    const entries = Array.isArray(exported) ? exported : exported ? [exported] : [];
    if (!entries.length) throw new Error(`render hook module exports no hooks: ${modulePath}`);
    for (const hook of entries) {
      if (!hook?.name || typeof hook.transform !== "function") throw new Error(`invalid render hook exported by ${modulePath}`);
      hooks.push(hook);
    }
  }
  return hooks;
}

export function applyRenderHooks(nodes: ManualNode[], hooks: ManualRenderHook[], context: ManualRenderHookContext): ManualNode[] {
  const visit = (node: ManualNode): ManualNode[] => {
    const withChildren = node.children ? { ...node, children: node.children.flatMap(visit) } : { ...node };
    let current = [withChildren];
    for (const hook of hooks) {
      current = current.flatMap((candidate) => {
        const transformed = hook.transform(candidate, context);
        if (transformed === undefined) return [candidate];
        return Array.isArray(transformed) ? transformed : [transformed];
      });
    }
    return current;
  };
  return nodes.flatMap(visit);
}
