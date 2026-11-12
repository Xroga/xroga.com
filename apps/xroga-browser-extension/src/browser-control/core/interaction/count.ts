// Counting what the page shows, for postconditions such as "the list has four rows" or "a row named Ada is there". The idea (a post-condition
// that checks the list gained a row, not only that a success message appeared) is from uiuing/browser-agent (MIT); this is a small reimplementation
// on this layer's own observation, not a copy of its code.
import type { ONode } from '../perception/outline';

export interface CountQuery {
  /** The element role, such as "listitem", "row" or "button". */
  role?: string;
  /** Text the element name contains, ignoring case. */
  name?: string;
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The text of an element and everything inside it, for a list item or a row whose own name is empty. */
function textOf(node: ONode): string {
  return [node.name, ...node.children.map(textOf)].join(' ');
}

/**
 * How many elements of the observation match: every element, not only the ones that can be acted on. Text nodes are never counted. With a role,
 * the name is looked for in the element's own name or in the text inside it (a list item's name is usually empty); with a name alone, only in the
 * element's own name, so a table is not counted for every row it contains.
 */
export function countMatching(tree: ONode[], query: CountQuery): number {
  const role = query.role ? clean(query.role) : undefined;
  const name = query.name ? clean(query.name) : undefined;
  if (!role && !name) return 0;
  let n = 0;
  const walk = (nodes: ONode[]) => {
    for (const node of nodes) {
      if (
        node.kind === 'element' &&
        (!role || clean(node.role) === role || clean(node.rawRole) === role) &&
        (!name || clean(node.name).includes(name) || (!!role && clean(textOf(node)).includes(name)))
      ) {
        n++;
      }
      walk(node.children);
    }
  };
  walk(tree);
  return n;
}

/** The words for a query, for a failure message: `listitem "Row 2"`. */
export function describeQuery(query: CountQuery): string {
  return [query.role, query.name ? JSON.stringify(query.name) : ''].filter(Boolean).join(' ') || 'element';
}
