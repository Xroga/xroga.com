import type { ToolHandler } from '../controller';
import { find, read, screenshot, snapshot } from './observe';
import { tabs } from './tabs';
import { navigate } from './navigate';
import { click, drag, hover, scroll } from './act';
import { canvas } from './canvas';
import { press, set, type } from './text';
import { wait } from './wait';
import { handleDialog } from './dialog';
import { askUser } from './ask';
import { fillForm } from './fill';
import { upload } from './upload';
import { diagnostics } from './diagnostics';
import { extractRows } from './extract-rows';
import { formModel } from './form-model';
import { webSearch } from './web-search';
import { demo } from './demo';

/** Tool name to handler. Arguments arrive validated against the catalogue's schema. */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  snapshot: (ctx, args) => snapshot(ctx, args as never),
  find: (ctx, args) => find(ctx, args as never),
  read: (ctx, args) => read(ctx, args as never),
  screenshot: (ctx, args) => screenshot(ctx, args as never),
  tabs: (ctx, args) => tabs(ctx, args as never),
  navigate: (ctx, args) => navigate(ctx, args as never),
  click: (ctx, args) => click(ctx, args as never),
  hover: (ctx, args) => hover(ctx, args as never),
  drag: (ctx, args) => drag(ctx, args as never),
  scroll: (ctx, args) => scroll(ctx, args as never),
  canvas: (ctx, args) => canvas(ctx, args as never),
  set: (ctx, args) => set(ctx, args as never),
  type: (ctx, args) => type(ctx, args as never),
  press: (ctx, args) => press(ctx, args as never),
  wait: (ctx, args) => wait(ctx, args as never),
  diagnostics: (ctx, args) => diagnostics(ctx, args as never),
  form_model: (ctx, args) => formModel(ctx, args as never),
  extract_rows: (ctx, args) => extractRows(ctx, args as never),
  web_search: (ctx, args) => webSearch(ctx, args as never),
  demo: (ctx, args) => demo(ctx, args as never),
  handle_dialog: (ctx, args) => handleDialog(ctx, args as never),
  ask_user: (ctx, args) => askUser(ctx, args as never),
  fill_form: (ctx, args) => fillForm(ctx, args as never),
  upload: (ctx, args) => upload(ctx, args as never),
};
