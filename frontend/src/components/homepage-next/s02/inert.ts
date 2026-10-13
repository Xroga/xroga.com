/** `inert` keeps hidden demo UI out of the tab order. React 18.3 treats it as a boolean attribute; the prop is
 *  spread so it type-checks without newer React DOM types. */
export const inertIf = (on: boolean): Record<string, boolean> => (on ? { inert: true } : {});
